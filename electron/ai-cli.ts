// "Sign in with Claude" and "Sign in with ChatGPT": the coach runs on the person's own Claude Code
// or Codex CLI, so it uses their own Claude or ChatGPT plan and the app never sees a password or token.
// The CLIs are run with no tools, in an empty temp folder, so the model can only write text.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type Cli = "claude-cli" | "codex";
type Msg = { role: "user" | "assistant"; content: string };

const WIN = process.platform === "win32";
const BIN: Record<Cli, string> = { "claude-cli": "claude", codex: "codex" };
const NAME: Record<Cli, string> = { "claude-cli": "Claude", codex: "ChatGPT" };
export const INSTALL: Record<Cli, string> = {
  "claude-cli": "https://claude.com/product/claude-code",
  codex: "https://developers.openai.com/codex/cli",
};

// ---------- finding the CLI ----------

// Apps opened from the Dock/Finder get a bare PATH, so also look where the installers put things.
let pathCache: string | undefined;
async function searchPath(): Promise<string> {
  if (pathCache) return pathCache;
  const home = os.homedir();
  const extra = WIN
    ? [path.join(home, ".local", "bin"), path.join(process.env.APPDATA ?? "", "npm"), path.join(process.env.LOCALAPPDATA ?? "", "Programs", "claude")]
    : [path.join(home, ".local", "bin"), path.join(home, ".claude", "local"), "/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".npm-global", "bin"), path.join(home, ".bun", "bin"), path.join(home, ".volta", "bin")];
  let shellPath = "";
  if (!WIN) {
    // The login shell's PATH covers nvm, asdf and anything else set up in .zshrc / .bash_profile.
    shellPath = await new Promise<string>((resolve) =>
      execFile(process.env.SHELL || "/bin/zsh", ["-ilc", "echo __P__$PATH"], { timeout: 4000 }, (_e, out) => resolve(/__P__(.*)/.exec(String(out))?.[1]?.trim() ?? "")),
    );
  }
  pathCache = [process.env.PATH ?? "", shellPath, ...extra].filter(Boolean).join(path.delimiter);
  return pathCache;
}

async function findCli(cli: Cli): Promise<string | undefined> {
  const dirs = (await searchPath()).split(path.delimiter);
  const exts = WIN ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const d of dirs) for (const e of exts) {
    const p = path.join(d, BIN[cli] + e);
    if (d && existsSync(p)) return p;
  }
  return undefined;
}

/** Environment for the CLI: our search PATH, and nothing inherited from a parent Claude Code session. */
async function cliEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: await searchPath() };
  for (const k of Object.keys(env)) if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_") || k === "CLAUDE_AGENT_SDK_VERSION") delete env[k];
  return env;
}

/** npm installs .cmd shims on Windows, which only run through the shell, so quote every argument for it. */
function launch(bin: string, args: string[], opts: { cwd?: string; env: NodeJS.ProcessEnv }) {
  const viaShell = WIN && /\.(cmd|bat)$/i.test(bin);
  const q = (a: string) => `"${a.replace(/"/g, '\\"')}"`;
  return viaShell
    ? spawn(q(bin), args.map(q), { ...opts, shell: true, windowsHide: true })
    : spawn(bin, args, { ...opts, windowsHide: true });
}

function run(bin: string, args: string[], opts: { timeout?: number; input?: string } = {}) {
  return new Promise<{ code: number; out: string; err: string }>(async (resolve) => {
    const p = launch(bin, args, { env: await cliEnv() });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const t = opts.timeout ? setTimeout(() => p.kill(), opts.timeout) : undefined;
    p.on("error", (e) => (clearTimeout(t), resolve({ code: -1, out, err: err + e.message })));
    p.on("close", (code) => (clearTimeout(t), resolve({ code: code ?? -1, out, err })));
    p.stdin.end(opts.input ?? "");
  });
}

// ---------- status and sign-in ----------

export type CliStatus = { installed: boolean; loggedIn: boolean; detail?: string; install: string };

export async function cliStatus(cli: Cli): Promise<CliStatus> {
  const bin = await findCli(cli);
  const install = INSTALL[cli];
  if (!bin) return { installed: false, loggedIn: false, install };
  if (cli === "claude-cli") {
    const r = await run(bin, ["auth", "status", "--json"], { timeout: 15000 });
    try {
      const s = JSON.parse(r.out) as { loggedIn?: boolean; authMethod?: string };
      return { installed: true, loggedIn: !!s.loggedIn, detail: s.loggedIn ? `Signed in (${s.authMethod})` : undefined, install };
    } catch {
      return { installed: true, loggedIn: false, detail: (r.err || r.out).trim().slice(0, 200), install };
    }
  }
  const r = await run(bin, ["login", "status"], { timeout: 15000 });
  const text = (r.out + r.err).trim();
  const loggedIn = r.code === 0 && /logged in/i.test(text);
  return { installed: true, loggedIn, detail: loggedIn ? text.split("\n").pop() : undefined, install };
}

