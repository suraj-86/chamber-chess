import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

/* ---------------------------------------------------------------------- */
/*  Chess engine (plain JS, no dependencies)                              */
/* ---------------------------------------------------------------------- */

const KNIGHT_DELTAS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_DELTAS   = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_DIRS   = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS     = [[-1,0],[1,0],[0,-1],[0,1]];
const PIECE_VALUE   = { P:100, N:320, B:330, R:500, Q:900, K:0 };
const PIECE_GLYPH   = { K:"♚", Q:"♛", R:"♜", B:"♝", N:"♞", P:"♟" };
const PIECE_NAME    = { K:"King", Q:"Queen", R:"Rook", B:"Bishop", N:"Knight", P:"Pawn" };

const CLOCK_PRESETS = {
  none:      null,
  bullet:    { minutes:1,  increment:0, label:"Bullet",    sub:"1 min" },
  blitz:     { minutes:3,  increment:2, label:"Blitz",     sub:"3 min + 2s" },
  rapid:     { minutes:10, increment:0, label:"Rapid",     sub:"10 min" },
  classical: { minutes:30, increment:0, label:"Classical", sub:"30 min" },
  increment: { minutes:5,  increment:5, label:"Fischer",   sub:"5 min + 5s" },
};

const inBounds = (r,c) => r>=0 && r<8 && c>=0 && c<8;
const color = (p) => p ? p[0] : null;
const type  = (p) => p ? p[1] : null;
const sq    = (r,c) => String.fromCharCode(97+c) + (8-r);

function initialBoard() {
  const b = Array.from({length:8}, () => Array(8).fill(null));
  const back = ["R","N","B","Q","K","B","N","R"];
  for (let c=0;c<8;c++){
    b[0][c] = "b"+back[c];
    b[1][c] = "bP";
    b[6][c] = "wP";
    b[7][c] = "w"+back[c];
  }
  return b;
}
const defaultCastling = () => ({ w:{k:true,q:true}, b:{k:true,q:true} });
const cloneBoard = (b) => b.map(r=>r.slice());
const cloneCastling = (c) => ({ w:{...c.w}, b:{...c.b} });
const cloneCaptured = (c) => ({ w:[...c.w], b:[...c.b] });

function findKing(board, col){
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (board[r][c]===col+"K") return {row:r,col:c};
  return null;
}

function isSquareAttacked(board, row, col_, byColor){
  const pawnDir = byColor==="w" ? 1 : -1;
  for (const dc of [-1,1]){
    const pr=row+pawnDir, pc=col_+dc;
    if (inBounds(pr,pc) && board[pr][pc]===byColor+"P") return true;
  }
  for (const [dr,dc] of KNIGHT_DELTAS){
    const nr=row+dr, nc=col_+dc;
    if (inBounds(nr,nc) && board[nr][nc]===byColor+"N") return true;
  }
  for (const [dr,dc] of KING_DELTAS){
    const nr=row+dr, nc=col_+dc;
    if (inBounds(nr,nc) && board[nr][nc]===byColor+"K") return true;
  }
  for (const [dr,dc] of BISHOP_DIRS){
    let nr=row+dr, nc=col_+dc;
    while (inBounds(nr,nc)){
      const t = board[nr][nc];
      if (t){ if (color(t)===byColor && (type(t)==="B"||type(t)==="Q")) return true; break; }
      nr+=dr; nc+=dc;
    }
  }
  for (const [dr,dc] of ROOK_DIRS){
    let nr=row+dr, nc=col_+dc;
    while (inBounds(nr,nc)){
      const t = board[nr][nc];
      if (t){ if (color(t)===byColor && (type(t)==="R"||type(t)==="Q")) return true; break; }
      nr+=dr; nc+=dc;
    }
  }
  return false;
}

function getPseudoMoves(board, row, col_, enPassant, castling){
  const piece = board[row][col_];
  if (!piece) return [];
  const c = color(piece), t = type(piece);
  const moves = [];

  if (t==="P"){
    const dir = c==="w" ? -1 : 1;
    const startRow = c==="w" ? 6 : 1;
    const one = row+dir;
    if (inBounds(one,col_) && !board[one][col_]){
      moves.push({row:one, col:col_, kind:"move"});
      const two = row+2*dir;
      if (row===startRow && !board[two][col_]) moves.push({row:two, col:col_, kind:"double"});
    }
    for (const dc of [-1,1]){
      const nr=row+dir, nc=col_+dc;
      if (!inBounds(nr,nc)) continue;
      const target = board[nr][nc];
      if (target && color(target)!==c) moves.push({row:nr, col:nc, kind:"capture"});
      else if (enPassant && enPassant.row===nr && enPassant.col===nc) moves.push({row:nr, col:nc, kind:"enpassant"});
    }
  } else if (t==="N"){
    for (const [dr,dc] of KNIGHT_DELTAS){
      const nr=row+dr, nc=col_+dc;
      if (!inBounds(nr,nc)) continue;
      const target = board[nr][nc];
      if (!target || color(target)!==c) moves.push({row:nr, col:nc, kind: target?"capture":"move"});
    }
  } else if (t==="B" || t==="R" || t==="Q"){
    const dirs = t==="B" ? BISHOP_DIRS : t==="R" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [dr,dc] of dirs){
      let nr=row+dr, nc=col_+dc;
      while (inBounds(nr,nc)){
        const target = board[nr][nc];
        if (!target){ moves.push({row:nr, col:nc, kind:"move"}); }
        else { if (color(target)!==c) moves.push({row:nr, col:nc, kind:"capture"}); break; }
        nr+=dr; nc+=dc;
      }
    }
  } else if (t==="K"){
    for (const [dr,dc] of KING_DELTAS){
      const nr=row+dr, nc=col_+dc;
      if (!inBounds(nr,nc)) continue;
      const target = board[nr][nc];
      if (!target || color(target)!==c) moves.push({row:nr, col:nc, kind: target?"capture":"move"});
    }
    const homeRow = c==="w" ? 7 : 0;
    if (row===homeRow && col_===4){
      const rights = castling[c];
      if (rights.k && !board[homeRow][5] && !board[homeRow][6] && board[homeRow][7]===c+"R"){
        moves.push({row:homeRow, col:6, kind:"castleK"});
      }
      if (rights.q && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] && board[homeRow][0]===c+"R"){
        moves.push({row:homeRow, col:2, kind:"castleQ"});
      }
    }
  }
  return moves;
}

