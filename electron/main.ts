// Chess Lab desktop shell: serves the built app offline over app://, and runs the AI coach
// (LM Studio / Ollama locally, or Claude) in the main process so keys never reach the page.
import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } from "electron";
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, "..", "dist");
const DEV = process.env.ELECTRON_DEV === "1";

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
};

// ---------- settings ----------

export type Provider = "off" | "lmstudio" | "ollama" | "claude";
type Settings = {
  provider: Provider;
  models: Partial<Record<Exclude<Provider, "off">, string>>;
  urls: { lmstudio: string; ollama: string };
  claudeKey?: string; // encrypted with the macOS keychain via safeStorage, base64
};

const DEFAULTS: Settings = {
  provider: "off",
  models: { claude: "claude-opus-5-5" },
  urls: { lmstudio: "http://localhost:1234/v1", ollama: "http://localhost:11434/v1" },
};
const settingsFile = () => path.join(app.getPath("userData"), "ai-settings.json");

async function loadSettings(): Promise<Settings> {
  try {
    const s = JSON.parse(await readFile(settingsFile(), "utf8"));
    return { ...DEFAULTS, ...s, models: { ...DEFAULTS.models, ...s.models }, urls: { ...DEFAULTS.urls, ...s.urls } };
  } catch {
    return DEFAULTS;
  }
}

const claudeKey = (s: Settings) => (s.claudeKey ? safeStorage.decryptString(Buffer.from(s.claudeKey, "base64")) : undefined);

ipcMain.handle("ai:get-settings", async () => {
  const { claudeKey: key, ...rest } = await loadSettings();
  return { ...rest, hasClaudeKey: !!key };
});

ipcMain.handle("ai:set-settings", async (_e, patch: Partial<Settings> & { claudeKey?: string | null }) => {
  const s = await loadSettings();
  const next: Settings = { ...s, ...patch, models: { ...s.models, ...patch.models }, urls: { ...s.urls, ...patch.urls } };
  if (patch.claudeKey === null) delete next.claudeKey;
  else if (patch.claudeKey) next.claudeKey = safeStorage.encryptString(patch.claudeKey.trim()).toString("base64");
  else next.claudeKey = s.claudeKey;
  await writeFile(settingsFile(), JSON.stringify(next, null, 2));
  return true;
});

// ---------- models ----------

ipcMain.handle("ai:models", async (_e, provider: Provider): Promise<{ ok: boolean; models: string[]; error?: string }> => {
  const s = await loadSettings();
  try {
    if (provider === "claude") {
      const key = claudeKey(s);
      if (!key) return { ok: false, models: [], error: "Add your Claude API key first." };
      const client = new Anthropic({ apiKey: key });
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return { ok: true, models: ids };
    }
    if (provider === "lmstudio" || provider === "ollama") {
      const res = await net.fetch(`${s.urls[provider]}/models`);
      const body = (await res.json()) as { data: { id: string }[] };
      // Embedding models can't chat.
      return { ok: true, models: body.data.map((m) => m.id).filter((id) => !/embed/i.test(id)) };
    }
    return { ok: true, models: [] };
  } catch (e) {
    return { ok: false, models: [], error: describeError(e, provider) };
  }
});

// ---------- chat ----------

type ChatRequest = { id: string; system: string; messages: { role: "user" | "assistant"; content: string }[] };
const running = new Map<string, AbortController>();

ipcMain.handle("ai:cancel", (_e, id: string) => running.get(id)?.abort());

ipcMain.handle("ai:chat", async (e, req: ChatRequest): Promise<{ ok: boolean; error?: string }> => {
  const s = await loadSettings();
  const abort = new AbortController();
  running.set(req.id, abort);
  const send = (text: string) => !e.sender.isDestroyed() && e.sender.send("ai:chunk", { id: req.id, text });
  try {
    if (s.provider === "claude") await chatClaude(s, req, abort.signal, send);
    else if (s.provider === "lmstudio" || s.provider === "ollama") await chatLocal(s, req, abort.signal, send);
    else return { ok: false, error: "The coach is off. Choose a model in Settings." };
    return { ok: true };
  } catch (err) {
    if (abort.signal.aborted) return { ok: true };
    return { ok: false, error: describeError(err, s.provider) };
  } finally {
    running.delete(req.id);
  }
});