/** Starts the CLI's own browser sign-in and resolves when it finishes. */
export async function cliLogin(cli: Cli): Promise<{ ok: boolean; error?: string }> {
  const bin = await findCli(cli);
  if (!bin) return { ok: false, error: `Install ${cli === "codex" ? "Codex" : "Claude Code"} first.` };
  const args = cli === "claude-cli" ? ["auth", "login", "--claudeai"] : ["login"];
  const r = await run(bin, args, { timeout: 10 * 60_000 });
  const st = await cliStatus(cli);
  if (st.loggedIn) return { ok: true };
  return { ok: false, error: (r.err || r.out).trim().split("\n").slice(-3).join(" ").slice(0, 300) || "Sign-in didn't finish." };
}

export async function cliLogout(cli: Cli) {
  const bin = await findCli(cli);
  if (bin) await run(bin, cli === "claude-cli" ? ["auth", "logout"] : ["logout"], { timeout: 15000 });
}

// ---------- chat ----------

/** The CLIs take one prompt, so earlier turns are written out as a transcript. */
function transcript(messages: Msg[]) {
  if (messages.length === 1) return messages[0].content;
  const earlier = messages.slice(0, -1).map((m) => `${m.role === "user" ? "Player" : "Coach"}: ${m.content}`).join("\n\n");
  return `Conversation so far:\n\n${earlier}\n\nPlayer's new message:\n${messages[messages.length - 1].content}`;
}

function friendly(cli: Cli, msg: string) {
  if (/auth|log ?in|sign in|token|401|credential|expired|time limit/i.test(msg)) return `${NAME[cli]} needs you to sign in again. Go to Settings → AI coach and press "Sign in with ${NAME[cli]}".`;
  if (/ENOTFOUND|ECONNREFUSED|network|offline|getaddrinfo|websocket|stream disconnected/i.test(msg)) return `Can't reach ${NAME[cli]}. Are you offline? The bots, puzzles and analysis all still work.`;
  if (/rate|limit|quota|usage/i.test(msg)) return `${NAME[cli]} says you've hit your plan's usage limit for now. Try again later.`;
  return msg.slice(0, 400);
}

export async function chatCli(cli: Cli, model: string | undefined, system: string, messages: Msg[], signal: AbortSignal, send: (t: string) => void) {
  const bin = await findCli(cli);
  if (!bin) throw new Error(`${cli === "codex" ? "Codex" : "Claude Code"} isn't installed. See Settings → AI coach.`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "chesslab-"));
  try {
    let args: string[];
    let input: string;
    if (cli === "claude-cli") {
      const sysFile = path.join(dir, "system.txt");
      await writeFile(sysFile, system);
      args = [
        "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--system-prompt-file", sysFile, "--tools", "", "--no-session-persistence",
        "--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands", "--effort", "low",
        "--model", model || "sonnet",
      ];
      input = transcript(messages);
    } else {
      args = ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "-s", "read-only", "-c", 'model_reasoning_effort="low"'];
      if (model && model !== "default") args.push("-m", model);
      args.push("-");
      input = `${system}\n\nAnswer as the coach, in plain text. Don't run commands or look at files.\n\n${transcript(messages)}`;
    }

    await new Promise<void>(async (resolve, reject) => {
      const p = launch(bin, args, { cwd: dir, env: await cliEnv() });
      const onAbort = () => p.kill();
      signal.addEventListener("abort", onAbort);
      let buf = "", err = "", failure = "", sent = false;
      const handle = (line: string) => {
        let ev: any;
        try {
          ev = JSON.parse(line);
        } catch {
          return;
        }
        if (cli === "claude-cli") {
          if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
            sent = true;
            send(ev.event.delta.text);
          } else if (ev.type === "result") {
            if (ev.is_error) failure = String(ev.result ?? ev.subtype ?? "error");
            else if (!sent && ev.result) send(String(ev.result));
          }
        } else {
          if (ev.type === "item.completed" && ev.item?.type === "agent_message" && ev.item.text) send((sent ? "\n\n" : "") + ev.item.text), (sent = true);
          else if (ev.type === "error" || ev.type === "turn.failed") failure ||= String(ev.message ?? ev.error?.message ?? "error");
        }
      };
      p.stdout.on("data", (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(handle);
      });
      p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
      p.on("error", (e) => reject(e));
      p.on("close", (code) => {
        signal.removeEventListener("abort", onAbort);
        if (buf) handle(buf);
        if (signal.aborted) return resolve();
        if (failure) return reject(new Error(friendly(cli, failure)));
        if (code !== 0 && !sent) return reject(new Error(friendly(cli, err.trim().split("\n").pop() || `exited with code ${code}`)));
        resolve();
      });
      p.stdin.end(input);
    });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export const CLI_MODELS: Record<Cli, string[]> = {
  "claude-cli": ["sonnet", "opus", "haiku"],
  codex: ["default"],
};
