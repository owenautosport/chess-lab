import { h } from "../board";
import { icon, type IconName } from "./visuals";

/** Panel heading with a coloured icon, like the section headers. */
export function title(name: IconName, text: string, color = "var(--accent)") {
  const i = icon(name, 20);
  i.style.color = color;
  return h("h2", { class: "titled" }, i, text);
}
