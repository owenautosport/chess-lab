// Generates many positions per endgame drill and checks each is legal and sensible.
import { Chess } from "chess.js";
import { randomEndgame } from "../src/learn/endgame-gen.ts";
import { ENDGAMES } from "../src/learn/lessons-data.ts";

let bad = 0;
for (const e of ENDGAMES) {
  for (let i = 0; i < 300; i++) {
    const fen = randomEndgame(e);
    const c = new Chess(fen); // throws if illegal
    const pieces = c.board().flat().filter(Boolean).map((p) => (p!.color === "w" ? p!.type.toUpperCase() : p!.type)).sort().join("");
    const want = ["K", "k", ...e.pieces.split("")].sort().join("");
    const bishops = c.board().flat().flatMap((p, i) => (p?.type === "b" ? [((i % 8) + Math.floor(i / 8)) % 2] : []));
    const problems = [
      c.turn() !== "w" && "not white to move",
      c.isGameOver() && "game already over",
      c.moves().some((m) => (c.move(m), c.isCheckmate() ? (c.undo(), true) : (c.undo(), false))) && "mate in 1 available",
      pieces !== want && `pieces ${pieces} != ${want}`,
      bishops.length === 2 && bishops[0] === bishops[1] && "bishops on same colour",
      c.board().flat().some((p, i) => p?.type === "p" && (i < 16 || i >= 56)) && "pawn on rank 1, 7 or 8" // board() row 0 is rank 8,
    ].filter(Boolean);
    if (problems.length) (bad++, console.log(`✗ ${e.key} ${fen}: ${problems.join(", ")}`));
  }
  console.log(`✓ ${e.key}: 300 positions, e.g. ${randomEndgame(e)}`);
}
process.exit(bad ? 1 : 0);
