// Opening course: overview of an opening's lines, and the move-by-move trainer.
import { Chess, type Square } from "chess.js";
import { askPromotion, button, colorOf, createBoard, h, isPromotion, playSound, positionConfig, renderMoves, soundFor, type Color } from "../board";
import { mountEngineGame } from "./engine-game";
import { OPENINGS, type Opening, type OpeningLine } from "./openings-data";
import { LINE_MASTERED, progress } from "./progress";
import { LEVELS } from "../play";
import { load } from "../store";
import { coachPanel, describePosition } from "../ai/coach";

export function mountOpening(root: HTMLElement, id: string, lineId?: string, mode?: string): () => void {
  const opening = OPENINGS.find((o) => o.id === id);
  if (!opening) {
    location.hash = "#learn";
    return () => {};
  }
  if (lineId && (mode === "learn" || mode === "practice")) return mountTrainer(root, opening, lineId, mode);
  return mountOverview(root, opening);
}

function mountOverview(root: HTMLElement, o: Opening) {
  const rows = o.lines.map((l) => {
    const lp = progress.line(l.id);
    const stars = "★".repeat(Math.min(LINE_MASTERED, lp.clean)) + "☆".repeat(Math.max(0, LINE_MASTERED - lp.clean));
    return h("div", { class: "line-row" },
      h("div", {}, h("b", {}, l.name), h("div", { class: "muted small" }, `${Math.ceil(l.moves.split(" ").length / 2)} moves · practised ${lp.reps}×`)),
      h("span", { class: "stars", title: `${lp.clean} clean run-throughs (${LINE_MASTERED} = learned)` }, stars),
      h("a", { class: "btn", href: `#learn/opening/${o.id}/${l.id}/learn` }, "Learn"),
      h("a", { class: "btn primary", href: `#learn/opening/${o.id}/${l.id}/practice` }, "Practise"),
    );
  });
  root.append(
    h("div", { class: "learn narrow" },
      h("a", { class: "back", href: "#learn" }, "← Learn"),
      h("header", { class: "learn-head" }, h("h1", {}, o.name), h("p", {}, o.summary), h("div", { class: "tags" }, h("span", { class: "tag" }, `You play ${o.side}`), ...o.ideas.map((i) => h("span", { class: "tag" }, i)))),
      h("div", { class: "panel" }, ...rows),
      h("a", { class: "btn primary wide big", href: `#learn/opening/${o.id}/any/practice` }, "Practise all lines (random, weakest first)"),
      h("p", { class: "muted small" }, "Learn shows you each move with an arrow and explains why. Practise makes you play your moves from memory; three clean run-throughs earns three stars."),
    ),
  );
  return () => {};
}

/** Least-practised line first, with a little randomness. */
function pickLine(o: Opening, not?: string): OpeningLine {
  const scored = o.lines.filter((l) => l.id !== not || o.lines.length === 1).map((l) => ({ l, s: progress.line(l.id).clean + Math.random() * 1.5 }));
  return scored.sort((a, b) => a.s - b.s)[0].l;
}

