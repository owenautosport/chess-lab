// Play a position out against Stockfish: endgame mate drills and practice scenarios.
import { Chess, type Square } from "chess.js";
import { askPromotion, button, colorOf, createBoard, h, isPromotion, material, playSound, positionConfig, renderMoves, soundFor, type Color } from "../board";
import { engine, formatScore, winPercent } from "../engine";
import { openInAnalysis } from "../router";

export type Outcome = "win" | "draw" | "loss" | "fail";

export type EngineGameOpts = {
  fen: string;
  me: Color;
  title: string;
  subtitle?: string;
  goal: "mate" | "play"; // mate: checkmate within moveLimit; play: play it out, engine judges at the end
  moveLimit?: number;
  strength: { skill: number; depth?: number; movetime?: number };
  tips?: string[];
  back: { href: string; label: string };
  controls?: HTMLElement; // e.g. a strength picker
  onResult?: (outcome: Outcome, myMoves: number, assisted: boolean) => void;
  onNew: () => void;
};

export function mountEngineGame(root: HTMLElement, o: EngineGameOpts) {
  const chess = new Chess(o.fen);
  const opp: Color = o.me === "white" ? "black" : "white";
  let thinking = false;
  let finished = false;
  let assisted = false; // used a hint or take-back
  const myMoves = () => chess.history({ verbose: true }).filter((m) => colorOf(m.color) === o.me).length;

  const boardEl = h("div", { class: "board" });
  const status = h("div", { class: "status" });
  const counter = h("div", { class: "counter" });
  const moves = h("div", { class: "moves" });
  const result = h("div", { class: "result" });
  const tipsEl = o.tips?.length ? h("details", { class: "tips", open: "" }, h("summary", {}, "Technique"), h("ol", {}, ...o.tips.map((t) => h("li", {}, t)))) : "";

  const board = createBoard(boardEl, {
    orientation: o.me,
    movable: { events: { after: (f, t) => userMove(f as Square, t as Square) } },
  });

  async function userMove(from: Square, to: Square) {
    let promotion: string | undefined;
    if (isPromotion(chess, from, to)) {
      promotion = (await askPromotion(boardEl, to, o.me, o.me)) ?? undefined;
      if (!promotion) return sync();
    }
    const m = chess.move({ from, to, promotion });
    soundFor(chess, m);
    board.setAutoShapes([]);
    if (checkEnd()) return;
    engineMove();
  }

  async function engineMove() {
    if (finished || colorOf(chess.turn()) === o.me) return sync();
    thinking = true;
    sync();
    const fen = chess.fen();
    const res = await engine().search(fen, o.strength);
    await new Promise((r) => setTimeout(r, 250));
    thinking = false;
    if (!res || finished || fen !== chess.fen() || res.best === "(none)") return sync();
    const m = chess.move({ from: res.best.slice(0, 2), to: res.best.slice(2, 4), promotion: res.best[4] });
    soundFor(chess, m);
    checkEnd();
  }

  /** Returns true if the game ended. */
  function checkEnd(): boolean {
    const n = myMoves();
    let outcome: Outcome | undefined;
    let text = "";
    if (chess.isCheckmate()) {
      outcome = colorOf(chess.turn()) === o.me ? "loss" : "win";
      text = outcome === "win" ? `Checkmate! Done in ${n} move${n === 1 ? "" : "s"}.` : "You were checkmated.";
    } else if (chess.isStalemate()) {
      outcome = o.goal === "mate" ? "fail" : "draw";
      text = "Stalemate! The king had no legal moves but wasn't in check. Always leave it a square until the final blow.";
    } else if (chess.isDraw()) {
      outcome = o.goal === "mate" ? "fail" : "draw";
      text = chess.isInsufficientMaterial() ? "Draw: not enough material left to mate." : chess.isThreefoldRepetition() ? "Draw by repetition." : "Draw by the 50-move rule.";
    } else if (o.goal === "mate" && o.moveLimit && n >= o.moveLimit && colorOf(chess.turn()) !== o.me) {
      outcome = "fail";
      text = `Out of moves: no mate within ${o.moveLimit}. Look at the technique steps and try again.`;
    }
    if (!outcome) return sync(), false;
    end(outcome, text);
    return true;
  }

  function end(outcome: Outcome, text: string, heading?: string) {
    finished = true;
    engine().stop();
    if (outcome === "win") playSound("end");
    status.textContent = "Game over";
    result.className = `result ${outcome}`;
    result.replaceChildren(h("b", {}, heading ?? { win: "Success", draw: "Draw", loss: "Lost", fail: "Not this time" }[outcome]), h("div", {}, text));
    o.onResult?.(outcome, myMoves(), assisted);
    sync();
  }

  async function finishAndJudge() {
    if (finished) return;
    finished = true;
    engine().stop();
    sync();
    status.textContent = "Stockfish is judging the position…";
    const res = await engine().search(chess.fen(), { depth: 16 });
    const line = res?.lines[0];
    if (!line) return;
    const mine = o.me === "white" ? winPercent(line) : 100 - winPercent(line);
    const score = formatScore(o.me === "white" ? line : { cp: line.cp && -line.cp, mate: line.mate && -line.mate });
    const verdict = mine >= 85 ? "You're winning" : mine >= 62 ? "You're better" : mine > 38 ? "About equal" : mine > 15 ? "You're worse" : "You're losing";
    const outcome: Outcome = mine >= 85 ? "win" : mine > 15 ? "draw" : "loss";
    end(outcome, `${score} for you, judged by Stockfish. Review the game to see where it turned.`, verdict);
  }

  function takeBack() {
    if (thinking || finished) return;
    assisted = true;
    chess.undo();
    if (colorOf(chess.turn()) !== o.me) chess.undo();
    board.setAutoShapes([]);
    sync();
  }

  async function hint() {
    if (thinking || finished || colorOf(chess.turn()) !== o.me) return;
    assisted = true;
    const res = await engine().search(chess.fen(), { depth: 16 });
    if (res && !finished) board.setAutoShapes([{ orig: res.best.slice(0, 2) as Square, dest: res.best.slice(2, 4) as Square, brush: "paleBlue" }]);
  }

  function review() {
    const c = new Chess(o.fen);
    for (const m of chess.history()) c.move(m);
    c.setHeader("SetUp", "1");
    c.setHeader("FEN", o.fen);
    openInAnalysis({ pgn: c.pgn(), review: true, me: o.me });
  }

  function sync() {
    board.set(positionConfig(chess, finished || thinking ? undefined : o.me));
    const hist = chess.history();
    renderMoves(moves, hist, hist.length, undefined, [], o.fen.split(" ")[1] === "b", +o.fen.split(" ")[5]);
    const mat = material(chess);
    const adv = o.me === "white" ? mat.diff : -mat.diff;
    counter.textContent = o.goal === "mate" && o.moveLimit ? `Moves used: ${myMoves()} / ${o.moveLimit}` : adv ? `Material: ${adv > 0 ? "+" : ""}${adv} for you` : "Material: level";
    if (!finished) status.textContent = thinking ? "Stockfish is thinking…" : chess.inCheck() ? "Check! Your move" : `Your move (${o.me})`;
    finishBtn.style.display = o.goal === "play" && !finished ? "" : "none";
    reviewBtn.disabled = hist.length === 0;
  }

  const finishBtn = button("Finish & judge", finishAndJudge);
  const reviewBtn = button("Review game", review);

  root.append(
    h("div", { class: "layout" },
      h("div", { class: "board-col" }, h("div", { class: "player-bar" }, h("span", { class: `dot ${opp}` }), h("b", {}, "Stockfish")), boardEl, h("div", { class: "player-bar" }, h("span", { class: `dot ${o.me}` }), h("b", {}, "You"))),
      h("aside", { class: "panel" },
        h("a", { class: "back", href: o.back.href }, `← ${o.back.label}`),
        h("h2", {}, o.title),
        o.subtitle ? h("div", { class: "muted" }, o.subtitle) : "",
        o.controls ?? "",
        status,
        counter,
        result,
        tipsEl,
        moves,
        h("div", { class: "row" }, button("Hint", hint), button("Take back", takeBack), finishBtn),
        h("div", { class: "row" }, button("Restart", restart), button("New position", o.onNew, "primary"), reviewBtn),
      ),
    ),
  );

  function restart() {
    engine().stop();
    while (chess.history().length) chess.undo();
    finished = thinking = assisted = false;
    result.className = "result";
    result.replaceChildren();
    board.setAutoShapes([]);
    engine().newGame();
    sync();
    engineMove();
  }

  board.redrawAll();
  engine().newGame();
  sync();
  engineMove();

  return () => {
    finished = true;
    engine().stop();
    board.destroy();
  };
}
