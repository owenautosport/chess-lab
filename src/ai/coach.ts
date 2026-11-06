// AI coach: talks to LM Studio, Ollama or Claude (via the desktop app's main process),
// always grounded in Stockfish's analysis so the model explains rather than calculates.
import { Chess } from "chess.js";
import { button, h } from "../board";
import { formatScore, type Line } from "../engine";
import { pvToSan } from "../board";
import { load, save } from "../store";

export type Provider = "off" | "lmstudio" | "ollama" | "claude";
export type AiSettings = {
  provider: Provider;
  models: Partial<Record<Exclude<Provider, "off">, string>>;
  urls: { lmstudio: string; ollama: string };
  hasClaudeKey?: boolean;
};
type Msg = { role: "user" | "assistant"; content: string };

type Bridge = {
  getSettings(): Promise<AiSettings>;
  setSettings(patch: Partial<AiSettings> & { claudeKey?: string | null }): Promise<boolean>;
  listModels(p: Provider): Promise<{ ok: boolean; models: string[]; error?: string }>;
  cancel(id: string): Promise<void>;
  chesscom(path: string): Promise<{ status: number; body: unknown }>;
  warm(): Promise<boolean>;
  maiaLevels(): Promise<number[]>;
  maiaMove(fen: string, elo: number): Promise<string>;
  chat(id: string, system: string, messages: Msg[], onText: (t: string) => void): Promise<{ ok: boolean; error?: string }>;
};

/** Present when running inside the desktop app. */
export const bridge = (window as unknown as { chessLab?: Bridge }).chessLab;

const BROWSER_DEFAULTS: AiSettings = {
  provider: "off",
  models: {},
  urls: { lmstudio: "http://localhost:1234/v1", ollama: "http://localhost:11434/v1" },
};

export const ai = {
  settings: (): Promise<AiSettings> => (bridge ? bridge.getSettings() : Promise.resolve(load("ai", BROWSER_DEFAULTS))),
  async save(patch: Partial<AiSettings> & { claudeKey?: string | null }) {
    if (bridge) return bridge.setSettings(patch);
    const s = load("ai", BROWSER_DEFAULTS);
    save("ai", { ...s, ...patch, models: { ...s.models, ...patch.models }, urls: { ...s.urls, ...patch.urls } });
    return true;
  },
  async models(p: Provider) {
    if (bridge) return bridge.listModels(p);
    if (p === "claude") return { ok: false, models: [], error: "Claude works in the desktop app." };
    if (p === "off") return { ok: true, models: [] };
    try {
      const s = await ai.settings();
      const body = await (await fetch(`${s.urls[p]}/models`)).json();
      return { ok: true, models: (body.data as { id: string }[]).map((m) => m.id).filter((id) => !/embed/i.test(id)) };
    } catch {
      return { ok: false, models: [], error: `Can't reach ${p === "lmstudio" ? "LM Studio" : "Ollama"}.` };
    }
  },
  /** Stream a reply. Returns an id that can be passed to cancel(). */
  async chat(system: string, messages: Msg[], onText: (t: string) => void, id = Math.random().toString(36).slice(2)) {
    if (bridge) return bridge.chat(id, system, messages, onText);
    return browserChat(system, messages, onText);
  },
  cancel: (id: string) => bridge?.cancel(id),
};

// In a plain browser (npm run dev) local models are called directly; Claude needs the desktop app.
async function browserChat(system: string, messages: Msg[], onText: (t: string) => void) {
  const s = await ai.settings();
  if (s.provider === "off") return { ok: false, error: "The coach is off. Choose a model in Settings." };
  if (s.provider === "claude") return { ok: false, error: "Claude works in the desktop app (npm run app)." };
  try {
    const res = await fetch(`${s.urls[s.provider]}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: s.models[s.provider], stream: false, messages: [{ role: "system", content: system }, ...messages] }),
    });
    const body = await res.json();
    onText(String(body.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim());
    return { ok: true };
  } catch {
    return { ok: false, error: `Can't reach ${s.provider === "lmstudio" ? "LM Studio" : "Ollama"}. Is it running?` };
  }
}

// ---------- grounding ----------

export const SYSTEM = `You are a friendly, encouraging chess coach for a club player (roughly 800-1500 rated) who wants to get much better.
You receive the position (FEN plus a list of pieces) and Stockfish's analysis. Stockfish is ground truth:
- never contradict its evaluations or best moves, and never invent moves or variations that aren't in the analysis;
- only call a move good or bad if the analysis supports it;
- refer to moves exactly as written (SAN).
Your job is to explain the ideas in plain English: threats, tactics, plans, weak squares, piece activity, what each move achieves and what the alternative would have done.
Keep it short: under 120 words unless the player asks for more. Use short paragraphs or a few "- " bullets. No headings.
Latency-sensitive; begin your visible answer immediately.`;

const NAMES: Record<string, string> = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "" };

