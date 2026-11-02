// Coach prompts for puzzles: a nudge while solving, a full explanation afterwards.
import { Chess } from "chess.js";
import { pvToSan } from "../board";
import { themeName } from "../puzzles";
import { coachPanel, describePosition } from "./coach";

export type PuzzleInfo = { fen: string; solution: string[]; themes: string[] };

/** The position the solver sees: after the opponent's setup move. */
function start(p: PuzzleInfo) {
  const c = new Chess(p.fen);
  const u = p.solution[0];
  c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c.fen();
}

export function puzzleCoach(current: () => { puzzle?: PuzzleInfo; done: boolean }) {
  const ctx = () => {
    const { puzzle } = current();
    if (!puzzle) return "No puzzle loaded.";
    const fen = start(puzzle);
    const themes = puzzle.themes.filter((t) => !/^(short|long|veryLong|oneMove|crushing|advantage|master|middlegame|endgame)$/.test(t)).map(themeName);
    return [
      "This is a tactics puzzle. The verified solution (from Lichess, checked by Stockfish) is ground truth.",
      describePosition(fen),
      `Solution line: ${pvToSan(fen, puzzle.solution.slice(1), 12)}`,
      themes.length ? `Themes: ${themes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  };
  return coachPanel({
    context: ctx,
    placeholder: "Ask about this puzzle…",
    actions: () =>
      current().done
        ? [{ label: "Explain the solution", prompt: "Explain why the solution works, move by move, and what pattern to remember so I spot it next time. Mention why the obvious alternatives fail if that's clear from the position." }]
        : [{ label: "Give me a nudge", prompt: "Give me a hint to help me find the first move WITHOUT naming the move or the piece's destination square. Point me at what to look at (a weak square, an overloaded piece, a loose piece, the king's safety)." }],
  });
}
