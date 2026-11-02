// Everything persists in localStorage under a "chesslab:" prefix.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`chesslab:${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`chesslab:${key}`, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

/** A position from one of your reviewed games where you went wrong. */
export type Mistake = {
  id: string; // fen, so re-reviewing a game doesn't duplicate
  fen: string; // position before your move
  played: string; // SAN you played
  best: string; // engine's best move, UCI
  kind: "inaccuracy" | "mistake" | "blunder";
  added: number;
  solved?: number; // times solved since
};

export const mistakes = {
  all: () => load<{ list: Mistake[] }>("mistakes", { list: [] }).list,
  add(ms: Mistake[]) {
    const list = mistakes.all();
    const ids = new Set(list.map((m) => m.id));
    save("mistakes", { list: [...list, ...ms.filter((m) => !ids.has(m.id))] });
  },
  update(m: Mistake) {
    save("mistakes", { list: mistakes.all().map((x) => (x.id === m.id ? m : x)) });
  },
};
