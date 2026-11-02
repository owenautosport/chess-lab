import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./style.css";
import { mountAnalysis } from "./analysis";
import { h } from "./board";
import { mountGames } from "./games";
import { mountPlay } from "./play";
import { mountPuzzles } from "./puzzles";
import { takePending } from "./router";
import { mountLearn } from "./learn/learn";
import { mountSettings } from "./settings";
import { icon, piece, type IconName } from "./ui/visuals";

type Tab = { label: string; icon: IconName | "pawn"; color: string; mount: (el: HTMLElement, path: string[]) => () => void };
const TABS: Record<string, Tab> = {
  learn: { label: "Learn", icon: "GraduationCap", color: "#5aa4e0", mount: mountLearn },
  play: { label: "Play", icon: "pawn", color: "#81b64c", mount: mountPlay },
  puzzles: { label: "Puzzles", icon: "Puzzle", color: "#f39c2f", mount: mountPuzzles },
  analysis: { label: "Analysis", icon: "ChartLine", color: "#a77fe0", mount: (el: HTMLElement) => mountAnalysis(el, takePending()) },
  games: { label: "My Games", icon: "History", color: "#3fb6a8", mount: mountGames },
  settings: { label: "Settings", icon: "Settings", color: "#a5a3a0", mount: mountSettings },
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const logo = h("img", { class: "logo", src: `${import.meta.env.BASE_URL}logo.png`, alt: "" });
const nav = h("nav", { class: "nav" }, h("a", { class: "brand", href: "#learn" }, logo, h("span", {}, "Chess Lab")));
const main = h("main", {});
app.append(nav, main);

for (const [key, t] of Object.entries(TABS)) {
  const glyph = t.icon === "pawn" ? piece("white", "pawn", 24, "nav-icon") : icon(t.icon, 22, "nav-icon");
  const link = h("a", { href: `#${key}`, "data-tab": key }, glyph, h("span", {}, t.label));
  link.style.setProperty("--tab", t.color);
  if (key === "settings") link.classList.add("bottom");
  nav.append(link);
}

let unmount: (() => void) | undefined;
function route() {
  const [first, ...path] = location.hash.slice(1).split("/");
  const tab = first in TABS ? first : "learn";
  unmount?.();
  main.replaceChildren();
  nav.querySelectorAll<HTMLAnchorElement>("[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  unmount = TABS[tab].mount(main, path);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
route();
