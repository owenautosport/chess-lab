// Glue between chess.js (rules) and chessground (board UI), plus small shared widgets.
import { Chess, SQUARES, type Move, type PieceSymbol, type Square } from "chess.js";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Config } from "@lichess-org/chessground/config";
import type { Key } from "@lichess-org/chessground/types";
import { formatScore, winPercent, type Line } from "./engine";

export type Color = "white" | "black";
export const colorOf = (c: "w" | "b"): Color => (c === "w" ? "white" : "black");

export function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const s of SQUARES) {
    const ms = chess.moves({ square: s, verbose: true });
    if (ms.length) dests.set(s, ms.map((m) => m.to));
  }
  return dests;
}

/** Board config that reflects `chess`'s position. Pass `movable` = the colour allowed to move, or undefined for view-only. */
export function positionConfig(chess: Chess, movable?: Color | "both"): Config {
  const last = chess.history({ verbose: true }).at(-1);
  const turn = colorOf(chess.turn());
  return {
    fen: chess.fen(),
    turnColor: turn,
    check: chess.inCheck() ? turn : false,
    lastMove: last ? [last.from, last.to] : undefined,
    movable: {
      color: movable,
      dests: movable && (movable === "both" || movable === turn) ? legalDests(chess) : new Map(),
    },
  };
}

export function createBoard(el: HTMLElement, config: Config = {}): Api {
  const api = Chessground(el, {
    animation: { enabled: true, duration: 180 },
    movable: { free: false, showDests: true },
    premovable: { enabled: false },
    highlight: { lastMove: true, check: true },
    ...config,
  });
  return api;
}

window.addEventListener("resize", () => document.body.dispatchEvent(new Event("chessground.resize")));

/** Is from→to a pawn reaching the last rank? */
export function isPromotion(chess: Chess, from: Square, to: Square) {
  const p = chess.get(from);
  return p?.type === "p" && (to[1] === "8" || to[1] === "1");
}

const ROLE: Record<string, string> = { q: "queen", r: "rook", b: "bishop", n: "knight" };

/** Overlay a piece picker on the destination file. Resolves null if dismissed. */
export function askPromotion(wrap: HTMLElement, to: Square, color: Color, orientation: Color): Promise<PieceSymbol | null> {
  return new Promise((resolve) => {
    const file = to.charCodeAt(0) - 97;
    const col = orientation === "white" ? file : 7 - file;
    const fromTop = (color === "white") === (orientation === "white");
    const overlay = document.createElement("div");
    overlay.className = "promotion";
    (["q", "n", "r", "b"] as PieceSymbol[]).forEach((p, i) => {
      const sq = document.createElement("button");
      sq.style.left = `${col * 12.5}%`;
      sq.style.top = `${(fromTop ? i : 7 - i) * 12.5}%`;
      sq.innerHTML = `<piece class="${ROLE[p]} ${color}"></piece>`;
      sq.onclick = (e) => {
        e.stopPropagation();
        overlay.remove();
        resolve(p);
      };
      overlay.append(sq);
    });
    overlay.onclick = () => {
      overlay.remove();
      resolve(null);
    };
    (wrap.querySelector(".cg-wrap") ?? wrap).append(overlay);
  });
}

// ---------- widgets ----------

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === "class" ? (el.className = v) : el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

export function button(label: string, onClick: () => void, cls = "") {
  const b = h("button", { class: `btn ${cls}`.trim(), type: "button" }, label);
  b.onclick = onClick;
  return b;
}

export type MoveMark = { symbol: string; cls: string } | undefined;

/** Two-column move list. `current` is the ply shown on the board (0 = start position). */
export function renderMoves(el: HTMLElement, sans: string[], current: number, onPick?: (ply: number) => void, marks: MoveMark[] = [], startsWithBlack = false, firstMoveNumber = 1) {
  el.replaceChildren();
  const plies = startsWithBlack ? ["", ...sans] : sans;
  for (let i = 0; i < plies.length; i += 2) {
    el.append(h("span", { class: "num" }, `${firstMoveNumber + i / 2}.`));
    for (const j of [i, i + 1]) {
      const ply = startsWithBlack ? j : j + 1; // ply number after this move
      const san = plies[j];
      const cell = h("span", { class: "mv" });
      if (san) {
        const mark = marks[ply - 1];
        cell.append(san);
        if (mark) cell.append(h("i", { class: `mark ${mark.cls}` }, mark.symbol));
        if (ply === current) cell.classList.add("active");
        if (onPick) cell.onclick = () => onPick(ply);
      }
      el.append(cell);
    }
  }
  el.querySelector(".active")?.scrollIntoView({ block: "nearest" });
}

/** Vertical evaluation bar; white share fills from the bottom (or top when flipped). */
export function evalBar() {
  const fill = h("div", { class: "eval-fill" });
  const label = h("div", { class: "eval-label" });
  const el = h("div", { class: "eval-bar" }, fill, label);
  return {
    el,
    set(line: Pick<Line, "cp" | "mate"> | undefined, orientation: Color) {
      el.classList.toggle("flipped", orientation === "black");
      if (!line) {
        fill.style.height = "50%";
        label.textContent = "";
        return;
      }
      const w = winPercent(line);
      fill.style.height = `${w}%`;
      label.textContent = formatScore(line).replace("+", "");
      label.classList.toggle("on-white", w >= 50);
    },
  };
}

/** Material balance: captured pieces per side and the point difference. */
export function material(chess: Chess) {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const value: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const glyph: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };
  const count = { w: { ...start, p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } } as Record<"w" | "b", Record<string, number>>;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== "k") count[p.color][p.type]++;
  const captured = (by: "w" | "b") => {
    const victim = by === "w" ? "b" : "w";
    return ["q", "r", "b", "n", "p"].map((t) => glyph[t].repeat(Math.max(0, start[t] - count[victim][t]))).join("");
  };
  const score = (c: "w" | "b") => Object.entries(count[c]).reduce((s, [t, n]) => s + value[t] * n, 0);
  return { white: captured("w"), black: captured("b"), diff: score("w") - score("b") };
}

/** Pretty principal variation in SAN, starting from fen. */
export function pvToSan(fen: string, pv: string[], max = 10): string {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    let m: Move;
    try {
      m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    const n = c.moveNumber();
    if (m.color === "w") out.push(`${n}. ${m.san}`);
    else out.push(out.length ? m.san : `${n - 1}... ${m.san}`);
  }
  return out.join(" ");
}

export const uciOf = (m: Pick<Move, "from" | "to" | "promotion">) => m.from + m.to + (m.promotion ?? "");

// ---------- sound ----------

let audio: AudioContext | undefined;
export function playSound(kind: "move" | "capture" | "check" | "end" | "wrong") {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    const freq = { move: 520, capture: 300, check: 760, end: 440, wrong: 180 }[kind];
    o.type = kind === "wrong" ? "square" : "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.08);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kind === "end" ? 0.4 : 0.09));
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.45);
  } catch {
    /* audio unavailable */
  }
}

export function soundFor(chess: Chess, m: Move) {
  if (chess.isGameOver()) playSound("end");
  else if (chess.inCheck()) playSound("check");
  else playSound(m.captured ? "capture" : "move");
}
