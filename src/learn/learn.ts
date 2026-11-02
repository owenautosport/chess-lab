// Learn tab: hub page plus routing to openings, lessons, endgames and practice scenarios.
//   #learn                       hub
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

export function mountLearn(root: HTMLElement, path: string[]): () => void {
  const [section, a, b, c] = path;
  if (section === "opening" && a) return mountOpening(root, a, b, c);
  if (section === "lesson" && a) return mountLesson(root, a);
  if (section === "endgame" && a) return mountEndgame(root, a);
  if (section === "practice" && a) return mountScenario(root, a);
  return mountHub(root);
}

function card(href: string, title: string, sub: string, meter?: number, badge?: string) {
  return h("a", { class: "card", href },
    h("div", { class: "card-top" }, h("b", {}, title), badge ? h("span", { class: "pill" }, badge) : ""),
    h("div", { class: "muted small" }, sub),
    meter !== undefined ? h("div", { class: "meter" }, h("i", { style: `width:${Math.round(meter * 100)}%` })) : "",
  );
}

function mountHub(root: HTMLElement) {
  const p = progress.get();

  const openings = OPENINGS.map((o) => {
    const learned = o.lines.filter((l) => (p.lines[l.id]?.clean ?? 0) >= LINE_MASTERED).length;
    return card(`#learn/opening/${o.id}`, o.name, `as ${o.side === "white" ? "White" : "Black"} · ${learned}/${o.lines.length} lines learned`, learned / o.lines.length);
  });

  const lessonCards = (list: Lesson[]) => {
    const grid = h("div", { class: "cards" });
    for (const l of list) {
      const lp = p.lessons[l.key];
      const level = lp?.level ?? 1;
      const c = card(`#learn/lesson/${l.key}`, l.title, lp ? `${lp.solved} solved` : "Not started", (level - 1) / LEVEL_BANDS.length, `Lv ${level}`);
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
    for (const q of ps) for (const t of q.themes) count.set(t, (count.get(t) ?? 0) + 1);
    root.querySelectorAll<HTMLElement>("[data-theme]").forEach((el) => {
      const n = count.get(el.dataset.theme!) ?? 0;
      if (n < 15) el.remove();
      else el.title = `${n} ${themeName(el.dataset.theme!)} puzzles`;
    });
  });

  const endgames = ENDGAMES.map((e) => {
    const ep = p.endgames[e.key];
    return card(`#learn/endgame/${e.key}`, e.title, ep ? `${ep.wins} wins · ${ep.tries} tries${ep.best ? ` · best ${ep.best} moves` : ""}` : `Mate in ${e.moveLimit} moves or fewer`, ep?.wins ? Math.min(1, ep.wins / 5) : 0);
  });

  const scenarios = SCENARIOS.map((s) => card(`#learn/practice/${s.key}`, s.title, s.blurb, undefined, `${p.scenarios[s.key]?.played ?? 0} played`));

  root.append(
    h("div", { class: "learn" },
      h("header", { class: "learn-head" }, h("h1", {}, "Learn"), h("p", { class: "muted" }, "Everything here is hands-on: learn an idea, then practise it until it sticks. Repeat any section as often as you like.")),
      section("Openings", "Learn the moves and the reasons, then practise from memory.", h("div", { class: "cards" }, ...openings)),
      section("Tactics", "Each lesson has an example and endless practice. Five clean solves in a row moves you up a level.", tactics),
      section("Checkmate patterns", "Recognise the classic mating nets instantly.", mates),
      section("Endgame technique", "Random positions every time. Mate the lone king against Stockfish's best defence.", h("div", { class: "cards" }, ...endgames)),
      section("Practice scenarios", "Random positions from each phase of the game. Play them out against the computer.", h("div", { class: "cards wide" }, ...scenarios)),
    ),
  );
  return () => {};
}

function section(title: string, sub: string, body: HTMLElement) {
  return h("section", { class: "learn-section" }, h("h2", {}, title), h("p", { class: "muted small" }, sub), body);
}
