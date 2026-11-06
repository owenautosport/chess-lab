// What the app knows about you as a player: game results, Game Review accuracy, puzzle and lesson
// stats, all in one profile. The coach uses it to estimate your level and pick what to practise next.
import { load, save, mistakes } from "../store";
import { progress, LINE_MASTERED } from "../learn/progress";
import { TACTICS, MATES } from "../learn/lessons-data";
import { themeName } from "../puzzles";
import { SYSTEM } from "../ai/coach";

export type GameRecord = { bot: string; botRating: number; result: 1 | 0.5 | 0; moves: number; at: number; coachWarnings: number };
export type ReviewRecord = { id: string; at: number; accuracy: number; moves: number; blunders: number; mistakes: number; inaccuracies: number; errorsByPhase: Record<Phase, number> };
export type Phase = "opening" | "middlegame" | "endgame";

type Store = { games: GameRecord[]; reviews: ReviewRecord[]; playRating?: number };

const get = () => load<Store>("profile", { games: [], reviews: [] });

export const record = {
  game(g: Omit<GameRecord, "at">) {
    const s = get();
    // Elo-style rating from games against the bots, started from your puzzle rating.
    const r = s.playRating ?? startRating();
    const expected = 1 / (1 + 10 ** ((g.botRating - r) / 400));
    const k = s.games.length < 10 ? 48 : 24;
    s.playRating = Math.round(Math.max(100, r + k * (g.result - expected)));
    s.games = [...s.games, { ...g, at: Date.now() }].slice(-200);
    save("profile", s);
  },
  review(r: Omit<ReviewRecord, "at">) {
    const s = get();
    // Re-reviewing the same game replaces its earlier record.
    s.reviews = [...s.reviews.filter((x) => x.id !== r.id), { ...r, at: Date.now() }].slice(-100);
    save("profile", s);
  },
};

/** Phase of a position, from move number and the pieces (not pawns) left on both sides. */
export function phaseOf(moveNumber: number, nonPawnMaterial: number): Phase {
  if (nonPawnMaterial <= 20) return "endgame"; // e.g. a rook and a minor piece each, or less
  return moveNumber <= 12 ? "opening" : "middlegame";
}

type PuzzleStats = { rating: number; played: number; themes: Record<string, [number, number]> };
const puzzleStats = () => load<PuzzleStats>("puzzles", { rating: 1000, played: 0, themes: {} });
// Puzzle ratings run higher than playing strength for most club players.
const startRating = () => {
  const p = puzzleStats();
  return p.played >= 10 ? Math.max(200, p.rating - 250) : 800;
};

export type ThemeScore = { key: string; name: string; rate: number; n: number };

export type Profile = {
  skill: number; // best guess at playing strength
  confidence: "rough guess" | "getting there" | "good";
  sources: string[];
  games: GameRecord[];
  reviews: ReviewRecord[];
  recentAccuracy?: number;
  blundersPerGame?: number;
  weakPhase?: Phase;
  weakThemes: ThemeScore[];
  strongThemes: ThemeScore[];
  linesLearned: number;
  endgamesWon: string[];
  savedMistakes: number;
};

