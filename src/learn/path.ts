// The guided path: one route from "how do the pieces move?" to advanced tactics, openings and endgames.
// It strings together the beginner lessons and every existing course, in the order a new player needs them.
import { h } from "../board";
import { basicsById } from "./basics-data";
import { ENDGAMES, lessonByKey, MATES } from "./lessons-data";
import { OPENINGS } from "./openings-data";
import { LINE_MASTERED, progress } from "./progress";
import { SCENARIOS } from "./scenario";
import { icon, piece, type IconName } from "../ui/visuals";

type Kind = "basics" | "lesson" | "opening" | "endgame" | "practice";
type NodeRef = [Kind, string];
type Unit = { title: string; nodes: NodeRef[] };
export type Level = { key: string; title: string; blurb: string; color: string; units: Unit[] };

export const LEVELS: Level[] = [
  {
    key: "beginner", title: "Beginner", color: "#81b64c", blurb: "Never played before? Start here: how the pieces move, the rules, and your first wins.",
    units: [
      { title: "The board and the pieces", nodes: [["basics", "board"], ["basics", "rook"], ["basics", "bishop"], ["basics", "queen"], ["basics", "king"], ["basics", "knight"], ["basics", "pawn"]] },
      { title: "The rules of the game", nodes: [["basics", "capture"], ["basics", "check"], ["basics", "checkmate"], ["basics", "special"], ["basics", "draws"]] },
      { title: "Your first checkmates", nodes: [["lesson", "mateIn1"], ["lesson", "backRankMate"], ["endgame", "krr"], ["endgame", "kq"]] },
      { title: "Starting a game", nodes: [["basics", "principles"], ["opening", "italian"], ["practice", "opening"]] },
      { title: "Winning material", nodes: [["lesson", "hangingPiece"], ["lesson", "fork"], ["lesson", "pin"], ["lesson", "skewer"]] },
    ],
  },
  {
    key: "intermediate", title: "Intermediate", color: "#5aa4e0", blurb: "The tactics that decide most games, an opening repertoire, and basic endgames.",
    units: [
      { title: "Tactics that win games", nodes: [["lesson", "discoveredAttack"], ["lesson", "doubleCheck"], ["lesson", "capturingDefender"], ["lesson", "deflection"], ["lesson", "mateIn2"]] },
      { title: "Your opening repertoire", nodes: [["opening", "queens-gambit"], ["opening", "london"], ["opening", "caro-kann"], ["opening", "qgd-black"]] },
      { title: "Endgame basics", nodes: [["endgame", "kr"], ["endgame", "kp"], ["practice", "endgame"]] },
      { title: "Play it out", nodes: [["practice", "middlegame"], ["lesson", "trappedPiece"], ["lesson", "intermezzo"]] },
    ],
  },
  {
    key: "advanced", title: "Advanced", color: "#a77fe0", blurb: "Sacrifices, famous mating patterns, sharper openings and the hardest basic endgames.",
    units: [
      { title: "Deeper tactics", nodes: [["lesson", "sacrifice"], ["lesson", "attraction"], ["lesson", "quietMove"], ["lesson", "clearance"], ["lesson", "mateIn3"]] },
      { title: "Famous mating patterns", nodes: [["lesson", "smotheredMate"], ["lesson", "arabianMate"], ["lesson", "anastasiaMate"], ["lesson", "bodenMate"], ["lesson", "hookMate"]] },
      { title: "Sharper openings", nodes: [["opening", "ruy-lopez"], ["opening", "sicilian-najdorf"], ["opening", "kings-indian"], ["opening", "french"]] },
      { title: "Hard endgames", nodes: [["endgame", "kbb"], ["endgame", "kbn"], ["lesson", "zugzwang"]] },
    ],
  },
];

export type PathNode = { kind: Kind; id: string; title: string; sub: string; href: string; done: boolean; glyph: () => Element };

const PIECE_LESSONS: Record<string, string> = { rook: "rook", bishop: "bishop", queen: "queen", king: "king", knight: "knight", pawn: "pawn" };

function resolve([kind, id]: NodeRef): PathNode {
  const p = progress.get();
  const ico = (name: IconName) => () => icon(name, 28);
  if (kind === "basics") {
    const b = basicsById(id)!;
    const role = PIECE_LESSONS[id];
    return { kind, id, title: b.title, sub: b.blurb, href: `#learn/basics/${id}`, done: !!p.basics[id]?.done,
      glyph: role ? () => piece("white", role, 40) : ico(b.icon as IconName) };
  }
  if (kind === "lesson") {
    const l = lessonByKey(id)!;
    const lp = p.lessons[id];
    const mate = MATES.some((m) => m.key === id);
    return { kind, id, title: l.title, sub: lp ? `Level ${lp.level} · ${lp.solved} solved` : mate ? "Checkmate pattern" : "Tactic", href: `#learn/lesson/${id}`,
      done: (lp?.level ?? 1) >= 2, glyph: ico(mate ? "Crown" : "Zap") };
  }
  if (kind === "opening") {
    const o = OPENINGS.find((x) => x.id === id)!;
    const learned = o.lines.filter((l) => (p.lines[l.id]?.clean ?? 0) >= LINE_MASTERED).length;
    return { kind, id, title: o.name, sub: `Opening as ${o.side === "white" ? "White" : "Black"} · ${learned}/${o.lines.length} lines`, href: `#learn/opening/${id}`,
      done: learned >= 1, glyph: ico("BookOpen") };
  }
  if (kind === "endgame") {
    const e = ENDGAMES.find((x) => x.key === id)!;
    const wins = p.endgames[id]?.wins ?? 0;
    return { kind, id, title: e.title, sub: wins ? `${wins} win${wins > 1 ? "s" : ""}` : "Endgame drill", href: `#learn/endgame/${id}`, done: wins >= 1, glyph: ico("Target") };
  }
  const s = SCENARIOS.find((x) => x.key === id)!;
  const played = p.scenarios[id]?.played ?? 0;
  return { kind, id, title: s.title, sub: played ? `${played} played` : "Play it out", href: `#learn/practice/${id}`, done: played >= 1, glyph: ico("Swords") };
}

