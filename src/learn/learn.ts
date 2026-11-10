// Learn tab: the guided path, the full course list, and routing to every lesson type.
//   #learn  /  #learn/path/<level>   guided path (beginner → advanced)
//   #learn/all                   every course in one place
//   #learn/basics/<id>           "learn to play" lesson (pieces, rules, opening principles)
//   #learn/opening/<id>          opening overview
//   #learn/opening/<id>/<line>/<learn|practice>   trainer ("any" line = random, least-practised first)
//   #learn/lesson/<theme>        tactic or mate lesson
//   #learn/endgame/<key>         basic mate / pawn ending drill
//   #learn/practice/<opening|middlegame|endgame>  random scenario
import { h } from "../board";
import { themeName, loadPuzzles } from "../puzzles";
import { mountEndgame } from "./endgame";
import { ENDGAMES, LEVEL_BANDS, MATES, TACTICS, type Lesson } from "./lessons-data";
import { mountLesson } from "./lesson";
import { OPENINGS } from "./openings-data";
import { mountOpening } from "./opening";
import { LINE_MASTERED, progress } from "./progress";
import { mountScenario, SCENARIOS } from "./scenario";
import { afterMoves, boardThumb, icon, piece, type IconName } from "../ui/visuals";
import { Chess } from "chess.js";
import { mountBasics } from "./basics";
import { pathView } from "./path";

export function mountLearn(root: HTMLElement, path: string[]): () => void {
  const [section, a, b, c] = path;
  if (section === "opening" && a) return mountOpening(root, a, b, c);
  if (section === "lesson" && a) return mountLesson(root, a);
  if (section === "endgame" && a) return mountEndgame(root, a);
  if (section === "practice" && a) return mountScenario(root, a);
  if (section === "basics" && a) return mountBasics(root, a);
  if (section === "all") return mountHub(root);
  return mountPath(root, section === "path" ? a : undefined);
}

/** Title row shared by the path and the course list, with a switch between them. */
function learnTop(active: "path" | "all") {
  const tab = (key: "path" | "all", label: string, href: string, ico: IconName) =>
    h("a", { class: `top-tab${key === active ? " on" : ""}`, href }, icon(ico, 18), label);
  return h("header", { class: "learn-top" },
    h("h1", {}, "Lessons"),
    h("nav", { class: "top-tabs" }, tab("path", "Guided path", "#learn", "Route"), tab("all", "All lessons", "#learn/all", "LayoutGrid")));
}

function mountPath(root: HTMLElement, level?: string) {
  const render = (lvl?: string) => root.replaceChildren(h("div", { class: "learn" }, learnTop("path"), pathView(lvl, (k) => {
    history.replaceState(null, "", `#learn/path/${k}`);
    render(k);
  })));
  render(level);
  return () => {};
}

