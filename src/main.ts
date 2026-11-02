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

const TABS: Record<string, { label: string; mount: (el: HTMLElement, path: string[]) => () => void }> = {
  learn: { label: "Learn", mount: mountLearn },
  play: { label: "Play", mount: mountPlay },
  puzzles: { label: "Puzzles", mount: mountPuzzles },
  analysis: { label: "Analysis", mount: (el: HTMLElement) => mountAnalysis(el, takePending()) },
  games: { label: "My Games", mount: mountGames },
  settings: { label: "Settings", mount: mountSettings },
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const nav = h("nav", { class: "nav" }, h("a", { class: "brand", href: "#learn" }, h("span", { class: "logo" }, "♞"), "Chess Lab"));
const main = h("main", {});
app.append(nav, main);

for (const [key, t] of Object.entries(TABS)) nav.append(h("a", { href: `#${key}`, "data-tab": key }, t.label));

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