export const allNodes = () => LEVELS.flatMap((l) => l.units.flatMap((u) => u.nodes.map(resolve)));

/** The first unfinished step, which the path highlights as "you are here". */
export const currentNode = () => allNodes().find((n) => !n.done);

/** Where "Next lesson" goes after finishing a node. */
export function nodeAfter(kind: Kind, id: string): PathNode | undefined {
  const nodes = allNodes();
  const i = nodes.findIndex((n) => n.kind === kind && n.id === id);
  return nodes.slice(i + 1).find((n) => !n.done) ?? nodes[i + 1];
}

// ---------- screen ----------

export function pathView(levelKey: string | undefined, onLevel: (key: string) => void): HTMLElement {
  const current = currentNode();
  const levelOf = (n?: PathNode) => LEVELS.find((l) => l.units.some((u) => u.nodes.some(([k, id]) => n && k === n.kind && id === n.id)));
  const level = LEVELS.find((l) => l.key === levelKey) ?? levelOf(current) ?? LEVELS[0];

  const tabs = h("div", { class: "level-tabs" }, ...LEVELS.map((l) => {
    const nodes = l.units.flatMap((u) => u.nodes.map(resolve));
    const done = nodes.filter((n) => n.done).length;
    const t = h("button", { class: `level-tab${l === level ? " on" : ""}`, type: "button" },
      h("b", {}, l.title), h("span", {}, `${done}/${nodes.length}`),
      h("div", { class: "meter" }, h("i", { style: `width:${Math.round((done / nodes.length) * 100)}%` })));
    t.style.setProperty("--lvl", l.color);
    t.onclick = () => onLevel(l.key);
    return t;
  }));

  let unitNo = LEVELS.slice(0, LEVELS.indexOf(level)).reduce((n, l) => n + l.units.length, 0);
  const units = level.units.map((u) => {
    unitNo++;
    const nodes = u.nodes.map(resolve);
    const done = nodes.filter((n) => n.done).length;
    const head = h("div", { class: "unit-head" },
      h("div", {}, h("div", { class: "unit-no" }, `Unit ${unitNo}`), h("h2", {}, u.title)),
      h("span", { class: "unit-count" }, done === nodes.length ? "✓ Complete" : `${done}/${nodes.length}`));
    head.style.setProperty("--lvl", level.color);
    const trail = h("div", { class: "trail" }, ...nodes.map((n, i) => {
      const isCurrent = current && n.kind === current.kind && n.id === current.id;
      const state = n.done ? "done" : isCurrent ? "current" : "todo";
      const node = h("a", { class: `trail-node ${state}`, href: n.href },
        h("span", { class: "trail-dot" }, n.glyph(), n.done ? h("span", { class: "trail-check" }, icon("Check", 14)) : ""),
        h("span", { class: "trail-text" }, h("b", {}, n.title), h("span", {}, isCurrent ? "Start here" : n.sub)));
      // Wind the trail left and right, like a path up a hill.
      node.style.setProperty("--x", `${Math.round(Math.sin(i * 1.1) * 70)}px`);
      return node;
    }));
    trail.style.setProperty("--lvl", level.color);
    return h("section", { class: "unit" }, head, trail);
  });

  const all = allNodes();
  const doneAll = all.filter((n) => n.done).length;
  const side = h("aside", { class: "path-side" },
    h("div", { class: "panel path-continue" },
      h("div", { class: "muted small" }, current ? "Up next" : "Path complete"),
      current
        ? h("div", { class: "continue-node" }, h("span", { class: "trail-dot current" }, current.glyph()), h("div", {}, h("b", {}, current.title), h("div", { class: "muted small" }, current.sub)))
        : h("p", {}, "You've finished every lesson on the path. Keep sharp with Puzzles and the bots."),
      current ? h("a", { class: "btn primary wide", href: current.href }, "Start lesson") : "",
      h("div", { class: "path-total" }, h("span", {}, "Your progress"), h("b", {}, `${Math.round((doneAll / all.length) * 100)}%`)),
      h("div", { class: "meter big" }, h("i", { style: `width:${Math.round((doneAll / all.length) * 100)}%` })),
      h("div", { class: "muted small" }, `${doneAll} of ${all.length} lessons complete. Nothing is locked: jump to any lesson you like.`),
    ),
  );

  return h("div", { class: "path-layout" },
    h("div", { class: "path-main" }, tabs, h("p", { class: "muted level-blurb" }, level.blurb), ...units),
    side,
  );
}
