// Settings: choose the AI coach's provider and model, store a Claude key, test the connection.
import { ai, bridge, SYSTEM, type AiSettings, type Provider } from "./ai/coach";
import { button, h } from "./board";
import { title } from "./ui/title";

const PROVIDERS: { key: Provider; label: string; blurb: string }[] = [
  { key: "off", label: "Off", blurb: "No AI coach. Everything else works as normal." },
  { key: "lmstudio", label: "LM Studio", blurb: "Runs on this Mac, works offline. Start the server in LM Studio (or run: lms server start)." },
  { key: "ollama", label: "Ollama", blurb: "Runs on this Mac, works offline. Download a model first, e.g. ollama pull qwen3:8b." },
  { key: "claude", label: "Claude", blurb: "Anthropic's Claude via the API. Best explanations; needs internet and an API key (pay as you go). When you're offline, your LM Studio model answers instead." },
];

export function mountSettings(root: HTMLElement) {
  let s: AiSettings;
  let alive = true;
  const seg = h("div", { class: "seg wide" });
  const blurb = h("p", { class: "muted small" });
  const modelSel = h("select", { class: "select" }) as HTMLSelectElement;
  const modelMsg = h("div", { class: "muted small" });
  const urlInput = h("input", { class: "text", spellcheck: "false" }) as HTMLInputElement;
  const keyInput = h("input", { class: "text", type: "password", placeholder: "sk-ant-…", autocomplete: "off" }) as HTMLInputElement;
  const keyStatus = h("div", { class: "muted small" });
  const testOut = h("div", { class: "coach-answer" });

  const modelRow = h("label", { class: "field" }, h("span", {}, "Model"), modelSel);
  const urlRow = h("label", { class: "field" }, h("span", {}, "Server"), urlInput);
  const keyRow = h("div", { class: "key-row" },
    h("label", { class: "field" }, h("span", {}, "API key"), keyInput),
    h("div", { class: "row" },
      button("Save key", async () => {
        if (!keyInput.value.trim()) return;
        await ai.save({ claudeKey: keyInput.value.trim() });
        keyInput.value = "";
        await reload();
      }, "primary"),
      button("Remove key", async () => {
        await ai.save({ claudeKey: null });
        await reload();
      }),
    ),
    keyStatus,
    h("p", { class: "muted small" }, "Get a key at console.anthropic.com. It's stored encrypted in your Mac's keychain and never leaves this app except to call Claude."),
  );

  async function reload() {
    s = await ai.settings();
    if (!alive) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === s.provider));
    const p = PROVIDERS.find((x) => x.key === s.provider)!;
    blurb.textContent = p.blurb;
    const local = s.provider === "lmstudio" || s.provider === "ollama";
    urlRow.style.display = local ? "" : "none";
    if (local) urlInput.value = s.urls[s.provider as "lmstudio" | "ollama"];
    keyRow.style.display = s.provider === "claude" ? "" : "none";
    keyStatus.textContent = s.hasClaudeKey ? "✓ A key is saved." : "No key saved yet.";
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
    modelSel.replaceChildren(...list.map((m) => new Option(m, m, false, m === current)));
    modelMsg.textContent = res.ok ? (list.length ? "" : "No models found. Download one first.") : res.error ?? "";
    // Pick a sensible default the first time.
    if (!current && list.length) {
      const preferred = list.find((m) => /gemma-4-31b|claude-opus-5-5/.test(m)) ?? list[0];
      modelSel.value = preferred;
      await ai.save({ models: { [p]: preferred } });
      s = await ai.settings();
    }
  }

  for (const p of PROVIDERS) {
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

  root.append(
    h("div", { class: "learn narrow" },
      h("header", { class: "learn-head" }, h("h1", {}, "Settings")),
      h("div", { class: "panel" },
        title("Sparkles", "AI coach", "#5aa4e0"),
        h("p", { class: "muted small" }, "The coach explains positions, moves, puzzles and your mistakes in plain English. It's always given Stockfish's analysis, so it explains rather than guesses."),
        seg, blurb, urlRow, modelRow, modelMsg, keyRow,
        h("div", { class: "row" }, button("Test the coach", test)),
        testOut,
      ),
      h("div", { class: "panel" },
        title("Info", "About", "#a5a3a0"),
        h("p", { class: "muted small" }, bridge ? "Desktop app: everything works offline except chess.com import and Claude." : "Running in a browser. For Claude and offline use, run the desktop app (npm run app)."),
      ),
    ),
  );
  reload();
  return () => {
    alive = false;
  };
}
