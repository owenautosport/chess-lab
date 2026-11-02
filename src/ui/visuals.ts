// Icons, piece images and mini-board thumbnails used across the app.
import { createElement, icons } from "lucide";
import { Chess } from "chess.js";
import pieceCss from "@lichess-org/chessground/assets/chessground.cburnett.css?raw";

export type IconName = keyof typeof icons;

/** A Lucide line icon (ISC licence). */
export function icon(name: IconName, size = 18, cls = "") {
  const el = createElement(icons[name]);
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("class", `icon ${cls}`.trim());
  el.setAttribute("aria-hidden", "true");
  return el;
}

// cburnett piece artwork (from chessground's stylesheet), keyed like "white pawn".
const PIECES: Record<string, string> = {};
for (const m of pieceCss.matchAll(/piece\.(\w+)\.(\w+)\s*\{\s*background-image:\s*url\('([^']+)'\)/g)) PIECES[`${m[2]} ${m[1]}`] = m[3];

const ROLE: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** A chess piece as an <img>, e.g. piece("white", "knight"). */
export function piece(color: "white" | "black", role: string, size = 22, cls = "") {
  const img = document.createElement("img");
  img.src = PIECES[`${color} ${role}`];
  img.width = img.height = size;
  img.alt = "";
  img.className = `piece-img ${cls}`.trim();
  return img;
}

const LIGHT = "#ebecd0";
const DARK = "#739552";
const HIGHLIGHT = "rgba(255,255,51,.5)";

/**
 * Small static board image for cards. `highlight` squares get the last-move yellow;
 * `arrow` draws a green arrow (e.g. the key move).
 */
export function boardThumb(fen: string, opts: { orientation?: "white" | "black"; highlight?: string[]; arrow?: [string, string] } = {}) {
  const flip = opts.orientation === "black";
  const xy = (sq: string) => {
    const f = sq.charCodeAt(0) - 97;
    const r = +sq[1] - 1;
    return [flip ? 7 - f : f, flip ? r : 7 - r];
  };
  const parts: string[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${(x + y) % 2 ? DARK : LIGHT}"/>`);
  for (const sq of opts.highlight ?? []) {
    const [x, y] = xy(sq);
    parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${HIGHLIGHT}"/>`);
  }
  const c = new Chess(fen, { skipValidation: true });
  for (const row of c.board())
    for (const p of row) {
      if (!p) continue;
      const [x, y] = xy(p.square);
      parts.push(`<image href="${PIECES[`${p.color === "w" ? "white" : "black"} ${ROLE[p.type]}`]}" x="${x}" y="${y}" width="1" height="1"/>`);
    }
  if (opts.arrow) {
    const [[x1, y1], [x2, y2]] = opts.arrow.map(xy);
    const [ax, ay, bx, by] = [x1 + 0.5, y1 + 0.5, x2 + 0.5, y2 + 0.5];
    const len = Math.hypot(bx - ax, by - ay);
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    const [ex, ey] = [bx - ux * 0.35, by - uy * 0.35];
    parts.push(
      `<line x1="${ax}" y1="${ay}" x2="${ex}" y2="${ey}" stroke="#ffaa00" stroke-width=".17" stroke-linecap="round" opacity=".85"/>`,
      `<polygon points="${bx},${by} ${ex - uy * 0.25},${ey + ux * 0.25} ${ex + uy * 0.25},${ey - ux * 0.25}" fill="#ffaa00" opacity=".85"/>`,
    );
  }
  const wrap = document.createElement("div");
  wrap.className = "thumb";
  wrap.innerHTML = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  return wrap;
}

/** Position after a SAN move list, with the last move's squares for highlighting. */
export function afterMoves(moves: string, startFen?: string) {
  const c = new Chess(startFen);
  let last: string[] = [];
  for (const san of moves.split(" ").filter(Boolean)) {
    const m = c.move(san);
    last = [m.from, m.to];
  }
  return { fen: c.fen(), last };
}
