/* =====================================================================
   3D CHESS ULTIMATE
   - Real 3D procedural pieces (Three.js) with a 2D unicode fallback
   - Correct rules engine (en passant, castling, check/mate/stalemate)
   - Negamax + alpha-beta + quiescence AI with piece-square tables
   - Smooth move / capture / castling / promotion animations
   ===================================================================== */

/* ----------------------------- Constants ----------------------------- */
const SQUARE = 1.0;                 // world units per square
const BOARD_HALF = 3.5 * SQUARE;    // board centered on origin
const MATE = 100000;

const PIECE_VALUES = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };

/* Piece-square tables (White's perspective, row 0 = Black's back rank) */
const PST = {
    pawn: [
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0
    ],
    knight: [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50
    ],
    bishop: [
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20
    ],
    rook: [
         0,  0,  0,  0,  0,  0,  0,  0,
         5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
         0,  0,  0,  5,  5,  0,  0,  0
    ],
    queen: [
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20
    ],
    king: [
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20
    ]
};

const UNICODE = {
    white: { king:'♔', queen:'♕', rook:'♖', bishop:'♗', knight:'♘', pawn:'♙' },
    black: { king:'♚', queen:'♛', rook:'♜', bishop:'♝', knight:'♞', pawn:'♟' }
};

/* ----------------------------- Game State ---------------------------- */
const gameState = {
    board: null,
    currentPlayer: 'white',
    gameMode: null,
    aiDifficulty: 'medium',
    selectedPiece: null,
    validMoves: [],
    moveHistory: [],
    history: [],            // board snapshots for undo
    timers: { white: 600, black: 600, active: false },
    isFlipped: false,
    gameOver: false,
    thinking: false
};

/* ------------------------- Audio (WebAudio) -------------------------- */
let audioCtx = null;
function audio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { audioCtx = null; }
    }
    return audioCtx;
}
function tone(freq, dur, type = 'sine', vol = 0.1) {
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.value = vol;
    osc.connect(g); g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
}
function playSound(type) {
    switch (type) {
        case 'click':   tone(800, 0.08, 'sine', 0.08); break;
        case 'move':    tone(440, 0.12, 'sine', 0.09); break;
        case 'capture': tone(300, 0.18, 'triangle', 0.13); break;
        case 'check':   tone(200, 0.25, 'sawtooth', 0.12); break;
        case 'special': tone(620, 0.22, 'sine', 0.12); break;
        case 'draw':    tone(500, 0.4, 'sine', 0.1); break;
        case 'win':     victory(); break;
    }
}
function victory() {
    const notes = [523, 659, 784, 1047];
    const ctx = audio(); if (!ctx) return;
    let t = ctx.currentTime;
    notes.forEach(f => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.13;
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 0.2); t += 0.25;
    });
}

/* =====================================================================
   RULES ENGINE  (all functions take a `board` argument)
   board is an 8x8 array of {type,color,hasMoved} | null,
   with extra props: board.castling {whiteK,whiteQ,blackK,blackQ}, board.ep {row,col}|null
   ===================================================================== */

function initializeBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
    b[0] = back.map(t => ({ type: t, color: 'black', hasMoved: false }));
    b[1] = Array.from({ length: 8 }, () => ({ type: 'pawn', color: 'black', hasMoved: false }));
    b[6] = Array.from({ length: 8 }, () => ({ type: 'pawn', color: 'white', hasMoved: false }));
    b[7] = back.map(t => ({ type: t, color: 'white', hasMoved: false }));
    b.castling = { whiteK: true, whiteQ: true, blackK: true, blackQ: true };
    b.ep = null;
    return b;
}

function cloneBoard(b) {
    const nb = b.map(row => row.map(c => c ? { ...c } : null));
    nb.castling = { ...b.castling };
    nb.ep = b.ep ? { ...b.ep } : null;
    return nb;
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function isEmpty(b, r, c) { return !b[r][c]; }

function opp(color) { return color === 'white' ? 'black' : 'white'; }

function findKing(b, color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (b[r][c] && b[r][c].type === 'king' && b[r][c].color === color)
                return { row: r, col: c };
    return null;
}

/* Is square (r,c) attacked by `byColor`? */
function isSquareAttacked(b, r, c, byColor) {
    // Pawns
    const dir = byColor === 'white' ? 1 : -1;  // pawn of byColor attacks from r+dir
    for (const dc of [-1, 1]) {
        const pr = r + dir, pc = c + dc;
        if (inBounds(pr, pc) && b[pr][pc] && b[pr][pc].color === byColor && b[pr][pc].type === 'pawn')
            return true;
    }
    // Knights
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && b[nr][nc] && b[nr][nc].color === byColor && b[nr][nc].type === 'knight')
            return true;
    }
    // King
    for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && b[nr][nc] && b[nr][nc].color === byColor && b[nr][nc].type === 'king')
                return true;
        }
    // Sliding: rook/queen (orthogonal), bishop/queen (diagonal)
    const orth = [[1,0],[-1,0],[0,1],[0,-1]];
    const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of orth) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
            const p = b[nr][nc];
            if (p) {
                if (p.color === byColor && (p.type === 'rook' || p.type === 'queen')) return true;
                break;
            }
            nr += dr; nc += dc;
        }
    }
    for (const [dr, dc] of diag) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
            const p = b[nr][nc];
            if (p) {
                if (p.color === byColor && (p.type === 'bishop' || p.type === 'queen')) return true;
                break;
            }
            nr += dr; nc += dc;
        }
    }
    return false;
}

function isInCheck(b, color) {
    const k = findKing(b, color);
    if (!k) return false;
    return isSquareAttacked(b, k.row, k.col, opp(color));
}

