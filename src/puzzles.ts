// Puzzle trainer: rated puzzles, theme drills, and drilling your own reviewed mistakes.
import { Chess, type Square } from "chess.js";
import { askPromotion, button, colorOf, createBoard, h, isPromotion, playSound, positionConfig, soundFor, uciOf, type Color } from "./board";
import { engine, winPercent, type Line } from "./engine";
import { openInAnalysis } from "./router";
import { load, mistakes, save, type Mistake } from "./store";

type Raw = [id: string, fen: string, moves: string, rating: number, themes: string];
type Puzzle = { id: string; fen: string; solution: string[]; rating: number; themes: string[]; mistake?: Mistake };
type Source = "rated" | "theme" | "mistakes";

// Tags that describe length/outcome rather than a tactic; hidden from the theme picker.
const META = new Set(["short", "long", "veryLong", "oneMove", "crushing", "advantage", "equality", "master", "masterVsMaster", "superGM"]);
export const themeName = (t: string) => t.replace(/([A-Z0-9])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace("Mate In", "Mate in");

type Stats = {
  rating: number;
  played: number;
  streak: number;
  best: number;
  recent: boolean[];
  seen: string[];
  themes: Record<string, [won: number, tried: number]>;
};
const DEFAULT: Stats = { rating: 1000, played: 0, streak: 0, best: 0, recent: [], seen: [], themes: {} };

let all: Puzzle[] | undefined;
async function loadPuzzles(): Promise<Puzzle[]> {
  if (all) return all;
  const raw: Raw[] = await (await fetch(`${import.meta.env.BASE_URL}data/puzzles.json`)).json();
  return (all = raw.map(([id, fen, moves, rating, themes]) => ({ id, fen, solution: moves.split(" "), rating, themes: themes.split(" ") })));
}

export function mountPuzzles(root: HTMLElement) {
  const stats = load<Stats>("puzzles", DEFAULT);
  const prefs = load("puzzlePrefs", { source: "rated" as Source, theme: "fork" });
  let puzzle: Puzzle | undefined;
  let chess = new Chess();
  let step = 0; // index into solution of the next expected move
  let me: Color = "white";
  let failed = false; // got something wrong (or took a hint) this puzzle
  let scored = false; // rating already updated for this puzzle
  let done = false;
  let alive = true;

  const boardEl = h("div", { class: "board" });
  const board = createBoard(boardEl, { movable: { events: { after: (f, t) => userMove(f as Square, t as Square) } } });

  const ratingEl = h("div", { class: "big-rating" });
  const feedback = h("div", { class: "feedback" });
  const info = h("div", { class: "puzzle-info" });
  const actions = h("div", { class: "row" });
  const dots = h("div", { class: "dots" });
  const weak = h("div", { class: "weak" });

  const sourceSel = h("div", { class: "seg wide" });
  const themeSel = h("select", { class: "select" }) as HTMLSelectElement;

  function setSource(s: Source) {
    prefs.source = s;
    save("puzzlePrefs", prefs);
    sourceSel.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.s === s));
    themeSel.style.display = s === "theme" ? "" : "none";
    next();
  }
  for (const [s, label] of [["rated", "Rated"], ["theme", "By theme"], ["mistakes", "My mistakes"]] as [Source, string][]) {
    const b = button(label, () => setSource(s));
    b.dataset.s = s;
    sourceSel.append(b);
  }
  themeSel.onchange = () => {
    prefs.theme = themeSel.value;
    save("puzzlePrefs", prefs);
    next();
  };

  async function pick(): Promise<Puzzle | undefined> {
    if (prefs.source === "mistakes") {
      const list = mistakes.all();
      if (!list.length) return undefined;
      // Least-practised first, then oldest.
      const m = [...list].sort((a, b) => (a.solved ?? 0) - (b.solved ?? 0) || a.added - b.added)[0];
      return { id: m.id, fen: m.fen, solution: [m.best], rating: 0, themes: [], mistake: m };
    }
    const ps = await loadPuzzles();
    const seen = new Set(stats.seen);
    let pool = ps.filter((p) => !seen.has(p.id) && (prefs.source === "rated" || p.themes.includes(prefs.theme)));
    if (!pool.length) pool = ps.filter((p) => prefs.source === "rated" || p.themes.includes(prefs.theme));
    for (const width of [75, 150, 300, 600, 5000]) {
      const near = pool.filter((p) => Math.abs(p.rating - stats.rating) <= width);
      if (near.length >= 3 || width === 5000) return near[Math.floor(Math.random() * near.length)];
    }
  }

  async function next() {
    const p = await pick();
    if (!alive) return;
    puzzle = p;
    feedback.className = "feedback";
    if (!p) {
      board.set({ fen: "8/8/8/8/8/8/8/8 w - - 0 1", movable: { color: undefined } });
      feedback.textContent = "No saved mistakes yet. Run Game Review on one of your games and your mistakes and blunders get added here automatically.";
      info.replaceChildren();
      actions.replaceChildren();
      return;
    }
    chess = new Chess(p.fen);
    step = 0;
    failed = scored = done = false;
    board.setAutoShapes([]);
    if (p.mistake) {
      // Your own position: you're the side to move, no setup move.
      me = colorOf(chess.turn());
      board.set({ orientation: me, ...positionConfig(chess, me) });
      feedback.textContent = `In your game you played ${p.mistake.played} here (a ${p.mistake.kind}). Find the better move.`;
    } else {
      me = chess.turn() === "w" ? "black" : "white";
      board.set({ orientation: me, ...positionConfig(chess) });
      feedback.textContent = `Find the best move for ${me}.`;
      await new Promise((r) => setTimeout(r, 500));
      if (!alive || puzzle !== p) return;
      playUci(p.solution[step++]);
    }
    renderInfo();
    renderActions();
  }

  function playUci(uci: string) {
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    soundFor(chess, m);
    board.set(positionConfig(chess, done ? undefined : me));
  }

  async function userMove(from: Square, to: Square) {
    if (!puzzle || done) return;
    let promotion: string | undefined;
    if (isPromotion(chess, from, to)) {
      promotion = (await askPromotion(boardEl, to, me, me)) ?? undefined;
      if (!promotion) return board.set(positionConfig(chess, me));
    }
    const expected = puzzle.solution[step];
    const trial = new Chess(chess.fen());
    const m = trial.move({ from, to, promotion });
    // Any mating move counts, as there can be more than one. In your own
    // positions, any move nearly as good as the engine's best counts too.
    if (uciOf(m) !== expected && !trial.isCheckmate() && !(puzzle.mistake && (await nearlyBest(chess.fen(), trial)))) {
      playSound("wrong");
      fail();
      board.set(positionConfig(chess, me));
      feedback.className = "feedback bad";
      feedback.textContent = `${m.san} isn't it. Try again, or see the solution.`;
      return;
    }
    chess = trial;
    soundFor(chess, m);
    step++;
    if (step >= puzzle.solution.length || chess.isCheckmate()) return solved();
    board.set(positionConfig(chess, undefined));
    feedback.className = "feedback good";
    feedback.textContent = "Best move! Keep going…";
    await new Promise((r) => setTimeout(r, 450));
    if (puzzle && !done) {
      playUci(puzzle.solution[step++]);
      board.set(positionConfig(chess, me));
    }
  }

  async function nearlyBest(before: string, after: Chess) {
    board.set({ movable: { color: undefined } });
    feedback.className = "feedback";
    feedback.textContent = "Checking your move…";
    const [a, b] = [await engine().search(before, { depth: 12 }), await engine().search(after.fen(), { depth: 12 })];
    if (!a?.lines[0] || !b?.lines[0]) return false;
    const mover = (l: Line) => (me === "white" ? winPercent(l) : 100 - winPercent(l));
    return mover(a.lines[0]) - mover(b.lines[0]) < 4;
  }

  function score(win: boolean) {
    if (scored || !puzzle) return;
    scored = true;
    if (puzzle.mistake) {
      if (win) mistakes.update((puzzle.mistake = { ...puzzle.mistake, solved: (puzzle.mistake.solved ?? 0) + 1 }));
      return;
    }
    const before = stats.rating;
    if (prefs.source === "rated") {
      const k = stats.played < 30 ? 40 : 20;
      const expected = 1 / (1 + 10 ** ((puzzle.rating - stats.rating) / 400));
      stats.rating = Math.round(stats.rating + k * ((win ? 1 : 0) - expected));
    }
    stats.played++;
    stats.streak = win ? stats.streak + 1 : 0;
    stats.best = Math.max(stats.best, stats.streak);
    stats.recent = [...stats.recent, win].slice(-20);
    stats.seen = [...stats.seen, puzzle.id].slice(-5000);
    for (const t of puzzle.themes) {
      if (META.has(t)) continue;
      const [w, n] = stats.themes[t] ?? [0, 0];
      stats.themes[t] = [w + (win ? 1 : 0), n + 1];
    }
    save("puzzles", stats);
    renderStats(stats.rating - before);
  }

  function fail() {
    failed = true;
    score(false);
    renderActions();
  }

  function solved() {
    done = true;
    score(!failed);
    board.set(positionConfig(chess, undefined));
    feedback.className = "feedback good";
    feedback.textContent = failed ? "Solved — but it didn't count. Keep at it." : "Correct! Puzzle solved.";
    renderInfo();
    renderActions();
    if (!failed && prefs.source !== "mistakes") setTimeout(() => puzzle && done && autoNext.checked && next(), 1200);
  }

  async function showSolution() {
    if (!puzzle || done) return;
    const p = puzzle;
    fail();
    done = true;
    board.setAutoShapes([]);
    while (step < p.solution.length) {
      playUci(p.solution[step++]);
      await new Promise((r) => setTimeout(r, 650));
      if (!alive || puzzle !== p) return;
    }
    feedback.className = "feedback";
    feedback.textContent = "That was the solution. Step through it in Analysis if it isn't clear why.";
    renderInfo();
    renderActions();
  }

  function hint() {
    if (!puzzle || done) return;
    fail();
    const sq = puzzle.solution[step].slice(0, 2) as Square;
    board.setAutoShapes([{ orig: sq, brush: "paleBlue" }]);
    feedback.className = "feedback";
    feedback.textContent = "Hint: move the highlighted piece. (Hints count as a miss.)";
  }

  const autoNext = h("input", { type: "checkbox" }) as HTMLInputElement;
  autoNext.checked = load("puzzleAuto", { on: true }).on;
  autoNext.onchange = () => save("puzzleAuto", { on: autoNext.checked });

  function renderActions() {
    const analyse = button("Analyse", () => puzzle && openInAnalysis({ fen: puzzle.fen }));
    actions.replaceChildren(...(done ? [button("Next puzzle →", next, "primary"), analyse] : [button("Hint", hint), button("Solution", showSolution), button("Skip", next)]));
  }

  function renderInfo() {
    if (!puzzle || puzzle.mistake) return info.replaceChildren(puzzle?.mistake ? h("div", { class: "muted small" }, `Mistake drill · solved ${puzzle.mistake.solved ?? 0}×`) : "");
    const tags = done ? puzzle.themes.filter((t) => !META.has(t)).map((t) => h("span", { class: "tag" }, themeName(t))) : [h("span", { class: "muted small" }, "Themes shown after solving")];
    info.replaceChildren(
      h("div", { class: "muted small" }, `Puzzle rating ${puzzle.rating} · `, h("a", { href: `https://lichess.org/training/${puzzle.id}`, target: "_blank", rel: "noreferrer" }, `#${puzzle.id}`)),
      h("div", { class: "tags" }, ...tags),
    );
  }

  function renderStats(delta = 0) {
    ratingEl.replaceChildren(
      h("span", {}, String(stats.rating)),
      delta ? h("span", { class: delta > 0 ? "up" : "down" }, `${delta > 0 ? "+" : ""}${delta}`) : "",
      h("small", {}, `Streak ${stats.streak} · best ${stats.best} · ${stats.played} played`),
    );
    dots.replaceChildren(...stats.recent.map((w) => h("i", { class: w ? "win" : "loss" })));
    const ranked = Object.entries(stats.themes)
      .filter(([, [, n]]) => n >= 3)
      .map(([t, [w, n]]) => ({ t, pct: w / n, n }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5);
    weak.replaceChildren(
      h("h3", {}, "Weakest themes"),
      ...(ranked.length
        ? ranked.map((r) => {
            const b = button("", () => {
              prefs.theme = r.t;
              themeSel.value = r.t;
              setSource("theme");
            }, "weak-row");
            b.append(h("span", {}, themeName(r.t)), h("span", { class: "bar" }, h("i", { style: `width:${r.pct * 100}%` })), h("span", { class: "muted" }, `${Math.round(r.pct * 100)}%`));
            return b;
          })
        : [h("div", { class: "muted small" }, "Solve a few more puzzles to see where you're weakest. Click a theme to drill it.")]),
    );
  }

  loadPuzzles().then((ps) => {
    const counts = new Map<string, number>();
    for (const p of ps) for (const t of p.themes) if (!META.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    [...counts].filter(([, n]) => n >= 20).sort((a, b) => themeName(a[0]).localeCompare(themeName(b[0]))).forEach(([t, n]) => themeSel.append(new Option(`${themeName(t)} (${n})`, t, false, t === prefs.theme)));
  });

  root.append(
    h("div", { class: "layout" },
      h("div", { class: "board-col" }, boardEl),
      h("aside", { class: "panel" },
        h("h2", {}, "Puzzles"),
        ratingEl,
        dots,
        sourceSel,
        themeSel,
        feedback,
        info,
        actions,
        h("label", { class: "toggle small" }, autoNext, h("span", {}, "Next puzzle automatically after a clean solve")),
        weak,
        h("div", { class: "muted tiny" }, "Puzzles from the Lichess open database (CC0)."),
      ),
    ),
  );

  board.redrawAll(); // bounds are only measurable once attached
  renderStats();
  setSource(prefs.source);

  return () => {
    alive = false;
    engine().stop();
    board.destroy();
  };
}