function applyMove(board, from, move, promo){
  const b = cloneBoard(board);
  const piece = b[from.row][from.col];
  let captured = null;

  if (move.kind==="enpassant"){
    captured = b[from.row][move.col];
    b[from.row][move.col] = null;
  } else {
    captured = b[move.row][move.col];
  }

  b[move.row][move.col] = promo ? color(piece)+promo : piece;
  b[from.row][from.col] = null;

  if (move.kind==="castleK"){
    b[from.row][5] = b[from.row][7];
    b[from.row][7] = null;
  } else if (move.kind==="castleQ"){
    b[from.row][3] = b[from.row][0];
    b[from.row][0] = null;
  }
  return { board:b, captured };
}

function nextCastlingRights(castling, board, from, move, capturedPiece){
  const piece = board[from.row][from.col];
  const pc = color(piece), pt = type(piece);
  const nc = cloneCastling(castling);
  if (pt==="K"){ nc[pc].k=false; nc[pc].q=false; }
  if (pt==="R"){
    if (from.row===(pc==="w"?7:0) && from.col===0) nc[pc].q=false;
    if (from.row===(pc==="w"?7:0) && from.col===7) nc[pc].k=false;
  }
  if (capturedPiece){
    const cc = color(capturedPiece);
    if (move.row===(cc==="w"?7:0) && move.col===0) nc[cc].q=false;
    if (move.row===(cc==="w"?7:0) && move.col===7) nc[cc].k=false;
  }
  return nc;
}

function getLegalMoves(board, row, col_, enPassant, castling){
  const piece = board[row][col_];
  if (!piece) return [];
  const c = color(piece);
  const opp = c==="w" ? "b" : "w";
  const pseudo = getPseudoMoves(board, row, col_, enPassant, castling);

  return pseudo.filter(move => {
    if (move.kind==="castleK" || move.kind==="castleQ"){
      if (isSquareAttacked(board, row, col_, opp)) return false;
      const midCol = move.kind==="castleK" ? 5 : 3;
      if (isSquareAttacked(board, row, midCol, opp)) return false;
    }
    const { board: nb } = applyMove(board, {row,col:col_}, move, type(piece)==="P" && (move.row===0||move.row===7) ? "Q" : null);
    const kp = findKing(nb, c);
    if (!kp) return false;
    return !isSquareAttacked(nb, kp.row, kp.col, opp);
  });
}

function allLegalMoves(board, col_, enPassant, castling){
  const out = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = board[r][c];
    if (p && color(p)===col_){
      const moves = getLegalMoves(board, r, c, enPassant, castling);
      for (const m of moves) out.push({ from:{row:r,col:c}, move:m });
    }
  }
  return out;
}

function materialDiff(board){
  let d = 0;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = board[r][c];
    if (p) d += (color(p)==="w" ? 1 : -1) * PIECE_VALUE[type(p)];
  }
  return d;
}

/* ---------------------------------------------------------------------- */
/*  Minimax AI (Upgraded with Positional Evaluation)                      */
/* ---------------------------------------------------------------------- */

function evaluate(board, aiColor){
  let score = 0;
  for (let r=0;r<8;r++) {
    for (let c=0;c<8;c++){
      const p = board[r][c];
      if (p) {
        const pc = color(p);
        const pt = type(p);
        let val = PIECE_VALUE[pt];
        
        if (pt === 'N' || pt === 'B' || pt === 'P') {
          const rd = Math.abs(r - 3.5), cd = Math.abs(c - 3.5);
          val += Math.floor((7 - (rd + cd)) * 4); 
        }
        if (pt === 'P') { 
          val += (pc === 'w' ? (6 - r) : (r - 1)) * 5; 
        } 
        if (pt === 'K') {
          val -= (Math.abs(c - 3.5) < 2) ? 20 : 0; 
        }

        score += (pc === aiColor ? 1 : -1) * val;
      }
    }
  }
  return score;
}

function minimax(board, depth, alpha, beta, colorToMove, aiColor, enPassant, castling, collect){
  const moves = allLegalMoves(board, colorToMove, enPassant, castling);
  if (moves.length===0){
    const kp = findKing(board, colorToMove);
    const inCheck = kp && isSquareAttacked(board, kp.row, kp.col, colorToMove==="w"?"b":"w");
    if (inCheck) return { score: colorToMove===aiColor ? -99000-depth : 99000+depth };
    return { score: 0 };
  }
  if (depth===0) return { score: evaluate(board, aiColor) };

  moves.sort((a,b) => (b.move.kind==="capture"?1:0) - (a.move.kind==="capture"?1:0));

  const maximizing = colorToMove===aiColor;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMove = null;

  for (const { from, move } of moves){
    const piece = board[from.row][from.col];
    const promo = type(piece)==="P" && (move.row===0||move.row===7) ? "Q" : null;
    const { board: nb, captured } = applyMove(board, from, move, promo);
    const nextEP = move.kind==="double" ? { row:(from.row+move.row)/2, col:from.col } : null;
    const nextCastling = nextCastlingRights(castling, board, from, move, captured);
    const { score } = minimax(nb, depth-1, alpha, beta, colorToMove==="w"?"b":"w", aiColor, nextEP, nextCastling);
    if (collect) collect.push({ from, move, promo, score });
    if (maximizing){
      if (score>bestScore){ bestScore=score; bestMove={from,move,promo}; }
      alpha = Math.max(alpha, score);
    } else {
      if (score<bestScore){ bestScore=score; bestMove={from,move,promo}; }
      beta = Math.min(beta, score);
    }
    if (beta<=alpha) break;
  }
  return { score:bestScore, move:bestMove };
}