/* Pseudo-legal moves for the piece at (r,c) — no self-check filter */
function rawMoves(b, r, c) {
    const piece = b[r][c];
    if (!piece) return [];
    const moves = [];
    const push = (row, col, extra = {}) => moves.push({ from: { row: r, col: c }, to: { row, col }, ...extra });

    switch (piece.type) {
        case 'pawn': {
            const dir = piece.color === 'white' ? -1 : 1;
            const start = piece.color === 'white' ? 6 : 1;
            const promoRow = piece.color === 'white' ? 0 : 7;
            const oneR = r + dir;
            if (inBounds(oneR, c) && isEmpty(b, oneR, c)) {
                if (oneR === promoRow) ['queen','rook','bishop','knight'].forEach(p => push(oneR, c, { promotion: p }));
                else push(oneR, c);
                const twoR = r + 2 * dir;
                if (r === start && isEmpty(b, twoR, c)) push(twoR, c, { double: true });
            }
            for (const dc of [-1, 1]) {
                const cr = oneR, cc = c + dc;
                if (!inBounds(cr, cc)) continue;
                const target = b[cr][cc];
                if (target && target.color !== piece.color) {
                    if (cr === promoRow) ['queen','rook','bishop','knight'].forEach(p => push(cr, cc, { promotion: p, capture: true }));
                    else push(cr, cc, { capture: true });
                } else if (b.ep && b.ep.row === cr && b.ep.col === cc) {
                    push(cr, cc, { enpassant: true });
                }
            }
            break;
        }
        case 'rook':
            slide(b, r, c, [[1,0],[-1,0],[0,1],[0,-1]], push); break;
        case 'bishop':
            slide(b, r, c, [[1,1],[1,-1],[-1,1],[-1,-1]], push); break;
        case 'queen':
            slide(b, r, c, [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]], push); break;
        case 'knight':
            for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
                const nr = r + dr, nc = c + dc;
                if (inBounds(nr, nc) && (!b[nr][nc] || b[nr][nc].color !== piece.color))
                    push(nr, nc, { capture: !!b[nr][nc] });
            }
            break;
        case 'king':
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    const nr = r + dr, nc = c + dc;
                    if (inBounds(nr, nc) && (!b[nr][nc] || b[nr][nc].color !== piece.color))
                        push(nr, nc, { capture: !!b[nr][nc] });
                }
            // Castling
            if (!piece.hasMoved) {
                const tr = b.castling;
                if (piece.color === 'white' && r === 7) {
                    if (tr.whiteK && b[7][5] === null && b[7][6] === null && b[7][7] && b[7][7].type === 'rook' && !b[7][7].hasMoved)
                        push(7, 6, { castling: 'kingside' });
                    if (tr.whiteQ && b[7][1] === null && b[7][2] === null && b[7][3] === null && b[7][0] && b[7][0].type === 'rook' && !b[7][0].hasMoved)
                        push(7, 2, { castling: 'queenside' });
                }
                if (piece.color === 'black' && r === 0) {
                    if (tr.blackK && b[0][5] === null && b[0][6] === null && b[0][7] && b[0][7].type === 'rook' && !b[0][7].hasMoved)
                        push(0, 6, { castling: 'kingside' });
                    if (tr.blackQ && b[0][1] === null && b[0][2] === null && b[0][3] === null && b[0][0] && b[0][0].type === 'rook' && !b[0][0].hasMoved)
                        push(0, 2, { castling: 'queenside' });
                }
            }
            break;
    }
    return moves;
}

function slide(b, r, c, dirs, push) {
    const piece = b[r][c];
    for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
            const t = b[nr][nc];
            if (!t) push(nr, nc);
            else { if (t.color !== piece.color) push(nr, nc, { capture: true }); break; }
            nr += dr; nc += dc;
        }
    }
}

/* Apply a move to a board IN PLACE (no clone). */
function performMoveOn(b, m) {
    const from = m.from, to = m.to;
    const piece = b[from.row][from.col];

    if (m.castling) {
        const row = from.row;
        if (m.castling === 'kingside') {
            b[row][5] = b[row][7]; b[row][7] = null;
            if (b[row][5]) b[row][5].hasMoved = true;
        } else {
            b[row][3] = b[row][0]; b[row][0] = null;
            if (b[row][3]) b[row][3].hasMoved = true;
        }
    }

    if (m.enpassant) {
        const capRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
        b[capRow][to.col] = null;
    }

    let newType = piece.type;
    if (piece.type === 'pawn' && (to.row === 0 || to.row === 7)) newType = m.promotion || 'queen';

    b[to.row][to.col] = { ...piece, type: newType, hasMoved: true };
    b[from.row][from.col] = null;

    // Castling rights
    if (piece.type === 'king') b.castling[piece.color + 'K'] = b.castling[piece.color + 'Q'] = false;
    if (piece.type === 'rook') {
        if (from.row === 7 && from.col === 0) b.castling.whiteQ = false;
        if (from.row === 7 && from.col === 7) b.castling.whiteK = false;
        if (from.row === 0 && from.col === 0) b.castling.blackQ = false;
        if (from.row === 0 && from.col === 7) b.castling.blackK = false;
    }
    // Capture of a rook on its home square removes opponent right
    const removeRight = (rr, cc, color) => {
        if (rr === 7 && cc === 0) b.castling.whiteQ = false;
        if (rr === 7 && cc === 7) b.castling.whiteK = false;
        if (rr === 0 && cc === 0) b.castling.blackQ = false;
        if (rr === 0 && cc === 7) b.castling.blackK = false;
    };
    if (b[to.row][to.col] && b[to.row][to.col].color !== piece.color) removeRight(to.row, to.col);

    // En passant target
    b.ep = null;
    if (piece.type === 'pawn' && m.double) b.ep = { row: (from.row + to.row) / 2, col: from.col };
}

