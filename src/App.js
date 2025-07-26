import React, { useState, useEffect } from "react";

const EMPTY = null;
const FLAME = "F";
const BRIGADE = "B";
const FIREWALL = "W";
const HYDRANT = "H";
const SUPPRESSED = "S"; // 制圧された炎（再燃可能）
const FOAM = "O"; // 泡消火剤（強化版制圧）
const WATERED = "D"; // 放水済みマス（次のターン炎にならない）

// ゲーム設定定数
const MAX_TURNS = 8; // 8ターン制に変更

// 8x8のボード初期化
const createInitialBoard = () => {
  const board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(EMPTY));

  // ほむら人の初期配置（下段）を3つに増加
  board[7][2] = FLAME;
  board[7][3] = FLAME;
  board[7][4] = FLAME;

  // 消火栓の配置（戦略ポイント、数を増やして消防隊を強化）
  board[2][2] = HYDRANT;
  board[2][5] = HYDRANT;
  board[5][1] = HYDRANT;
  board[5][6] = HYDRANT;
  board[4][3] = HYDRANT; // 中央に追加
  board[4][4] = HYDRANT; // 中央に追加

  return board;
};

const Cell = ({
  value,
  onClick,
  row,
  col,
  isValidMove,
  isFirewallTarget,
  isWaterTarget,
  isSpecialTarget,
}) => {
  let className = "cell";
  if (value === FLAME) className += " flame";
  if (value === BRIGADE) className += " brigade";
  if (value === FIREWALL) className += " firewall";
  if (value === HYDRANT) className += " hydrant";
  if (value === SUPPRESSED) className += " suppressed";
  if (value === FOAM) className += " foam";
  if (value === WATERED) className += " watered";
  if (isValidMove) className += " valid-move";
  if (isFirewallTarget) className += " firewall-target";
  if (isWaterTarget) className += " water-target";
  if (isSpecialTarget) className += " special-target";

  const getEmoji = () => {
    if (value === FLAME) return "🔥";
    if (value === BRIGADE) return "⛑️";
    if (value === FIREWALL) return "🧱";
    if (value === HYDRANT) return "🚰";
    if (value === SUPPRESSED) return "💨";
    if (value === FOAM) return "🫧";
    if (value === WATERED) return "💧";
    return "";
  };

  return (
    <div className={className} onClick={onClick}>
      <div className="cell-content">{getEmoji()}</div>
      <div className="coord">
        {row},{col}
      </div>
    </div>
  );
};