function pickAIMove(board, aiColor, enPassant, castling, difficulty){
  const depth = difficulty==="easy" ? 1 : difficulty==="medium" ? 2 : 3;
  const collect = [];
  const { move: best } = minimax(board, depth, -Infinity, Infinity, aiColor, aiColor, enPassant, castling, collect);
  if (!best) return null;
  if (collect.length===0) return best;

  const sorted = [...collect].sort((a,b) => b.score-a.score);
  const topScore = sorted[0].score;
  if (difficulty==="easy"){
    const pool = sorted.filter(m => m.score >= topScore-150);
    return pool[Math.floor(Math.random()*pool.length)];
  }
  if (difficulty==="medium"){
    const pool = sorted.filter(m => m.score >= topScore-50).slice(0,4);
    return pool[Math.floor(Math.random()*pool.length)];
  }
  return sorted[0];
}

/* ---------------------------------------------------------------------- */
/*  Sound effects (Web Audio API, no asset files)                         */
/* ---------------------------------------------------------------------- */

function ensureAudioCtx(ref){
  if (!ref.current){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ref.current = new AC();
  }
  if (ref.current.state==="suspended") ref.current.resume();
  return ref.current;
}

function playSound(kind, enabled, ref){
  if (!enabled) return;
  const ctx = ensureAudioCtx(ref);
  if (!ctx) return;
  try{
    const now = ctx.currentTime;
    const beep = (freq, start, dur, waveType="sine", gain=0.06) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = waveType;
      osc.frequency.value = freq;
      osc.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(gain, now+start);
      g.gain.exponentialRampToValueAtTime(0.0001, now+start+dur);
      osc.start(now+start);
      osc.stop(now+start+dur+0.02);
    };
    if (kind==="move") beep(520,0,0.09,"sine",0.05);
    else if (kind==="capture"){ beep(300,0,0.09,"square",0.05); beep(200,0.05,0.1,"square",0.04); }
    else if (kind==="check"){ beep(660,0,0.08,"triangle",0.06); beep(880,0.09,0.12,"triangle",0.06); }
    else if (kind==="checkmate"){ beep(660,0,0.1,"sawtooth",0.05); beep(520,0.12,0.12,"sawtooth",0.05); beep(390,0.24,0.22,"sawtooth",0.05); }
    else if (kind==="stalemate"){ beep(440,0,0.15,"sine",0.05); beep(440,0.18,0.2,"sine",0.04); }
    else if (kind==="start"){ beep(440,0,0.08,"sine",0.05); beep(660,0.09,0.12,"sine",0.05); }
    else if (kind==="timeout"){ beep(200,0,0.3,"sawtooth",0.05); }
  } catch(e) { /* audio not available, fail silently */ }
}

function formatClock(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s/60);
  const r = s%60;
  return `${m}:${r.toString().padStart(2,"0")}`;
}

/* ---------------------------------------------------------------------- */
/*  React component                                                       */
/* ---------------------------------------------------------------------- */