/* Legal moves for the piece at (r,c) */
function legalMovesFrom(b, r, c) {
    const piece = b[r][c];
    if (!piece) return [];
    const cand = rawMoves(b, r, c);
    const result = [];
    for (const m of cand) {
        if (m.castling) {
            // King must not be in check, pass through attacked square, or land on attacked square
            const k = b[r][c];
            const enemy = opp(k.color);
            const row = r;
            if (isSquareAttacked(b, row, c, enemy)) continue; // currently in check -> can't castle
            const step = m.castling === 'kingside' ? 1 : -1;
            const midCol = c + step;
            if (isSquareAttacked(b, row, midCol, enemy)) continue;
            if (isSquareAttacked(b, m.to.row, m.to.col, enemy)) continue;
            result.push(m);
            continue;
        }
        const nb = cloneBoard(b);
        performMoveOn(nb, m);
        if (!isInCheck(nb, piece.color)) result.push(m);
    }
    return result;
}

function allLegalMoves(b, color) {
    const moves = [];
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (b[r][c] && b[r][c].color === color)
                legalMovesFrom(b, r, c).forEach(m => moves.push(m));
    return moves;
}

/* Would this move leave own king in check? (used by UI selection) */
function isMoveLegal(b, m, color) {
    const nb = cloneBoard(b);
    performMoveOn(nb, m);
    return !isInCheck(nb, color);
}

/* =====================================================================
   AI  (Negamax + alpha-beta + quiescence)
   ===================================================================== */
function evaluate(b) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (!p) continue;
            const val = PIECE_VALUES[p.type];
            const pst = PST[p.type][p.color === 'white' ? r * 8 + c : (7 - r) * 8 + c];
            const total = val + pst;
            score += p.color === 'white' ? total : -total;
        }
    }
    return score;
}

function orderMoves(moves) {
    // Captures first (MVV-LVA-ish), promotions high
    return moves.sort((a, b) => {
        const score = m => (m.capture ? 10 : 0) + (m.promotion ? 8 : 0) + (m.enpassant ? 5 : 0);
        return score(b) - score(a);
    });
}

function quiescence(b, color, alpha, beta) {
    const standPat = (color === 'white' ? 1 : -1) * evaluate(b);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const caps = allLegalMoves(b, color).filter(m => m.capture || m.enpassant);
    for (const m of caps) {
        if (performance.now() > aiDeadline) break;
        const nb = cloneBoard(b);
        performMoveOn(nb, m);
        const score = -quiescence(nb, opp(color), -beta, -alpha);
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

function negamax(b, color, depth, alpha, beta) {
    if (performance.now() > aiDeadline) return quiescence(b, color, alpha, beta);
    if (depth === 0) return quiescence(b, color, alpha, beta);
    const moves = orderMoves(allLegalMoves(b, color));
    if (moves.length === 0) {
        if (isInCheck(b, color)) return -MATE - depth; // prefer faster mates
        return 0; // stalemate
    }
    let best = -Infinity;
    for (const m of moves) {
        const nb = cloneBoard(b);
        performMoveOn(nb, m);
        const score = -negamax(nb, opp(color), depth - 1, -beta, -alpha);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

let aiDeadline = Infinity;

function chooseAIMove(difficulty) {
    const b = gameState.board;
    const color = gameState.currentPlayer;
    const moves = orderMoves(allLegalMoves(b, color));
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    const depth = difficulty === 'hard' ? 3 : 2;
    aiDeadline = performance.now() + (difficulty === 'hard' ? 2500 : 800);
    let best = -Infinity, bestMove = moves[0];
    for (const m of moves) {
        const nb = cloneBoard(b);
        performMoveOn(nb, m);
        const score = -negamax(nb, opp(color), depth - 1, -Infinity, Infinity);
        if (score > best) { best = score; bestMove = m; }
    }
    return bestMove;
}

/* =====================================================================
   3D VIEW (Three.js)
   ===================================================================== */
const View = {
    ready: false,
    busy: false,
    scene: null, camera: null, renderer: null, controls: null, raycaster: null,
    boardGroup: null, pieceGroup: null, highlightGroup: null,
    pieceMeshes: null,          // 8x8 of meshes
    squareMeshes: null,         // 8x8 of square meshes
    materials: {}, clock: null, tweens: [], selectedRing: null
};

function squareToWorld(row, col) {
    return { x: (col - BOARD_HALF) , z: (row - BOARD_HALF) };
}

function webglAvailable() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
}

function initThree() {
    if (typeof THREE === 'undefined') return false;
    if (!webglAvailable()) return false;
    const container = document.getElementById('boardContainer');
    const canvas = document.getElementById('chessCanvas');
    const w = container.clientWidth || 560, h = container.clientHeight || 560;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (renderer.physicallyCorrectLights !== undefined) renderer.physicallyCorrectLights = false;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping, renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0818, 18, 34);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 9.5, 10.5);
    camera.lookAt(0, 0, 0);

    // Lights
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20160f, 0.55));
    const amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);

    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(-6, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(8, 6, -6); scene.add(fill);

    const neon = new THREE.PointLight(0x00f2fe, 0.6, 30); neon.position.set(-5, 5, 6); scene.add(neon);
    const neon2 = new THREE.PointLight(0xbc00ff, 0.5, 30); neon2.position.set(6, 4, -6); scene.add(neon2);

    // Controls
    let controls = null;
    if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 8;
        controls.maxDistance = 20;
        controls.minPolarAngle = 0.25;
        controls.maxPolarAngle = 1.15;
        controls.target.set(0, 0, 0);
        controls.update();
    }

    // Board group
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const pieceGroup = new THREE.Group();
    boardGroup.add(pieceGroup);

    const highlightGroup = new THREE.Group();
    boardGroup.add(highlightGroup);

    // Materials
    View.materials.white = new THREE.MeshPhysicalMaterial({ color: 0xf3ece0, roughness: 0.35, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    View.materials.black = new THREE.MeshPhysicalMaterial({ color: 0x2b2320, roughness: 0.5, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.5 });

    // Build board squares + frame
    buildBoard(boardGroup);

    Object.assign(View, { scene, camera, renderer, controls, raycaster: new THREE.Raycaster(),
        boardGroup, pieceGroup, highlightGroup, pieceMeshes: null, squareMeshes: null, clock: new THREE.Clock(), tweens: [] });

    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const loading = document.getElementById('loading3d');
    if (loading) loading.classList.add('hidden');

    View.ready = true;
    animate();
    return true;
}

function buildBoard(group) {
    const sq = new THREE.Group();
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xe9d3ad, roughness: 0.7, metalness: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7, metalness: 0.05 });
    const geo = new THREE.BoxGeometry(SQUARE * 0.98, 0.2, SQUARE * 0.98);
    View.squareMeshes = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const mat = (r + c) % 2 === 0 ? lightMat : darkMat;
            const m = new THREE.Mesh(geo, mat);
            const p = squareToWorld(r, c);
            m.position.set(p.x, -0.1, p.z);
            m.receiveShadow = true;
            m.userData = { kind: 'square', row: r, col: c };
            sq.add(m);
            View.squareMeshes[r][c] = m;
        }
    }
    group.add(sq);

    // Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.5, metalness: 0.2 });
    const t = 0.5, frameY = -0.1;
    const mk = (w, d, x, z) => {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), frameMat);
        f.position.set(x, frameY, z); f.receiveShadow = true; f.castShadow = true; group.add(f);
    };
    const span = 8 * SQUARE + t;
    mk(span, t, 0, -BOARD_HALF - SQUARE / 2 - t / 2);
    mk(span, t, 0,  BOARD_HALF + SQUARE / 2 + t / 2);
    mk(t, span, -BOARD_HALF - SQUARE / 2 - t / 2, 0);
    mk(t, span,  BOARD_HALF + SQUARE / 2 + t / 2, 0);

    // Ground shadow catcher
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.21; ground.receiveShadow = true;
    group.add(ground);
}

