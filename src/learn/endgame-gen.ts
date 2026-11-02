// Random basic-endgame positions. No browser dependencies, so scripts/check-endgames.ts can test it.
import { Chess, SQUARES, type PieceSymbol, type Square } from "chess.js";
import type { Endgame } from "./lessons-data";

const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const file = (s: string) => s.charCodeAt(0) - 97;
const rank = (s: string) => +s[1] - 1;
const near = (a: string, b: string) => Math.abs(file(a) - file(b)) <= 1 && Math.abs(rank(a) - rank(b)) <= 1;
const light = (s: string) => (file(s) + rank(s)) % 2 === 1;

/** A random legal position: White to move with the endgame's pieces, Black has a bare king. */
export function randomEndgame(e: Endgame): string {
  for (;;) {
    const c = new Chess();
    c.clear();
    const used = new Set<string>();
    const place = (type: PieceSymbol, color: "w" | "b", ok: (s: string) => boolean = () => true) => {
      const s = rand(SQUARES.filter((q) => !used.has(q) && ok(q)));
      used.add(s);
      c.put({ type, color }, s as Square);
      return s;
    };
    const wk = place("k", "w");
    const bk = place("k", "b", (s) => !near(s, wk));
    let firstBishop: string | undefined;
    for (const p of e.pieces.toLowerCase()) {
      if (p === "p") place("p", "w", (s) => rank(s) >= 1 && rank(s) <= 4);
      else if (p === "b" && firstBishop) place("b", "w", (s) => light(s) !== light(firstBishop!));
      else {
        const s = place(p as PieceSymbol, "w");
        if (p === "b") firstBishop = s;
      }
    }
    // Black must not already be in check (it's White's move), and should have a few squares to run to.
    if (c.isAttacked(bk as Square, "w")) continue;
    const free = SQUARES.filter((q) => near(q, bk) && q !== bk && !used.has(q) && !c.isAttacked(q, "w"));
    if (free.length < 2) continue;
    const fen = c.fen();
    const real = new Chess(fen);
    if (real.isGameOver()) continue;
    // No instant win: a drill that starts with mate in 1 teaches nothing.
    if (real.moves().some((m) => (real.move(m), real.isCheckmate() ? (real.undo(), true) : (real.undo(), false)))) continue;
    return fen;
  }
}
