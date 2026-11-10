// Settings: choose the AI coach (sign in with Claude/ChatGPT, an API key, or a local model), test it.
import { ai, bridge, PROVIDER_NAMES, SYSTEM, type AiSettings, type Cli, type Provider } from "./ai/coach";
import { button, h, playSound, setSound, soundSettings } from "./board";
import { title } from "./ui/title";
import { icon } from "./ui/visuals";

type ProviderInfo = { key: Provider; label: string; blurb: string; desktopOnly?: boolean };
const PROVIDERS: ProviderInfo[] = [
  { key: "off", label: "Off", blurb: "No AI coach. Everything else (bots, puzzles, analysis, lessons) works as normal, online or offline." },
  { key: "claude-cli", label: "Claude", desktopOnly: true, blurb: "Uses your own Claude account (Pro or Max plan) through Claude Code. Sign in once in your browser; the app never sees your password." },
  { key: "codex", label: "ChatGPT", desktopOnly: true, blurb: "Uses your own ChatGPT account (Plus, Pro or Team) through OpenAI's Codex CLI. Sign in once in your browser; the app never sees your password." },
  {
    key: "claude", label: "Claude API",
    blurb: bridge
      ? "Anthropic's API with your own key (pay as you go). When you're offline, your LM Studio model answers instead, if you've set one up."
      : "Anthropic's Claude via the API. Connect your own API key below: you pay Anthropic for what you use, and nobody else's account is involved.",
  },
  { key: "openai", label: "OpenAI API", desktopOnly: true, blurb: "OpenAI's API with your own key (pay as you go)." },
  { key: "lmstudio", label: "LM Studio", blurb: "Runs on this computer, works offline. Start the server in LM Studio (or run: lms server start)." },
  { key: "ollama", label: "Ollama", blurb: "Runs on this computer, works offline. Download a model first, e.g. ollama pull qwen3:8b." },
];

const KEYS = {
  claude: { field: "claudeKey", has: "hasClaudeKey", placeholder: "sk-ant-…", where: "console.anthropic.com" },
  openai: { field: "openaiKey", has: "hasOpenaiKey", placeholder: "sk-…", where: "platform.openai.com" },
} as const;