/* ---- Piece geometry (procedural) ---- */
function lathe(points, seg = 28) {
    const v = points.map(p => new THREE.Vector2(p[0], p[1]));
    return new THREE.LatheGeometry(v, seg);
}
function addLathe(group, points, mat, y = 0) {
    const g = lathe(points);
    const m = new THREE.Mesh(g, mat);
    m.position.y = y; m.castShadow = true;
    group.add(m);
}
function makeBase(mat) {
    const g = new THREE.Group();
    addLathe(g, [[0,0],[0.34,0],[0.34,0.05],[0.26,0.08],[0.22,0.12],[0,0.12]], mat);
    return g;
}
function sphere(r, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat); m.castShadow = true; return m; }

function createPieceMesh(type, color) {
    const mat = View.materials[color];
    const group = new THREE.Group();
    const base = makeBase(mat); group.add(base);

    switch (type) {
        case 'pawn': {
            addLathe(group, [[0,0.12],[0.20,0.12],[0.20,0.16],[0.12,0.20],[0.10,0.34],[0.16,0.40],[0,0.44]], mat);
            const s = sphere(0.13, mat); s.position.y = 0.50; group.add(s);
            break;
        }
        case 'rook': {
            addLathe(group, [[0,0.12],[0.24,0.12],[0.24,0.18],[0.18,0.22],[0.20,0.40],[0.24,0.46],[0.24,0.54],[0,0.54]], mat);
            // crenellations
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.09), mat);
                box.position.set(Math.cos(a) * 0.20, 0.58, Math.sin(a) * 0.20);
                box.castShadow = true; group.add(box);
            }
            break;
        }
        case 'bishop': {
            addLathe(group, [[0,0.12],[0.22,0.12],[0.22,0.18],[0.14,0.22],[0.10,0.40],[0.16,0.50],[0.10,0.58],[0,0.60]], mat);
            const s = sphere(0.08, mat); s.position.y = 0.64; group.add(s);
            break;
        }
        case 'knight': {
            const shape = new THREE.Shape();
            const pts = [[0.0,0.0],[0.18,0.0],[0.20,0.18],[0.30,0.28],[0.26,0.40],
                        [0.14,0.42],[0.16,0.55],[0.05,0.50],[0.02,0.40],[-0.10,0.30],
                        [-0.14,0.18],[-0.14,0.05]];
            shape.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
            shape.closePath();
            const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, steps: 1 });
            geo.center();
            const head = new THREE.Mesh(geo, mat);
            head.castShadow = true;
            head.position.y = 0.40;
            group.add(head);
            break;
        }
        case 'queen': {
            addLathe(group, [[0,0.12],[0.24,0.12],[0.24,0.18],[0.15,0.22],[0.11,0.42],[0.18,0.56],[0.12,0.66],[0,0.68]], mat);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const s = sphere(0.055, mat);
                s.position.set(Math.cos(a) * 0.15, 0.72, Math.sin(a) * 0.15);
                group.add(s);
            }
            const top = sphere(0.08, mat); top.position.y = 0.78; group.add(top);
            break;
        }
        case 'king': {
            addLathe(group, [[0,0.12],[0.24,0.12],[0.24,0.18],[0.15,0.22],[0.11,0.42],[0.18,0.56],[0.13,0.68],[0,0.70]], mat);
            const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), mat);
            v.position.y = 0.82; v.castShadow = true; group.add(v);
            const h = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.07, 0.07), mat);
            h.position.y = 0.78; h.castShadow = true; group.add(h);
            break;
        }
    }

    group.userData = { kind: 'piece', type, color };
    return group;
}

function placePieceMesh(row, col, mesh) {
    const p = squareToWorld(row, col);
    mesh.position.set(p.x, 0, p.z);
    // Knights face the opponent
    if (mesh.userData.type === 'knight') {
        mesh.rotation.y = mesh.userData.color === 'white' ? Math.PI / 2 : -Math.PI / 2;
    }
}

