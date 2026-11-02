// Analysis board: free moves, live multi-line engine, PGN/FEN import, and full game review.
import { Chess, validateFen, type Move, type Square } from "chess.js";
import { askPromotion, button, colorOf, createBoard, evalBar, h, isPromotion, positionConfig, pvToSan, renderMoves, soundFor, uciOf, type Color, type MoveMark } from "./board";
import { strongEngine as engine, formatScore, winPercent, type Line } from "./engine";
import { mistakes, type Mistake } from "./store";
import { coachPanel, describeLines, describePosition } from "./ai/coach";
import { title } from "./ui/title";
import { icon } from "./ui/visuals";

export type AnalysisInput = { pgn?: string; fen?: string; review?: boolean; me?: Color };

type Verdict = "best" | "good" | "inaccuracy" | "mistake" | "blunder";
const MARK: Record<Verdict, MoveMark> = {
  best: { symbol: "★", cls: "best" },
  good: undefined,
  inaccuracy: { symbol: "?!", cls: "inaccuracy" },
  mistake: { symbol: "?", cls: "mistake" },
  blunder: { symbol: "??", cls: "blunder" },
};

export function mountAnalysis(root: HTMLElement, input: AnalysisInput = {}) {
  let startFen = new Chess().fen();
  let line: Move[] = []; // main line
  let ply = 0; // position shown = after `ply` moves
  let orientation: Color = input.me ?? "white";
  let engineOn = true;
  let reviewing = false;
  let review: { evals: Line[]; best: string[]; verdicts: Verdict[]; loss: number[] } | null = null;
  let me: Color | "both" = input.me ?? "both";
  let alive = true;

  const boardEl = h("div", { class: "board" });
  const bar = evalBar();
  const linesEl = h("div", { class: "lines" });
  const moves = h("div", { class: "moves" });
  const coach = h("div", { class: "coach" });
  const summary = h("div", { class: "summary" });
  const graph = h("div", { class: "graph" });
  const engineToggle = h("input", { type: "checkbox" }) as HTMLInputElement;
  engineToggle.checked = true;
  engineToggle.onchange = () => {
    engineOn = engineToggle.checked;
    sync();
  };

  const chessAt = (n: number) => {
    const c = new Chess(startFen);
    for (const m of line.slice(0, n)) c.move(m.san);
    return c;
  };
  let chess = chessAt(0);

  const board = createBoard(boardEl, {
    orientation,
    movable: { events: { after: (from, to) => userMove(from as Square, to as Square) } },
  });

  async function userMove(from: Square, to: Square) {
    let promotion: string | undefined;
    if (isPromotion(chess, from, to)) {
      promotion = (await askPromotion(boardEl, to, colorOf(chess.turn()), orientation)) ?? undefined;
      if (!promotion) return sync();
    }
    const m = chess.move({ from, to, promotion });
    soundFor(chess, m);
    if (line[ply] && uciOf(line[ply]) === uciOf(m)) {
      ply++;
    } else {
      // New branch replaces the rest of the line (and any review of it).
      line = [...line.slice(0, ply), m];
      ply++;
      review = null;
    }
    sync();
  }

  function goTo(n: number) {
    ply = Math.max(0, Math.min(line.length, n));
    chess = chessAt(ply);
    sync();
  }

  function sync() {
    chess = chessAt(ply);
    board.set(positionConfig(chess, reviewing ? undefined : "both"));
    board.setAutoShapes([]);
    renderMoves(moves, line.map((m) => m.san), ply, goTo, review?.verdicts.map((v) => MARK[v]) ?? [], startFen.split(" ")[1] === "b", +startFen.split(" ")[5]);
    renderCoach();
    renderSummary();
    coachAi.refresh();
    placeBadge();
    if (review) bar.set(review.evals[ply], orientation);
    runEngine();
  }

  /** Game Review badge pinned to the corner of the square the current move landed on, as on chess.com. */
  const badge = h("div", { class: "sq-badge" });
  function placeBadge() {
    const v = review && ply > 0 ? review.verdicts[ply - 1] : undefined;
    if (!v) return badge.remove();
    const to = line[ply - 1].to;
    const f = to.charCodeAt(0) - 97;
    const r = +to[1] - 1;
    const [col, row] = orientation === "white" ? [f, 7 - r] : [7 - f, r];
    badge.className = `sq-badge ${v}`;
    badge.replaceChildren(v === "best" ? icon("Star", 14) : v === "good" ? icon("Check", 14) : MARK[v]!.symbol);
    badge.style.left = `${(col + 1) * 12.5}%`;
    badge.style.top = `${row * 12.5}%`;
    boardEl.append(badge);
  }

  function runEngine() {
    if (reviewing) return; // the review owns the engine until it finishes
    engine().stop();
    linesEl.replaceChildren();
    if (!engineOn) {
      if (!review) bar.set(undefined, orientation);
      return;
    }
    if (chess.isGameOver()) {
      linesEl.append(h("div", { class: "muted" }, chess.isCheckmate() ? "Checkmate" : "Draw"));
      return;
    }
    const fen = chess.fen();
    engine().search(fen, { depth: 22, multipv: 3 }, (lines) => {
      if (fen !== chess.fen()) return;
      live = { fen, lines };
      bar.set(lines[0], orientation);
      linesEl.replaceChildren(
        h("div", { class: "muted small" }, `Stockfish 19 (full network) · depth ${lines[0].depth}`),
        ...lines.map((l) => h("div", { class: "line" }, h("b", { class: (winPercent(l) >= 50 ? "w" : "b") + " score" }, formatScore(l)), h("span", {}, pvToSan(fen, l.pv)))),
      );
      const best = lines[0].pv[0];
      if (best) board.setAutoShapes([{ orig: best.slice(0, 2) as Square, dest: best.slice(2, 4) as Square, brush: "paleBlue" }]);
    });
  }

  // ---------- game review ----------

  async function runReview() {
    if (!line.length || reviewing) return;
    reviewing = true;
    engine().stop();
    const evals: Line[] = [];
    const best: string[] = [];
    for (let i = 0; i <= line.length; i++) {
      summary.replaceChildren(h("div", { class: "progress" }, h("div", { style: `width:${(i / (line.length + 1)) * 100}%` })), h("div", { class: "muted small" }, `Reviewing move ${Math.ceil(i / 2)} of ${Math.ceil(line.length / 2)}…`));
      const c = chessAt(i);
      if (c.isCheckmate()) evals[i] = { multipv: 1, depth: 0, mate: c.turn() === "w" ? -1 : 1, pv: [] };
      else if (c.isGameOver()) evals[i] = { multipv: 1, depth: 0, cp: 0, pv: [] };
      else {
        const res = await engine().search(c.fen(), { depth: 14, movetime: 900 });
        if (!res) {
          reviewing = false; // cancelled
          return alive ? sync() : undefined;
        }
        evals[i] = res.lines[0] ?? { multipv: 1, depth: 0, cp: 0, pv: [] };
        best[i] = res.best;
      }
    }
    const verdicts: Verdict[] = [];
    const loss: number[] = [];
    line.forEach((m, i) => {
      const sign = m.color === "w" ? 1 : -1;
      const before = sign > 0 ? winPercent(evals[i]) : 100 - winPercent(evals[i]);
      const after = sign > 0 ? winPercent(evals[i + 1]) : 100 - winPercent(evals[i + 1]);
      const l = Math.max(0, before - after);
      loss.push(l);
      verdicts.push(uciOf(m) === best[i] ? "best" : l >= 20 ? "blunder" : l >= 10 ? "mistake" : l >= 5 ? "inaccuracy" : "good");
    });
    review = { evals, best, verdicts, loss };
    reviewing = false;

    const found: Mistake[] = [];
    line.forEach((m, i) => {
      const v = verdicts[i];
      if ((v === "mistake" || v === "blunder") && (me === "both" || colorOf(m.color) === me)) {
        const fen = chessAt(i).fen();
        found.push({ id: fen, fen, played: m.san, best: best[i], kind: v, added: Date.now() });
      }
    });
    mistakes.add(found);
    sync();
  }

  // ---------- AI coach ----------

  let live: { fen: string; lines: Line[] } = { fen: "", lines: [] };

  /** Stockfish lines for a position: live analysis if it's current, otherwise a quick search. */
  async function linesFor(fen: string): Promise<Line[]> {
    if (live.fen === fen && live.lines[0]?.depth >= 14) return live.lines;
    const res = await engine().search(fen, { depth: 16, multipv: 3 });
    runEngine(); // the coach's search interrupted live analysis; restart it
    return res?.lines ?? [];
  }

  async function moveContext(): Promise<string> {
    const i = ply - 1;
    const m = line[i];
    const before = chessAt(i).fen();
    const after = chess.fen();
    const [b, a] = [await linesFor(before), await linesFor(after)];
    const verdict = review?.verdicts[i];
    return [
      "The position BEFORE the move:",
      describePosition(before),
      describeLines(before, b),
      "",
      `Move played: ${Math.ceil(ply / 2)}${m.color === "w" ? "." : "..."} ${m.san} (by ${m.color === "w" ? "White" : "Black"})${verdict ? `, classified by Game Review as: ${verdict}` : ""}.`,
      "",
      "The position AFTER the move:",
      describePosition(after),
      describeLines(after, a),
    ].join("\n");
  }

  const coachAi = coachPanel({
    context: async () => {
      const fen = chess.fen();
      const recent = line.slice(Math.max(0, ply - 10), ply).map((m) => m.san).join(" ");
      return [describePosition(fen), recent ? `Recent moves: ${recent}` : "", describeLines(fen, await linesFor(fen))].filter(Boolean).join("\n");
    },
    actions: () => [
      { label: "Explain this position", prompt: "What's going on in this position? Who stands better and why, and what should the side to move be trying to do?" },
      ...(ply > 0
        ? [{ label: "Explain the last move", prompt: async () => `${await moveContext()}\n\nExplain the move that was played: what did it try to do, and how does it compare with Stockfish's best move in the position before? If it was a mistake, explain clearly what it allowed.` }]
        : []),
      ...(review
        ? [{ label: "Summarise my game", prompt: () => gameSummaryPrompt() }]
        : []),
    ],
  });

  function gameSummaryPrompt(): string {
    const r = review!;
    const bad = line
      .map((m, i) => ({ m, i, v: r.verdicts[i] }))
      .filter((x) => x.v === "mistake" || x.v === "blunder" || x.v === "inaccuracy")
      .filter((x) => me === "both" || colorOf(x.m.color) === me)
      .slice(0, 12)
      .map(({ m, i, v }) => {
        const before = chessAt(i).fen();
        return `- Move ${Math.ceil((i + 1) / 2)}${m.color === "w" ? "." : "..."} ${m.san} (${v}). Eval before ${formatScore(r.evals[i])}, after ${formatScore(r.evals[i + 1])}. Stockfish preferred ${pvToSan(before, [r.best[i]]).replace(/^\d+\.+\s*/, "")}.`;
      });
    return [
      `Game (PGN moves): ${line.map((m) => m.san).join(" ")}`,
      `I played: ${me === "both" ? "both sides / not specified" : me}.`,
      "Stockfish Game Review found these errors:",
      ...(bad.length ? bad : ["- none worth mentioning"]),
      "",
      "Summarise this game for me as a coach would: the 2-3 most important lessons, what patterns to practise, and one thing I did well. Under 180 words.",
    ].join("\n");
  }

  const accuracy = (losses: number[]) =>
    losses.length ? losses.reduce((s, l) => s + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * l) - 3.1669)), 0) / losses.length : 100;

  function renderSummary() {
    if (reviewing) return;
    graph.replaceChildren();
    if (!review) {
      summary.replaceChildren(
        line.length ? button("★ Run Game Review", runReview, "primary wide") : h("div", { class: "muted small" }, "Play or load a game, then run Game Review to get accuracy and every mistake marked."),
      );
      return;
    }
    const side = (c: "w" | "b") => {
      const idx = line.map((m, i) => (m.color === c ? i : -1)).filter((i) => i >= 0);
      const count = (v: Verdict) => idx.filter((i) => review!.verdicts[i] === v).length;
      return { acc: accuracy(idx.map((i) => review!.loss[i])), best: count("best"), inacc: count("inaccuracy"), mist: count("mistake"), blun: count("blunder") };
    };
    const w = side("w");
    const b = side("b");
    const row = (label: string, cls: string, a: number, bb: number) => {
      const [sym, ...name] = label.split(" ");
      return h("tr", {}, h("td", { class: cls }, h("i", { class: `mark ${cls}` }, sym), ` ${name.join(" ")}`), h("td", {}, String(a)), h("td", {}, String(bb)));
    };
    summary.replaceChildren(
      h("table", { class: "review" },
        h("tr", {}, h("th", {}), h("th", {}, "White"), h("th", {}, "Black")),
        h("tr", { class: "acc" }, h("td", {}, "Accuracy"), h("td", {}, w.acc.toFixed(1)), h("td", {}, b.acc.toFixed(1))),
        row("★ Best", "best", w.best, b.best),
        row("?! Inaccuracy", "inaccuracy", w.inacc, b.inacc),
        row("? Mistake", "mistake", w.mist, b.mist),
        row("?? Blunder", "blunder", w.blun, b.blun),
      ),
    );
    graph.append(evalGraph(review.evals, ply, goTo));
  }

  function renderCoach() {
    coach.replaceChildren();
    if (!review || ply === 0) return;
    const i = ply - 1;
    const v = review.verdicts[i];
    const m = line[i];
    const before = chessAt(i).fen();
    const bestSan = pvToSan(before, [review.best[i]]).replace(/^\d+\.+\s*/, "");
    const text: Record<Verdict, string> = {
      best: `${m.san} is the best move.`,
      good: `${m.san} is a good move.`,
      inaccuracy: `${m.san} is an inaccuracy. Best was ${bestSan}.`,
      mistake: `${m.san} is a mistake. Best was ${bestSan}.`,
      blunder: `${m.san} is a blunder. Best was ${bestSan}.`,
    };
    coach.className = `coach ${v}`;
    coach.append(h("div", {}, text[v]), h("div", { class: "muted small" }, `Eval after: ${formatScore(review.evals[ply])}`));
    if (v !== "best" && v !== "good") {
      coach.append(
        button("Show best", () => {
          goTo(i);
          const b = review!.best[i];
          board.setAutoShapes([{ orig: b.slice(0, 2) as Square, dest: b.slice(2, 4) as Square, brush: "green" }]);
        }),
      );
    }
  }

  // ---------- import / export ----------

  const io = h("textarea", { class: "io", placeholder: "Paste a PGN or FEN, then Load", rows: "3" }) as HTMLTextAreaElement;

  function loadText(text: string): boolean {
    text = text.trim();
    if (!text) return false;
    try {
      if (validateFen(text).ok) {
        startFen = text;
        line = [];
      } else {
        const c = new Chess();
        c.loadPgn(text);
        const hist = c.history({ verbose: true });
        startFen = hist[0]?.before ?? c.fen();
        line = hist;
      }
    } catch {
      io.classList.add("bad");
      setTimeout(() => io.classList.remove("bad"), 800);
      return false;
    }
    review = null;
    goTo(line.length);
    return true;
  }

  function exportPgn() {
    const c = new Chess(startFen);
    if (startFen !== new Chess().fen()) {
      c.setHeader("SetUp", "1");
      c.setHeader("FEN", startFen);
    }
    for (const m of line) c.move(m.san);
    return c.pgn();
  }

  const copy = (text: string, btn: HTMLButtonElement) => {
    navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 900);
  };

  const fenBtn = button("Copy FEN", () => copy(chess.fen(), fenBtn));
  const pgnBtn = button("Copy PGN", () => copy(exportPgn(), pgnBtn));

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowLeft") goTo(ply - 1);
    else if (e.key === "ArrowRight") goTo(ply + 1);
    else if (e.key === "Home" || e.key === "ArrowUp") goTo(0);
    else if (e.key === "End" || e.key === "ArrowDown") goTo(line.length);
    else if (e.key === "f") flip();
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);

  function flip() {
    orientation = orientation === "white" ? "black" : "white";
    board.set({ orientation });
    sync();
  }

  const meSel = h("select", { class: "select" }) as HTMLSelectElement;
  for (const [v, t] of [["both", "Both sides"], ["white", "White"], ["black", "Black"]]) meSel.append(new Option(t, v, false, v === me));
  meSel.onchange = () => (me = meSel.value as Color | "both");

  root.append(
    h("div", { class: "layout" },
      h("div", { class: "board-col with-bar" }, bar.el, boardEl),
      h("aside", { class: "panel" },
        h("div", { class: "panel-head" }, title("ChartLine", "Analysis", "#a77fe0"), h("label", { class: "toggle" }, engineToggle, h("span", {}, "Engine"))),
        linesEl,
        summary,
        graph,
        coach,
        coachAi.el,
        moves,
        h("div", { class: "row" },
          button("⏮", () => goTo(0)), button("◀", () => goTo(ply - 1)), button("▶", () => goTo(ply + 1)), button("⏭", () => goTo(line.length)), button("Flip", flip),
        ),
        h("details", { class: "more" },
          h("summary", {}, "Import / export"),
          io,
          h("label", { class: "field" }, h("span", {}, "Save mistakes for"), meSel),
          h("div", { class: "row" }, button("Load", () => loadText(io.value) && (io.value = "")), fenBtn, pgnBtn, button("Reset", () => loadText(new Chess().fen()))),
        ),
      ),
    ),
  );

  board.redrawAll(); // bounds are only measurable once attached
  if (input.fen) loadText(input.fen);
  else if (input.pgn) loadText(input.pgn);
  sync();
  if (input.review) runReview();

  return () => {
    alive = false;
    window.removeEventListener("keydown", onKey);
    engine().stop();
    board.destroy();
  };
}

function evalGraph(evals: Line[], current: number, onPick: (ply: number) => void) {
  const W = 300;
  const H = 70;
  const n = Math.max(1, evals.length - 1);
  const pts = evals.map((e, i) => `${(i / n) * W},${H - (winPercent(e) / 100) * H}`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `
    <polygon points="0,${H} ${pts.join(" ")} ${W},${H}" class="g-white"/>
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="g-mid"/>
    <line x1="${(current / n) * W}" x2="${(current / n) * W}" y1="0" y2="${H}" class="g-cur"/>`;
  svg.onclick = (e) => {
    const r = svg.getBoundingClientRect();
    onPick(Math.round(((e.clientX - r.left) / r.width) * n));
  };
  return svg;
}
