# Changelog

Version numbers follow [semantic versioning](https://semver.org): the middle number goes up for new features, the last for fixes. Bump `version` in `package.json` and add an entry here before every build you hand over; the release workflow refuses a tag that doesn't match `package.json`.

## 1.1.1 — 2026-11-10

### Fixed
- Board coordinates: the rank numbers were invisible (coloured the same as the square under them), and the file letters sat on the borders between squares. Numbers now sit in the top-left corner of the left-hand squares and letters in the bottom-right corner of the bottom row, like chess.com, always in the opposite colour to their square.

## 1.1.0 — 2026-11-10

### Added
- **Guided lessons path** (Learn → Guided path): Beginner → Intermediate → Advanced, 14 units and 55 lessons, from "how the pieces move" to sacrifices, famous mates and hard endgames. Shows what to do next; nothing is locked.
- **Learn to play**, 13 new beginner lessons played on the board: the board and square names, how each piece moves (collect-the-stars games with a fewest-moves target), piece values, check and the three ways out, checkmate, castling, promotion, en passant, stalemate and draws, and opening principles.
- `scripts/check-basics.ts` checks every beginner exercise is legal and solvable.
- The version number is shown in Settings → About.

### Changed
- Closer to chess.com's look: dark header strips on side panels, a "White to move / Black to move" banner on puzzles and tactic lessons, solid green/red right and wrong feedback, bigger player avatars, a roomier sidebar, square board corners.
- Learn → All lessons keeps the previous course list.

## 1.0.0 — 2026-11-10

### Added
- **Desktop download**: GitHub Releases with a Mac (Apple Silicon) `.dmg` and a Windows `.exe`, built by the *Release desktop app* workflow when a `v*` tag is pushed.
- **Sign in with Claude / ChatGPT** for the AI coach, using your own Claude Code or Codex login; OpenAI API keys alongside Claude API keys.
- Offline bots bundled in the installer: Stockfish (8 levels) and the human-like Maia players (1100–1900), with a Windows build of lc0.

### Changed
- New installs start with the AI coach off.
- The Mac app is ad-hoc signed, so a downloaded copy gets the normal "Open Anyway" prompt instead of "damaged".

## 0.0.0
- First local builds: Play, Puzzles, Analysis and Game Review, chess.com import, Learn courses, the desktop app and the offline AI coach.