function mountTrainer(root: HTMLElement, o: Opening, lineId: string, mode: "learn" | "practice") {
  const random = lineId === "any";
  let line = random ? pickLine(o) : o.lines.find((l) => l.id === lineId) ?? o.lines[0];
  const me: Color = o.side;
  let sans: string[] = [];
  let chess = new Chess();
  let ply = 0; // moves played so far
  let errors = 0;
  let wrongHere = 0; // wrong tries on the current move
  let done = false;
  let alive = true;
  let cleanup: (() => void) | undefined;

  const boardEl = h("div", { class: "board" });
  const board = createBoard(boardEl, { orientation: me, movable: { events: { after: (f, t) => userMove(f as Square, t as Square) } } });

  const title = h("h2", {});
  const sub = h("div", { class: "muted small" });
  const coach = h("div", { class: "coach" });
  const status = h("div", { class: "status" });
  const moves = h("div", { class: "moves" });
  const progressEl = h("div", { class: "meter" }, h("i"));
  const after = h("div", { class: "row" });
  const coachAi = coachPanel({
    placeholder: "Ask about this opening…",
    context: () =>
      [
        `Opening: ${o.name}, line "${line.name}". The player is learning it as ${me}. Book move order (main line theory, ground truth): ${sans.join(" ")}.`,
        `Moves played so far: ${chess.history().join(" ") || "(none)"}.`,
        sans[ply] ? `Next book move: ${sans[ply]}.` : "The line is complete.",
        describePosition(chess.fen()),
      ].join("\n"),
    actions: () => [
      { label: sans[ply] ? `Why ${sans[ply]}?` : "What's the plan now?", prompt: sans[ply] ? `Why is ${sans[ply]} the book move here? What does it do, and what's wrong with the natural alternatives?` : "The opening line is finished. What are the typical plans for each side from here?" },
      { label: "Key ideas", prompt: `What are the 3 most important ideas to remember in the ${o.name} for ${me}?` },
    ],
  });
  const panel = h("aside", { class: "panel" },
    h("a", { class: "back", href: `#learn/opening/${o.id}` }, `← ${o.name}`),
    title, sub, progressEl, status, coach, moves, after, coachAi.el,
    h("div", { class: "row" }, button("Hint", hint), button("Restart line", () => begin(line))),
  );
  const layout = h("div", { class: "layout" }, h("div", { class: "board-col" }, boardEl), panel);
  root.append(layout);
  board.redrawAll();

  const myTurn = () => colorOf(chess.turn()) === me;

  function begin(l: OpeningLine) {
    line = l;
    sans = l.moves.split(" ");
    chess = new Chess();
    ply = errors = wrongHere = 0;
    done = false;
    after.replaceChildren();
    title.textContent = l.name;
    sub.textContent = `${o.name} · ${mode === "learn" ? "Learn mode: follow the arrows" : "Practice: play from memory"}`;
    coach.className = "coach";
    coach.replaceChildren(h("div", {}, o.summary));
    sync();
    advance();
  }

  /** Play the opponent's book moves until it's your turn or the line ends. */
  async function advance() {
    while (alive && !done && ply < sans.length && !myTurn()) {
      await new Promise((r) => setTimeout(r, ply === 0 ? 500 : 450));
      if (!alive || done) return;
      const m = chess.move(sans[ply++]);
      soundFor(chess, m);
      note(ply, m.san, false);
      sync();
    }
    if (ply >= sans.length) return complete();
    showTarget();
  }

  function showTarget() {
    sync();
    const c = new Chess(chess.fen());
    const m = c.move(sans[ply]);
    const arrow = mode === "learn" || wrongHere >= 2;
    board.setAutoShapes(arrow ? [{ orig: m.from as Square, dest: m.to as Square, brush: "green" }] : []);
    if (mode === "learn" && line.notes[ply + 1]) note(ply + 1, m.san, true);
    status.className = "status";
    status.textContent = mode === "learn" ? `Play ${m.san}` : wrongHere >= 2 ? `The book move is ${m.san}` : "Your move";
  }

  function note(n: number, san: string, upcoming: boolean) {
    const text = line.notes[n];
    if (!text) return;
    const moveNo = `${Math.ceil(n / 2)}${n % 2 ? "." : "..."} ${san}`;
    coach.className = "coach good";
    coach.replaceChildren(h("b", {}, upcoming ? `Next: ${moveNo}` : moveNo), h("div", {}, text));
  }

  async function userMove(from: Square, to: Square) {
    if (done || !myTurn()) return;
    let promotion: string | undefined;
    if (isPromotion(chess, from, to)) {
      promotion = (await askPromotion(boardEl, to, me, me)) ?? undefined;
      if (!promotion) return sync();
    }
    const trial = new Chess(chess.fen());
    const m = trial.move({ from, to, promotion });
    const expected = new Chess(chess.fen()).move(sans[ply]);
    if (m.san !== expected.san) {
      playSound("wrong");
      errors++;
      wrongHere++;
      status.className = "status bad";
      status.textContent = wrongHere >= 2 ? `Not the book move. It's ${expected.san} (arrow shown).` : `${m.san} isn't the move here. Try again.`;
      sync();
      if (wrongHere >= 2) board.setAutoShapes([{ orig: expected.from as Square, dest: expected.to as Square, brush: "green" }]);
      return;
    }
    chess.move({ from, to, promotion }); // keep the game's history for the move list
    ply++;
    wrongHere = 0;
    soundFor(chess, m);
    board.setAutoShapes([]);
    if (mode === "practice") note(ply, m.san, false);
    sync();
    advance();
  }

  function hint() {
    if (done || !myTurn()) return;
    wrongHere = Math.max(wrongHere, 2);
    errors++;
    showTarget();
  }

  function complete() {
    done = true;
    sync();
    board.setAutoShapes([]);
    const clean = mode === "practice" && errors === 0;
    const p = progress.update((p) => {
      const lp = p.lines[line.id] ?? { reps: 0, clean: 0, last: 0 };
      lp.reps++;
      if (clean) lp.clean++;
      lp.last = Date.now();
      p.lines[line.id] = lp;
    });
    const lp = p.lines[line.id];
    status.className = `status ${clean ? "over" : ""}`;
    status.textContent = mode === "learn" ? "Line complete! Now practise it from memory." : clean ? `Perfect run! ${Math.min(lp.clean, LINE_MASTERED)}/${LINE_MASTERED} stars.` : `Line complete with ${errors} slip${errors === 1 ? "" : "s"}. Go again for a clean run.`;
    if (clean) playSound("end");
    after.replaceChildren(
      button("Again", () => begin(line)),
      mode === "learn" ? button("Practise it", () => (location.hash = `#learn/opening/${o.id}/${line.id}/practice`), "primary") : button(random ? "Next line" : "Another line", () => begin(pickLine(o, line.id)), "primary"),
      button("Play on vs computer", playOn),
    );
  }

  function playOn() {
    const fen = chess.fen();
    const lvl = LEVELS[load("play", { level: 3 }).level] ?? LEVELS[3];
    alive = false;
    board.destroy();
    root.replaceChildren();
    cleanup = mountEngineGame(root, {
      fen, me, goal: "play",
      title: `${o.name}: play it out`,
      subtitle: `${line.name}. Stockfish level ${lvl.name}.`,
      strength: lvl,
      back: { href: `#learn/opening/${o.id}`, label: o.name },
      onNew: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    });
  }

  function sync() {
    coachAi.refresh();
    board.set(positionConfig(chess, done || !myTurn() ? undefined : me));
    const hist = chess.history();
    renderMoves(moves, hist, hist.length);
    (progressEl.firstChild as HTMLElement).style.width = `${(ply / sans.length) * 100}%`;
  }

  begin(line);
  return () => {
    alive = false;
    if (cleanup) cleanup();
    else board.destroy();
  };
}
