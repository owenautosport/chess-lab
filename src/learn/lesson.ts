// A tactic / mate-pattern lesson: explanation, a step-through example, then levelled practice.
import { Chess, type Square } from "chess.js";
import { button, createBoard, h, positionConfig, soundFor, turnBanner } from "../board";
import { loadPuzzles, type Puzzle } from "../puzzles";
import { LEVEL_BANDS, LEVEL_UP_STREAK, MATES, lessonByKey } from "./lessons-data";
import { progress } from "./progress";
import { PuzzleRunner } from "./runner";
import { puzzleCoach } from "../ai/puzzle-coach";
import { title } from "../ui/title";

export function mountLesson(root: HTMLElement, key: string) {
  const lesson = lessonByKey(key);
  if (!lesson) {
    location.hash = "#learn";
    return () => {};
  }
  let pool: Puzzle[] = [];
  let runner: PuzzleRunner | undefined;
  let exampleIdx = 0;
  let alive = true;
  const recent: string[] = [];

  let current: Puzzle | undefined;
  const coachAi = puzzleCoach(() => ({ puzzle: runner ? current : undefined, done: !!runner?.done }));
  const boardEl = h("div", { class: "board" });
  const board = createBoard(boardEl, { movable: { events: { after: (f, t) => runner?.move(f as Square, t as Square) } } });

  const levelEl = h("div", { class: "level" });
  const status = h("div", { class: "feedback" });
  const controls = h("div", { class: "row" });
  const tabs = h("div", { class: "seg wide" });
  const exampleBtn = button("Example", () => showExample());
  const practiceBtn = button("Practise", () => practise());
  tabs.append(exampleBtn, practiceBtn);
  const setTab = (t: "ex" | "pr") => {
    exampleBtn.classList.toggle("on", t === "ex");
    practiceBtn.classList.toggle("on", t === "pr");
  };

  root.append(
    h("div", { class: "layout" },
      h("div", { class: "board-col" }, boardEl),
      h("aside", { class: "panel" },
        h("a", { class: "back", href: "#learn" }, "← Learn"),
        title(MATES.some((m) => m.key === key) ? "Crown" : "Zap", lesson.title, MATES.some((m) => m.key === key) ? "#e5534b" : "#f39c2f"),
        h("div", { class: "explain" }, h("p", {}, lesson.what), h("p", { class: "muted" }, h("b", {}, "How to spot it: "), lesson.spot)),
        levelEl,
        tabs,
        status,
        controls,
        coachAi.el,
      ),
    ),
  );
  board.redrawAll();

  function renderLevel() {
    const lp = progress.lesson(key);
    const dots = Array.from({ length: LEVEL_UP_STREAK }, (_, i) => h("i", { class: i < lp.streak ? "win" : "" }));
    levelEl.replaceChildren(
      h("div", { class: "level-top" }, h("b", {}, `Level ${lp.level} of ${LEVEL_BANDS.length}`), h("span", { class: "muted small" }, `${lp.solved} solved`)),
      h("div", { class: "dots streak" }, ...dots),
      h("div", { class: "muted small" }, lp.level < LEVEL_BANDS.length ? `${LEVEL_UP_STREAK} clean solves in a row to reach level ${lp.level + 1}` : "Top level: keep the streak going"),
    );
  }

  // ---------- example ----------

  function showExample() {
    runner?.stop();
    runner = undefined;
    setTab("ex");
    const easiest = pool.slice(0, 12);
    const p = easiest[exampleIdx % easiest.length];
    const chess = new Chess(p.fen);
    let step = 0;
    board.setAutoShapes([]);
    const me = chess.turn() === "w" ? "black" : "white";
    board.set({ orientation: me, ...positionConfig(chess) });

    const caption = () => {
      if (step === 0) return `A position from a real game. You're ${me}. Press ▶ to see your opponent's move, then the ${lesson!.title.toLowerCase()} idea.`;
      if (step >= p.solution.length) return "That's the whole idea. Now try some yourself in Practise.";
      return step % 2 === 1 ? `Now ${me} to move. Press ▶ to see the key move.` : "Press ▶ to continue.";
    };
    const draw = () => {
      status.className = "feedback";
      status.textContent = caption();
      const next = p.solution[step];
      board.setAutoShapes(next && step % 2 === 1 ? [{ orig: next.slice(0, 2) as Square, dest: next.slice(2, 4) as Square, brush: "green" }] : []);
    };
    const forward = () => {
      if (step >= p.solution.length) return;
      const u = p.solution[step++];
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      soundFor(chess, m);
      board.set(positionConfig(chess));
      draw();
      status.prepend(h("b", {}, `${m.color === "w" ? "White" : "Black"} plays ${m.san}. `));
    };
    const reset = () => {
      showExample();
    };
    controls.replaceChildren(button("↺", reset), button("▶ Next move", forward, "primary"), button("Another example", () => (exampleIdx++, showExample())), button("Try one →", practise));
    draw();
  }

  // ---------- practice ----------

  function pick(): Puzzle {
    const lp = progress.lesson(key);
    for (let d = 0; d < LEVEL_BANDS.length; d++) {
      // Prefer the current level's band, widening outward if it's empty.
      for (const lvl of [lp.level - 1 - d, lp.level - 1 + d]) {
        const band = LEVEL_BANDS[lvl];
        if (!band) continue;
        const inBand = pool.filter((q) => q.rating >= band[0] && q.rating < band[1] && !recent.includes(q.id));
        if (inBand.length) return inBand[Math.floor(Math.random() * inBand.length)];
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function practise() {
    runner?.stop();
    setTab("pr");
    const p = pick();
    current = p;
    recent.push(p.id);
    if (recent.length > 30) recent.shift();
    const r = new PuzzleRunner(board, boardEl, p.solution, p.fen, {
      status: (kind, text) => {
        if (kind === "turn") return turnBanner(status, text as "white" | "black");
        status.className = `feedback ${kind === "info" ? "" : kind}`;
        status.textContent = text;
      },
      finished: (clean) => {
        if (runner !== r) return;
        let levelled = false;
        progress.update((pr) => {
          const lp = pr.lessons[key] ?? { level: 1, streak: 0, solved: 0, tries: 0 };
          lp.tries++;
          if (clean) {
            lp.solved++;
            lp.streak++;
            if (lp.streak >= LEVEL_UP_STREAK && lp.level < LEVEL_BANDS.length) {
              lp.level++;
              lp.streak = 0;
              levelled = true;
            }
          } else lp.streak = 0;
          pr.lessons[key] = lp;
        });
        renderLevel();
        if (levelled) {
          status.className = "feedback good";
          status.textContent = `Level up! You're now on level ${progress.lesson(key).level}. Puzzles get harder from here.`;
        }
        controls.replaceChildren(button("Next puzzle →", practise, "primary"));
        coachAi.refresh();
        if (clean && !levelled) setTimeout(() => alive && runner === r && practise(), 1100);
      },
    });
    runner = r;
    controls.replaceChildren(button("Hint", () => r.hint()), button("Solution", () => r.showSolution()), button("Skip", practise));
    r.start();
    coachAi.refresh();
  }

  status.textContent = "Loading puzzles…";
  loadPuzzles().then((ps) => {
    if (!alive) return;
    pool = ps.filter((p) => p.themes.includes(key)).sort((a, b) => a.rating - b.rating);
    renderLevel();
    if (!pool.length) {
      status.textContent = "No puzzles for this theme yet.";
      return;
    }
    if (progress.lesson(key).tries === 0) showExample();
    else practise();
  });

  return () => {
    alive = false;
    runner?.stop();
    board.destroy();
  };
}
