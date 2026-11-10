// Chess Lab desktop shell: serves the built app offline over app://, and runs the AI coach
// (LM Studio / Ollama locally, or Claude) in the main process so keys never reach the page.
import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } from "electron";
import Anthropic from "@anthropic-ai/sdk";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chatCli, cliLogin, cliLogout, cliStatus, CLI_MODELS, type Cli } from "./ai-cli.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, "..", "dist");
const DEV = process.env.ELECTRON_DEV === "1";

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
};

// ---------- settings ----------

// claude-cli / codex: "Sign in with Claude / ChatGPT" via the person's own Claude Code or Codex login.
// claude / openai: API keys.
export type Provider = "off" | "lmstudio" | "ollama" | "claude" | "openai" | "claude-cli" | "codex";
type Settings = {
  provider: Provider;
  models: Partial<Record<Exclude<Provider, "off">, string>>;
  urls: { lmstudio: string; ollama: string };
  claudeKey?: string; // encrypted with the OS keychain via safeStorage, base64
  openaiKey?: string; // same
};

const isCli = (p: Provider): p is Cli => p === "claude-cli" || p === "codex";

const DEFAULTS: Settings = {
  // New installs start with the coach off; Settings offers the sign-in buttons.
  provider: "off",
  models: { claude: "claude-opus-5-5", lmstudio: "gemma-4-31b-it-mlx", openai: "gpt-5.5", "claude-cli": "sonnet", codex: "default" },
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

const decrypt = (v?: string) => (v ? safeStorage.decryptString(Buffer.from(v, "base64")) : undefined);
const claudeKey = (s: Settings) => decrypt(s.claudeKey);
const openaiKey = (s: Settings) => decrypt(s.openaiKey);

ipcMain.handle("ai:get-settings", async () => {
  const { claudeKey: key, openaiKey: okey, ...rest } = await loadSettings();
  return { ...rest, hasClaudeKey: !!key, hasOpenaiKey: !!okey };
});

ipcMain.handle("ai:set-settings", async (_e, patch: Partial<Settings> & { claudeKey?: string | null; openaiKey?: string | null }) => {
  const s = await loadSettings();
  const next: Settings = { ...s, ...patch, models: { ...s.models, ...patch.models }, urls: { ...s.urls, ...patch.urls } };
  for (const k of ["claudeKey", "openaiKey"] as const) {
    if (patch[k] === null) delete next[k];
    else if (patch[k]) next[k] = safeStorage.encryptString(patch[k]!.trim()).toString("base64");
    else next[k] = s[k];
  }
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
    if (provider === "openai") {
      const key = openaiKey(s);
      if (!key) return { ok: false, models: [], error: "Add your OpenAI API key first." };
      const res = await net.fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
      if (res.status === 401) return { ok: false, models: [], error: "OpenAI rejected the API key." };
      const body = (await res.json()) as { data: { id: string }[] };
      // Chat models only: skip audio, image, embedding, moderation and realtime models.
      const ids = body.data.map((m) => m.id).filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/audio|image|realtime|transcribe|tts|search|embed|moderation|instruct/.test(id));
      return { ok: true, models: ids.sort().reverse() };
    }
    if (isCli(provider)) return { ok: true, models: CLI_MODELS[provider] };
    if (provider === "lmstudio" || provider === "ollama") {
      await ensureLocal(s, provider);
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

// ---------- signing in with Claude / ChatGPT ----------

const isCliArg = (c: unknown): c is Cli => c === "claude-cli" || c === "codex";
ipcMain.handle("ai:cli-status", (_e, cli: Cli) => (isCliArg(cli) ? cliStatus(cli) : null));
ipcMain.handle("ai:cli-login", (_e, cli: Cli) => (isCliArg(cli) ? cliLogin(cli) : { ok: false }));
ipcMain.handle("ai:cli-logout", (_e, cli: Cli) => (isCliArg(cli) ? cliLogout(cli) : undefined));
ipcMain.handle("ai:open-install", (_e, cli: Cli) => isCliArg(cli) && shell.openExternal(cli === "codex" ? "https://developers.openai.com/codex/cli" : "https://claude.com/product/claude-code"));

// ---------- keeping the local model ready ----------

const LMS = path.join(os.homedir(), ".lmstudio", "bin", "lms");

async function reachable(url: string) {
  try {
    return (await net.fetch(`${url}/models`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/** Start LM Studio's server if it isn't running (it works fully offline). */
async function ensureLocal(s: Settings, provider: "lmstudio" | "ollama") {
  if (await reachable(s.urls[provider])) return true;
  if (provider === "lmstudio" && existsSync(LMS)) execFile(LMS, ["server", "start"], () => {});
  if (provider === "ollama") execFile("open", ["-ga", "Ollama"], () => {});
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await reachable(s.urls[provider])) return true;
  }
  return false;
}

/** Load the chosen local model in the background so the first question doesn't wait for it. */
ipcMain.handle("ai:warm", async () => {
  const s = await loadSettings();
  const provider = s.provider === "ollama" ? "ollama" : s.provider === "lmstudio" ? "lmstudio" : undefined;
  if (provider !== "lmstudio" && provider !== "ollama") return false;
  const model = s.models[provider];
  if (!model || !(await ensureLocal(s, provider))) return false;
  try {
    await net.fetch(`${s.urls[provider]}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    });
    return true;
  } catch {
    return false;
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
    if (s.provider === "claude") {
      try {
        await chatClaude(s, req, abort.signal, send);
      } catch (err) {
        // Offline (or Claude unreachable): answer with the local model instead, if one is set up.
        if (!(err instanceof Anthropic.APIConnectionError) || abort.signal.aborted || !s.models.lmstudio) throw err;
        send(`(Offline, so ${s.models.lmstudio} is answering.)\n\n`);
        await chatLocal({ ...s, provider: "lmstudio" }, req, abort.signal, send);
      }
    }
    else if (isCli(s.provider)) await chatCli(s.provider, s.models[s.provider], req.system, req.messages, abort.signal, send);
    else if (s.provider === "openai") {
      const key = openaiKey(s);
      if (!key) throw new Error("Add your OpenAI API key in Settings.");
      await chatOpenAICompat("https://api.openai.com/v1", { authorization: `Bearer ${key}` }, s.models.openai ?? "gpt-5.5", "OpenAI", req, abort.signal, send);
    }
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
  if (!(await ensureLocal(s, provider))) throw new Error("ECONNREFUSED");
  await chatOpenAICompat(s.urls[provider], {}, model, provider === "lmstudio" ? "LM Studio" : "Ollama", req, signal, send);
}

/** Any OpenAI-style chat API: OpenAI itself, LM Studio, Ollama. */
async function chatOpenAICompat(base: string, headers: Record<string, string>, model: string, label: string, req: ChatRequest, signal: AbortSignal, send: (t: string) => void) {
  const res = await net.fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: req.system }, ...req.messages] }),
    signal,
  });
  if (res.status === 401) throw new Error(`${label} rejected the API key. Check it in Settings.`);
  if (!res.ok || !res.body) throw new Error(`${label} replied ${res.status}: ${(await res.text()).slice(0, 200)}`);

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
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|Failed to fetch/i.test(msg)) {
    if (provider === "openai") return "Can't reach OpenAI. Are you offline? The bots, puzzles and analysis all still work.";
    return provider === "lmstudio" ? "LM Studio isn't running. Open LM Studio and start its server (or run: lms server start)." : provider === "ollama" ? "Ollama isn't running. Open the Ollama app." : msg;
  }
  return msg;
}

// ---------- Maia: human-like opponents via lc0 ----------

// Packaged: Resources/engines; dev: ./engines (filled by scripts/fetch-engines.sh).
const ENGINES = app.isPackaged ? path.join(process.resourcesPath, "engines") : path.join(here, "..", "engines");
const LC0 = path.join(ENGINES, process.platform === "win32" ? "lc0.exe" : "lc0");
const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

class Lc0 {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private waiter?: { test: (l: string) => boolean; resolve: (l: string) => void };
  private weights?: string;
  private queue: Promise<unknown> = Promise.resolve();

  private start() {
    this.proc = spawn(LC0, [], { stdio: "pipe", cwd: ENGINES, windowsHide: true });
    this.proc.stdout.on("data", (d: Buffer) => {
      this.buffer += d.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const l of lines) if (this.waiter?.test(l.trim())) this.waiter.resolve(l.trim());
    });
    this.proc.on("exit", () => (this.proc = undefined, this.weights = undefined));
  }

  private send(cmd: string) {
    this.proc!.stdin.write(cmd + "\n");
  }

  private wait(test: (l: string) => boolean, ms = 20000) {
    return new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("lc0 timed out")), ms);
      this.waiter = { test, resolve: (l) => (clearTimeout(t), resolve(l)) };
    });
  }

  /** Maia's most likely human move: one node = the policy network's top choice. */
  move(fen: string, elo: number): Promise<string> {
    const run = async () => {
      if (!this.proc) {
        this.start();
        this.send("uci");
        await this.wait((l) => l === "uciok");
      }
      const weights = path.join(ENGINES, "maia", `maia-${elo}.pb.gz`);
      if (weights !== this.weights) {
        this.send(`setoption name WeightsFile value ${weights}`);
        this.weights = weights;
      }
      this.send("isready");
      await this.wait((l) => l === "readyok");
      this.send(`position fen ${fen}`);
      this.send("go nodes 1");
      return (await this.wait((l) => l.startsWith("bestmove"))).split(" ")[1];
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  stop() {
    this.proc?.kill();
  }
}

const lc0 = new Lc0();
ipcMain.handle("maia:levels", () => (existsSync(LC0) ? MAIA_LEVELS.filter((e) => existsSync(path.join(ENGINES, "maia", `maia-${e}.pb.gz`))) : []));
ipcMain.handle("maia:move", (_e, fen: string, elo: number) => {
  if (!MAIA_LEVELS.includes(elo)) throw new Error("Unknown Maia level");
  return lc0.move(fen, elo);
});
app.on("before-quit", () => lc0.stop());

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