export function mountSettings(root: HTMLElement) {
  let s: AiSettings;
  let alive = true;
  const seg = h("div", { class: "seg wide wrap" });
  const blurb = h("p", { class: "muted small" });
  const modelSel = h("select", { class: "select" }) as HTMLSelectElement;
  const modelMsg = h("div", { class: "muted small" });
  const urlInput = h("input", { class: "text", spellcheck: "false" }) as HTMLInputElement;
  const keyInput = h("input", { class: "text", type: "password", autocomplete: "off" }) as HTMLInputElement;
  const keyStatus = h("div", { class: "muted small" });
  const keyHelp = h("p", { class: "muted small" });
  const testOut = h("div", { class: "coach-answer" });

  const modelRow = h("label", { class: "field" }, h("span", {}, "Model"), modelSel);
  const urlRow = h("label", { class: "field" }, h("span", {}, "Server"), urlInput);
  const keyProvider = () => (s.provider === "openai" ? KEYS.openai : KEYS.claude);
  const keyRow = h("div", { class: "key-row" },
    h("label", { class: "field" }, h("span", {}, "API key"), keyInput),
    h("div", { class: "row" },
      button("Save key", async () => {
        if (!keyInput.value.trim()) return;
        await ai.save({ [keyProvider().field]: keyInput.value.trim() });
        keyInput.value = "";
        await reload();
      }, "primary"),
      button("Remove key", async () => {
        await ai.save({ [keyProvider().field]: null });
        await reload();
      }),
    ),
    keyStatus,
    keyHelp,
  );

  // Sign in with Claude / ChatGPT (desktop app only).
  const signIn = h("div", { class: "signin" });
  let signingIn = false;
  async function renderSignIn(cli: Cli) {
    const name = PROVIDER_NAMES[cli];
    const tool = cli === "codex" ? "Codex" : "Claude Code";
    signIn.replaceChildren(h("p", { class: "muted small" }, `Checking ${tool}…`));
    const st = await bridge!.cliStatus(cli);
    if (!alive || s.provider !== cli) return;
    if (!st.installed) {
      signIn.replaceChildren(
        h("p", { class: "small" }, `${tool} isn't installed on this computer. It's free; install it, then come back and press Check again.`),
        h("div", { class: "row" },
          button(`Get ${tool}`, () => bridge!.openInstall(cli), "primary"),
          button("Check again", () => renderSignIn(cli)),
        ),
      );
      return;
    }
    const msg = h("p", { class: "muted small" });
    const go = button(st.loggedIn ? "Sign in again" : `Sign in with ${name}`, async () => {
      if (signingIn) return;
      signingIn = true;
      go.setAttribute("disabled", "");
      msg.textContent = "Finish signing in in the browser window that just opened…";
      const res = await bridge!.cliLogin(cli);
      signingIn = false;
      if (!alive) return;
      if (res.ok) renderSignIn(cli);
      else {
        go.removeAttribute("disabled");
        msg.textContent = res.error ?? "Sign-in didn't finish. Try again.";
      }
    }, st.loggedIn ? undefined : "primary");
    if (st.loggedIn) {
      // Logins can expire while the CLI still says "logged in", so signing in again is always on offer.
      signIn.replaceChildren(
        h("p", { class: "good-text small" }, `✓ Signed in with ${name}${st.detail ? ` · ${st.detail}` : ""}`),
        h("div", { class: "row" }, go, button("Sign out", async () => {
          await bridge!.cliLogout(cli);
          renderSignIn(cli);
        })),
        msg,
      );
      return;
    }
    signIn.replaceChildren(h("div", { class: "row" }, go), msg);
  }

  async function reload() {
    s = await ai.settings();
    if (!alive) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === s.provider));
    const p = PROVIDERS.find((x) => x.key === s.provider) ?? PROVIDERS[0];
    blurb.textContent = p.blurb;
    const local = s.provider === "lmstudio" || s.provider === "ollama";
    urlRow.style.display = local ? "" : "none";
    if (local) urlInput.value = s.urls[s.provider as "lmstudio" | "ollama"];
    const keyed = s.provider === "claude" || s.provider === "openai";
    keyRow.style.display = keyed ? "" : "none";
    if (keyed) {
      const k = keyProvider();
      keyInput.placeholder = k.placeholder;
      keyStatus.textContent = s[k.has] ? "✓ A key is saved." : "No key saved yet.";
      keyHelp.textContent = bridge
        ? `Get a key at ${k.where}. It's stored encrypted in your computer's keychain and only ever sent to ${s.provider === "openai" ? "OpenAI" : "Anthropic"}.`
        : `Get your own key at ${k.where}. It's saved only in this browser, on this device, and is only ever sent to Anthropic. Remove it here when you're done, especially on a shared computer.`;
    }
    const cli = s.provider === "claude-cli" || s.provider === "codex";
    signIn.style.display = cli && bridge ? "" : "none";
    if (cli && bridge) renderSignIn(s.provider as Cli);
    modelRow.style.display = s.provider === "off" ? "none" : "";
    if (s.provider !== "off") await loadModels();
  }

  async function loadModels() {
    const p = s.provider;
    modelMsg.textContent = "Loading models…";
    const res = await ai.models(p);
    if (!alive || p !== s.provider) return;
    const current = s.models[p as Exclude<Provider, "off">];
    const list = res.models.length ? res.models : current ? [current] : [];
    const label = (m: string) => (m === "default" ? "Your account's default model" : m);
    modelSel.replaceChildren(...list.map((m) => new Option(label(m), m, false, m === current)));
    modelMsg.textContent = res.ok ? (list.length ? "" : "No models found. Download one first.") : res.error ?? "";
    // Pick a sensible default the first time, or if the saved model isn't offered any more.
    if (list.length && (!current || !list.includes(current))) {
      const preferred = list.find((m) => /gemma-4-31b|claude-opus-5-5|^sonnet$|^gpt-5\.5$|^default$/.test(m)) ?? list[0];
      modelSel.value = preferred;
      await ai.save({ models: { [p]: preferred } });
      s = await ai.settings();
    }
  }

  for (const p of PROVIDERS.filter((x) => bridge || !x.desktopOnly)) {
    const b = button(p.label, async () => {
      await ai.save({ provider: p.key });
      await reload();
    });
    b.dataset.p = p.key;
    seg.append(b);
  }
  modelSel.onchange = async () => {
    await ai.save({ models: { [s.provider]: modelSel.value } });
    s = await ai.settings();
  };
  urlInput.onchange = async () => {
    await ai.save({ urls: { ...s.urls, [s.provider]: urlInput.value.trim().replace(/\/$/, "") } });
    await reload();
  };

  async function test() {
    testOut.innerHTML = '<p class="muted">Asking…</p>';
    let text = "";
    const started = performance.now();
    const res = await ai.chat(SYSTEM, [{ role: "user", content: "In one sentence, what's the main idea behind 1.e4 e5 2.Nf3?" }], (t) => {
      text += t;
      testOut.textContent = text;
    });
    if (!res.ok) testOut.textContent = res.error ?? "Failed.";
    else testOut.append(h("div", { class: "muted small" }, `Answered in ${((performance.now() - started) / 1000).toFixed(1)}s`));
  }

  // Sound: on/off and volume. Off means the app never opens the audio device at all.
  const sound = soundSettings();
  const soundSeg = h("div", { class: "seg wide" });
  const volume = h("input", { type: "range", min: "0", max: "100", class: "range" }) as HTMLInputElement;
  volume.value = String(Math.round(sound.volume * 100));
  const volumeRow = h("div", { class: "row sound-row" }, h("label", { class: "field" }, h("span", {}, "Volume"), volume), button("Test sound", () => playSound("capture")));
  const syncSound = () => {
    soundSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", (b.dataset.on === "1") === sound.on));
    volumeRow.style.display = sound.on ? "" : "none";
    setSound(sound);
  };
  for (const on of [true, false]) {
    const b = button(on ? "On" : "Off", () => {
      sound.on = on;
      syncSound();
    });
    b.prepend(icon(on ? "Volume2" : "VolumeX", 16));
    b.dataset.on = on ? "1" : "0";
    soundSeg.append(b);
  }
  volume.oninput = () => {
    sound.volume = +volume.value / 100;
    setSound(sound);
  };
  volume.onchange = () => playSound("move");
  syncSound();

  root.append(
    h("div", { class: "learn narrow" },
      h("header", { class: "learn-head" }, h("h1", {}, "Settings")),
      h("div", { class: "panel" },
        title("Volume2", "Sound", "#f39c2f"),
        h("p", { class: "muted small" }, "Move, capture and check sounds. Turn them off and the app won't use your speakers at all, so there's no pop when you move a piece."),
        soundSeg, volumeRow,
      ),
      h("div", { class: "panel" },
        title("Sparkles", "AI coach", "#5aa4e0"),
        h("p", { class: "muted small" }, "The coach explains positions, moves, puzzles and your mistakes in plain English. It's always given Stockfish's analysis, so it explains rather than guesses."),
        seg, blurb, signIn, urlRow, keyRow, modelRow, modelMsg,
        h("div", { class: "row" }, button("Test the coach", test)),
        testOut,
      ),
      h("div", { class: "panel" },
        title("Info", "About", "#a5a3a0"),
        h("p", { class: "version-line" }, h("b", {}, `Chess Lab ${__APP_VERSION__}`), " · ", h("a", { href: "https://github.com/owenautosport/chess-lab/releases", target: "_blank", rel: "noopener" }, "What's new")),
        h("p", { class: "muted small" }, bridge ? "Desktop app: the bots (Stockfish and the human-like Maia players), puzzles, analysis and lessons all work offline. Only chess.com import and the online AI coaches need internet." : "Running in a browser. The AI coach uses your own Claude key, or a model running on your own computer (LM Studio or Ollama, with CORS turned on in their server settings)."),
      ),
    ),
  );
  reload();
  return () => {
    alive = false;
  };
}