export default function ChessGame(){
  const [gameStarted, setGameStarted] = useState(false);
  const [mode, setMode] = useState("local");
  const [aiDifficulty, setAiDifficulty] = useState("medium");
  const [playerColor, setPlayerColor] = useState("w");
  const [clockPreset, setClockPreset] = useState("none");
  const [soundOn, setSoundOn] = useState(true);

  const [board, setBoard] = useState(initialBoard);
  const [turn, setTurn] = useState("w");
  const [castling, setCastling] = useState(defaultCastling);
  const [enPassant, setEnPassant] = useState(null);
  const [captured, setCaptured] = useState({ w:[], b:[] });
  const [history, setHistory] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pendingPromo, setPendingPromo] = useState(null);
  const [past, setPast] = useState([]);
  const [positions, setPositions] = useState([{ board: initialBoard(), captured:{w:[],b:[]}, lastMove:null }]);
  const [viewIndex, setViewIndex] = useState(null);
  const [clocks, setClocks] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [showResultPopup, setShowResultPopup] = useState(false);
  // NEW: State for the custom resign confirmation modal
  const [showResignPopup, setShowResignPopup] = useState(false);

  const containerRef = useRef(null);
  const audioCtxRef = useRef(null);

  const aiColor = playerColor==="w" ? "b" : "w";
  const atLive = viewIndex===null;
  const displayed = atLive ? { board, captured, lastMove } : positions[viewIndex];

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  useEffect(() => {
    if (gameOver) {
      setShowResultPopup(true);
      const t = setTimeout(() => setShowResultPopup(false), 2000);
      return () => clearTimeout(t);
    } else {
      setShowResultPopup(false);
    }
  }, [gameOver]);

  const legalMoves = useMemo(() => {
    if (!selected || gameOver || !atLive) return [];
    return getLegalMoves(board, selected.row, selected.col, enPassant, castling);
  }, [board, selected, enPassant, castling, gameOver, atLive]);

  const opponentColor = turn==="w" ? "b" : "w";
  const inCheck = useMemo(() => {
    const kp = findKing(displayed.board, turn);
    return kp ? isSquareAttacked(displayed.board, kp.row, kp.col, opponentColor) : false;
  }, [displayed, turn, opponentColor]);

  const finalizeMove = useCallback((from, move, promo) => {
    setPast(prev => [...prev, {
      board, turn, castling: cloneCastling(castling), enPassant,
      captured: cloneCaptured(captured), history:[...history], lastMove, gameOver,
      clocks: clocks ? {...clocks} : null, positions:[...positions],
    }]);

    const piece = board[from.row][from.col];
    const pieceType = type(piece), pieceColor = color(piece);
    const { board: nb, captured: cap } = applyMove(board, from, move, promo);

    const nextCastling = nextCastlingRights(castling, board, from, move, cap);
    const nextEnPassant = move.kind==="double" ? { row:(from.row+move.row)/2, col:from.col } : null;
    const nextTurn = pieceColor==="w" ? "b" : "w";

    let note;
    if (move.kind==="castleK") note = "O-O";
    else if (move.kind==="castleQ") note = "O-O-O";
    else {
      const capMark = (cap || move.kind==="enpassant") ? "x" : "";
      const prefix = pieceType==="P" ? (capMark ? String.fromCharCode(97+from.col) : "") : pieceType;
      note = `${prefix}${capMark}${sq(move.row, move.col)}`;
      if (promo) note += "=" + promo;
    }

    const kp = findKing(nb, nextTurn);
    const oppInCheck = kp ? isSquareAttacked(nb, kp.row, kp.col, pieceColor) : false;
    const oppMoves = allLegalMoves(nb, nextTurn, nextEnPassant, nextCastling);
    let result = null;
    if (oppMoves.length===0){
      result = oppInCheck ? { winner: pieceColor, reason:"checkmate" } : { winner:null, reason:"stalemate" };
      note += oppInCheck ? "#" : "";
    } else if (oppInCheck) note += "+";

    const newCaptured = cap ? { ...captured, [pieceColor]: [...captured[pieceColor], cap] } : captured;
    if (cap) setCaptured(newCaptured);

    const newPositions = [...positions, { board: nb, captured: newCaptured, lastMove: { from, to:{row:move.row,col:move.col} } }];
    setPositions(newPositions);
    setViewIndex(null);

    setBoard(nb);
    setCastling(nextCastling);
    setEnPassant(nextEnPassant);
    setTurn(nextTurn);
    setLastMove({ from, to:{row:move.row,col:move.col} });
    setHistory(prev => [...prev, { note, color:pieceColor }]);
    setSelected(null);

    if (clocks){
      const preset = CLOCK_PRESETS[clockPreset];
      setClocks(prev => prev ? { ...prev, [pieceColor]: prev[pieceColor] + (preset ? preset.increment : 0) } : prev);
    }

    if (result) playSound(result.reason==="checkmate" ? "checkmate" : "stalemate", soundOn, audioCtxRef);
    else if (oppInCheck) playSound("check", soundOn, audioCtxRef);
    else if (cap || move.kind==="enpassant") playSound("capture", soundOn, audioCtxRef);
    else playSound("move", soundOn, audioCtxRef);

    if (result) setGameOver(result);
  }, [board, castling, turn, enPassant, captured, history, lastMove, gameOver, clocks, clockPreset, positions, soundOn]);

  const handleSquareClick = useCallback((r, c) => {
    if (!atLive || gameOver || pendingPromo || aiThinking || showResignPopup) return;
    if (mode==="ai" && turn!==playerColor) return;
    const piece = board[r][c];

    if (selected){
      const move = legalMoves.find(m => m.row===r && m.col===c);
      if (move){
        if (type(board[selected.row][selected.col])==="P" && (r===0 || r===7)){
          setPendingPromo({ from: selected, move });
        } else {
          finalizeMove(selected, move, null);
        }
        return;
      }
      if (piece && color(piece)===turn){ setSelected({row:r, col:c}); return; }
      setSelected(null);
      return;
    }
    if (piece && color(piece)===turn) setSelected({row:r, col:c});
  }, [board, selected, legalMoves, turn, gameOver, pendingPromo, finalizeMove, atLive, mode, playerColor, aiThinking, showResignPopup]);

  const choosePromotion = (p) => {
    if (!pendingPromo) return;
    finalizeMove(pendingPromo.from, pendingPromo.move, p);
    setPendingPromo(null);
  };

  const handleUndo = () => {
    if (past.length===0 || pendingPromo || aiThinking || !atLive) return;
    let popCount = 1;
    if (mode==="ai" && history.length>0 && past.length>=2){
      const lastMover = history[history.length-1].color;
      if (lastMover===aiColor) popCount = 2;
    }
    const idx = Math.max(0, past.length-popCount);
    const target = past[idx];
    setBoard(target.board);
    setTurn(target.turn);
    setCastling(target.castling);
    setEnPassant(target.enPassant);
    setCaptured(target.captured);
    setHistory(target.history);
    setLastMove(target.lastMove);
    setGameOver(target.gameOver);
    setClocks(target.clocks);
    setPositions(target.positions);
    setPast(p => p.slice(0, idx));
    setViewIndex(null);
    setSelected(null);
  };

  const viewMove = (i) => { if (pendingPromo) return; setViewIndex(i+1); };
  const returnToLive = () => setViewIndex(null);

  useEffect(() => {
    if (!gameStarted || mode!=="ai" || gameOver || !atLive || pendingPromo) return;
    if (turn!==aiColor) return;
    setAiThinking(true);
    const timer = setTimeout(() => {
      const result = pickAIMove(board, aiColor, enPassant, castling, aiDifficulty);
      if (result) finalizeMove(result.from, result.move, result.promo);
      setAiThinking(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [gameStarted, mode, gameOver, atLive, pendingPromo, turn, aiColor, board, enPassant, castling, aiDifficulty]);

  useEffect(() => {
    if (!gameStarted || !clocks || gameOver || !atLive || pendingPromo) return;
    const id = setInterval(() => {
      setClocks(prev => {
        if (!prev) return prev;
        const t = { ...prev };
        t[turn] = Math.max(0, t[turn]-1);
        if (t[turn]===0){
          setGameOver({ winner: turn==="w" ? "b" : "w", reason:"timeout" });
          playSound("timeout", soundOn, audioCtxRef);
        }
        return t;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameStarted, clocks, gameOver, atLive, pendingPromo, turn, soundOn]);

  const buildInitialClocks = (preset) => {
    const p = CLOCK_PRESETS[preset];
    return p ? { w: p.minutes*60, b: p.minutes*60 } : null;
  };

  const resetLiveState = () => {
    setBoard(initialBoard());
    setTurn("w");
    setCastling(defaultCastling());
    setEnPassant(null);
    setCaptured({ w:[], b:[] });
    setHistory([]);
    setLastMove(null);
    setGameOver(null);
    setSelected(null);
    setPendingPromo(null);
    setPast([]);
    setPositions([{ board: initialBoard(), captured:{w:[],b:[]}, lastMove:null }]);
    setViewIndex(null);
    setClocks(buildInitialClocks(clockPreset));
    setAiThinking(false);
  };

  const handleStart = () => {
    ensureAudioCtx(audioCtxRef);
    resetLiveState();
    setGameStarted(true);
    setTimeout(() => playSound("start", soundOn, audioCtxRef), 50);
  };
  
  const handleRematch = () => { resetLiveState(); setTimeout(() => playSound("start", soundOn, audioCtxRef), 50); };
  
  // NEW: Updated to use custom modal state instead of window.confirm
  const handleMenu = () => {
    if (!gameOver && history.length > 0) {
      setShowResignPopup(true);
    } else {
      setGameStarted(false);
    }
  };

  const kingInCheckSquare = (atLive && inCheck && !gameOver) ? findKing(board, turn) : null;
  const matDiff = materialDiff(displayed.board);
  const advLeader = matDiff>0 ? "w" : matDiff<0 ? "b" : null;
  const advValue = (Math.abs(matDiff)/100).toFixed(1);

  if (!gameStarted){
    return (
      <div className="chess-app" ref={containerRef}>
        <style>{SHARED_CSS}</style>
        <div className="cg-header">
          <div className="cg-eyebrow">A Quiet Game Of Chess</div>
          <h1 className="cg-title">Cham<em>ber</em> Chess</h1>
        </div>

        <div className="setup-card">
          <div className="setup-section">
            <div className="setup-label">Opponent</div>
            <div className="option-row">
              <button className={`option-card ${mode==="local"?"active":""}`} onClick={() => setMode("local")}>
                <span className="option-title">Local Two Player</span>
                <span className="option-sub">Pass and play on one board</span>
              </button>
              <button className={`option-card ${mode==="ai"?"active":""}`} onClick={() => setMode("ai")}>
                <span className="option-title">Play vs Computer</span>
                <span className="option-sub">A minimax engine opponent</span>
              </button>
            </div>
          </div>

          {mode==="ai" && (
            <>
              <div className="setup-section">
                <div className="setup-label">Difficulty</div>
                <div className="option-row three">
                  {["easy","medium","hard"].map(d => (
                    <button key={d} className={`option-card small ${aiDifficulty===d?"active":""}`} onClick={() => setAiDifficulty(d)}>
                      <span className="option-title">{d[0].toUpperCase()+d.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-section">
                <div className="setup-label">Play As</div>
                <div className="option-row">
                  <button className={`option-card small ${playerColor==="w"?"active":""}`} onClick={() => setPlayerColor("w")}>
                    <span className="option-title">White</span>
                  </button>
                  <button className={`option-card small ${playerColor==="b"?"active":""}`} onClick={() => setPlayerColor("b")}>
                    <span className="option-title">Black</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="setup-section">
            <div className="setup-label">Time Control</div>
            <div className="option-row five">
              <button className={`option-card small ${clockPreset==="none"?"active":""}`} onClick={() => setClockPreset("none")}>
                <span className="option-title">None</span>
                <span className="option-sub">Untimed</span>
              </button>
              {Object.entries(CLOCK_PRESETS).filter(([k]) => k!=="none").map(([k,p]) => (
                <button key={k} className={`option-card small ${clockPreset===k?"active":""}`} onClick={() => setClockPreset(k)}>
                  <span className="option-title">{p.label}</span>
                  <span className="option-sub">{p.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <div className="option-row">
              <button className={`option-card small ${soundOn?"active":""}`} onClick={() => setSoundOn(s=>!s)}>
                <span className="option-title">{soundOn ? "🔊 Sound On" : "🔇 Sound Off"}</span>
              </button>
            </div>
          </div>

          <button className="new-game-btn start-btn" onClick={handleStart}>Start Game</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chess-app" ref={containerRef}>
      <style>{SHARED_CSS}</style>

      <div className="cg-header">
        <div className="cg-eyebrow">
          {mode==="ai" ? `You (${playerColor==="w"?"White":"Black"}) vs Computer · ${aiDifficulty[0].toUpperCase()+aiDifficulty.slice(1)}` : "Two Player · Local Board"}
        </div>
        <h1 className="cg-title">Cham<em>ber</em> Chess</h1>
      </div>

      <div className="cg-layout">
        <div className="board-frame">
          {clocks && (
            <div className={`clock-row top ${turn==="b" && !gameOver ? "active" : ""} ${clocks.b < 30 ? "low" : ""}`}>
              <span className="clock-label">Black</span>
              <span className="clock-time">{formatClock(clocks.b)}</span>
            </div>
          )}

          <div className="board-inner">
            <div className="board-grid">
              {displayed.board.map((rowArr, r) => rowArr.map((piece, c) => {
                const isLight = (r+c)%2===0;
                const isSelected = atLive && selected && selected.row===r && selected.col===c;
                const moveHere = atLive ? legalMoves.find(m => m.row===r && m.col===c) : null;
                const lm = displayed.lastMove;
                const isLast = lm && ((lm.from.row===r && lm.from.col===c) || (lm.to.row===r && lm.to.col===c));
                const isCheckSquare = kingInCheckSquare && kingInCheckSquare.row===r && kingInCheckSquare.col===c;
                const isMoveDest = atLive && lm && lm.to.row===r && lm.to.col===c;
                let dx=0, dy=0;
                if (isMoveDest){ dx = lm.from.col-lm.to.col; dy = lm.from.row-lm.to.row; }
                return (
                  <div
                    key={`${r}-${c}`}
                    className={[
                      "square", isLight ? "light" : "dark",
                      isSelected ? "selected" : "",
                      !isSelected && isLast ? "last-move" : "",
                      isCheckSquare ? "in-check" : "",
                    ].join(" ").trim()}
                    onClick={() => handleSquareClick(r, c)}
                    role="button"
                    aria-label={`${sq(r,c)}${piece ? ", " + PIECE_NAME[type(piece)] : ""}`}
                  >
                    {piece && (
                      <span
                        key={isMoveDest ? `p-${r}-${c}-${history.length}` : `p-${r}-${c}-static`}
                        className={`piece ${color(piece)==="w" ? "white" : "black"} ${isMoveDest ? "sliding" : ""}`}
                        style={isMoveDest ? { "--dx": dx, "--dy": dy } : undefined}
                      >
                        {PIECE_GLYPH[type(piece)]}
                      </span>
                    )}
                    {moveHere && (piece ? <span className="capture-ring" /> : <span className="move-dot" />)}
                  </div>
                );
              }))}
            </div>

            {showResultPopup && gameOver && (
              <div className="result-popup">
                <div className="result-popup-card">
                  {gameOver.reason === "checkmate" && "Checkmate!"}
                  {gameOver.reason === "stalemate" && "Draw"}
                  {gameOver.reason === "timeout" && "Time's up!"}
                </div>
              </div>
            )}
          </div>

          {clocks && (
            <div className={`clock-row bottom ${turn==="w" && !gameOver ? "active" : ""} ${clocks.w < 30 ? "low" : ""}`}>
              <span className="clock-label">White</span>
              <span className="clock-time">{formatClock(clocks.w)}</span>
            </div>
          )}

          {!atLive && (
            <div className="viewing-banner">
              <span>Viewing move {viewIndex}</span>
              <button className="ghost-btn tiny" onClick={returnToLive}>Return to Live</button>
            </div>
          )}
          {aiThinking && atLive && !gameOver && (
            <div className="thinking-banner">Computer is thinking…</div>
          )}
        </div>

        <div className="side-panel">
          <div className="plaque">
            <div className="plaque-title">To Move</div>
            <div className="turn-row">
              <span className={`turn-swatch ${turn==="b" ? "black" : ""}`} />
              <span className="turn-text">{turn==="w" ? "White" : "Black"}</span>
            </div>
            {inCheck && !gameOver && atLive && <div className="status-line">Check</div>}
            {gameOver && (
              <div className="gameover-banner">
                {gameOver.reason==="checkmate" && `Checkmate — ${gameOver.winner==="w" ? "White" : "Black"} wins`}
                {gameOver.reason==="stalemate" && "Stalemate — draw"}
                {gameOver.reason==="timeout" && `Time's up — ${gameOver.winner==="w" ? "White" : "Black"} wins`}
              </div>
            )}

            <div className="advantage-row">
              <div className="advantage-label">
                {advLeader ? `${advLeader==="w"?"White":"Black"} +${advValue}` : "Even material"}
              </div>
              <div className="advantage-bar">
                <div
                  className="advantage-fill"
                  style={{ width: `${50 + Math.max(-50, Math.min(50, matDiff/20))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="plaque">
            <div className="plaque-title">Captured</div>
            <div className="captured-row">
              {displayed.captured.b.map((p,i) => <span key={i} className="piece-mini black">{PIECE_GLYPH[type(p)]}</span>)}
            </div>
            <div className="captured-row" style={{marginTop:6}}>
              {displayed.captured.w.map((p,i) => <span key={i} className="piece-mini white">{PIECE_GLYPH[type(p)]}</span>)}
            </div>
          </div>

          <div className="plaque">
            <div className="plaque-title">Moves</div>
            <div className="history-list">
              {history.map((h,i) => (
                i % 2 === 0
                  ? <React.Fragment key={i}>
                      <span className="mv-num">{Math.floor(i/2)+1}.</span>
                      <span
                        className={`mv-entry ${!atLive && viewIndex===i+1 ? "viewing" : ""}`}
                        onClick={() => viewMove(i)}
                      >{h.note}</span>
                      <span
                        className={`mv-entry ${!atLive && history[i+1] && viewIndex===i+2 ? "viewing" : ""}`}
                        onClick={() => history[i+1] && viewMove(i+1)}
                      >{history[i+1] ? history[i+1].note : ""}</span>
                    </React.Fragment>
                  : null
              ))}
            </div>
          </div>

          <div className="btn-row">
            <button className="new-game-btn" onClick={handleRematch}>Rematch</button>
            <button className="ghost-btn" onClick={handleUndo} disabled={past.length===0 || !!pendingPromo || aiThinking || !atLive}>Undo</button>
          </div>
          <div className="btn-row">
            <button className="ghost-btn" onClick={handleMenu}>Menu</button>
            <button className="ghost-btn" onClick={toggleFullscreen}>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
            <button className="ghost-btn" onClick={() => setSoundOn(s=>!s)}>{soundOn ? "🔊" : "🔇"}</button>
          </div>
        </div>
      </div>

      {pendingPromo && (
        <div className="promo-overlay">
          <div className="promo-card">
            <div className="promo-title">Promote to</div>
            <div className="promo-choices">
              {["Q","R","B","N"].map(p => (
                <div key={p} className="promo-choice" onClick={() => choosePromotion(p)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key==="Enter") choosePromotion(p); }}>
                  <span className={turn==="w" ? "piece white" : "piece black"} style={{fontSize:34}}>
                    {PIECE_GLYPH[p]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW: Custom Resign Modal */}
      {showResignPopup && (
        <div className="promo-overlay">
          <div className="promo-card" style={{ maxWidth: 360 }}>
            <div className="promo-title">Resign Game?</div>
            <div style={{ color: "var(--brass-light)", marginBottom: 24, fontSize: 15, lineHeight: 1.4 }}>
              Are you sure you want to abandon this match and return to the main menu?
            </div>
            <div className="btn-row">
              <button 
                className="new-game-btn" 
                onClick={() => { 
                  setShowResignPopup(false); 
                  setGameStarted(false); 
                }}
              >
                Yes, Resign
              </button>
              <button 
                className="ghost-btn" 
                onClick={() => setShowResignPopup(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Styles                                                                 */
/* ---------------------------------------------------------------------- */

const SHARED_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  .chess-app {
    --bg: #16110c;
    --panel: #221a13;
    --panel-edge: #3a2c1d;
    --board-light: #e8d9bb;
    --board-dark: #7c5330;
    --brass: #b8944f;
    --brass-light: #e3c581;
    --cream: #f2e7d3;
    --ink: #241a10;
    --move-dot: rgba(120, 168, 110, 0.65);
    --capture-ring: rgba(196, 92, 68, 0.85);
    --check-glow: rgba(206, 66, 52, 0.85);
    --sq: 76px;

    background: radial-gradient(ellipse at top, #241a11 0%, var(--bg) 60%);
    min-height: 100vh;
    padding: 40px 20px 60px;
    box-sizing: border-box;
    font-family: 'Inter', sans-serif;
    color: var(--cream);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .chess-app * { box-sizing: border-box; }

  .cg-header { text-align: center; margin-bottom: 24px; }
  .cg-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--brass-light);
    margin-bottom: 6px;
  }
  .cg-title {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 600;
    font-size: 44px;
    margin: 0;
    color: var(--cream);
  }
  .cg-title em { color: var(--brass-light); font-style: italic; }

  /* ---------- setup screen ---------- */
  .setup-card {
    width: 100%;
    max-width: 620px;
    background: linear-gradient(160deg, #2a2015, #1c150e);
    border: 1px solid var(--panel-edge);
    border-radius: 12px;
    padding: 26px 28px 28px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(184,148,79,0.15);
  }
  .setup-section { margin-bottom: 20px; }
  .setup-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--brass-light);
    margin-bottom: 10px;
  }
  .option-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .option-row.three .option-card, .option-row.five .option-card { flex: 1 1 0; }
  .option-card {
    flex: 1 1 220px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--panel-edge);
    border-radius: 8px;
    padding: 14px 16px;
    text-align: left;
    cursor: pointer;
    color: var(--cream);
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
  }
  .option-card.small { padding: 10px 12px; text-align: center; align-items: center; }
  .option-card:hover { border-color: var(--brass); transform: translateY(-1px); }
  .option-card.active { border-color: var(--brass-light); background: rgba(184,148,79,0.18); }
  .option-title { font-weight: 600; font-size: 14px; }
  .option-sub { font-size: 11px; color: var(--brass-light); opacity: 0.8; }

  .start-btn { width: 100%; margin-top: 6px; padding: 14px; font-size: 15px; }

  /* ---------- board ---------- */
  .cg-layout { display: flex; gap: 28px; align-items: flex-start; flex-wrap: wrap; justify-content: center; }

  .board-frame {
    position: relative;
    background: linear-gradient(155deg, #4a3320, #2d2015);
    border-radius: 10px;
    padding: 18px 22px 22px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(184,148,79,0.25);
  }

  /* Upgraded Clocks with Pulse */
  .clock-row {
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 8px;
    background: rgba(0,0,0,0.25);
    opacity: 0.65;
    transition: all 0.2s ease;
  }
  .clock-row.bottom { margin-top: 8px; margin-bottom: 0; }
  .clock-row.active { opacity: 1; background: rgba(184,148,79,0.22); box-shadow: inset 0 0 0 1px var(--brass); color: var(--cream); }
  
  .clock-row.low { color: #ff6b6b; animation: pulse 1s infinite; border-color: #ff6b6b; box-shadow: inset 0 0 0 1px #ff6b6b; }
  @keyframes pulse { 50% { opacity: 0.7; } }

  .clock-label { font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--brass-light); }
  .clock-row.low .clock-label { color: #ff6b6b; }
  .clock-time { font-size: 18px; font-weight: 500; }

  .board-inner { position: relative; }

  .board-grid {
    display: grid;
    grid-template-columns: repeat(8, var(--sq));
    grid-template-rows: repeat(8, var(--sq));
    border: 2px solid var(--brass);
    box-shadow: 0 0 0 6px #241a10, 0 0 0 7px var(--brass);
  }

  .square { position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; overflow: visible; }
  .square.light { background: var(--board-light); }
  .square.dark { background: var(--board-dark); }
  .square.selected::before { content: ""; position: absolute; inset: 0; background: rgba(184,148,79,0.55); }
  .square.last-move::before { content: ""; position: absolute; inset: 0; background: rgba(184,148,79,0.28); }
  .square.in-check::after {
    content: ""; position: absolute; inset: 6px; border-radius: 50%;
    background: radial-gradient(circle, var(--check-glow) 0%, transparent 72%);
  }
  .move-dot { position: absolute; width: 18%; height: 18%; border-radius: 50%; background: var(--move-dot); pointer-events: none; }
  .capture-ring { position: absolute; inset: 6%; border-radius: 50%; border: 4px solid var(--capture-ring); pointer-events: none; }

  /* ---------- 2.5D pieces ---------- */
  .piece {
    font-size: calc(var(--sq) * 0.62);
    line-height: 1;
    position: relative;
    z-index: 2;
    transition: transform 0.12s ease;
  }
  .piece::after {
    content: "";
    position: absolute;
    left: 50%; bottom: -6%;
    width: 60%; height: 16%;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(0,0,0,0.38) 0%, transparent 72%);
    z-index: -1;
    border-radius: 50%;
  }
  .piece.white {
    color: #f5ecd8;
    text-shadow:
      0 1px 0 #d8c496,
      0 2px 0 #c2ab74,
      0 3px 0 #a68d55,
      0 5px 6px rgba(0,0,0,0.45);
  }
  .piece.black {
    color: #2a1c10;
    text-shadow:
      0 1px 0 #55402a,
      0 2px 0 #3f2e1c,
      0 3px 0 #2c1e10,
      0 5px 6px rgba(0,0,0,0.55);
  }
  .square:hover .piece { transform: translateY(-3px); }

  .piece.sliding { animation: slideIn 0.2s ease-out; }
  @keyframes slideIn {
    from { transform: translate(calc(var(--dx) * var(--sq)), calc(var(--dy) * var(--sq))); }
    to   { transform: translate(0, 0); }
  }
  
  /* ---------- Game Over Popup ---------- */
  .result-popup {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.4);
    z-index: 20;
    border-radius: 8px;
    pointer-events: none;
  }
  .result-popup-card {
    font-family: 'Cormorant Garamond', serif;
    font-size: 48px;
    font-weight: 600;
    color: var(--cream);
    background: var(--panel);
    border: 2px solid var(--brass);
    padding: 20px 40px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  @keyframes popIn {
    0% { opacity: 0; transform: scale(0.8); }
    100% { opacity: 1; transform: scale(1); }
  }

  .viewing-banner, .thinking-banner {
    margin-top: 10px;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--brass-light);
    background: rgba(0,0,0,0.3);
    border-radius: 6px;
    padding: 8px 10px;
  }
  .thinking-banner { font-style: italic; opacity: 0.85; }

  /* ---------- side panel ---------- */
  .side-panel { width: 280px; display: flex; flex-direction: column; gap: 16px; }
  .plaque {
    background: linear-gradient(160deg, #2a2015, #1c150e);
    border: 1px solid var(--panel-edge);
    border-radius: 8px;
    padding: 16px 18px;
    box-shadow: inset 0 0 0 1px rgba(184,148,79,0.15);
  }
  .plaque-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--brass-light);
    margin-bottom: 10px;
  }
  .turn-row { display: flex; align-items: center; gap: 10px; }
  .turn-swatch { width: 14px; height: 14px; border-radius: 50%; background: var(--cream); box-shadow: 0 0 0 1px #000; }
  .turn-swatch.black { background: #1a120a; }
  .turn-text { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 600; }
  .status-line { margin-top: 6px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--check-glow); }
  .gameover-banner { font-family: 'Cormorant Garamond', serif; font-size: 19px; font-style: italic; color: var(--brass-light); margin-top: 8px; }

  .advantage-row { margin-top: 14px; }
  .advantage-label { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--brass-light); margin-bottom: 6px; }
  .advantage-bar { height: 6px; border-radius: 3px; background: #1a120a; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(184,148,79,0.25); }
  .advantage-fill { height: 100%; background: linear-gradient(90deg, var(--brass), var(--brass-light)); transition: width 0.3s ease; }

  .captured-row { display: flex; flex-wrap: wrap; gap: 4px; min-height: 28px; font-size: 22px; }
  .captured-row .piece-mini.white { color: var(--cream); }
  .captured-row .piece-mini.black { color: #4a3a28; }

  .history-list {
    max-height: 220px; overflow-y: auto;
    font-family: 'JetBrains Mono', monospace; font-size: 13px;
    display: grid; grid-template-columns: 28px 1fr 1fr;
    row-gap: 4px; column-gap: 8px;
  }
  .history-list .mv-num { color: var(--brass-light); opacity: 0.7; }
  .mv-entry { cursor: pointer; border-radius: 3px; padding: 1px 4px; }
  .mv-entry:hover { background: rgba(184,148,79,0.2); }
  .mv-entry.viewing { background: rgba(184,148,79,0.4); color: var(--cream); }

  .btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn-row .new-game-btn, .btn-row .ghost-btn { flex: 1 1 auto; }

  .new-game-btn {
    font-family: 'Inter', sans-serif; font-weight: 600; font-size: 13px; letter-spacing: 0.03em;
    background: linear-gradient(160deg, var(--brass-light), var(--brass));
    color: #241a10; border: none; border-radius: 6px; padding: 12px 16px; cursor: pointer;
    transition: transform 0.1s ease, filter 0.15s ease;
  }
  .new-game-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .new-game-btn:focus-visible { outline: 2px solid var(--cream); outline-offset: 2px; }

  .ghost-btn {
    font-family: 'Inter', sans-serif; font-weight: 600; font-size: 13px; letter-spacing: 0.03em;
    background: transparent; color: var(--brass-light); border: 1px solid var(--brass);
    border-radius: 6px; padding: 12px 14px; cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }
  .ghost-btn.tiny { padding: 5px 10px; font-size: 11px; }
  .ghost-btn:hover:not(:disabled) { background: rgba(184,148,79,0.15); transform: translateY(-1px); }
  .ghost-btn:focus-visible { outline: 2px solid var(--brass-light); outline-offset: 2px; }
  .ghost-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .chess-app:fullscreen { width: 100%; height: 100%; overflow-y: auto; }

  .promo-overlay { position: fixed; inset: 0; background: rgba(10,7,4,0.72); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .promo-card { background: var(--panel); border: 1px solid var(--brass); border-radius: 10px; padding: 22px 26px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
  .promo-title { font-family: 'Cormorant Garamond', serif; font-size: 22px; margin-bottom: 14px; }
  .promo-choices { display: flex; gap: 10px; }
  .promo-choice { font-size: 34px; width: 58px; height: 58px; display: flex; align-items: center; justify-content: center; background: var(--board-light); border-radius: 6px; cursor: pointer; border: 2px solid transparent; }
  .promo-choice:hover { border-color: var(--brass); }
  .promo-choice:focus-visible { outline: 2px solid var(--brass-light); }

  @media (max-width: 720px) {
    .chess-app { --sq: 40px; }
    .side-panel { width: 100%; max-width: 456px; }
  }
`;