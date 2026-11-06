// Coach tab: your estimated level, a training plan built from your weak spots, the next new idea
// to learn, and an AI coach that knows all of that. The plan works without any AI configured.
import { Chess } from "chess.js";
import { button, h } from "../board";
import { coachPanel } from "../ai/coach";
import { BOTS } from "../bots";
import { loadPuzzles, themeName } from "../puzzles";
import { load, save } from "../store";
import { title } from "../ui/title";
import { afterMoves, boardThumb, icon, type IconName } from "../ui/visuals";
import { OPENINGS } from "../learn/openings-data";
import { MATES, TACTICS } from "../learn/lessons-data";
import { CURRICULUM, nextSteps, type Step } from "./curriculum";
import { adaptiveSystem, profile, type Profile } from "./profile";

const KIND: Record<Step["kind"], { label: string; icon: IconName; color: string }> = {
  tactic: { label: "Tactic", icon: "Zap", color: "#f39c2f" },
  mate: { label: "Checkmate", icon: "Crown", color: "#e5534b" },
  endgame: { label: "Endgame", icon: "Target", color: "#a77fe0" },
  opening: { label: "Opening", icon: "BookOpen", color: "#5aa4e0" },
};

type PlanItem = { icon: IconName; color: string; title: string; why: string; href: string; go?: () => void };

export function mountCoach(root: HTMLElement) {
  const p = profile();
  const next = nextSteps(p.skill, 3);
  const page = h("div", { class: "learn coach-page" },
    hero(p),
    section("ListChecks", "#81b64c", "Today's training", "Picked from your results. It changes as you improve.", planList(plan(p, next))),
    next.length ? section("Sparkles", "#f0b44c", "Your next new idea", `The next thing worth learning at about ${p.skill}.`, newIdea(next[0], next.slice(1))) : "",
    section("Route", "#5aa4e0", "Your course", "Every idea in the order players usually need them. Ticked ones you've already got.", course(p)),
    h("div", { class: "panel coach-chat" },
      title("MessageCircle", "Talk to your coach", "#3fb6a8"),
      h("p", { class: "muted small" }, "It knows your level, results and weak spots, and pitches every answer to you. Needs an AI model in Settings."),
      coachPanel({
        title: "🎓 AI coach",
        open: true,
        system: adaptiveSystem,
        context: () => "No position on the board: this is a general coaching conversation.",
        actions: () => [
          { label: "What should I work on?", prompt: "Look at my profile. What are the two or three things that would improve my results fastest, and how should I practise them in this app?" },
          ...(next[0] ? [{ label: `Teach me: ${next[0].title}`, prompt: `Teach me "${next[0].title}" at my level. The idea: ${next[0].what} How to spot or play it: ${next[0].how} Explain it simply, give one classic example in words, and tell me what to look for in my own games.` }] : []),
          { label: `How do I reach ${Math.round((p.skill + 200) / 100) * 100}?`, prompt: `I'm about ${p.skill}. What do players at ${Math.round((p.skill + 200) / 100) * 100} do that I don't yet? Give me a short, concrete plan.` },
        ],
        placeholder: "Ask your coach anything…",
      }).el,
    ),
  );
  root.append(page);
  return () => {};
}

function hero(p: Profile) {
  const w = p.games.filter((g) => g.result === 1).length;
  const d = p.games.filter((g) => g.result === 0.5).length;
  const l = p.games.length - w - d;
  const stat = (i: IconName, v: string, label: string) => h("div", { class: "hero-stat" }, icon(i, 18), h("b", {}, v), h("span", {}, label));
  return h("header", { class: "learn-hero coach-hero" },
    h("div", { class: "coach-face" }, icon("GraduationCap", 44)),
    h("div", { class: "hero-text" },
      h("h1", {}, "Your coach"),
      h("p", {}, p.sources.length ? `You're playing at about ${p.skill}. That's from ${p.sources.join(", ")}.` : "Play a game against a bot or do a few rated puzzles, and I'll work out your level and what to practise."),
      h("div", { class: "hero-stats" },
        stat("Gauge", String(p.skill), `level · ${p.confidence}`),
        stat("Swords", `${w}/${d}/${l}`, "won/drew/lost"),
        p.recentAccuracy !== undefined ? stat("Target", `${p.recentAccuracy.toFixed(0)}%`, "accuracy") : stat("Target", "–", "review a game for accuracy"),
        p.blundersPerGame !== undefined ? stat("TriangleAlert", p.blundersPerGame.toFixed(1), "blunders/game") : "",
      ),
    ),
  );
}