function syncBoard3D() {
    // remove existing
    if (View.pieceMeshes) {
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (View.pieceMeshes[r][c]) View.pieceGroup.remove(View.pieceMeshes[r][c]);
    }
    View.pieceMeshes = Array.from({ length: 8 }, () => Array(8).fill(null));
    const b = gameState.board;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (!p) continue;
            const mesh = createPieceMesh(p.type, p.color);
            placePieceMesh(r, c, mesh);
            View.pieceGroup.add(mesh);
            View.pieceMeshes[r][c] = mesh;
        }
    }
}

function updateHighlights3D() {
    // clear
    while (View.highlightGroup.children.length) {
        const m = View.highlightGroup.children.pop();
        View.highlightGroup.remove(m);
    }
    const disc = (row, col, color, opacity = 0.55) => {
        const g = new THREE.CircleGeometry(0.4, 32);
        const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const mesh = new THREE.Mesh(g, m);
        mesh.rotation.x = -Math.PI / 2;
        const p = squareToWorld(row, col);
        mesh.position.set(p.x, 0.02, p.z);
        View.highlightGroup.add(mesh);
    };

    if (gameState.selectedPiece) {
        disc(gameState.selectedPiece.row, gameState.selectedPiece.col, 0x00f2fe, 0.7);
    }
    gameState.validMoves.forEach(m => {
        const cap = m.capture || m.enpassant;
        disc(m.to.row, m.to.col, cap ? 0xff006e : 0x00ff88, cap ? 0.6 : 0.5);
    });
    // check indicator (highlight the king of the side to move, if in check)
    if (isInCheck(gameState.board, gameState.currentPlayer)) {
        const k = findKing(gameState.board, gameState.currentPlayer);
        if (k) disc(k.row, k.col, 0xff3030, 0.8);
    }
}

function onResize() {
    if (!View.ready) return;
    const container = document.getElementById('boardContainer');
    const w = container.clientWidth, h = container.clientHeight;
    View.camera.aspect = w / h; View.camera.updateProjectionMatrix();
    View.renderer.setSize(w, h, false);
}

function onPointerDown(e) {
    if (!View.ready || gameState.gameOver || gameState.thinking || View.busy) return;
    if (gameState.gameMode === 'pvai' && gameState.currentPlayer === 'black') return;
    if (gameState.gameMode === 'aivai') return;

    const rect = View.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    View.raycaster.setFromCamera({ x: nx, y: ny }, View.camera);
    const targets = [];
    View.pieceGroup.traverse(o => { if (o.isMesh) targets.push(o); });
    View.squareMeshes.forEach(row => row.forEach(m => targets.push(m)));
    const hits = View.raycaster.intersectObjects(targets, false);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && !obj.userData.kind) obj = obj.parent;
    if (!obj || !obj.userData.kind) return;

    let row, col;
    if (obj.userData.kind === 'square') {
        row = obj.userData.row; col = obj.userData.col;
    } else {
        // piece: find its board coordinate via the mesh map
        outer:
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (View.pieceMeshes[r][c] === obj) { row = r; col = c; break outer; }
    }
    if (typeof row === 'number') onSquareClick(row, col);
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(View.clock.getDelta(), 0.05);
    updateTweens(dt);
    if (View.controls) View.controls.update();
    View.renderer.render(View.scene, View.camera);
}

function updateTweens(dt) {
    for (let i = View.tweens.length - 1; i >= 0; i--) {
        const tw = View.tweens[i];
        tw.t += dt / tw.dur;
        const k = Math.min(tw.t, 1);
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        if (tw.type === 'move') {
            tw.obj.position.lerpVectors(tw.from, tw.to, ease);
            tw.obj.position.y = Math.sin(k * Math.PI) * 0.6; // arc
        } else if (tw.type === 'capture') {
            // Lift + shrink (do NOT touch shared material opacity)
            tw.obj.position.y = tw.startY + k * 1.2;
            const s = Math.max(0.01, 1 - k);
            tw.obj.scale.set(s, s, s);
        }
        if (k >= 1) {
            if (tw.onDone) tw.onDone();
            View.tweens.splice(i, 1);
        }
    }
}

function animateMove3D(move, info, onDone) {
    const { movingMesh: mesh, capturedMesh: captured, promoting } = info;
    const to = move.to;

    View.busy = true;

    if (captured) {
        if (move.enpassant) View.pieceMeshes[move.from.row][move.to.col] = null;
        View.tweens.push({ type: 'capture', obj: captured, startY: captured.position.y, t: 0, dur: 0.35,
            onDone: () => { View.pieceGroup.remove(captured); captured.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } });
    }

    View.pieceMeshes[to.row][to.col] = mesh;
    View.pieceMeshes[move.from.row][move.from.col] = null;

    const pTo = squareToWorld(to.row, to.col);
    const toVec = new THREE.Vector3(pTo.x, 0, pTo.z);
    View.tweens.push({ type: 'move', obj: mesh, from: mesh.position.clone(), to: toVec, t: 0, dur: 0.4,
        onDone: () => {
            mesh.position.copy(toVec);
            if (promoting) {
                View.pieceGroup.remove(mesh);
                const np = createPieceMesh(move.promotion || 'queen', gameState.board[to.row][to.col].color);
                placePieceMesh(to.row, to.col, np);
                View.pieceGroup.add(np);
                View.pieceMeshes[to.row][to.col] = np;
            }
            View.busy = false;
            if (onDone) onDone();
        } });

    // castling rook slide
    if (move.castling) {
        const row = move.from.row;
        const rookFromCol = move.castling === 'kingside' ? 7 : 0;
        const rookToCol = move.castling === 'kingside' ? 5 : 3;
        const rook = View.pieceMeshes[row][rookFromCol];
        View.pieceMeshes[row][rookToCol] = rook;
        View.pieceMeshes[row][rookFromCol] = null;
        const rp = squareToWorld(row, rookToCol);
        View.tweens.push({ type: 'move', obj: rook, from: rook.position.clone(), to: new THREE.Vector3(rp.x, 0, rp.z), t: 0, dur: 0.4 });
    }
}

