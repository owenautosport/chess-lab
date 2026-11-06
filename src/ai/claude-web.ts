// Claude on the website: each visitor connects their own Anthropic API key. The key stays in
// their browser's storage and is only ever sent to Anthropic. (The desktop app keeps its key in
// the Mac keychain and calls Claude from the main process instead.)
const KEY = "chesslab:claudeKey";

export const webKey = {
  get: (): string | null => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(key: string | null) {
    try {
      if (key) localStorage.setItem(KEY, key);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage blocked */
    }
  },
};

// Loaded on first use, so visitors who never use Claude don't download the SDK.
async function client() {
  const key = webKey.get();
  if (!key) throw new Error("no-key");
  const { default: SDK } = await import("@anthropic-ai/sdk");
  return { c: new SDK({ apiKey: key, dangerouslyAllowBrowser: true }) };
}

export async function listClaudeModels(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const { c } = await client();
    const ids: string[] = [];
    for await (const m of c.models.list()) ids.push(m.id);
    return { ok: true, models: ids };
  } catch (e) {
    return { ok: false, models: [], error: await describe(e) };
  }
}

export async function chatClaudeWeb(
  model: string,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  onText: (t: string) => void,
  signal: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { c } = await client();
    const stream = c.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        system,
        messages,
        output_config: { effort: "medium" },
        // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onText(ev.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") onText("\n\n(Claude declined to answer this one.)");
    if (final.stop_reason === "max_tokens") onText("\n\n(Answer cut off.)");
    return { ok: true };
  } catch (e) {
    if (signal.aborted) return { ok: true };
    return { ok: false, error: await describe(e) };
  }
}

async function describe(e: unknown): Promise<string> {
  if ((e as Error)?.message === "no-key") return "Connect your own Claude API key in Settings first.";
  const { default: SDK } = await import("@anthropic-ai/sdk");
  if (e instanceof SDK.AuthenticationError) return "Claude rejected the API key. Check it in Settings.";
  if (e instanceof SDK.RateLimitError) return "Claude is rate-limiting requests. Wait a moment and try again.";
  if (e instanceof SDK.APIConnectionError) return "Can't reach Claude. Are you offline?";
  if (e instanceof SDK.APIError) return `Claude error ${e.status}: ${e.message}`;
  return "Something went wrong talking to Claude.";
}

