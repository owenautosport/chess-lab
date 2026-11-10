// Player for the "Learn to play" lessons (#learn/basics/<id>): a coach explains, you do it on the board,
// one exercise after another, with a progress bar along the top. Every lesson can be replayed.
import { Chess, type Square } from "chess.js";
import type { Api } from "@lichess-org/chessground/api";
import type { Key } from "@lichess-org/chessground/types";
import { askPromotion, button, createBoard, h, isPromotion, playSound, positionConfig, soundFor } from "../board";
import { basicsById, type Exercise, type Goal } from "./basics-data";
import { progress } from "./progress";
import { nodeAfter } from "./path";
import { starDests, starMove, starPar, starsLeft, type StarState } from "./stars";
import { icon, piece } from "../ui/visuals";

const FILES = "abcdefgh";
const ROLE_NAME: Record<string, string> = { R: "rook", B: "bishop", Q: "queen", K: "king", N: "knight", P: "pawn" };
const strip = (san: string) => san.replace(/[+#]/g, "");

export function mountBasics(root: HTMLElement, id: string): () => void {
  const lesson = basicsById(id);
  if (!lesson) {
    location.hash = "#learn";
    return () => {};
  }
  let idx = 0;
  let mistakes = 0;
  let alive = true;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => alive && fn(), ms));

  const boardEl = h("div", { class: "board" });
  const overlay = h("div", { class: "star-layer" });
  const wrap = h("div", { class: "board-wrap" }, boardEl, overlay);
  const board: Api = createBoard(boardEl, { coordinates: true });

  const bar = h("div", { class: "lesson-bar" });
  const bubble = h("div", { class: "coach-text" });
  const feedback = h("div", { class: "feedback", hidden: "" });
  const counter = h("div", { class: "star-counter", hidden: "" });
  const controls = h("div", { class: "row lesson-controls" });
  const coach = h("div", { class: "coach-bubble" }, h("span", { class: "coach-avatar" }, piece("white", "knight", 34)), bubble);

  const panel = h("aside", { class: "panel lesson-panel" },
    h("div", { class: "lesson-head" },
      h("a", { class: "back", href: "#learn" }, "← Path"),
      h("h2", { class: "titled" }, h("span", { class: "lesson-icon" }, icon(lesson.icon as never, 18)), lesson.title),
      bar),
    coach, counter, feedback, controls);
  root.append(h("div", { class: "layout lesson-layout" }, h("div", { class: "board-col" }, wrap), panel));
  board.redrawAll();

  function renderBar() {
    bar.replaceChildren(...lesson!.exercises.map((_, i) => h("i", { class: i < idx ? "done" : i === idx ? "now" : "" })));
  }

  function say(text: string) {
    bubble.textContent = text;
  }

  function tell(kind: "good" | "bad" | "info", text: string) {
    feedback.hidden = false;
    feedback.className = `feedback ${kind === "info" ? "" : kind}`;
    feedback.textContent = text;
  }

  function clearBoardExtras() {
    overlay.replaceChildren();
    board.setAutoShapes([]);
    counter.hidden = true;
    feedback.hidden = true;
  }

  function next() {
    idx++;
    if (idx >= lesson!.exercises.length) return finish();
    show();
  }

  function finishedExercise(text: string) {
    tell("good", text);
    controls.replaceChildren(button(idx + 1 < lesson!.exercises.length ? "Next →" : "Finish lesson", next, "primary"));
  }

  function show() {
    renderBar();
    clearBoardExtras();
    const ex = lesson!.exercises[idx];
    if (ex.kind === "info") return showInfo(ex);
    if (ex.kind === "squares") return showSquares(ex);
    if (ex.kind === "stars") return showStars(ex);
    return showMove(ex);
  }

  // ---------- info ----------

  function showInfo(ex: Extract<Exercise, { kind: "info" }>) {
    say(ex.text);
    const c = new Chess(ex.fen ?? undefined);
    if (ex.moves) for (const m of ex.moves.split(" ")) c.move(m);
    board.set({ orientation: "white", fen: ex.fen || ex.moves ? c.fen() : "8/8/8/8/8/8/8/8 w - - 0 1", lastMove: undefined, check: false, movable: { color: undefined, dests: new Map() } });
    board.setAutoShapes([
      ...(ex.arrows ?? []).map(([a, b]) => ({ orig: a as Key, dest: b as Key, brush: "red" })),
      ...(ex.marks ?? []).map((m) => ({ orig: m as Key, brush: "green" })),
    ]);
    controls.replaceChildren(button(idx + 1 < lesson!.exercises.length ? "Next →" : "Finish lesson", next, "primary"));
  }

  // ---------- find the square ----------

  function showSquares(ex: Extract<Exercise, { kind: "squares" }>) {
    say(ex.text);
    let found = 0;
    let target = "";
    const pickTarget = () => {
      let t: string;
      do t = FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));
      while (t === target);
      target = t;
      counter.hidden = false;
      counter.replaceChildren(h("span", { class: "target-square" }, target), h("span", { class: "muted" }, `${found} of ${ex.count} found`));
    };
    board.set({
      orientation: "white", fen: "8/8/8/8/8/8/8/8 w - - 0 1", lastMove: undefined, check: false, selectable: { enabled: true },
      movable: { color: undefined, dests: new Map() },
      events: {
        select: (key) => {
          if (found >= ex.count) return;
          if (key === target) {
            found++;
            playSound("move");
            board.setAutoShapes([{ orig: key, brush: "green" }]);
            if (found >= ex.count) {
              counter.replaceChildren(h("span", { class: "target-square done" }, "✓"), h("span", { class: "muted" }, `${found} of ${ex.count} found`));
              board.set({ events: { select: undefined } });
              return finishedExercise("You know your way around the board. Every move in chess is written with these names.");
            }
            pickTarget();
            tell("good", `Yes, that's ${key}.`);
          } else {
            mistakes++;
            playSound("wrong");
            board.setAutoShapes([{ orig: key, brush: "red" }]);
            tell("bad", `That's ${key}. Find ${target}: file ${target[0]} is the column, rank ${target[1]} is the row.`);
          }
        },
      },
    });
    controls.replaceChildren();
    pickTarget();
  }

  // ---------- collect the stars ----------

  function showStars(ex: Extract<Exercise, { kind: "stars" }>) {
    say(ex.text);
    const start: StarState = { piece: ex.piece, at: ex.from, stars: [...ex.stars], enemies: [...(ex.enemies ?? [])], blockers: [...(ex.blockers ?? [])] };
    const par = starPar(start);
    let s = start;
    let moves = 0;
    const enemyRole = ex.piece === "P" ? "p" : "n";

    const fen = () => {
      const grid = Array.from({ length: 8 }, () => Array(8).fill(""));
      const put = (sq: string, ch: string) => (grid[8 - +sq[1]][sq.charCodeAt(0) - 97] = ch);
      s.blockers.forEach((b) => put(b, "P"));
      s.enemies.forEach((e) => put(e, enemyRole));
      put(s.at, s.piece);
      return grid.map((row) => row.map((c) => c || "1").join("").replace(/1+/g, (m) => String(m.length))).join("/") + " w - - 0 1";
    };
    const drawStars = () => overlay.replaceChildren(...s.stars.map((sq) => {
      const st = h("span", { class: "star" }, icon("Star", 30));
      st.style.left = `${(sq.charCodeAt(0) - 97) * 12.5}%`;
      st.style.top = `${(8 - +sq[1]) * 12.5}%`;
      return st;
    }));
    const drawCounter = () => {
      counter.hidden = false;
      counter.replaceChildren(h("span", {}, icon("Star", 16), ` ${starsLeft(s)} left`), h("span", { class: "muted" }, `Moves ${moves} · best ${par}`));
    };
    const redraw = () => {
      board.set({
        orientation: "white", fen: fen(), turnColor: "white", check: false,
        movable: { color: starsLeft(s) ? "white" : undefined, dests: starsLeft(s) ? new Map([[s.at as Key, starDests(s) as Key[]]]) : new Map() },
        events: { select: undefined },
      });
      drawStars();
      drawCounter();
    };
    board.set({ lastMove: undefined, movable: { events: { after: (_o, dest) => {
      if (lesson!.exercises[idx] !== ex) return;
      const captured = s.enemies.includes(dest);
      s = starMove(s, dest);
      moves++;
      playSound(captured ? "capture" : "move");
      redraw();
      if (!starsLeft(s)) {
        const rating = moves <= par ? `Perfect: ${moves} move${moves > 1 ? "s" : ""}, the fewest possible!` : `Done in ${moves} moves. It can be done in ${par}: try again for a perfect score?`;
        finishedExercise(rating);
        if (moves > par) controls.prepend(button("Try again", () => showStars(ex)));
      }
    } } } });
    controls.replaceChildren(button("Restart", () => showStars(ex)));
    redraw();
    if (ex.piece === "P") tell("info", `Your ${ROLE_NAME[ex.piece]} is the white piece. Drag it or click it, then click where to go.`);
  }

  // ---------- make the right move ----------

  function showMove(ex: Extract<Exercise, { kind: "move" }>) {
    say(ex.text);
    let chess = new Chess(ex.fen ?? undefined);
    if (ex.moves) for (const m of ex.moves.split(" ")) chess.move(m);
    const me = chess.turn() === "w" ? "white" : "black";
    const checkers = checkingSquares(chess);
    let solved = false;

    const meets = (after: Chess, san: string, piece: string, to: string, goal: Goal) => {
      if (typeof goal === "object") return goal.accept.map(strip).includes(strip(san));
      if (goal === "mate") return after.isCheckmate();
      if (goal === "check") return after.inCheck();
      if (goal === "escape-king") return piece === "k";
      if (goal === "escape-capture") return checkers.has(to);
      return piece !== "k" && !checkers.has(to);
    };
    const wrongText = (after: Chess, san: string) => {
      const w = ex.wrong ?? {};
      if (w[strip(san)]) return w[strip(san)];
      if (after.isStalemate()) return `${san} leaves Black with no legal move but not in check: that's stalemate, a draw! Try again.`;
      if (w["*"]) return w["*"];
      if (ex.goal === "mate") return after.inCheck() ? `${san} is check, but the king can escape. Find checkmate.` : `${san} isn't checkmate. Look for a check the king can't escape.`;
      if (ex.goal === "check") return `${san} doesn't attack the king. Try again.`;
      return `${san} isn't the move here. Try again.`;
    };

    const setBoard = () => board.set({ orientation: me, ...positionConfig(chess, solved ? undefined : me), events: { select: undefined } });
    board.set({ movable: { events: { after: async (from, to) => {
      if (lesson!.exercises[idx] !== ex || solved) return;
      let promotion: string | undefined;
      if (isPromotion(chess, from as Square, to as Square)) {
        promotion = (await askPromotion(boardEl, to as Square, me, me)) ?? undefined;
        if (!promotion) return setBoard();
      }
      const after = new Chess(chess.fen());
      const m = after.move({ from, to, promotion });
      if (meets(after, m.san, m.piece, m.to, ex.goal)) {
        solved = true;
        chess = after;
        soundFor(chess, m);
        setBoard();
        board.setAutoShapes([]);
        finishedExercise(ex.done);
      } else {
        mistakes++;
        playSound("wrong");
        // Show the wrong move briefly, then take it back.
        board.set({ fen: after.fen(), lastMove: [from, to], movable: { color: undefined, dests: new Map() } });
        tell("bad", wrongText(after, m.san));
        later(setBoard, 700);
      }
    } } } });

    const hint = () => {
      mistakes++;
      const sample = chess.moves({ verbose: true }).find((m) => {
        const a = new Chess(chess.fen());
        a.move(m.san);
        return meets(a, m.san, m.piece, m.to, ex.goal);
      });
      if (sample) board.setAutoShapes([{ orig: sample.from as Key, brush: "paleBlue" }]);
      tell("info", ex.hint ?? "Hint: the highlighted piece is the one to move.");
    };
    controls.replaceChildren(button("Hint", hint));
    setBoard();
  }

  // ---------- finish ----------

  function finish() {
    renderBar();
    clearBoardExtras();
    const best = progress.get().basics[id]?.mistakes;
    progress.update((p) => (p.basics[id] = { done: true, mistakes: best === undefined ? mistakes : Math.min(best, mistakes) }));
    const after = nodeAfter("basics", id);
    say(mistakes === 0 ? "Lesson complete, without a single mistake. Brilliant!" : `Lesson complete! (${mistakes} mistake${mistakes > 1 ? "s" : ""} or hints along the way.)`);
    tell("good", "✓ Saved to your path.");
    controls.replaceChildren(
      button("Practise again", () => ((idx = 0), (mistakes = 0), show())),
      after ? h("a", { class: "btn primary", href: after.href }, `Next: ${after.title} →`) : h("a", { class: "btn primary", href: "#learn" }, "Back to the path"),
    );
    playSound("end");
  }

  show();
  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    board.destroy();
  };
}

/** Squares of the pieces giving check to the side to move. */
function checkingSquares(c: Chess): Set<string> {
  const out = new Set<string>();
  if (!c.inCheck()) return out;
  const king = c.board().flat().find((p) => p?.type === "k" && p.color === c.turn())!.square;
  const them = c.turn() === "w" ? "b" : "w";
  for (const sq of c.attackers(king, them)) out.add(sq);
  return out;
}
