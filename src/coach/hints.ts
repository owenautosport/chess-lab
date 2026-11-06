// In-game coach: spots what's going on in a position (a tactic for you, a threat against you)
// and judges the move you played. Engine-based, so it works offline and on the website.
import { Chess, type Square } from "chess.js";
import { Engine, winPercent, type Line } from "../engine";
import { pvToSan } from "../board";

// Its own engine, so coaching never delays or cancels the bot's thinking.
let coachEngine: Engine | undefined;
const eng = () => (coachEngine ??= new Engine());

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export type Hint = {
  kind: "mate" | "tactic" | "threat" | "quiet";
  /** Three steps, from a nudge to the answer. */
  steps: [string, string, string];
  square: Square; // highlighted at step 2
  best: { from: Square; to: Square };
  threat?: { from: Square; to: Square };
  lesson?: string; // Learn lesson key for this motif
};

/** Win chance for the side to move in `fen`, from a line scored from White's point of view. */
const forMover = (fen: string, l: Pick<Line, "cp" | "mate">) => (fen.split(" ")[1] === "w" ? winPercent(l) : 100 - winPercent(l));
const sq = (uci: string) => ({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square });
const sanOf = (fen: string, uci: string) => pvToSan(fen, [uci]).replace(/^\d+\.+\s*/, "");

export async function findHint(fen: string): Promise<Hint | null> {
  const res = await eng().search(fen, { depth: 12, multipv: 2 });
  if (!res?.lines[0]) return null;
  const [l1, l2] = res.lines;
  const best = res.best;
  const bestSan = sanOf(fen, best);
  const w1 = forMover(fen, l1);
  const w2 = l2 ? forMover(fen, l2) : 0;

  // You have a forced mate.
  if (l1.mate !== undefined && forMover(fen, l1) === 100) {
    const n = Math.abs(l1.mate);
    return {
      kind: "mate", lesson: n === 1 ? "mateIn1" : n === 2 ? "mateIn2" : "mateIn3", square: sq(best).from, best: sq(best),
      steps: [`There's a checkmate in ${n}! Look at every check.`, `Start with the piece I've highlighted.`, `${bestSan} leads to mate.`],
    };
  }

  // Only one move is good: that's a tactic to find.
  if (w1 - w2 >= 15 && w1 >= 55) {
    const motif = describeMotif(fen, best);
    return {
      kind: "tactic", lesson: motif.lesson, square: sq(best).from, best: sq(best),
      steps: [motif.nudge, `The ${motif.piece} I've highlighted is the one to move.`, `${bestSan}! ${motif.answer}`],
    };
  }

  // Is the opponent threatening something? Ask what they'd play if it were their move again.
  const threat = await findThreat(fen, w1);
  if (threat) {
    return {
      kind: "threat", square: threat.square, best: sq(best), threat: threat.move,
      steps: [threat.nudge, threat.where, `They want ${threat.san}. A good answer is ${bestSan}.`],
    };
  }

  const piece = new Chess(fen).get(sq(best).from);
  const opening = +fen.split(" ")[5] <= 10;
  const general = opening
    ? "No tactics or threats right now. Develop a piece, fight for the centre, or get castled."
    : "No tactics or threats right now. Improve your worst-placed piece, or put a rook on an open file.";
  return {
    kind: "quiet", square: sq(best).from, best: sq(best),
    steps: [general, `Think about your ${piece ? NAME[piece.type] : "piece"} here.`, `Stockfish likes ${bestSan}.`],
  };
}