// Representative positions for the endgame and scenario cards.
const ENDGAME_THUMBS: Record<string, string> = {
  kq: "8/8/3k4/8/8/2Q5/8/4K3 w - - 0 1",
  krr: "3k4/8/8/8/8/8/R7/1R2K3 w - - 0 1",
  kr: "3k4/8/8/8/8/8/8/R3K3 w - - 0 1",
  kbb: "3k4/8/8/8/8/8/8/2B1KB2 w - - 0 1",
  kbn: "3k4/8/8/8/8/8/8/1N2KB2 w - - 0 1",
  kp: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
};
const SCENARIO_THUMBS: Record<string, { moves?: string; fen?: string }> = {
  opening: { moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6" },
  middlegame: { fen: "r2q1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PPQ2PPP/R3K2R w KQ - 0 10" },
  endgame: { fen: "8/5pk1/6p1/3R4/r4P2/6PK/8/8 w - - 0 40" },
};

function card(href: string, title: string, sub: string, meter?: number, badge?: string, image?: HTMLElement) {
  return h("a", { class: "card", href },
    image ?? "",
    h("div", { class: "card-top" }, h("b", {}, title), badge ? h("span", { class: "pill" }, badge) : ""),
    h("div", { class: "muted small" }, sub),
    meter !== undefined ? h("div", { class: "meter" }, h("i", { style: `width:${Math.round(meter * 100)}%` })) : "",
  );
}

function mountHub(root: HTMLElement) {
  const p = progress.get();

  const openings = OPENINGS.map((o) => {
    const learned = o.lines.filter((l) => (p.lines[l.id]?.clean ?? 0) >= LINE_MASTERED).length;
    const pos = afterMoves(o.lines[0].moves.split(" ").slice(0, 8).join(" "));
    return card(`#learn/opening/${o.id}`, o.name, `as ${o.side === "white" ? "White" : "Black"} · ${learned}/${o.lines.length} lines learned`, learned / o.lines.length, undefined, boardThumb(pos.fen, { orientation: o.side, highlight: pos.last }));
  });

  const lessonCards = (list: Lesson[]) => {
    const grid = h("div", { class: "cards" });
    for (const l of list) {
      const lp = p.lessons[l.key];
      const level = lp?.level ?? 1;
      const c = card(`#learn/lesson/${l.key}`, l.title, lp ? `${lp.solved} solved` : "Not started", (level - 1) / LEVEL_BANDS.length, `Lv ${level}`, h("div", { class: "thumb placeholder" }));
      c.dataset.theme = l.key;
      grid.append(c);
    }
    return grid;
  };
  const tactics = lessonCards(TACTICS);
  const mates = lessonCards(MATES);

  // Hide lessons with too few puzzles to practise properly.
  loadPuzzles().then((ps) => {
    const count = new Map<string, number>();
    const easiest = new Map<string, (typeof ps)[number]>(); // puzzles are sorted by rating
    for (const q of ps) for (const t of q.themes) {
      count.set(t, (count.get(t) ?? 0) + 1);
      if (!easiest.has(t)) easiest.set(t, q);
    }
    root.querySelectorAll<HTMLElement>("[data-theme]").forEach((el) => {
      const n = count.get(el.dataset.theme!) ?? 0;
      if (n < 15) return el.remove();
      el.title = `${n} ${themeName(el.dataset.theme!)} puzzles`;
      // Card image: the easiest real example, from the solver's side.
      const p = easiest.get(el.dataset.theme!)!;
      const c = new Chess(p.fen);
      const u = p.solution[0];
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      el.querySelector(".thumb")?.replaceWith(boardThumb(c.fen(), { orientation: c.turn() === "w" ? "white" : "black", highlight: [u.slice(0, 2), u.slice(2, 4)] }));
    });
  });

  const endgames = ENDGAMES.map((e) => {
    const ep = p.endgames[e.key];
    return card(`#learn/endgame/${e.key}`, e.title, ep ? `${ep.wins} wins · ${ep.tries} tries${ep.best ? ` · best ${ep.best} moves` : ""}` : `Mate in ${e.moveLimit} moves or fewer`, ep?.wins ? Math.min(1, ep.wins / 5) : 0, undefined, boardThumb(ENDGAME_THUMBS[e.key]));
  });

  const scenarios = SCENARIOS.map((s) => {
    const t = SCENARIO_THUMBS[s.key];
    const pos = t.moves ? afterMoves(t.moves) : { fen: t.fen!, last: [] };
    return card(`#learn/practice/${s.key}`, s.title, s.blurb, undefined, `${p.scenarios[s.key]?.played ?? 0} played`, boardThumb(pos.fen, { highlight: pos.last }));
  });

  const hero = h("header", { class: "learn-hero" },
    h("div", { class: "hero-text" },
      h("h1", {}, "Learn"),
      h("p", {}, "Everything here is hands-on: learn an idea, then practise it until it sticks. Repeat any section as often as you like."),
      h("div", { class: "hero-stats" },
        stat("BookOpen", `${Object.values(p.lines).filter((l) => l.clean >= LINE_MASTERED).length}`, "lines learned"),
        stat("Zap", `${Object.values(p.lessons).reduce((n, l) => n + l.solved, 0)}`, "lesson puzzles"),
        stat("Trophy", `${Object.values(p.endgames).reduce((n, e) => n + e.wins, 0)}`, "endgames won"),
      ),
    ),
    h("div", { class: "hero-pieces" }, ...["king", "queen", "rook", "bishop", "knight", "pawn"].map((r, i) => piece(i % 2 ? "black" : "white", r, 64))),
  );

  root.append(
    h("div", { class: "learn" },
      learnTop("all"),
      hero,
      section("BookOpen", "#5aa4e0", "Openings", "Learn the moves and the reasons, then practise from memory.", h("div", { class: "cards" }, ...openings)),
      section("Zap", "#f39c2f", "Tactics", "Each lesson has an example and endless practice. Five clean solves in a row moves you up a level.", tactics),
      section("Crown", "#e5534b", "Checkmate patterns", "Recognise the classic mating nets instantly.", mates),
      section("Target", "#a77fe0", "Endgame technique", "Random positions every time. Mate the lone king against Stockfish's best defence.", h("div", { class: "cards" }, ...endgames)),
      section("Swords", "#81b64c", "Practice scenarios", "Random positions from each phase of the game. Play them out against the computer.", h("div", { class: "cards wide" }, ...scenarios)),
    ),
  );
  return () => {};
}

function section(iconName: IconName, color: string, title: string, sub: string, body: HTMLElement) {
  const badge = h("span", { class: "section-icon" }, icon(iconName, 20));
  badge.style.background = color;
  return h("section", { class: "learn-section" }, h("h2", {}, badge, title), h("p", { class: "muted small" }, sub), body);
}

function stat(iconName: IconName, value: string, label: string) {
  return h("div", { class: "hero-stat" }, icon(iconName, 18), h("b", {}, value), h("span", {}, label));
}
