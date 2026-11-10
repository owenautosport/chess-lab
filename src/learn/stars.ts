// Rules for the star-collecting mini-games: one white piece on an otherwise simple board.
// Pure functions, shared by the lesson player and scripts/check-basics.ts.
import type { Role } from "./basics-data";

export type StarState = { piece: Role; at: string; stars: string[]; enemies: string[]; blockers: string[] };

const file = (s: string) => s.charCodeAt(0) - 97;
const rank = (s: string) => +s[1] - 1;
const sq = (f: number, r: number) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? String.fromCharCode(97 + f) + (r + 1) : null);

const LINES: Record<string, [number, number][]> = {
  R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
};
LINES.Q = [...LINES.R, ...LINES.B];
const KING: [number, number][] = [...LINES.Q];
const KNIGHT: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

/** Squares the piece can move to. Own pawns (blockers) block; enemies can be captured. */
export function starDests(s: StarState): string[] {
  const f = file(s.at), r = rank(s.at);
  const own = new Set(s.blockers), enemy = new Set(s.enemies);
  const out: string[] = [];
  const step = (deltas: [number, number][], slide: boolean) => {
    for (const [df, dr] of deltas) {
      for (let k = 1; k < 8; k++) {
        const t = sq(f + df * k, r + dr * k);
        if (!t || own.has(t)) break;
        out.push(t);
        if (enemy.has(t) || !slide) break;
      }
    }
  };
  if (s.piece in LINES) step(LINES[s.piece], true);
  else if (s.piece === "K") step(KING, false);
  else if (s.piece === "N") step(KNIGHT, false);
  else {
    // Pawn: forward onto empty squares (two from the 2nd rank), diagonally forward only to capture.
    const one = sq(f, r + 1);
    if (one && !own.has(one) && !enemy.has(one)) {
      out.push(one);
      const two = sq(f, r + 2);
      if (r === 1 && two && !own.has(two) && !enemy.has(two)) out.push(two);
    }
    for (const df of [-1, 1]) {
      const t = sq(f + df, r + 1);
      if (t && enemy.has(t)) out.push(t);
    }
  }
  return out;
}

/** Move the piece; collects a star or captures on arrival, and promotes a pawn to a queen. */
export function starMove(s: StarState, to: string): StarState {
  return {
    piece: s.piece === "P" && to[1] === "8" ? "Q" : s.piece,
    at: to,
    stars: s.stars.filter((x) => x !== to),
    enemies: s.enemies.filter((x) => x !== to),
    blockers: s.blockers,
  };
}

export const starsLeft = (s: StarState) => s.stars.length + s.enemies.length;

/** Fewest moves to collect everything (breadth-first search), or -1 if it can't be done. */
export function starPar(start: StarState): number {
  const key = (s: StarState) => `${s.piece}${s.at}|${s.stars.join()}|${s.enemies.join()}`;
  let frontier = [start];
  const seen = new Set([key(start)]);
  for (let depth = 0; depth < 30 && frontier.length; depth++) {
    const next: StarState[] = [];
    for (const s of frontier) {
      if (!starsLeft(s)) return depth;
      for (const t of starDests(s)) {
        const n = starMove(s, t);
        const k = key(n);
        if (!seen.has(k)) seen.add(k), next.push(n);
      }
    }
    frontier = next;
  }
  return -1;
}