async function chatClaude(s: Settings, req: ChatRequest, signal: AbortSignal, send: (t: string) => void) {
  const key = claudeKey(s);
  if (!key) throw new Error("Add your Claude API key in Settings.");
  const client = new Anthropic({ apiKey: key });
  const stream = client.beta.messages.stream(
    {
      model: s.models.claude ?? "claude-opus-5-5",
      max_tokens: 16000,
      system: req.system,
      messages: req.messages,
      output_config: { effort: "medium" },
      // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal },
  );
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send(ev.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") send("\n\n(Claude declined to answer this one.)");
  if (final.stop_reason === "max_tokens") send("\n\n(Answer cut off.)");
}

async function chatLocal(s: Settings, req: ChatRequest, signal: AbortSignal, send: (t: string) => void) {
  const provider = s.provider as "lmstudio" | "ollama";
  const model = s.models[provider];
  if (!model) throw new Error("Choose a model in Settings.");
  const res = await net.fetch(`${s.urls[provider]}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: req.system }, ...req.messages] }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`${provider === "lmstudio" ? "LM Studio" : "Ollama"} replied ${res.status}: ${(await res.text()).slice(0, 200)}`);

  // OpenAI-style server-sent events. Reasoning models may wrap thoughts in <think>…</think>; hide them.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pending = "";
  let thinking = false;
  const emit = (text: string) => {
    pending += text;
    for (;;) {
      if (thinking) {
        const end = pending.indexOf("</think>");
        if (end < 0) return void (pending = pending.slice(-8));
        pending = pending.slice(end + 8);
        thinking = false;
      } else {
        const start = pending.indexOf("<think>");
        if (start < 0) {
          // Hold back a possible partial "<think" tag at the end.
          const safe = pending.length - 7;
          if (safe > 0) send(pending.slice(0, safe)), (pending = pending.slice(safe));
          return;
        }
        if (start > 0) send(pending.slice(0, start));
        pending = pending.slice(start + 7);
        thinking = true;
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "").trim();
      if (!data || data === "[DONE]" || !line.startsWith("data:")) continue;
      const delta = JSON.parse(data).choices?.[0]?.delta?.content;
      if (delta) emit(delta);
    }
  }
  if (!thinking && pending) send(pending);
}

function describeError(e: unknown, provider: Provider): string {
  if (e instanceof Anthropic.AuthenticationError) return "Claude rejected the API key. Check it in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is rate-limiting requests. Wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Can't reach Claude. Are you offline? Local models work without internet.";
  if (e instanceof Anthropic.APIError) return `Claude error ${e.status}: ${e.message}`;
  const msg = e instanceof Error ? e.message : String(e);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|Failed to fetch/i.test(msg)) {
    return provider === "lmstudio" ? "LM Studio isn't running. Open LM Studio and start its server (or run: lms server start)." : provider === "ollama" ? "Ollama isn't running. Open the Ollama app." : msg;
  }
  return msg;
}

// ---------- chess.com (no CORS issues from the main process) ----------

ipcMain.handle("net:chesscom", async (_e, apiPath: string) => {
  if (!/^\/pub\/player\/[^/]+\/games\/(archives|\d{4}\/\d{2})$/.test(apiPath)) return { status: 400, body: null };
  const res = await net.fetch(`https://api.chess.com${apiPath}`, { headers: { "user-agent": "chess-lab (personal training app)" } });
  return { status: res.status, body: res.ok ? await res.json() : null };
});

// ---------- window ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#312e2b",
    title: "Chess Lab",
    webPreferences: { preload: path.join(here, "..", "electron", "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(DEV ? "http://localhost:5174/#learn" : "app://chess/index.html#learn");
}

app.whenReady().then(() => {
  protocol.handle("app", async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(DIST, rel === "/" ? "index.html" : rel));
    if (!file.startsWith(DIST)) return new Response("Not found", { status: 404 });
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      return new Response(res.body, { headers: { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