const GameBoard = () => {
  const [board, setBoard] = useState(createInitialBoard);
  const [currentPlayer, setCurrentPlayer] = useState(FLAME);
  const [gameStatus, setGameStatus] = useState("playing");
  const [validMoves, setValidMoves] = useState([]);
  const [firewallTargets, setFirewallTargets] = useState([]);
  const [waterTargets, setWaterTargets] = useState([]);
  const [specialTargets, setSpecialTargets] = useState([]);
  const [turnCount, setTurnCount] = useState(0);
  const [selectedAction, setSelectedAction] = useState(null);
  const [selectedHydrant, setSelectedHydrant] = useState(null);
  const [flameActions, setFlameActions] = useState(2);
  const [wallsPlaced, setWallsPlaced] = useState(0);
  const [wateredCells, setWateredCells] = useState([]);

  // 消防隊の新しい能力
  const [brigadeSpecialUses, setBrigadeSpecialUses] = useState({
    megaBlast: 1,
    foamBarrier: 1,
    emergency: 1,
  });
  const [emergencyMode, setEmergencyMode] = useState(false);

  // ほむら人の移動可能範囲（既存炎から2マス以内、防火壁は通過不可、放水済みマスは不可）
  const getFlameValidMoves = (board) => {
    const moves = [];
    const flamePositions = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === FLAME) {
          flamePositions.push([row, col]);
        }
      }
    }

    flamePositions.forEach(([flameRow, flameCol]) => {
      const directions = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];

      directions.forEach(([dr, dc]) => {
        let hasFirewall = false;
        for (let step = 1; step <= 2; step++) {
          const checkRow = flameRow + dr * step;
          const checkCol = flameCol + dc * step;

          if (checkRow >= 0 && checkRow < 8 && checkCol >= 0 && checkCol < 8) {
            if (board[checkRow][checkCol] === FIREWALL) {
              hasFirewall = true;
              break;
            }

            if (!hasFirewall) {
              const distance =
                Math.abs(checkRow - flameRow) + Math.abs(checkCol - flameCol);
              if (
                distance <= 2 &&
                (board[checkRow][checkCol] === EMPTY ||
                  board[checkRow][checkCol] === SUPPRESSED) &&
                board[checkRow][checkCol] !== WATERED
              ) {
                moves.push([checkRow, checkCol]);
              }
            }
          }
        }
      });
    });

    return [...new Set(moves.map((m) => m.join(",")))].map((m) =>
      m.split(",").map(Number)
    );
  };

  // 消防隊の防火壁設置可能場所
  const getFirewallTargets = (board) => {
    const targets = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === EMPTY) {
          targets.push([row, col]);
        }
      }
    }
    return targets;
  };

  // 消火栓からの放水範囲
  const getWaterTargets = (board, hydrantRow, hydrantCol) => {
    const targets = [];
    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    directions.forEach(([dr, dc]) => {
      const row = hydrantRow + dr;
      const col = hydrantCol + dc;
      if (row >= 0 && row < 8 && col >= 0 && col < 8) {
        if (board[row][col] === FLAME) {
          targets.push([row, col]);
        }
      }
    });

    return targets;
  };

  // 大放水の範囲（3x3）
  const getMegaBlastTargets = (board, hydrantRow, hydrantCol) => {
    const targets = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const row = hydrantRow + dr;
        const col = hydrantCol + dc;
        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
          if (board[row][col] === FLAME) {
            targets.push([row, col]);
          }
        }
      }
    }
    return targets;
  };

  // 泡バリア設置可能場所
  const getFoamTargets = (board) => {
    const targets = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === EMPTY || board[row][col] === SUPPRESSED) {
          targets.push([row, col]);
        }
      }
    }
    return targets;
  };

  // 連鎖爆発チェック
  const checkChainReaction = (board) => {
    for (let row = 0; row <= 6; row++) {
      for (let col = 0; col <= 6; col++) {
        let flameCount = 0;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            if (board[row + i][col + j] === FLAME) {
              flameCount++;
            }
          }
        }
        if (flameCount === 4) {
          return [row, col];
        }
      }
    }
    return null;
  };

  // 連鎖爆発実行
  const triggerChainReaction = (board, topLeftRow, topLeftCol) => {
    const newBoard = board.map((row) => [...row]);
    const centerRow = topLeftRow + 0.5;
    const centerCol = topLeftCol + 0.5;

    for (let dr = -1; dr <= 2; dr++) {
      for (let dc = -1; dc <= 2; dc++) {
        const row = Math.round(centerRow + dr);
        const col = Math.round(centerCol + dc);
        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
          if (newBoard[row][col] === FIREWALL) {
            newBoard[row][col] = FLAME;
          } else if (
            newBoard[row][col] === EMPTY ||
            newBoard[row][col] === SUPPRESSED ||
            newBoard[row][col] === WATERED
          ) {
            newBoard[row][col] = FLAME;
          } else if (newBoard[row][col] === FOAM) {
            newBoard[row][col] = SUPPRESSED;
          }
        }
      }
    }

    return newBoard;
  };

  // 勝利条件チェック
  const checkWinCondition = (board) => {
    // ほむら人の勝利：上位3列に6個以上の炎
    let topFlameCount = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === FLAME) {
          topFlameCount++;
        }
      }
    }
    if (topFlameCount >= 6) {
      return FLAME;
    }

    // 消防隊の勝利：8ターン防御成功
    if (turnCount >= MAX_TURNS * 2) {
      return BRIGADE;
    }

    // 炎が完全消火された場合は消防隊勝利
    let flameCount = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === FLAME) flameCount++;
      }
    }
    if (flameCount === 0) {
      return BRIGADE;
    }

    return null;
  };

  // ターン切り替え時に放水済みマスをリセット（ほむら人のターンが始まるとき）
  useEffect(() => {
    if (currentPlayer === FLAME && turnCount > 0) {
      const newBoard = board.map((row) =>
        row.map((cell) => (cell === WATERED ? EMPTY : cell))
      );
      setBoard(newBoard);
      setWateredCells([]);
    }
  }, [currentPlayer, turnCount]);

  // 有効な手を更新
  useEffect(() => {
    if (gameStatus === "playing") {
      if (currentPlayer === FLAME) {
        setValidMoves(getFlameValidMoves(board));
        setFirewallTargets([]);
        setWaterTargets([]);
        setSpecialTargets([]);
      } else {
        setValidMoves([]);
        if (selectedAction === "firewall") {
          setFirewallTargets(getFirewallTargets(board));
        } else if (selectedAction === "water" && selectedHydrant) {
          setWaterTargets(
            getWaterTargets(board, selectedHydrant[0], selectedHydrant[1])
          );
        } else if (selectedAction === "megaBlast" && selectedHydrant) {
          setSpecialTargets(
            getMegaBlastTargets(board, selectedHydrant[0], selectedHydrant[1])
          );
        } else if (selectedAction === "foamBarrier") {
          setSpecialTargets(getFoamTargets(board));
        }
      }
    }
  }, [board, currentPlayer, gameStatus, selectedAction, selectedHydrant]);

  // 勝利判定
  useEffect(() => {
    const winner = checkWinCondition(board);
    if (winner) {
      setGameStatus(winner === FLAME ? "flame_wins" : "brigade_wins");
    }
  }, [board, turnCount]);

  const handleCellClick = (row, col) => {
    if (gameStatus !== "playing") return;

    if (currentPlayer === FLAME) {
      const isValidMove = validMoves.some(([r, c]) => r === row && c === col);
      if (!isValidMove) return;

      const newBoard = [...board];
      newBoard[row][col] = FLAME;

      const chainReaction = checkChainReaction(newBoard);
      let finalBoard = newBoard;

      if (chainReaction) {
        finalBoard = triggerChainReaction(
          newBoard,
          chainReaction[0],
          chainReaction[1]
        );
      }

      setBoard(finalBoard);

      const newFlameActions = flameActions - 1;
      setFlameActions(newFlameActions);

      if (newFlameActions <= 0) {
        setCurrentPlayer(BRIGADE);
        setTurnCount((prev) => prev + 1);
        setFlameActions(2);
      }
    } else {
      // 消防隊のアクション
      if (
        board[row][col] === HYDRANT &&
        (selectedAction === "water" || selectedAction === "megaBlast") &&
        !selectedHydrant
      ) {
        setSelectedHydrant([row, col]);
        return;
      }

      let actionCompleted = false;
      let newWallsPlaced = wallsPlaced;

      if (selectedAction === "firewall") {
        const isValidTarget = firewallTargets.some(
          ([r, c]) => r === row && c === col
        );
        if (isValidTarget && board[row][col] === EMPTY) {
          const newBoard = [...board];
          newBoard[row][col] = FIREWALL;
          setBoard(newBoard);
          newWallsPlaced++;
          setWallsPlaced(newWallsPlaced);

          const remainingTargets = firewallTargets.filter(
            ([r, c]) => !(r === row && c === col)
          );
          if (remainingTargets.length > 0 && newWallsPlaced < 2) {
            setFirewallTargets(remainingTargets);
            return;
          }

          actionCompleted = true;
        }
      } else if (selectedAction === "water" && selectedHydrant) {
        const isValidTarget = waterTargets.some(
          ([r, c]) => r === row && c === col
        );
        if (isValidTarget && board[row][col] === FLAME) {
          const newBoard = [...board];
          newBoard[row][col] = WATERED;
          setWateredCells((prev) => [...prev, [row, col]]);
          setBoard(newBoard);
          actionCompleted = true;
        }
      } else if (selectedAction === "megaBlast" && selectedHydrant) {
        const isValidTarget = specialTargets.some(
          ([r, c]) => r === row && c === col
        );
        if (isValidTarget) {
          const newBoard = [...board];
          const [hydrantRow, hydrantCol] = selectedHydrant;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const targetRow = hydrantRow + dr;
              const targetCol = hydrantCol + dc;
              if (
                targetRow >= 0 &&
                targetRow < 8 &&
                targetCol >= 0 &&
                targetCol < 8
              ) {
                if (newBoard[targetRow][targetCol] === FLAME) {
                  newBoard[targetRow][targetCol] = WATERED;
                  setWateredCells((prev) => [...prev, [targetRow, targetCol]]);
                }
              }
            }
          }
          setBoard(newBoard);
          setBrigadeSpecialUses((prev) => ({
            ...prev,
            megaBlast: prev.megaBlast - 1,
          }));
          actionCompleted = true;
        }
      } else if (selectedAction === "foamBarrier") {
        const isValidTarget = specialTargets.some(
          ([r, c]) => r === row && c === col
        );
        if (isValidTarget) {
          const newBoard = [...board];
          newBoard[row][col] = FOAM;
          setBoard(newBoard);
          setBrigadeSpecialUses((prev) => ({
            ...prev,
            foamBarrier: prev.foamBarrier - 1,
          }));
          actionCompleted = true;
        }
      }

      if (actionCompleted) {
        if (emergencyMode) {
          setEmergencyMode(false);
          setBrigadeSpecialUses((prev) => ({
            ...prev,
            emergency: prev.emergency - 1,
          }));
        } else {
          setCurrentPlayer(FLAME);
          setTurnCount((prev) => prev + 1);
        }

        setSelectedAction(null);
        setSelectedHydrant(null);
        setFirewallTargets([]);
        setWaterTargets([]);
        setSpecialTargets([]);
        setWallsPlaced(0);
      }
    }
  };

  const selectAction = (action) => {
    if (currentPlayer === BRIGADE) {
      setSelectedAction(action);
      setSelectedHydrant(null);
      setWaterTargets([]);
      setFirewallTargets([]);
      setSpecialTargets([]);
      setWallsPlaced(0);
    }
  };

  const activateEmergency = () => {
    if (brigadeSpecialUses.emergency > 0 && currentPlayer === BRIGADE) {
      setEmergencyMode(true);
    }
  };

  const resetGame = () => {
    setBoard(createInitialBoard());
    setCurrentPlayer(FLAME);
    setGameStatus("playing");
    setValidMoves([]);
    setFirewallTargets([]);
    setWaterTargets([]);
    setSpecialTargets([]);
    setTurnCount(0);
    setSelectedAction(null);
    setSelectedHydrant(null);
    setFlameActions(2);
    setWallsPlaced(0);
    setBrigadeSpecialUses({ megaBlast: 1, foamBarrier: 1, emergency: 1 });
    setEmergencyMode(false);
    setWateredCells([]);
  };

  const getStatusMessage = () => {
    const remainingTurns = Math.max(0, MAX_TURNS * 2 - turnCount);

    switch (gameStatus) {
      case "flame_wins":
        return "🔥 Homura people win!We have deployed a massive flame on the upper level!";
      case "brigade_wins":
        return "⛑️ Victory for the fire brigade!We stopped the invasion of the flames!";
      default:
        if (currentPlayer === FLAME) {
          return `🔥 Homura person's turn- last ${flameActions} action (remain ${Math.ceil(
            remainingTurns / 2
          )}turn)`;
        } else {
          if (emergencyMode) {
            return "🚨 Emergency response mode: in continuous action!";
          } else if (selectedAction === "water" && selectedHydrant) {
            return "💧 Water spray mode: Click on adjacent flames to control them";
          } else if (selectedAction === "megaBlast" && selectedHydrant) {
            return "💥 Large Water Dissipation Mode: 3x3 area of fire is controlled at once!";
          } else if (selectedAction === "firewall") {
            return `🧱 Firewall mode: Click on the location where you want to install the firewall. (${wallsPlaced}/2)`;
          } else if (selectedAction === "foamBarrier") {
            return "🫧 Bubble barrier mode: reinforced suppressant in place";
          } else {
            return `⛑️ Fire Brigade Turn - Select Action (Remain ${Math.ceil(
              remainingTurns / 2
            )} Turn)`;
          }
        }
    }
  };

  return (
    <div className="game-container">
      <style jsx>{`
        .game-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          font-family: "Arial", sans-serif;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          color: white;
          min-height: 100vh;
        }

        .game-header {
          text-align: center;
          margin-bottom: 20px;
        }

        .game-header h1 {
          font-size: 2.5em;
          margin: 0 0 10px 0;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }

        .status {
          font-size: 1.2em;
          margin: 10px 0;
          padding: 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }

        .game-info {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin: 10px 0;
          flex-wrap: wrap;
        }

        .info-item {
          background: rgba(255, 255, 255, 0.1);
          padding: 8px 15px;
          border-radius: 5px;
          font-weight: bold;
        }

        .special-abilities {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin: 15px 0;
          flex-wrap: wrap;
        }

        .action-buttons {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin: 15px 0;
          flex-wrap: wrap;
        }

        .action-btn {
          padding: 10px 20px;
          background: #4a5568;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1em;
          transition: all 0.3s;
        }

        .action-btn:hover {
          background: #2d3748;
          transform: translateY(-2px);
        }

        .action-btn.selected {
          background: #e53e3e;
          box-shadow: 0 0 10px rgba(229, 62, 62, 0.5);
        }

        .special-btn {
          padding: 10px 20px;
          background: #805ad5;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1em;
          transition: all 0.3s;
        }

        .special-btn:hover {
          background: #6b46c1;
          transform: translateY(-2px);
        }

        .special-btn:disabled {
          background: #4a5568;
          cursor: not-allowed;
          transform: none;
        }

        .special-btn.selected {
          background: #9f7aea;
          box-shadow: 0 0 10px rgba(159, 122, 234, 0.5);
        }

        .emergency-btn {
          background: #f56565;
          animation: pulse-red 2s infinite;
        }

        .emergency-btn:hover {
          background: #e53e3e;
        }

        .reset-btn {
          padding: 10px 20px;
          background: #38a169;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1em;
          margin: 10px;
        }

        .reset-btn:hover {
          background: #2f855a;
        }

        .game-board {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 2px;
          max-width: 480px;
          margin: 20px auto;
          background: #2d3748;
          padding: 10px;
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .cell {
          width: 50px;
          height: 50px;
          background: #4a5568;
          border: 1px solid #2d3748;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          position: relative;
          border-radius: 4px;
        }

        .cell:hover {
          transform: scale(1.05);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        }

        .cell.flame {
          background: linear-gradient(45deg, #ff6b35, #f7931e);
          box-shadow: 0 0 15px rgba(255, 107, 53, 0.8);
          animation: flicker 1s infinite alternate;
        }

        .cell.suppressed {
          background: linear-gradient(45deg, #718096, #a0aec0);
          box-shadow: 0 0 10px rgba(113, 128, 150, 0.5);
        }

        .cell.foam {
          background: linear-gradient(45deg, #4299e1, #63b3ed);
          box-shadow: 0 0 15px rgba(66, 153, 225, 0.8);
          animation: bubble 2s infinite;
        }

        .cell.watered {
          background: linear-gradient(45deg, #3182ce, #2b6cb0);
          box-shadow: 0 0 10px rgba(49, 130, 206, 0.5);
          animation: pulse-blue 1s infinite;
        }

        .cell.firewall {
          background: linear-gradient(45deg, #8b4513, #a0522d);
          box-shadow: 0 0 8px rgba(139, 69, 19, 0.6);
        }

        .cell.hydrant {
          background: linear-gradient(45deg, #3182ce, #2c5282);
          box-shadow: 0 0 10px rgba(49, 130, 206, 0.7);
        }

        .cell.valid-move {
          background: rgba(72, 187, 120, 0.3);
          border: 2px solid #48bb78;
          animation: pulse 1s infinite;
        }

        .cell.firewall-target {
          background: rgba(139, 69, 19, 0.3);
          border: 2px solid #8b4513;
        }

        .cell.water-target {
          background: rgba(49, 130, 206, 0.3);
          border: 2px solid #3182ce;
        }

        .cell.special-target {
          background: rgba(159, 122, 234, 0.3);
          border: 2px solid #9f7aea;
          animation: pulse-purple 1s infinite;
        }

        .cell-content {
          font-size: 1.5em;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
        }

        .coord {
          font-size: 0.6em;
          position: absolute;
          bottom: 2px;
          right: 2px;
          opacity: 0.7;
        }

        @keyframes flicker {
          0% {
            box-shadow: 0 0 15px rgba(255, 107, 53, 0.8);
          }
          100% {
            box-shadow: 0 0 25px rgba(255, 107, 53, 1);
          }
        }

        @keyframes pulse {
          0% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.6;
          }
        }

        @keyframes pulse-blue {
          0% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.7;
          }
        }

        @keyframes pulse-purple {
          0% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.8;
          }
          100% {
            opacity: 0.4;
          }
        }

        @keyframes pulse-red {
          0% {
            box-shadow: 0 0 5px rgba(245, 101, 101, 0.5);
          }
          50% {
            box-shadow: 0 0 20px rgba(245, 101, 101, 1);
          }
          100% {
            box-shadow: 0 0 5px rgba(245, 101, 101, 0.5);
          }
        }

        @keyframes bubble {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>

      <div className="game-header">
        <h1>🔥 鎮魂戦 炎炎ノ消防隊 🔥</h1>
        <div className="status">{getStatusMessage()}</div>
        <div className="game-info">
          <div className="info-item">
            Turn: {Math.floor(turnCount / 2) + 1}/{MAX_TURNS}
          </div>
          <div className="info-item">
            epiglottitis:{" "}
            {
              board
                .slice(0, 3)
                .flat()
                .filter((cell) => cell === FLAME).length
            }
            /6
          </div>
          <div className="info-item">
            Total number of flames:{" "}
            {board.flat().filter((cell) => cell === FLAME).length}
          </div>
          <div className="info-item">
            Number of victories:{" "}
            {
              board
                .flat()
                .filter((cell) => cell === SUPPRESSED || cell === FOAM).length
            }
          </div>
        </div>

        {currentPlayer === BRIGADE && (
          <>
            <div className="special-abilities">
              <button
                className={`special-btn ${
                  selectedAction === "megaBlast" ? "selected" : ""
                }`}
                onClick={() => selectAction("megaBlast")}
                disabled={brigadeSpecialUses.megaBlast <= 0}
              >
                💥 Large Water ({brigadeSpecialUses.megaBlast})
              </button>
              <button
                className={`special-btn ${
                  selectedAction === "foamBarrier" ? "selected" : ""
                }`}
                onClick={() => selectAction("foamBarrier")}
                disabled={brigadeSpecialUses.foamBarrier <= 0}
              >
                🫧 Bubble Barrier ({brigadeSpecialUses.foamBarrier})
              </button>
              <button
                className={`special-btn emergency-btn ${
                  emergencyMode ? "selected" : ""
                }`}
                onClick={activateEmergency}
                disabled={brigadeSpecialUses.emergency <= 0 || emergencyMode}
              >
                🚨 Emergency Response ({brigadeSpecialUses.emergency})
              </button>
            </div>
            <div className="action-buttons">
              <button
                className={`action-btn ${
                  selectedAction === "firewall" ? "selected" : ""
                }`}
                onClick={() => selectAction("firewall")}
              >
                🧱 Firewall installation (two)
              </button>
              <button
                className={`action-btn ${
                  selectedAction === "water" ? "selected" : ""
                }`}
                onClick={() => selectAction("water")}
              >
                💧 Usually drain
              </button>
              {selectedAction && (
                <button
                  className="action-btn"
                  onClick={() => {
                    setSelectedAction(null);
                    setSelectedHydrant(null);
                    setWaterTargets([]);
                    setFirewallTargets([]);
                    setSpecialTargets([]);
                    setWallsPlaced(0);
                  }}
                >
                  ❌ Cancel
                </button>
              )}
            </div>
          </>
        )}

        <button onClick={resetGame} className="reset-btn">
          New Game
        </button>
      </div>

      <div className="game-board">
        {board.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <Cell
              key={`${rowIndex}-${colIndex}`}
              value={cell}
              row={rowIndex}
              col={colIndex}
              onClick={() => handleCellClick(rowIndex, colIndex)}
              isValidMove={validMoves.some(
                ([r, c]) => r === rowIndex && c === colIndex
              )}
              isFirewallTarget={firewallTargets.some(
                ([r, c]) => r === rowIndex && c === colIndex
              )}
              isWaterTarget={waterTargets.some(
                ([r, c]) => r === rowIndex && c === colIndex
              )}
              isSpecialTarget={specialTargets.some(
                ([r, c]) => r === rowIndex && c === colIndex
              )}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default GameBoard;
