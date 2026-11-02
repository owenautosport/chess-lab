// Drives one puzzle on an existing board: plays the setup move, checks your moves, plays replies.
import { Chess, type Square } from "chess.js";
import type { Api } from "@lichess-org/chessground/api";
import { askPromotion, isPromotion, playSound, positionConfig, soundFor, uciOf, type Color } from "../board";

export type RunnerHooks = {
  status: (kind: "info" | "good" | "bad", text: string) => void;
  finished: (clean: boolean) => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PuzzleRunner {
  chess: Chess;
  me: Color;
  step = 0;
  failed = false;
  done = false;
  private stopped = false;
  private board: Api;
  private boardEl: HTMLElement;
  private solution: string[];
  private hooks: RunnerHooks;

  constructor(board: Api, boardEl: HTMLElement, solution: string[], fen: string, hooks: RunnerHooks) {
    this.board = board;
    this.boardEl = boardEl;
    this.solution = solution;
    this.hooks = hooks;
    this.chess = new Chess(fen);
    this.me = this.chess.turn() === "w" ? "black" : "white"; // the first solution move is the opponent's
  }

  async start() {
    this.board.setAutoShapes([]);
    this.board.set({ orientation: this.me, ...positionConfig(this.chess) });
    this.hooks.status("info", `Find the best move for ${this.me}.`);
    await wait(550);
    if (this.stopped) return;
    this.play(this.solution[this.step++]);
  }

  stop() {
    this.stopped = true;
  }

  private play(uci: string) {
    const m = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    soundFor(this.chess, m);
    this.board.set(positionConfig(this.chess, this.done ? undefined : this.me));
  }

  async move(from: Square, to: Square) {
    if (this.done || this.stopped) return;
    let promotion: string | undefined;
    if (isPromotion(this.chess, from, to)) {
      promotion = (await askPromotion(this.boardEl, to, this.me, this.me)) ?? undefined;
      if (!promotion) return this.board.set(positionConfig(this.chess, this.me));
    }
    const trial = new Chess(this.chess.fen());
    const m = trial.move({ from, to, promotion });
    if (uciOf(m) !== this.solution[this.step] && !trial.isCheckmate()) {
      playSound("wrong");
      this.failed = true;
      this.board.set(positionConfig(this.chess, this.me));
      this.hooks.status("bad", `${m.san} isn't it. Try again.`);
      return;
    }
    this.chess = trial;
    soundFor(this.chess, m);
    this.step++;
    this.board.setAutoShapes([]);
    if (this.step >= this.solution.length || this.chess.isCheckmate()) return this.finish();
    this.board.set(positionConfig(this.chess));
    this.hooks.status("good", "Correct! Keep going…");
    await wait(450);
    if (this.stopped) return;
    this.play(this.solution[this.step++]);
  }

  hint() {
    if (this.done) return;
    this.failed = true;
    this.board.setAutoShapes([{ orig: this.solution[this.step].slice(0, 2) as Square, brush: "paleBlue" }]);
    this.hooks.status("info", "Hint: move the highlighted piece.");
  }

  async showSolution() {
    if (this.done) return;
    this.failed = true;
    this.done = true;
    this.board.setAutoShapes([]);
    while (this.step < this.solution.length) {
      this.play(this.solution[this.step++]);
      await wait(700);
      if (this.stopped) return;
    }
    this.hooks.status("info", "That was the solution.");
    this.hooks.finished(false);
  }

  private finish() {
    this.done = true;
    this.board.set(positionConfig(this.chess));
    this.hooks.status("good", this.failed ? "Solved, with help." : "Solved!");
    this.hooks.finished(!this.failed);
  }
}