/* =====================================================================
   VIEW MODE
   Default to the reliable 2D board (every device, mouse + touch).
   Real WebGL 3D is opt-in via the "3D VIEW" button, activated only when
   WebGL + Three.js are available on the device.
   ===================================================================== */
let use3D = false;

function renderBoard2D() {
    const boardEl = document.getElementById('boardContainer');
    let el = document.getElementById('chessBoard');
    if (!el) {
        el = document.createElement('div');
        el.id = 'chessBoard'; el.className = 'chess-board';
        boardEl.appendChild(el);
    }
    el.classList.toggle('flipped', gameState.isFlipped);
    el.innerHTML = '';
    const b = gameState.board;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            sq.dataset.row = r; sq.dataset.col = c;
            if (gameState.selectedPiece && gameState.selectedPiece.row === r && gameState.selectedPiece.col === c) sq.classList.add('selected');
            const mv = gameState.validMoves.find(m => m.to.row === r && m.to.col === c);
            if (mv) sq.classList.add(mv.capture || mv.enpassant ? 'highlight-capture' : 'highlight-move');
            const enemy = opp(gameState.currentPlayer);
            if (b[r][c] && b[r][c].type === 'king' && b[r][c].color === enemy && isInCheck(b, enemy)) sq.classList.add('check');
            if (b[r][c]) {
                const pe = document.createElement('div');
                pe.className = 'piece ' + b[r][c].color;
                const span = document.createElement('span');
                span.className = 'piece-symbol';
                span.textContent = UNICODE[b[r][c].color][b[r][c].type];
                pe.appendChild(span);
                sq.appendChild(pe);
            }
            sq.addEventListener('click', () => onSquareClick(r, c));
            el.appendChild(sq);
        }
    }
}

/* =====================================================================
   INTERACTION / GAME FLOW
   ===================================================================== */
function startGame(mode) {
    gameState.gameMode = mode;
    gameState.board = initializeBoard();
    gameState.currentPlayer = 'white';
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    gameState.moveHistory = [];
    gameState.history = [];
    gameState.gameOver = false;
    gameState.thinking = false;
    gameState.isFlipped = false; // White (human) starts at the bottom

    document.getElementById('modeOverlay').classList.add('hidden');
    document.getElementById('gameContainer').style.display = 'block';
    document.getElementById('gameOverModal').classList.remove('active');

    if (use3D) { syncBoard3D(); updateHighlights3D(); }
    else renderBoard2D();

    updateStatus();
    updateTimers();
    updateMoveHistory();

    if (mode === 'aivai') { gameState.timers.active = false; setTimeout(aiMove, 600); }
    else if (mode === 'pvai' && gameState.currentPlayer === 'black') setTimeout(aiMove, 600);
}

function onSquareClick(row, col) {
    if (gameState.gameOver || gameState.thinking || View.busy) return;
    const b = gameState.board;
    const clicked = b[row][col];

    if (gameState.selectedPiece) {
        const mv = gameState.validMoves.find(m => m.to.row === row && m.to.col === col);
        if (mv) { commitMove(mv); return; }
    }
    if (clicked && clicked.color === gameState.currentPlayer) {
        selectPiece(row, col);
        return;
    }
    deselect();
}

function selectPiece(row, col) {
    gameState.selectedPiece = { row, col };
    gameState.validMoves = legalMovesFrom(gameState.board, row, col);
    playSound('click');
    if (use3D) updateHighlights3D(); else renderBoard2D();
}

function deselect() {
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    if (use3D) updateHighlights3D(); else renderBoard2D();
}

function commitMove(move) {
    // Human promotion: ask which piece
    const from = move.from, to = move.to;
    const piece = gameState.board[from.row][from.col];
    const isPromotion = piece.type === 'pawn' && (to.row === 0 || to.row === 7);

    if (isPromotion && !move.promotion) {
        showPromotionDialog((promo) => {
            move.promotion = promo;
            finishCommit(move);
        });
        return;
    }
    finishCommit(move);
}

function finishCommit(move) {
    // Capture info BEFORE mutating the logical board
    const fromPiece = gameState.board[move.from.row][move.from.col];
    const movingColor = fromPiece.color;
    const wasCapture = !!(gameState.board[move.to.row][move.to.col]) || move.enpassant;
    const promoting = fromPiece.type === 'pawn' && (move.to.row === 0 || move.to.row === 7);

    // Pre-compute captured mesh for the 3D view (before the logical move)
    let capturedMesh = null, movingMesh = null;
    if (use3D && View.pieceMeshes) {
        movingMesh = View.pieceMeshes[move.from.row][move.from.col];
        if (move.enpassant) capturedMesh = View.pieceMeshes[move.from.row][move.to.col];
        else if (gameState.board[move.to.row][move.to.col]) capturedMesh = View.pieceMeshes[move.to.row][move.to.col];
    }

    // Snapshot + logical update (needed before afterMove reads the board)
    gameState.history.push(cloneBoard(gameState.board));
    performMoveOn(gameState.board, move);

    if (use3D) {
        try {
            animateMove3D(move, { movingMesh, capturedMesh, promoting }, () => afterMove(move, wasCapture, movingColor));
        } catch (e) {
            console.error('3D animation error, falling back to sync', e);
            syncBoard3D();
            afterMove(move, wasCapture, movingColor);
        }
    }
    else { renderBoard2D(); afterMove(move, wasCapture, movingColor); }
}