function describeMotif(fen: string, uci: string): { nudge: string; answer: string; piece: string; lesson?: string } {
  const c = new Chess(fen);
  const me = c.turn();
  const them = me === "w" ? "b" : "w";
  const { from, to } = sq(uci);
  const mover = c.get(from)!;
  const target = c.get(to);
  const defended = c.isAttacked(to, them);
  const m = c.move({ from, to, promotion: uci[4] });
  const piece = NAME[mover.type];

  // Attacks from the moved piece next move: two or more valuable targets is a fork.
  const forks = (() => {
    const t = new Chess(c.fen());
    if (t.inCheck()) {
      // Check plus another big target.
      const others = attackedBy(c, to, them).filter((s) => c.get(s)!.type !== "k" && VALUE[c.get(s)!.type] >= 3);
      return others.length ? ["king", ...others.map((s) => NAME[c.get(s)!.type])] : [];
    }
    return attackedBy(c, to, them).filter((s) => VALUE[c.get(s)!.type] >= 3).map((s) => NAME[c.get(s)!.type]);
  })();

  if (m.promotion) return { nudge: "One of your pawns is ready to make a big step.", answer: "Promote!", piece, lesson: "advancedPawn" };
  if (forks.length >= 2) return { nudge: `Look for a fork: one move that attacks two things at once.`, answer: `It attacks the ${forks.slice(0, 2).join(" and ")}.`, piece, lesson: "fork" };
  if (target && (!defended || VALUE[target.type] > VALUE[mover.type])) {
    return { nudge: "Something is free. Is there a piece you can take for nothing?", answer: `The ${NAME[target.type]} on ${to} ${defended ? "is worth more than what you give" : "was undefended"}.`, piece, lesson: "hangingPiece" };
  }
  if (m.san.includes("+")) return { nudge: "Look at your checks. One of them is very strong.", answer: "The check sets up a win of material.", piece };
  return { nudge: "There's a tactic here that wins material. Check every capture and every threat.", answer: "It wins material by force.", piece };
}

/** Squares of the opponent's pieces that the piece on `from` attacks. */
function attackedBy(c: Chess, from: Square, victim: "w" | "b"): Square[] {
  const out: Square[] = [];
  for (const row of c.board())
    for (const p of row) if (p && p.color === victim && c.attackers(p.square, victim === "w" ? "b" : "w").includes(from)) out.push(p.square);
  return out;
}

async function findThreat(fen: string, myWin: number) {
  const c = new Chess(fen);
  if (c.inCheck() || !c.setTurn(c.turn() === "w" ? "b" : "w")) return null;
  const nullFen = c.fen();
  const res = await eng().search(nullFen, { depth: 10 });
  if (!res?.lines[0]) return null;
  const theirWin = forMover(nullFen, res.lines[0]);
  if (theirWin - (100 - myWin) < 15) return null;
  const move = sq(res.best);
  const san = sanOf(nullFen, res.best);
  const victim = c.get(move.to);
  if (res.lines[0].mate !== undefined) return { move, san, square: move.to, nudge: "Danger! Your opponent is threatening checkmate.", where: "Look at the square I've highlighted near your king." };
  if (victim) return { move, san, square: move.to, nudge: `Careful: something of yours is under attack.`, where: `Your ${NAME[victim.type]} on ${move.to} is in danger.` };
  return { move, san, square: move.from, nudge: "Your opponent has a threat. What did their last move attack?", where: "Watch the piece I've highlighted." };
}

export type Judgement = { verdict: "best" | "good" | "inaccuracy" | "mistake" | "blunder"; text: string; bestSan: string; loss: number };

/** How good was the move? Compares Stockfish's view before and after it. */
export async function judgeMove(fenBefore: string, uci: string, fenAfter: string): Promise<Judgement | null> {
  const before = await eng().search(fenBefore, { depth: 12 });
  if (!before?.lines[0]) return null;
  const after = new Chess(fenAfter).isGameOver() ? null : await eng().search(fenAfter, { depth: 12 });
  const wBefore = forMover(fenBefore, before.lines[0]);
  const cm = new Chess(fenAfter).isCheckmate();
  const wAfter = cm ? 100 : after?.lines[0] ? 100 - forMover(fenAfter, after.lines[0]) : wBefore;
  const loss = Math.max(0, wBefore - wAfter);
  const bestSan = sanOf(fenBefore, before.best);
  const verdict = uci === before.best ? "best" : loss >= 20 ? "blunder" : loss >= 10 ? "mistake" : loss >= 5 ? "inaccuracy" : "good";
  // What does the opponent get? Their best reply, in words.
  const reply = after?.best && after.best !== "(none)" ? after.best : "";
  const replySan = reply ? sanOf(fenAfter, reply) : "";
  const captured = reply ? new Chess(fenAfter).get(sq(reply).to) : undefined;
  const why = replySan ? (captured ? ` It lets them play ${replySan}, winning your ${NAME[captured.type]}.` : ` Their best reply is ${replySan}.`) : "";
  const text = {
    best: "Best move!",
    good: "Good move.",
    inaccuracy: `Inaccuracy. ${bestSan} was better.`,
    mistake: `Mistake.${why} ${bestSan} was better.`,
    blunder: `Blunder!${why} You should play ${bestSan} instead.`,
  }[verdict];
  return { verdict, text, bestSan, loss };
}
