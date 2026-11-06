// The coach's course: ideas in the order a player usually needs them, each with the rating
// where it starts to matter. The coach teaches the first one you haven't got yet, at your level.
import { ENDGAMES, MATES, TACTICS, LEVEL_BANDS } from "../learn/lessons-data";
import { OPENINGS } from "../learn/openings-data";
import { progress, LINE_MASTERED } from "../learn/progress";

export type Step = {
  id: string;
  kind: "tactic" | "mate" | "endgame" | "opening";
  title: string;
  from: number; // rating where this becomes worth learning
  what: string; // the idea, in a sentence or two
  how: string; // how to spot or play it
  href: string; // where to practise it
  done: () => boolean;
  progressText: () => string;
};

const lesson = (key: string, from: number): Step => {
  const l = [...TACTICS, ...MATES].find((x) => x.key === key)!;
  return {
    id: `lesson:${key}`, kind: TACTICS.includes(l) ? "tactic" : "mate", title: l.title, from, what: l.what, how: l.spot, href: `#learn/lesson/${key}`,
    // Learned once you've cleared the level that matches the rating it's taught at.
    done: () => (progress.lesson(key).level - 1) >= Math.max(1, levelFor(from)),
    progressText: () => {
      const p = progress.lesson(key);
      return p.solved ? `Level ${p.level} · ${p.solved} solved` : "Not started";
    },
  };
};

const endgame = (key: string, from: number): Step => {
  const e = ENDGAMES.find((x) => x.key === key)!;
  return {
    id: `endgame:${key}`, kind: "endgame", title: e.title, from, what: e.blurb, how: e.steps.join(" "), href: `#learn/endgame/${key}`,
    done: () => progress.endgame(key).wins >= 3,
    progressText: () => `${progress.endgame(key).wins} of 3 wins`,
  };
};

const opening = (id: string, from: number): Step => {
  const o = OPENINGS.find((x) => x.id === id)!;
  const first = o.lines[0];
  return {
    id: `opening:${id}`, kind: "opening", title: `${o.name} (as ${o.side === "white" ? "White" : "Black"})`, from, what: o.summary, how: o.ideas.join(". ") + ".",
    href: `#learn/opening/${id}/${first.id}/learn`,
    done: () => progress.line(first.id).clean >= LINE_MASTERED,
    progressText: () => `${progress.line(first.id).clean} of ${LINE_MASTERED} clean run-throughs of the main line`,
  };
};

/** Lesson level (1-based) whose puzzle band contains a rating. */
function levelFor(rating: number) {
  const i = LEVEL_BANDS.findIndex(([lo, hi]) => rating >= lo && rating < hi);
  return i < 0 ? LEVEL_BANDS.length : i + 1;
}

export const CURRICULUM: Step[] = [
  lesson("hangingPiece", 0),
  lesson("mateIn1", 0),
  endgame("kq", 0),
  opening("italian", 200),
  lesson("fork", 300),
  endgame("krr", 300),
  lesson("backRankMate", 400),
  endgame("kr", 450),
  opening("scandinavian", 500),
  lesson("pin", 550),
  lesson("mateIn2", 650),
  lesson("skewer", 700),
  lesson("trappedPiece", 800),
  opening("london", 850),
  lesson("discoveredAttack", 900),
  lesson("capturingDefender", 950),
  endgame("kp", 1000),
  opening("caro-kann", 1050),
  lesson("deflection", 1100),
  lesson("smotheredMate", 1150),
  lesson("attraction", 1200),
  lesson("intermezzo", 1250),
  lesson("defensiveMove", 1300),
  opening("queens-gambit", 1300),
  lesson("advancedPawn", 1350),
  lesson("doubleCheck", 1400),
  lesson("mateIn3", 1450),
  lesson("sacrifice", 1500),
  opening("ruy-lopez", 1500),
  lesson("clearance", 1600),
  lesson("quietMove", 1650),
  endgame("kbb", 1700),
  lesson("xRayAttack", 1750),
  lesson("interference", 1800),
  opening("sicilian-najdorf", 1800),
  lesson("zugzwang", 1850),
  endgame("kbn", 1900),
];

/** The next new idea for someone of this rating: the first unlearned step at or below their level. */
export function nextSteps(skill: number, n = 3): Step[] {
  return CURRICULUM.filter((s) => s.from <= skill + 150 && !s.done()).slice(0, n);
}

export function stepFor(key: string): Step | undefined {
  return CURRICULUM.find((s) => s.id === `lesson:${key}`);
}
