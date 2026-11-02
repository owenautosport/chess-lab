import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./style.css";
import { mountAnalysis } from "./analysis";
import { h } from "./board";
import { mountGames } from "./games";
import { mountPlay } from "./play";
import { mountPuzzles } from "./puzzles";
import { takePending } from "./router";

const TABS = {
  play: { label: "Play", mount: mountPlay },
  puzzles: { label: "Puzzles", mount: mountPuzzles },
  analysis: { label: "Analysis", mount: (el: HTMLElement) => mountAnalysis(el, takePending()) },
  games: { label: "My Games", mount: mountGames },
};
type Tab = keyof typeof TABS;

const app = document.querySelector<HTMLDivElement>("#app")!;
const nav = h("nav", { class: "nav" }, h("a", { class: "brand", href: "#play" }, h("span", { class: "logo" }, "♞"), "Chess Lab"));
const main = h("main", {});
app.append(nav, main);

for (const [key, t] of Object.entries(TABS)) nav.append(h("a", { href: `#${key}`, "data-tab": key }, t.label));

let unmount: (() => void) | undefined;
function route() {
  const tab = (location.hash.slice(1) in TABS ? location.hash.slice(1) : "play") as Tab;
  unmount?.();
  main.replaceChildren();
  nav.querySelectorAll<HTMLAnchorElement>("[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  unmount = TABS[tab].mount(main);
}
window.addEventListener("hashchange", route);
route();
