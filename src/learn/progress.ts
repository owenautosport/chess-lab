import { load, save } from "../store";

export type LineProgress = { reps: number; clean: number; last: number };
export type LessonProgress = { level: number; streak: number; solved: number; tries: number };
export type EndgameProgress = { wins: number; tries: number; best?: number };

type Progress = {
  lines: Record<string, LineProgress>;
  lessons: Record<string, LessonProgress>;
  endgames: Record<string, EndgameProgress>;
  scenarios: Record<string, { played: number }>;
};

const EMPTY: Progress = { lines: {}, lessons: {}, endgames: {}, scenarios: {} };

export const progress = {
  get: () => load<Progress>("learn", EMPTY),
  update(fn: (p: Progress) => void) {
    const p = progress.get();
    fn(p);
    save("learn", p);
    return p;
  },
  line: (id: string): LineProgress => progress.get().lines[id] ?? { reps: 0, clean: 0, last: 0 },
  lesson: (key: string): LessonProgress => progress.get().lessons[key] ?? { level: 1, streak: 0, solved: 0, tries: 0 },
  endgame: (key: string): EndgameProgress => progress.get().endgames[key] ?? { wins: 0, tries: 0 },
};

/** A line counts as learned after three clean practice run-throughs. */
export const LINE_MASTERED = 3;
