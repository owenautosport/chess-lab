# Chess Lab

A free, local chess trainer: play Stockfish, solve puzzles, and review your games.

```bash
npm install
npm run dev        # http://localhost:5173
```

## What's in it

- **Play** — Stockfish 19 at 8 strength levels, hints, take-backs, then one click to review the game.
- **Puzzles** — 9,000 rated puzzles (399–2916) with an Elo-style puzzle rating, theme drills (forks, pins, mate-in-2, endgames…), a "weakest themes" panel, and **My mistakes**, which drills the positions you got wrong in your own reviewed games.
- **My Games** — enter your chess.com username to list your games (newest first, filter by time control, W/L/D tally) and run Game Review on any of them, reviewed from your side. Uses chess.com's free public API; the dev server relays it at `/chesscom`.
- **Analysis** — free board, live top-3 engine lines and eval bar, PGN/FEN import, and **Game Review**: accuracy per side, every move marked best / inaccuracy / mistake / blunder, an eval graph, and "Best was …" coaching.

Progress (puzzle rating, theme stats, saved mistakes) lives in the browser's localStorage.

## Credits

- Board: [chessground](https://github.com/lichess-org/chessground) (GPL-3.0), cburnett pieces.
- Rules: [chess.js](https://github.com/jhlywa/chess.js).
- Engine: [stockfish.js](https://github.com/nmrugg/stockfish.js), lite single-threaded build in `public/engine/`.
- Puzzles: [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Rebuild with `scripts/build-puzzles.mjs`.
