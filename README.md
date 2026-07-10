# 3D Chess Ultimate

A beautiful, fully playable 3D chess game that runs in the browser with **no build step**.
Pieces are rendered as real 3D geometry (Three.js) with lighting, soft shadows and smooth
move/capture/castling/promotion animations. If the 3D engine can't load (e.g. offline), the
game automatically falls back to a clean 2D board so it's always playable.

## Features

- **Real 3D pieces** — procedurally generated pawn/rook/bishop/knight/queen/king meshes,
  marble/wood materials, orbit camera (drag to rotate, scroll to zoom).
- **All game modes** — Player vs Player, Player vs AI, AI vs AI (spectator), and a
  simulated online mode.
- **Strong AI** — Negamax search with alpha-beta pruning, quiescence search and
  piece-square tables. Difficulties: Easy (random), Medium, Hard.
- **Correct rules** — full en passant, castling (with path/check validation), and
  accurate check / checkmate / stalemate detection.
- **Animations & polish** — sliding piece moves, captures that lift and shrink away,
  castling rook slides, promotion swaps, check glow, confetti, sound effects, move
  history with algebraic notation, and a move timer.
- **Controls** — Undo, Flip board, Toggle timer, Rematch, Main menu. Keyboard:
  `F` flip, `R` rematch, `M` menu, `U` undo.

## How to run

Just open `index.html` in a browser — no server required. The 3D view loads Three.js from a
CDN, so an internet connection is needed for 3D; offline use falls back to the 2D board.

Optionally, serve it locally:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## How to play

1. Click **PLAYER VS PLAYER**, **PLAYER VS AI**, **AI VS AI**, or **ONLINE MODE**.
2. For AI, pick **EASY / MEDIUM / HARD**.
3. Move pieces by **clicking a piece, then clicking a highlighted square**
   (green = move, red = capture). Drag to rotate the 3D camera.

## Project structure

```
index.html   – page layout, menus, modals
style.css    – neon UI theme, board/panel styling
script.js    – rules engine, 3D scene, AI, animations, input
```

## Tech

Vanilla JavaScript + [Three.js](https://threejs.org/) (r128, loaded via CDN). No bundler,
no dependencies to install.
