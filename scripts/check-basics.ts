// Checks every "Learn to play" exercise: positions are legal, goals can be met, star games are solvable.
import { Chess } from "chess.js";
import { BASICS, type Goal } from "../src/learn/basics-data.ts";
import { starPar } from "../src/learn/stars.ts";

const strip = (san: string) => san.replace(/[+#]/g, "");
let bad = 0;
const fail = (where: string, msg: string) => (console.log(`✗ ${where}: ${msg}`), bad++);

function meets(c: Chess, goal: Goal, san: string, from: string, checker: Set<string>) {
  const after = new Chess(c.fen());
  const m = after.move(san);
  if (typeof goal === "object") return goal.accept.map(strip).includes(strip(m.san));
  if (goal === "mate") return after.isCheckmate();
  if (goal === "check") return after.inCheck();
  if (goal === "escape-king") return m.piece === "k";
  if (goal === "escape-capture") return checker.has(m.to);
  return m.piece !== "k" && !checker.has(m.to); // escape-block
}

for (const b of BASICS) {
  b.exercises.forEach((ex, i) => {
    const where = `${b.id} #${i + 1}`;
    if (ex.kind === "stars") {
      const all = [ex.from, ...ex.stars, ...(ex.blockers ?? []), ...(ex.enemies ?? [])];
      if (new Set(all).size !== all.length) fail(where, "two things on one square");
      const par = starPar({ piece: ex.piece, at: ex.from, stars: ex.stars, enemies: ex.enemies ?? [], blockers: ex.blockers ?? [] });
      if (par < 1) fail(where, "can't be solved");
      else console.log(`✓ ${where.padEnd(16)} stars, par ${par}`);
      return;
    }
    if (ex.kind !== "move") {
      if (ex.fen) try { new Chess(ex.fen); } catch (e) { fail(where, `bad FEN: ${(e as Error).message}`); }
      return;
    }
    let c: Chess;
    try {
      c = new Chess(ex.fen);
      if (ex.moves) for (const s of ex.moves.split(" ")) c.move(s);
    } catch (e) {
      return fail(where, `bad position: ${(e as Error).message}`);
    }
    if (c.isGameOver()) return fail(where, "game already over");
    // Squares of pieces giving check, for the escape goals.
    const checker = new Set<string>();
    if (c.inCheck()) {
      const king = c.board().flat().find((p) => p?.type === "k" && p.color === c.turn())!.square;
      for (const row of c.board()) for (const p of row) if (p && p.color !== c.turn() && c.attackers(king, p.color).includes(p.square)) checker.add(p.square);
    }
    if (typeof ex.goal === "string" && ex.goal.startsWith("escape") && !c.inCheck()) fail(where, "escape goal but not in check");
    const moves = c.moves({ verbose: true });
    const good = moves.filter((m) => meets(c, ex.goal, m.san, m.from, checker)).map((m) => m.san);
    if (!good.length) fail(where, `no move meets ${JSON.stringify(ex.goal)}`);
    if (typeof ex.goal === "object") for (const a of ex.goal.accept) if (!moves.some((m) => strip(m.san) === strip(a))) fail(where, `accepted move ${a} is illegal`);
    for (const w of Object.keys(ex.wrong ?? {})) if (w !== "*" && !moves.some((m) => strip(m.san) === strip(w))) fail(where, `wrong-move note for illegal ${w}`);
    const stalemates = moves.filter((m) => { const a = new Chess(c.fen()); a.move(m.san); return a.isStalemate(); }).map((m) => m.san);
    console.log(`✓ ${where.padEnd(16)} ${good.length}/${moves.length} moves ok: ${good.slice(0, 6).join(" ")}${stalemates.length ? `  (stalemates: ${stalemates.join(" ")})` : ""}`);
  });
}
console.log(bad ? `${bad} problem(s)` : "all exercises valid");
process.exit(bad ? 1 : 0);