function afterMove(move, wasCapture, movingColor) {
    playSound(wasCapture ? 'capture' : 'move');

    recordMove(move, movingColor);
    gameState.currentPlayer = opp(gameState.currentPlayer);
    gameState.selectedPiece = null;
    gameState.validMoves = [];

    if (use3D) updateHighlights3D();

    checkGameState();
    updateStatus();

    const aiTurn = !gameState.gameOver &&
        (gameState.gameMode === 'aivai' ||
         (gameState.gameMode === 'pvai' && gameState.currentPlayer === 'black'));
    gameState.thinking = aiTurn;

    // AI turns
    if (aiTurn) setTimeout(aiMove, 500);
}

function aiMove() {
    if (gameState.gameOver) return;
    gameState.thinking = true;
    setStatus('AI THINKING…');
    // defer so the UI can paint the "thinking" state
    setTimeout(() => {
        let move;
        try {
            move = chooseAIMove(gameState.aiDifficulty);
        } catch (e) {
            console.error('AI search error', e);
            move = null;
        }
        gameState.thinking = false;
        // Fallback: if the search failed or found nothing, pick any legal move so
        // the game can never freeze on "AI THINKING…".
        if (!move) {
            const all = allLegalMoves(gameState.board, gameState.currentPlayer);
            move = all.length ? all[Math.floor(Math.random() * all.length)] : null;
        }
        if (!move) { checkGameState(); return; }
        // AI promotion defaults to queen
        if (!move.promotion && gameState.board[move.from.row][move.from.col].type === 'pawn' &&
            (move.to.row === 0 || move.to.row === 7)) move.promotion = 'queen';
        finishCommit(move);
    }, 30);
}

/* ----------------------------- Game state checks ----------------------------- */
function checkGameState() {
    const player = gameState.currentPlayer;
    if (isInCheck(gameState.board, player)) {
        playSound('check');
        if (allLegalMoves(gameState.board, player).length === 0) {
            endGame('checkmate', opp(player));
            return;
        }
    } else if (allLegalMoves(gameState.board, player).length === 0) {
        endGame('stalemate', null);
        return;
    }
    // (no 50-move / insufficient-material handling for simplicity)
}

function endGame(type, winner) {
    gameState.gameOver = true;
    const modal = document.getElementById('gameOverModal');
    const result = document.getElementById('gameResult');
    const resultText = document.getElementById('gameResultText');
    if (type === 'checkmate') {
        result.textContent = 'CHECKMATE!';
        resultText.textContent = `${winner.toUpperCase()} WINS!`;
        createConfetti(); playSound('win');
    } else {
        result.textContent = 'DRAW!';
        resultText.textContent = 'STALEMATE';
        playSound('draw');
    }
    modal.classList.add('active');
}

/* ----------------------------- Move history (algebraic) ----------------------------- */
const LETTERS = 'abcdefgh';
function squareName(r, c) { return LETTERS[c] + (8 - r); }

function recordMove(move, moverColor) {
    const b = gameState.board;
    const piece = move.promotion ? { type: move.promotion } : b[move.to.row][move.to.col];
    const isCastle = move.castling;
    let san = '';
    if (isCastle) san = move.castling === 'kingside' ? 'O-O' : 'O-O-O';
    else {
        const letter = piece.type === 'pawn' ? '' : piece.type[0].toUpperCase();
        if (move.capture || move.enpassant) {
            if (piece.type === 'pawn') san += LETTERS[move.from.col] + 'x';
            else san += letter + 'x';
        } else san += letter;
        san += squareName(move.to.row, move.to.col);
        if (move.promotion) san += '=' + move.promotion[0].toUpperCase();
    }
    // determine check / mate after this move
    const nb = cloneBoard(b);
    if (isInCheck(nb, opp(moverColor))) san += allLegalMoves(nb, opp(moverColor)).length === 0 ? '#' : '+';

    const ply = gameState.moveHistory.length + 1;
    gameState.moveHistory.push({ ply, san, color });
    updateMoveHistory();
}

function updateMoveHistory() {
    const el = document.getElementById('moveHistory');
    el.innerHTML = '';
    for (let i = 0; i < gameState.moveHistory.length; i += 2) {
        const w = gameState.moveHistory[i];
        const bl = gameState.moveHistory[i + 1];
        const rowEl = document.createElement('div');
        rowEl.className = 'move-entry';
        const num = (i / 2 + 1) + '.';
        rowEl.textContent = `${num} ${w.san}${bl ? '  ' + bl.san : ''}`;
        if (w.san.includes('#') || (bl && bl.san.includes('#'))) rowEl.classList.add('checkmate');
        else if (w.san.includes('+') || (bl && bl.san.includes('+'))) rowEl.classList.add('check');
        el.appendChild(rowEl);
    }
    el.scrollTop = el.scrollHeight;
}

/* ----------------------------- Promotion modal ----------------------------- */
function showPromotionDialog(cb) {
    const modal = document.getElementById('promotionModal');
    modal.classList.add('active');
    document.querySelectorAll('[data-piece]').forEach(btn => {
        btn.onclick = () => {
            modal.classList.remove('active');
            cb(btn.dataset.piece);
        };
    });
}

/* ----------------------------- Status / timers ----------------------------- */
function setStatus(text, cls = '') {
    const el = document.getElementById('gameStatus');
    el.textContent = text;
    el.className = 'game-status' + (cls ? ' ' + cls : '');
}
function updateStatus() {
    if (gameState.gameOver) { setStatus('GAME OVER'); return; }
    const inChk = isInCheck(gameState.board, gameState.currentPlayer);
    const turn = gameState.gameMode === 'pvai' && gameState.currentPlayer === 'black' ? 'AI' :
                 gameState.gameMode === 'aivai' ? 'ENGINE' : gameState.currentPlayer.toUpperCase();
    setStatus(`${turn}'S TURN`, inChk ? 'check' : '');
}

