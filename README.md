# Chess Lab

A free, local chess trainer: play Stockfish, solve puzzles, and review your games.

## Download

**[Get the desktop app from Releases](https://github.com/owenautosport/chess-lab/releases/latest)**: `.dmg` for Mac (Apple Silicon, M1 or newer) and `.exe` for Windows (64-bit).

- **Plays offline, like a phone chess app.** Small engines ship inside the app: Stockfish (8 bots from 250 to 3200) and the human-like Maia players (1100–1900, about 1.3 MB each). No internet needed for bots, puzzles, analysis or lessons.
- **AI coach: sign in with Claude or ChatGPT.** Settings → AI coach → *Claude* or *ChatGPT* → **Sign in**. It uses your own Claude (Pro/Max) or ChatGPT (Plus/Pro) plan through the free [Claude Code](https://claude.com/product/claude-code) or [Codex](https://developers.openai.com/codex/cli) command-line tool; install one first, and the sign-in happens in your browser, so the app never sees a password. API keys (Claude or OpenAI) and local models (LM Studio, Ollama) work too.

**First launch:** the app isn't signed with a paid certificate, so your computer asks once. On a Mac, if it says the app can't be opened, go to **System Settings → Privacy & Security → Open Anyway**. On Windows, press **More info → Run anyway** on the SmartScreen box.

Or **try it in your browser: https://owenautosport.github.io/chess-lab/** (no Maia bots or sign-in there).

## Building it yourself

```bash
npm install
node node_modules/electron/install.js   # npm 11 blocks install scripts, so fetch Electron once
npm run dev          # browser version, http://localhost:5173
npm run app          # desktop app (Electron)
npm run engines      # fetch lc0 + Maia into engines/ (macOS: brew install lc0 first)
npm run dist:mac     # release/Chess-Lab-<version>-mac-arm64.dmg
npm run dist:win     # release/Chess-Lab-<version>-win-x64.exe (run on Windows)
npm run install:mac  # build, install to /Applications, remove the build copy
```

**Publishing a release:** bump `version` in `package.json` and add a `CHANGELOG.md` entry, then `git tag v<version> && git push origin v<version>` (the workflow refuses a tag that doesn't match `package.json`). The *Release desktop app* workflow builds the Mac and Windows installers on GitHub's machines and attaches them to a new Release.

## Chess engines

- **Stockfish 19 lite** (1.8 MB): play levels, drills, puzzles.
- **Stockfish 19 full network** (99 MB, copied from `node_modules` by `scripts/copy-engine.mjs`): Analysis and Game Review.
- **Maia 1100–1900** via **lc0** (desktop app only): neural nets trained on human games, so they play like real club players of that rating, mistakes included. Pick them under Play → Human-like. GPL-3.0 ([CSSLab/maia-chess](https://github.com/CSSLab/maia-chess)). lc0 is the Homebrew build on Mac and the official CPU (OpenBLAS) build on Windows, fetched by `scripts/fetch-engines.mjs`.

## AI coach

Settings → AI coach picks the model behind the 🎓 coach panels (Analysis, Puzzles, lessons, opening trainer):

- **LM Studio** or **Ollama**: local and offline. Uses their OpenAI-compatible servers (`localhost:1234/v1`, `localhost:11434/v1`). The app starts LM Studio's server if it isn't running and loads the model as soon as you open a coach panel. Default: Gemma 4 31B (no hidden reasoning, so answers start quickly).
- **Claude** / **ChatGPT** (sign in): runs your own Claude Code (`claude -p`) or Codex (`codex exec`) CLI, so it bills your Claude or ChatGPT plan. Each run has no tools, no MCP servers and no saved session, in an empty temp folder, so the model can only write text. The app finds the CLI even when opened from the Dock (it reads your login shell's PATH and the usual install folders). New installs start with the coach off.
- **Claude API** / **OpenAI API**: your own key (`claude-opus-5-5` / `gpt-5.5` by default). If the Claude API is unreachable it falls back to the LM Studio model. Keys are encrypted with the OS keychain (Electron `safeStorage`) and only used in the main process.

The coach never calculates: every prompt includes Stockfish's evaluation and lines (or the verified puzzle solution) and the model is told to explain them, not contradict them.

## What's in it

- **Learn** — a **guided path** from zero to advanced (Beginner → Intermediate → Advanced, 14 units, 55 lessons), plus every course on its own under *All lessons*. Nothing is locked; the path just shows what to do next.
  - *Learn to play* (for complete beginners): the board and square names, how each piece moves (collect-the-stars mini-games with a "fewest moves" target), capturing and piece values, check and the three ways out of it, checkmate, castling, promotion, en passant, stalemate and draws, and opening principles. Every step is played on the board.
  - *Openings*: 12 openings (Italian, Ruy Lopez, Queen's Gambit, London, Scotch as White; Najdorf, French, Caro-Kann, Scandinavian, King's Indian, QGD as Black), 26 lines with move-by-move explanations. **Learn** mode shows arrows; **Practise** mode makes you play from memory (three clean runs = learned), then play on against Stockfish.
  - *Tactics* (19) and *Checkmate patterns* (22): explanation, a step-through example, then endless practice from real puzzles across five levels (five clean solves in a row to level up).
  - *Endgame technique*: queen, two-rook ladder, rook, two bishops, bishop + knight, king + pawn. Random position every time against Stockfish's best defence, with a move limit and technique steps.
  - *Practice scenarios*: random opening, middlegame and endgame positions to play out against the computer, judged by Stockfish when you finish.
- **Play** — Stockfish 19 at 8 strength levels, hints, take-backs, then one click to review the game.
- **Puzzles** — 9,000 rated puzzles (399–2916) with an Elo-style puzzle rating, theme drills (forks, pins, mate-in-2, endgames…), a "weakest themes" panel, and **My mistakes**, which drills the positions you got wrong in your own reviewed games.
- **My Games** — enter your chess.com username to list your games (newest first, filter by time control, W/L/D tally) and run Game Review on any of them, reviewed from your side. Uses chess.com's free public API; the dev server relays it at `/chesscom`.
- **Analysis** — free board, live top-3 engine lines and eval bar, PGN/FEN import, and **Game Review**: accuracy per side, every move marked best / inaccuracy / mistake / blunder, an eval graph, and "Best was …" coaching.

Progress (puzzle rating, theme stats, saved mistakes, Learn progress) lives in the browser's localStorage.

## Credits

- Board: [chessground](https://github.com/lichess-org/chessground) (GPL-3.0), cburnett pieces.
- Rules: [chess.js](https://github.com/jhlywa/chess.js).
- Engine: [stockfish.js](https://github.com/nmrugg/stockfish.js), lite single-threaded build in `public/engine/`.
- Puzzles: [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Rebuild with `scripts/build-puzzles.mjs`.

## Licence

GPL-3.0 (see `LICENSE`), as required by chessground and Stockfish. Maia networks are GPL-3.0 too; Lichess puzzles are CC0.

## Checks

```bash
node scripts/check-openings.ts   # every opening line is legal, notes point at real moves
node scripts/check-endgames.ts   # 300 generated positions per endgame drill are legal and sensible
node scripts/check-basics.ts     # every Learn-to-play exercise is legal and solvable (and its par)
```