/** The adaptive part: what to do today, from what the profile shows. */
function plan(p: Profile, next: Step[]): PlanItem[] {
  const items: PlanItem[] = [];
  const pStats = load("puzzles", { played: 0 });
  if (!p.games.length && pStats.played < 10) {
    items.push({ icon: "Puzzle", color: "#f39c2f", title: "Do 10 rated puzzles", why: "So I can estimate your level. It takes about five minutes.", href: "#puzzles", go: () => save("puzzlePrefs", { ...load("puzzlePrefs", {}), source: "rated" }) });
  }
  const weak = p.weakThemes[0];
  const lessonTitle = (key: string) => [...TACTICS, ...MATES].find((l) => l.key === key)?.title ?? themeName(key);
  if (weak) items.push({ icon: "Zap", color: "#f39c2f", title: `Practise ${lessonTitle(weak.key).toLowerCase()}`, why: `You solve ${Math.round(weak.rate * 100)}% of these puzzles. Getting this up wins games.`, href: `#learn/lesson/${weak.key}` });
  if (p.savedMistakes) {
    items.push({ icon: "Repeat", color: "#e5534b", title: "Fix your own mistakes", why: `${p.savedMistakes} positions from your reviewed games where you went wrong. Find the right move this time.`, href: "#puzzles", go: () => save("puzzlePrefs", { ...load("puzzlePrefs", {}), source: "mistakes" }) });
  }
  if (p.blundersPerGame !== undefined && p.blundersPerGame >= 1.5 && weak?.key !== "hangingPiece") {
    items.push({ icon: "ShieldCheck", color: "#3fb6a8", title: "Stop leaving pieces hanging", why: `You average ${p.blundersPerGame.toFixed(1)} blunders a game. Before every move, check what it leaves undefended.`, href: "#learn/lesson/hangingPiece" });
  }
  if (p.weakPhase === "opening") {
    const o = next.find((s) => s.kind === "opening") ?? CURRICULUM.find((s) => s.kind === "opening" && !s.done());
    if (o) items.push({ icon: "BookOpen", color: "#5aa4e0", title: `Learn ${o.title}`, why: "Most of your mistakes come in the opening. A solid repertoire fixes that.", href: o.href });
  } else if (p.weakPhase === "endgame") {
    items.push({ icon: "Target", color: "#a77fe0", title: "Practise endgames", why: "Most of your mistakes come in the endgame. Play out random endgames against the computer.", href: "#learn/practice/endgame" });
  } else if (p.weakPhase === "middlegame") {
    items.push({ icon: "Swords", color: "#81b64c", title: "Practise middlegames", why: "Most of your mistakes come in the middlegame. Play out random middlegame positions.", href: "#learn/practice/middlegame" });
  }
  const lastGame = p.games.at(-1);
  if (lastGame && !p.reviews.length) {
    items.push({ icon: "Star", color: "#81b64c", title: "Review a game", why: "Run Game Review after a game and I'll learn where you go wrong (opening, middlegame or endgame).", href: "#play" });
  }
  // A game that stretches you, with the in-game coach on.
  const bot = BOTS.reduce((a, b) => (Math.abs(b.rating - (p.skill + 100)) < Math.abs(a.rating - (p.skill + 100)) ? b : a));
  items.push({ icon: "Bot", color: "#81b64c", title: `Play ${bot.name} (${bot.rating})`, why: "Just above your level, with the coach pointing out tactics and threats as you go.", href: "#play", go: () => save("play", { ...load("play", {}), bot: bot.id, coach: true }) });
  return items.slice(0, 5);
}

