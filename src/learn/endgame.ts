// Basic endgame drills: a random legal position each time, you mate against Stockfish's best defence.
import { h } from "../board";
import { engine, winPercent } from "../engine";
import { mountEngineGame } from "./engine-game";
import { randomEndgame } from "./endgame-gen";
import { endgameByKey } from "./lessons-data";
import { progress } from "./progress";

export function mountEndgame(root: HTMLElement, key: string) {
  const e = endgameByKey(key);
  if (!e) {
    location.hash = "#learn";
    return () => {};
  }
  let cleanup: (() => void) | undefined;
  let alive = true;

  async function next() {
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren(h("div", { class: "learn narrow" }, h("p", { class: "muted" }, "Setting up a position…")));
    let fen = randomEndgame(e!);
    if (e!.pieces === "P") {
      // Only hand out king-and-pawn positions that are actually winning.
      for (let i = 0; i < 25; i++) {
        const res = await engine().search(fen, { depth: 18 });
        if (!alive) return;
        if (res?.lines[0] && winPercent(res.lines[0]) > 90) break;
        fen = randomEndgame(e!);
      }
    }
    if (!alive) return;
    root.replaceChildren();
    const ep = progress.endgame(e!.key);
    cleanup = mountEngineGame(root, {
      fen,
      me: "white",
      goal: "mate",
      moveLimit: e!.moveLimit,
      title: e!.title,
      subtitle: `${e!.blurb} Record: ${ep.wins} win${ep.wins === 1 ? "" : "s"} from ${ep.tries}${ep.best ? `, best ${ep.best} moves` : ""}.`,
      strength: { skill: 20, depth: 14, movetime: 500 },
      tips: e!.steps,
      back: { href: "#learn", label: "Learn" },
      onNew: next,
      onResult: (outcome, moves, assisted) =>
        progress.update((p) => {
          const r = p.endgames[e!.key] ?? { wins: 0, tries: 0 };
          r.tries++;
          if (outcome === "win" && !assisted) {
            r.wins++;
            r.best = Math.min(r.best ?? Infinity, moves);
          }
          p.endgames[e!.key] = r;
        }),
    });
  }

  next();
  return () => {
    alive = false;
    cleanup?.();
  };
}