export function profile(): Profile {
  const s = get();
  const p = puzzleStats();
  const learn = progress.get();
  const sources: string[] = [];

  // Skill: games against bots count most, then puzzle rating; Game Review accuracy nudges it.
  const parts: [number, number][] = [];
  if (s.games.length) {
    parts.push([s.playRating!, Math.min(6, s.games.length)]);
    sources.push(`${s.games.length} game${s.games.length > 1 ? "s" : ""} against the bots`);
  }
  if (p.played >= 10) {
    parts.push([p.rating - 250, Math.min(4, p.played / 25)]);
    sources.push(`puzzle rating ${p.rating}`);
  }
  const recent = s.reviews.slice(-5);
  const recentAccuracy = recent.length ? recent.reduce((a, r) => a + r.accuracy, 0) / recent.length : undefined;
  if (recentAccuracy !== undefined) {
    // Very roughly: 60% accuracy ~ 700, 75% ~ 1200, 90% ~ 1700.
    parts.push([Math.max(200, 700 + (recentAccuracy - 60) * 33), Math.min(3, recent.length)]);
    sources.push(`accuracy in ${recent.length} reviewed game${recent.length > 1 ? "s" : ""}`);
  }
  const weight = parts.reduce((a, [, w]) => a + w, 0);
  const skill = weight ? Math.round(parts.reduce((a, [r, w]) => a + r * w, 0) / weight / 25) * 25 : 800;
  const confidence = weight >= 8 ? "good" : weight >= 3 ? "getting there" : "rough guess";

  const blundersPerGame = recent.length ? recent.reduce((a, r) => a + r.blunders, 0) / recent.length : undefined;
  const phaseErrors: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  for (const r of recent) for (const k of Object.keys(phaseErrors) as Phase[]) phaseErrors[k] += r.errorsByPhase[k] ?? 0;
  const worst = (Object.entries(phaseErrors) as [Phase, number][]).sort((a, b) => b[1] - a[1])[0];
  const weakPhase = worst[1] >= 2 ? worst[0] : undefined;

  // Puzzle themes that have a lesson, scored by your success rate.
  const lessonKeys = new Set([...TACTICS, ...MATES].map((l) => l.key));
  const scored: ThemeScore[] = Object.entries(p.themes)
    .filter(([k, [, n]]) => lessonKeys.has(k) && n >= 4)
    .map(([key, [w, n]]) => ({ key, name: themeName(key), rate: w / n, n }));
  const weakThemes = scored.filter((t) => t.rate < 0.6).sort((a, b) => a.rate - b.rate).slice(0, 4);
  const strongThemes = scored.filter((t) => t.rate >= 0.75).sort((a, b) => b.rate - a.rate).slice(0, 4);

  return {
    skill,
    confidence,
    sources,
    games: s.games,
    reviews: s.reviews,
    recentAccuracy,
    blundersPerGame,
    weakPhase,
    weakThemes,
    strongThemes,
    linesLearned: Object.values(learn.lines).filter((l) => l.clean >= LINE_MASTERED).length,
    endgamesWon: Object.entries(learn.endgames).filter(([, e]) => e.wins > 0).map(([k]) => k),
    savedMistakes: mistakes.all().filter((m) => !m.solved).length,
  };
}

/** A plain-text summary of the profile, for the AI coach. */
export function describeProfile(p: Profile): string {
  const last = p.games.slice(-5).map((g) => `${g.result === 1 ? "won" : g.result === 0 ? "lost" : "drew"} vs ${g.bot} (${g.botRating})`);
  return [
    `Estimated playing strength: about ${p.skill} (${p.confidence}; based on ${p.sources.join(", ") || "nothing yet"}).`,
    last.length ? `Recent bot games: ${last.join("; ")}.` : "",
    p.recentAccuracy !== undefined ? `Average Game Review accuracy (last ${Math.min(5, p.reviews.length)} games): ${p.recentAccuracy.toFixed(0)}%, ${p.blundersPerGame!.toFixed(1)} blunders per game.` : "",
    p.weakPhase ? `Most errors happen in the ${p.weakPhase}.` : "",
    p.weakThemes.length ? `Weak puzzle themes: ${p.weakThemes.map((t) => `${t.name} ${Math.round(t.rate * 100)}%`).join(", ")}.` : "",
    p.strongThemes.length ? `Strong puzzle themes: ${p.strongThemes.map((t) => `${t.name} ${Math.round(t.rate * 100)}%`).join(", ")}.` : "",
    `Opening lines learned: ${p.linesLearned}. Basic mates won: ${p.endgamesWon.join(", ") || "none yet"}.`,
  ].filter(Boolean).join("\n");
}

/** The AI coach's instructions, tuned to this player's level. */
export function adaptiveSystem(): string {
  const p = profile();
  const level = p.skill < 800 ? "a beginner: use very simple words, one idea at a time, no long variations"
    : p.skill < 1400 ? "an improving club player: explain the idea first, then at most one short line"
    : "a strong club player: be concise and precise, and go deeper into plans and calculation";
  return [
    SYSTEM.replace("for a club player (roughly 800-1500 rated)", "for a player"),
    "",
    `About this player (adapt everything to them; they are ${level}):`,
    describeProfile(p),
    "When the question is general and there's no position, teach the idea with a simple, well-known example and never invent analysis of a specific game.",
    "When you suggest practice, only point to what this app has (don't invent features or time controls):",
    "- Learn: tactic and checkmate lessons (forks, pins, back-rank mate, ...) with levels; opening trainer (Italian, Ruy Lopez, Queen's Gambit, London, Scotch, Sicilian Najdorf, French, Caro-Kann, Scandinavian, King's Indian, QGD); basic mates vs Stockfish (queen, rook, two rooks, two bishops, bishop and knight, king and pawn); random opening, middlegame and endgame scenarios.",
    "- Puzzles: rated, by theme, and 'My mistakes' (positions from the player's own reviewed games).",
    "- Play: bots from 250 to full-strength Stockfish (plus human-like Maia bots), with an in-game coach that points out tactics, threats and mistakes.",
    "- Analysis: Game Review with accuracy and every mistake marked; My Games imports chess.com games.",
  ].join("\n");
}