function planList(items: PlanItem[]) {
  const list = h("div", { class: "plan" });
  for (const it of items) {
    const badge = h("span", { class: "section-icon" }, icon(it.icon, 18));
    badge.style.background = it.color;
    const a = h("a", { class: "plan-item", href: it.href }, badge, h("div", {}, h("b", {}, it.title), h("div", { class: "muted small" }, it.why)), icon("ChevronRight", 18));
    if (it.go) a.onclick = it.go;
    list.append(a);
  }
  return list;
}

function newIdea(step: Step, after: Step[]) {
  const k = KIND[step.kind];
  const thumb = h("div", { class: "thumb placeholder" });
  exampleFor(step).then((t) => t && thumb.replaceWith(t));
  return h("div", { class: "idea" },
    h("div", { class: "idea-main panel" },
      thumb,
      h("div", { class: "idea-text" },
        h("span", { class: "pill", style: `background:${k.color}` }, k.label),
        h("h3", {}, step.title),
        h("p", {}, step.what),
        h("p", { class: "muted" }, h("b", {}, "How: "), step.how),
        h("div", { class: "muted small" }, step.progressText()),
        h("div", { class: "row" }, h("a", { class: "btn primary", href: step.href }, icon("GraduationCap", 16), "Learn it now")),
      ),
    ),
    after.length ? h("div", { class: "muted small" }, "After that: ", after.map((s) => s.title).join(", "), ".") : "",
  );
}

/** A picture for the idea: a real puzzle for tactics and mates, the opening position for openings. */
async function exampleFor(step: Step) {
  if (step.kind === "opening") {
    const o = OPENINGS.find((x) => step.id === `opening:${x.id}`)!;
    const pos = afterMoves(o.lines[0].moves.split(" ").slice(0, 8).join(" "));
    return boardThumb(pos.fen, { orientation: o.side, highlight: pos.last });
  }
  if (step.kind === "endgame") return null;
  const key = step.id.split(":")[1];
  const q = (await loadPuzzles()).find((x) => x.themes.includes(key));
  if (!q) return null;
  const c = new Chess(q.fen);
  const u = q.solution[0];
  c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return boardThumb(c.fen(), { orientation: c.turn() === "w" ? "white" : "black", highlight: [u.slice(0, 2), u.slice(2, 4)] });
}

function course(p: Profile) {
  const list = h("div", { class: "course" });
  const nextId = nextSteps(p.skill, 1)[0]?.id;
  for (const s of CURRICULUM) {
    const done = s.done();
    const locked = s.from > p.skill + 150;
    const k = KIND[s.kind];
    const row = h("a", { class: `course-step${done ? " done" : ""}${locked ? " locked" : ""}${s.id === nextId ? " next" : ""}`, href: s.href },
      icon(done ? "CircleCheck" : locked ? "Lock" : s.id === nextId ? "CirclePlay" : "Circle", 18, "state"),
      h("span", { class: "kind", style: `color:${k.color}` }, icon(k.icon, 14)),
      h("span", { class: "name" }, s.title),
      h("span", { class: "muted small" }, locked ? `from ${s.from}` : s.progressText()),
    );
    list.append(row);
  }
  const wrap = h("div", {}, list);
  const more = button("Show the whole course", () => {
    list.classList.toggle("all");
    more.lastChild!.textContent = list.classList.contains("all") ? "Show less" : "Show the whole course";
  });
  wrap.append(more);
  return wrap;
}

function section(iconName: IconName, color: string, t: string, sub: string, body: HTMLElement) {
  const badge = h("span", { class: "section-icon" }, icon(iconName, 20));
  badge.style.background = color;
  return h("section", { class: "learn-section" }, h("h2", {}, badge, t), h("p", { class: "muted small" }, sub), body);
}