/** Human-readable description of a position for the model. */
export function describePosition(fen: string): string {
  const c = new Chess(fen);
  const side = (color: "w" | "b") =>
    c.board().flat().filter((p) => p && p.color === color).map((p) => `${NAMES[p!.type]}${p!.square}`).join(", ");
  return [
    `FEN: ${fen}`,
    `White: ${side("w")}`,
    `Black: ${side("b")}`,
    `${c.turn() === "w" ? "White" : "Black"} to move.${c.inCheck() ? " (In check.)" : ""}`,
  ].join("\n");
}

export function describeLines(fen: string, lines: Line[]): string {
  if (!lines.length) return "Stockfish: no analysis available.";
  return ["Stockfish's top lines (score from White's point of view):", ...lines.map((l, i) => `${i + 1}. ${formatScore(l)} (depth ${l.depth}): ${pvToSan(fen, l.pv, 8)}`)].join("\n");
}

// ---------- UI ----------

/** Minimal, safe markdown: escape everything, then allow **bold** and "- " bullets. */
function render(text: string): string {
  const esc = text.trim().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<b>$1</b>")
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split("\n");
      if (lines.every((l) => /^\s*[-*•]\s/.test(l))) return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*•]\s/, "")}</li>`).join("")}</ul>`;
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

export type CoachAction = { label: string; prompt: string | (() => Promise<string> | string) };

/**
 * A coach box: quick-action buttons, a question field, and a streamed answer.
 * `context()` is called at ask time so answers always use the current position.
 */
export function coachPanel(opts: { actions: () => CoachAction[]; context: () => Promise<string> | string; placeholder?: string; system?: () => string; title?: string; open?: boolean }) {
  const answer = h("div", { class: "coach-answer" });
  const buttons = h("div", { class: "row coach-actions" });
  const input = h("input", { class: "text", placeholder: opts.placeholder ?? "Ask the coach about this position…" }) as HTMLInputElement;
  const status = h("div", { class: "muted small" });
  const el = h("details", { class: "ai-coach" }, h("summary", {}, opts.title ?? "🎓 AI coach"), status, buttons, h("div", { class: "row" }, input), answer);
  if (opts.open) el.open = true;
  let history: Msg[] = [];
  let runId: string | undefined;
  let lastContext = "";

  async function ask(question: string) {
    if (runId) ai.cancel(runId);
    const s = await ai.settings();
    if (s.provider === "off") {
      status.innerHTML = 'The coach is off. Pick LM Studio, Ollama or Claude in <a href="#settings">Settings</a>.';
      return;
    }
    const ctx = await opts.context();
    // A new position starts a fresh conversation.
    if (ctx !== lastContext) history = [];
    lastContext = ctx;
    const content = history.length ? question : `${ctx}\n\nQuestion: ${question}`;
    history.push({ role: "user", content });
    const id = (runId = Math.random().toString(36).slice(2));
    let text = "";
    answer.innerHTML = '<p class="muted">Thinking…</p>';
    status.textContent = `${s.provider === "claude" ? "Claude" : s.provider === "lmstudio" ? "LM Studio" : "Ollama"} · ${s.models[s.provider] ?? ""}`;
    const res = await ai.chat(opts.system?.() ?? SYSTEM, history, (t) => {
      if (runId !== id) return;
      text += t;
      answer.innerHTML = render(text);
    }, id);
    if (runId !== id) return;
    runId = undefined;
    if (!res.ok) {
      history.pop();
      answer.innerHTML = `<p class="bad-text">${render(res.error ?? "Something went wrong.")}</p>`;
      return;
    }
    history.push({ role: "assistant", content: text });
  }

  function refresh() {
    buttons.replaceChildren(...opts.actions().map((a) => button(a.label, async () => ask(typeof a.prompt === "string" ? a.prompt : await a.prompt()))));
  }
  input.onkeydown = (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      ask(input.value.trim());
      input.value = "";
    }
  };
  el.addEventListener("toggle", () => {
    if (!el.open) return;
    refresh();
    bridge?.warm(); // start loading the local model now, so the first answer is quick
  });
  refresh();
  return { el, refresh, ask };
}
