// Thin UCI wrapper around the Stockfish web worker.
// Searches are queued so a new one only starts after the previous `bestmove`;
// a stale queued search (superseded before it ran) is skipped.

export type Line = {
  multipv: number;
  depth: number;
  cp?: number; // centipawns, white's point of view
  mate?: number; // moves to mate, white's point of view (+ = white mates)
  pv: string[]; // UCI moves
};

export type SearchOpts = {
  depth?: number;
  movetime?: number;
  multipv?: number;
  skill?: number; // 0–20
};

export type SearchResult = { best: string; lines: Line[] } | null;

const WORKER_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export class Engine {
  private worker = new Worker(WORKER_URL);
  private waiters: { test: (l: string) => boolean; resolve: (l: string) => void }[] = [];
  private onInfo?: (line: string) => void;
  private queue: Promise<unknown>;
  private generation = 0;
  private searching = false;

  constructor() {
    this.worker.onmessage = (e) => this.receive(String(e.data));
    this.queue = (async () => {
      this.send("uci");
      await this.waitFor((l) => l === "uciok");
      await this.sync();
    })();
  }

  /** Cancel any running search and every search queued behind it. */
  stop() {
    this.generation++;
    if (this.searching) this.send("stop");
  }

  newGame() {
    this.queue = this.queue.then(() => {
      this.send("ucinewgame");
      return this.sync();
    });
  }

  search(fen: string, opts: SearchOpts, onUpdate?: (lines: Line[]) => void): Promise<SearchResult> {
    const gen = ++this.generation;
    const run = async (): Promise<SearchResult> => {
      if (gen !== this.generation) return null;
      const whiteToMove = fen.split(" ")[1] === "w";
      const lines: Line[] = [];
      this.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      this.send(`setoption name Skill Level value ${opts.skill ?? 20}`);
      await this.sync();
      if (gen !== this.generation) return null;

      this.onInfo = (l) => {
        const line = parseInfo(l, whiteToMove);
        if (!line) return;
        lines[line.multipv - 1] = line;
        onUpdate?.(lines.filter(Boolean));
      };
      this.searching = true;
      this.send(`position fen ${fen}`);
      const limits = [
        opts.depth ? `depth ${opts.depth}` : "",
        opts.movetime ? `movetime ${opts.movetime}` : "",
      ].join(" ");
      this.send(`go ${limits.trim() || "infinite"}`);
      const done = await this.waitFor((l) => l.startsWith("bestmove"));
      this.searching = false;
      this.onInfo = undefined;
      if (gen !== this.generation) return null;
      return { best: done.split(" ")[1], lines: lines.filter(Boolean) };
    };
    const p = this.queue.then(run, run);
    this.queue = p;
    return p;
  }

  private sync() {
    this.send("isready");
    return this.waitFor((l) => l === "readyok");
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(test: (l: string) => boolean) {
    return new Promise<string>((resolve) => this.waiters.push({ test, resolve }));
  }

  private receive(l: string) {
    if (l.startsWith("info")) this.onInfo?.(l);
    const i = this.waiters.findIndex((w) => w.test(l));
    if (i >= 0) this.waiters.splice(i, 1)[0].resolve(l);
  }
}

function parseInfo(l: string, whiteToMove: boolean): Line | null {
  const t = l.split(" ");
  const at = (k: string) => t.indexOf(k);
  if (at("pv") < 0 || at("score") < 0 || at("upperbound") >= 0 || at("lowerbound") >= 0) return null;
  const sign = whiteToMove ? 1 : -1;
  const kind = t[at("score") + 1];
  const value = +t[at("score") + 2] * sign;
  return {
    multipv: at("multipv") >= 0 ? +t[at("multipv") + 1] : 1,
    depth: +t[at("depth") + 1],
    cp: kind === "cp" ? value : undefined,
    mate: kind === "mate" ? value : undefined,
    pv: t.slice(at("pv") + 1),
  };
}

/** Winning chances for white, 0–100, from a centipawn or mate score. */
export function winPercent(line: Pick<Line, "cp" | "mate">): number {
  if (line.mate !== undefined) return line.mate > 0 ? 100 : line.mate < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, line.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function formatScore(line: Pick<Line, "cp" | "mate">): string {
  if (line.mate !== undefined) return `${line.mate > 0 ? "" : "-"}M${Math.abs(line.mate)}`;
  const v = (line.cp ?? 0) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

let shared: Engine | undefined;
export const engine = () => (shared ??= new Engine());
