// "My Games": pull your games from chess.com's free public API and send them to Game Review.
import { button, h, type Color } from "./board";
import { openInAnalysis } from "./router";
import { load, save } from "./store";

type Side = { username: string; rating: number; result: string };
export type ChessComGame = {
  url: string;
  pgn?: string;
  time_class: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  rules: string;
  white: Side;
  black: Side;
  accuracies?: { white: number; black: number };
};

const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
const ICON: Record<string, string> = { bullet: "⁍", blitz: "⚡", rapid: "◷", daily: "☀", classical: "♜" };

/** Your colour, opponent, and W/L/D from a game. */
export function describe(g: ChessComGame, username: string) {
  const me: Color = g.white.username.toLowerCase() === username.toLowerCase() ? "white" : "black";
  const mine = g[me];
  const theirs = g[me === "white" ? "black" : "white"];
  const outcome = mine.result === "win" ? "won" : DRAWS.has(mine.result) ? "drawn" : "lost";
  const how = outcome === "won" ? theirs.result : mine.result;
  return { me, mine, theirs, outcome, how };
}

/** Fetch via the dev-server relay first, then directly (chess.com allows CORS). */
async function api<T>(path: string): Promise<T> {
  const urls = [`${import.meta.env.BASE_URL}chesscom${path}`, `https://api.chess.com${path}`];
  let last: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) throw new Error("not-found");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.headers.get("content-type")?.includes("json")) throw new Error("not json");
      return await res.json();
    } catch (e) {
      if ((e as Error).message === "not-found") throw e;
      last = e;
    }
  }
  throw last;
}

export function mountGames(root: HTMLElement) {
  const prefs = load("chesscom", { username: "", timeClass: "all" });
  const reviewed = load<{ urls: string[] }>("reviewedGames", { urls: [] });
  let archives: string[] = []; // monthly archive URLs, oldest first
  let loadedMonths = 0;
  let games: ChessComGame[] = [];
  let busy = false;

  const input = h("input", { class: "text", placeholder: "chess.com username", autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
  input.value = prefs.username;
  const fetchBtn = button("Load games", () => start(), "primary");
  input.onkeydown = (e) => e.key === "Enter" && start();

  const tc = h("select", { class: "select" }) as HTMLSelectElement;
  for (const [v, t] of [["all", "All time controls"], ["bullet", "Bullet"], ["blitz", "Blitz"], ["rapid", "Rapid"], ["daily", "Daily"]]) tc.append(new Option(t, v, false, v === prefs.timeClass));
  tc.onchange = () => {
    prefs.timeClass = tc.value;
    save("chesscom", prefs);
    render();
  };

  const msg = h("div", { class: "muted small" });
  const summary = h("div", { class: "games-summary" });
  const list = h("div", { class: "games" });
  const more = button("Load older games", () => loadMonth());

  async function start() {
    const name = input.value.trim().toLowerCase();
    if (!name || busy) return;
    prefs.username = name;
    save("chesscom", prefs);
    games = [];
    loadedMonths = 0;
    archives = [];
    busy = true;
    msg.textContent = "Looking up your games…";
    render();
    try {
      archives = (await api<{ archives: string[] }>(`/pub/player/${encodeURIComponent(name)}/games/archives`)).archives;
    } catch (e) {
      busy = false;
      msg.textContent = (e as Error).message === "not-found" ? `No chess.com player called "${name}".` : "Couldn't reach chess.com. Check your connection and try again.";
      return render();
    }
    busy = false;
    if (!archives.length) {
      msg.textContent = "That account has no games yet.";
      return render();
    }
    await loadMonth();
    // A quiet month shouldn't leave the list nearly empty.
    if (games.length < 10 && loadedMonths < archives.length) await loadMonth();
  }

  async function loadMonth() {
    if (busy || loadedMonths >= archives.length) return;
    busy = true;
    const url = archives[archives.length - 1 - loadedMonths];
    msg.textContent = `Loading ${url.split("/").slice(-2).join("-")}…`;
    render();
    try {
      const month = await api<{ games: ChessComGame[] }>(new URL(url).pathname);
      const standard = month.games.filter((g) => g.rules === "chess" && g.pgn);
      games = [...games, ...standard].sort((a, b) => b.end_time - a.end_time);
      loadedMonths++;
      msg.textContent = "";
    } catch {
      msg.textContent = "Couldn't load that month from chess.com. Try again.";
    }
    busy = false;
    render();
  }

  function review(g: ChessComGame) {
    const { me } = describe(g, prefs.username);
    if (!reviewed.urls.includes(g.url)) {
      reviewed.urls = [...reviewed.urls, g.url].slice(-2000);
      save("reviewedGames", reviewed);
    }
    openInAnalysis({ pgn: g.pgn, review: true, me });
  }

  function render() {
    fetchBtn.disabled = busy;
    const shown = games.filter((g) => tc.value === "all" || g.time_class === tc.value);
    const tally = { won: 0, lost: 0, drawn: 0 };
    for (const g of shown) tally[describe(g, prefs.username).outcome as keyof typeof tally]++;
    summary.replaceChildren(
      ...(shown.length
        ? [h("span", { class: "won" }, `${tally.won} won`), h("span", { class: "lost" }, `${tally.lost} lost`), h("span", { class: "drawn" }, `${tally.drawn} drawn`)]
        : []),
    );

    list.replaceChildren(
      ...shown.map((g) => {
        const d = describe(g, prefs.username);
        const done = reviewed.urls.includes(g.url);
        const acc = g.accuracies?.[d.me];
        const row = h("button", { class: `game ${d.outcome}`, type: "button", title: "Run Game Review on this game" },
          h("span", { class: "tc", title: g.time_class }, ICON[g.time_class] ?? "•"),
          h("span", { class: "who" },
            h("b", {}, `${d.theirs.username} (${d.theirs.rating})`),
            h("small", {}, `${new Date(g.end_time * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · as ${d.me} · ${d.how}${acc ? ` · ${acc.toFixed(1)}%` : ""}`),
          ),
          h("span", { class: "res" }, d.outcome === "won" ? "W" : d.outcome === "lost" ? "L" : "½"),
          h("span", { class: `rev${done ? " done" : ""}` }, done ? "Reviewed" : "Review"),
        );
        row.onclick = () => review(g);
        return row;
      }),
    );
    if (!shown.length && games.length) list.append(h("div", { class: "muted small" }, "No games in this time control yet. Try loading older games."));
    more.style.display = games.length && loadedMonths < archives.length ? "" : "none";
    more.disabled = busy;
  }

  root.append(
    h("div", { class: "games-page" },
      h("div", { class: "panel" },
        h("h2", {}, "My Games"),
        h("div", { class: "muted small" }, "Pull in your chess.com games for free and run Game Review on any of them. Your mistakes go into the Puzzles → My mistakes drill."),
        h("div", { class: "row fetch" }, input, fetchBtn),
        tc,
        msg,
        summary,
        list,
        more,
      ),
    ),
  );

  render();
  if (prefs.username) start();
  return () => {};
}
