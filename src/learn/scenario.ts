// Random practice positions from each phase of the game, played out against Stockfish.
import { Chess } from "chess.js";
import { colorOf, h, type Color } from "../board";
import { engine, winPercent } from "../engine";
import { LEVELS } from "../play";
import { loadPuzzles } from "../puzzles";
import { load, save } from "../store";
import { mountEngineGame } from "./engine-game";
import { allLines } from "./openings-data";
import { progress } from "./progress";

export const SCENARIOS = [
  { key: "opening", title: "Opening practice", blurb: "Start at the end of a random book line from the course and play on." },
  { key: "middlegame", title: "Middlegame practice", blurb: "A balanced middlegame reached from a real opening. Make a plan and play." },
  { key: "endgame", title: "Endgame practice", blurb: "Real endgame positions from master and club games. Convert the advantage." },
] as const;

type Setup = { fen: string; me: Color; subtitle: string };

const rand = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

function playLine(moves: string) {
  const c = new Chess();
  for (const m of moves.split(" ")) c.move(m);
  return c;
}

async function setupOpening(): Promise<Setup> {
  const { opening, line } = rand(allLines());
  return { fen: playLine(line.moves).fen(), me: opening.side, subtitle: `${opening.name}: ${line.name}. You've reached the end of the book line as ${opening.side}.` };
}

async function setupMiddlegame(): Promise<Setup | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { opening, line } = rand(allLines());
    const c = playLine(line.moves);
    // Let the engine play on with some variety: choose among near-best moves.
    const extra = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < extra && !c.isGameOver(); i++) {
      const res = await engine().search(c.fen(), { depth: 8, multipv: 3 });
      if (!res) return null;
      const best = res.lines[0];
      const sign = c.turn() === "w" ? 1 : -1;
      const ok = res.lines.filter((l) => (best.cp ?? 0) * sign - (l.cp ?? 0) * sign <= 40 && l.mate === undefined);
      const pv = (ok.length ? rand(ok) : best).pv[0];
      c.move({ from: pv.slice(0, 2), to: pv.slice(2, 4), promotion: pv[4] });
    }
    const judge = await engine().search(c.fen(), { depth: 12 });
    if (!judge) return null;
    const w = winPercent(judge.lines[0]);
    if (w > 30 && w < 70) {
      const me: Color = Math.random() < 0.5 ? "white" : "black";
      return { fen: c.fen(), me, subtitle: `From the ${opening.name} (${line.name}), ${c.moveNumber()} moves in. Roughly balanced. You're ${me}, ${colorOf(c.turn()) === me ? "to move" : "Stockfish to move"}.` };
    }
  }
  return setupOpening();
}

async function setupEndgame(): Promise<Setup> {
  const all = await loadPuzzles();
  const ends = all.filter((p) => p.themes.includes("endgame") && p.rating < 2000);
  const p = rand(ends);
  const c = new Chess(p.fen);
  const u = p.solution[0];
  c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const kind = p.themes.find((t) => t.endsWith("Endgame") && t !== "endgame");
  const label = kind ? kind.replace("Endgame", "").replace("queenRook", "queen and rook").replace(/^./, (x) => x.toUpperCase()) + " endgame" : "Endgame";
  return { fen: c.fen(), me: colorOf(c.turn()), subtitle: `${label} from a real game. There's a strong move here; find it, then win the position.` };
}

export function mountScenario(root: HTMLElement, key: string) {
  const s = SCENARIOS.find((x) => x.key === key);
  if (!s) {
    location.hash = "#learn";
    return () => {};
  }
  const prefs = load("play", { level: 3 });
  let cleanup: (() => void) | undefined;
  let alive = true;

  const levelSel = h("select", { class: "select" }) as HTMLSelectElement;
  LEVELS.forEach((l, i) => levelSel.append(new Option(`Stockfish ${l.name}`, String(i), false, i === prefs.level)));
  levelSel.onchange = () => save("play", { ...load("play", {}), level: (prefs.level = +levelSel.value) });

  async function next() {
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren(h("div", { class: "learn narrow" }, h("p", { class: "muted" }, key === "middlegame" ? "Finding a balanced middlegame…" : "Setting up…")));
    const setup = key === "opening" ? await setupOpening() : key === "middlegame" ? await setupMiddlegame() : await setupEndgame();
    if (!alive || !setup) return;
    root.replaceChildren();
    progress.update((p) => (p.scenarios[key] = { played: (p.scenarios[key]?.played ?? 0) + 1 }));
    cleanup = mountEngineGame(root, {
      fen: setup.fen,
      me: setup.me,
      goal: "play",
      title: s!.title,
      subtitle: setup.subtitle,
      strength: LEVELS[prefs.level],
      controls: levelSel,
      back: { href: "#learn", label: "Learn" },
      onNew: next,
    });
  }

  next();
  return () => {
    alive = false;
    cleanup?.();
  };
}