function updateTimers() {
    document.getElementById('whiteTimer').textContent = formatTime(gameState.timers.white);
    document.getElementById('blackTimer').textContent = formatTime(gameState.timers.black);
}
function startTimer() {
    if (!gameState.timers.active || gameState.gameOver) return;
    const interval = setInterval(() => {
        const p = gameState.currentPlayer;
        if (gameState.timers[p] > 0) {
            gameState.timers[p]--;
            updateTimers();
            const t = document.getElementById(`${p}Timer`);
            t.classList.toggle('critical', gameState.timers[p] < 30);
            t.classList.toggle('warning', gameState.timers[p] < 60 && gameState.timers[p] >= 30);
            if (gameState.timers[p] === 0) {
                clearInterval(interval);
                endGame('timeout', p === 'white' ? 'black' : 'white');
            }
        }
    }, 1000);
}
function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

/* ----------------------------- Confetti / particles ----------------------------- */
function createConfetti() {
    const c = document.getElementById('confetti');
    const colors = ['#00f2fe', '#bc00ff', '#ff00c8', '#00ff88'];
    for (let i = 0; i < 120; i++) {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDelay = Math.random() * 2 + 's';
        el.style.animationDuration = (Math.random() * 2 + 2) + 's';
        el.style.width = (Math.random() * 8 + 5) + 'px';
        el.style.height = (Math.random() * 8 + 5) + 'px';
        c.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }
}
function createParticles() {
    const c = document.getElementById('particles');
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.animationDuration = (Math.random() * 5 + 5) + 's';
        c.appendChild(p);
    }
}

/* ----------------------------- Undo / flip / menu ----------------------------- */
function undoMove() {
    if (gameState.gameOver || gameState.thinking || gameState.history.length === 0) return;
    // In PVAI, undo back to the human's turn (pop AI move + human move)
    const popOne = () => {
        const prev = gameState.history.pop();
        if (prev) {
            gameState.board = prev;
            gameState.moveHistory.pop();
            gameState.currentPlayer = opp(gameState.currentPlayer);
        }
    };
    if (gameState.gameMode === 'pvai' || gameState.gameMode === 'aivai') {
        if (gameState.history.length >= 1) popOne();
        if (gameState.history.length >= 1 && gameState.gameMode === 'pvai') popOne();
        if (gameState.gameMode === 'aivai' && gameState.history.length >= 1) popOne();
    } else {
        popOne();
    }
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    gameState.gameOver = false;
    document.getElementById('gameOverModal').classList.remove('active');
    if (use3D) { syncBoard3D(); updateHighlights3D(); } else renderBoard2D();
    updateMoveHistory();
    updateStatus();
    playSound('click');
}

function flipBoard() {
    gameState.isFlipped = !gameState.isFlipped;
    if (use3D) {
        View.boardGroup.rotation.y = gameState.isFlipped ? Math.PI : 0;
    } else {
        document.getElementById('chessBoard').classList.toggle('flipped', gameState.isFlipped);
    }
    playSound('click');
}

/* ----------------------------- Wiring / init ----------------------------- */
function setupEventListeners() {
    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            if (mode === 'pvai') document.getElementById('difficultyOverlay').classList.remove('hidden');
            else startGame(mode);
        });
    });
    document.querySelectorAll('[data-difficulty]').forEach(card => {
        card.addEventListener('click', () => {
            gameState.aiDifficulty = card.dataset.difficulty;
            document.getElementById('difficultyOverlay').classList.add('hidden');
            startGame('pvai');
        });
    });

    document.getElementById('undoBtn').addEventListener('click', undoMove);
    document.getElementById('flipBtn').addEventListener('click', flipBoard);
    document.getElementById('viewBtn').addEventListener('click', toggleView);
    document.getElementById('timerToggleBtn').addEventListener('click', () => {
        gameState.timers.active = !gameState.timers.active;
        if (gameState.timers.active) startTimer();
    });
    document.getElementById('rematchBtn').addEventListener('click', () => {
        document.getElementById('gameOverModal').classList.remove('active');
        startGame(gameState.gameMode);
    });
    document.getElementById('playAgainBtn').addEventListener('click', () => {
        document.getElementById('gameOverModal').classList.remove('active');
        startGame(gameState.gameMode);
    });
    document.getElementById('menuBtn').addEventListener('click', () => {
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('modeOverlay').classList.remove('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') { if (gameState.gameMode) document.getElementById('rematchBtn').click(); }
        if (e.key === 'f' || e.key === 'F') flipBoard();
        if (e.key === 'm' || e.key === 'M') document.getElementById('menuBtn').click();
        if (e.key === 'u' || e.key === 'U') undoMove();
    });
    document.addEventListener('touchmove', (e) => { if (e.scale !== 1) e.preventDefault(); }, { passive: false });
}

function init() {
    createParticles();
    setupEventListeners();
    // Default to the reliable 2D board (no WebGL needed). The 3D view is opt-in.
    use3D = false;
    const cv = document.getElementById('chessCanvas'); if (cv) cv.style.display = 'none';
}

/* Toggle between the 2D board and the real WebGL 3D view. The 3D view only
   turns on if WebGL + Three.js are available on this device. */
function toggleView() {
    const btn = document.getElementById('viewBtn');
    const boardEl = document.getElementById('chessBoard');
    const canvas = document.getElementById('chessCanvas');
    if (!use3D) {
        let ok = View.ready;
        if (!ok) { try { ok = initThree(); } catch (e) { console.error(e); ok = false; } }
        if (ok && View.ready) {
            use3D = true;
            if (boardEl) boardEl.style.display = 'none';
            if (canvas) canvas.style.display = 'block';
            syncBoard3D();
            updateHighlights3D();
            btn.textContent = '2D VIEW';
            playSound('special');
        } else {
            setStatus('3D unavailable on this device');
            btn.textContent = '3D VIEW';
        }
    } else {
        use3D = false;
        if (boardEl) boardEl.style.display = '';
        if (canvas) canvas.style.display = 'none';
        renderBoard2D();
        btn.textContent = '3D VIEW';
        playSound('click');
    }
}

document.addEventListener('DOMContentLoaded', init);
