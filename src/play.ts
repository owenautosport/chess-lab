// Play against Stockfish at a chosen strength.
import { Chess, type Move, type Square } from "chess.js";
import { askPromotion, button, colorOf, createBoard, h, isPromotion, material, playSound, positionConfig, renderMoves, soundFor, type Color } from "./board";
import { engine } from "./engine";
import { openInAnalysis } from "./router";
import { load, save } from "./store";

// Rough strength ladder: Stockfish skill level plus a search limit.
const LEVELS = [
  { name: "1 · Beginner", skill: 0, depth: 1 },
  { name: "2 · Novice", skill: 2, depth: 2 },
  { name: "3 · Casual", skill: 5, depth: 3 },
  { name: "4 · Club", skill: 8, depth: 5 },
  { name: "5 · Strong club", skill: 11, depth: 8 },
  { name: "6 · Expert", skill: 14, depth: 10 },
  { name: "7 · Master", skill: 17, depth: 13 },
  { name: "8 · Maximum", skill: 20, movetime: 1500 },
];

export function mountPlay(root: HTMLElement) {
  const settings = load("play", { level: 3, side: "white" as Color | "random" });
  const chess = new Chess();
  let me: Color = "white";
  let thinking = false;
  let over = false;
  let endNote = "";

  const boardEl = h("div", { class: "board" });
  const topBar = h("div", { class: "player-bar" });
  const bottomBar = h("div", { class: "player-bar" });
  const moves = h("div", { class: "moves" });
  const status = h("div", { class: "status" });

  const level = h("select", { class: "select" }) as HTMLSelectElement;
  LEVELS.forEach((l, i) => level.append(new Option(l.name, String(i), false, i === settings.level)));
  level.onchange = () => save("play", { ...settings, level: (settings.level = +level.value) });

  const side = h("div", { class: "seg" });
  for (const s of ["white", "random", "black"] as const) {
    const b = button(s === "random" ? "?" : s === "white" ? "♔" : "♚", () => {
      settings.side = s;
      save("play", settings);
      side.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    });
    b.title = `Play as ${s}`;
    if (settings.side === s) b.classList.add("on");
    side.append(b);
  }

  const board = createBoard(boardEl, {
    movable: { events: { after: (from, to) => userMove(from as Square, to as Square) } },
  });

  async function userMove(from: Square, to: Square) {
    let promotion: string | undefined;
    if (isPromotion(chess, from, to)) {
      promotion = (await askPromotion(boardEl, to, me, me)) ?? undefined;
      if (!promotion) return sync();
    }
    apply(chess.move({ from, to, promotion }));
    engineMove();
  }

  function apply(m: Move) {
    soundFor(chess, m);
    sync();
  }

  async function engineMove() {
    if (chess.isGameOver() || colorOf(chess.turn()) === me) return;
    thinking = true;
    sync();
    const lvl = LEVELS[settings.level];
    const started = performance.now();
    const res = await engine().search(chess.fen(), { skill: lvl.skill, depth: lvl.depth, movetime: lvl.movetime });
    // Don't let instant replies feel robotic.
    await new Promise((r) => setTimeout(r, Math.max(0, 350 - (performance.now() - started))));
    thinking = false;
    if (!res || res.best === "(none)" || over) return sync();
    const b = res.best;
    apply(chess.move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] }));
  }

  function newGame() {
    engine().stop();
    chess.reset();
    over = false;
    endNote = "";
    thinking = false;
    me = settings.side === "random" ? (Math.random() < 0.5 ? "white" : "black") : settings.side;
    board.set({ orientation: me });
    board.setAutoShapes([]);
    engine().newGame();
    sync();
    engineMove();
  }

  function takeBack() {
    if (thinking || over) return;
    chess.undo();
    if (colorOf(chess.turn()) !== me) chess.undo();
    board.setAutoShapes([]);
    sync();
  }

  async function hint() {
    if (thinking || over || colorOf(chess.turn()) !== me) return;
    const res = await engine().search(chess.fen(), { depth: 14 });
    if (res) board.setAutoShapes([{ orig: res.best.slice(0, 2) as Square, dest: res.best.slice(2, 4) as Square, brush: "paleBlue" }]);
  }

  function resign() {
    if (over || chess.history().length === 0) return;
    over = true;
    playSound("end");
    endNote = `You resigned — ${me === "white" ? "Black" : "White"} wins`;
    sync();
  }

  function result(): string {
    if (chess.isCheckmate()) return colorOf(chess.turn()) === me ? "Checkmate — you lost" : "Checkmate — you won!";
    if (chess.isStalemate()) return "Draw by stalemate";
    if (chess.isThreefoldRepetition()) return "Draw by repetition";
    if (chess.isInsufficientMaterial()) return "Draw — insufficient material";
    if (chess.isDraw()) return "Draw by 50-move rule";
    return "";
  }

  function sync() {
    if (chess.isGameOver()) over = true;
    board.set(positionConfig(chess, over || thinking ? undefined : me));
    if (!thinking) board.setAutoShapes([]);
    const hist = chess.history();
    renderMoves(moves, hist, hist.length);

    const mat = material(chess);
    const bar = (c: Color, name: string) => {
      const caps = c === "white" ? mat.white : mat.black;
      const adv = c === "white" ? mat.diff : -mat.diff;
      const turn = !over && colorOf(chess.turn()) === c;
      return [h("span", { class: `dot ${c}${turn ? " turn" : ""}` }), h("b", {}, name), h("span", { class: "caps" }, caps), adv > 0 ? h("span", { class: "adv" }, `+${adv}`) : ""];
    };
    const opp: Color = me === "white" ? "black" : "white";
    topBar.replaceChildren(...bar(opp, `Stockfish · ${LEVELS[settings.level].name.split(" · ")[1]}`));
    bottomBar.replaceChildren(...bar(me, "You"));

    const end = endNote || result();
    status.className = `status${end ? " over" : ""}`;
    status.textContent = end || (thinking ? "Stockfish is thinking…" : colorOf(chess.turn()) === me ? (chess.inCheck() ? "Check! Your move" : "Your move") : "");
    analyseBtn.disabled = hist.length === 0;
  }

  const analyseBtn = button("Review this game", () => openInAnalysis({ pgn: chess.pgn(), review: true, me }), "primary");

  root.append(
    h("div", { class: "layout" },
      h("div", { class: "board-col" }, topBar, boardEl, bottomBar),
      h("aside", { class: "panel" },
        h("h2", {}, "Play the computer"),
        h("label", { class: "field" }, h("span", {}, "Strength"), level),
        h("label", { class: "field" }, h("span", {}, "Play as"), side),
        button("New game", newGame, "primary wide"),
        status,
        moves,
        h("div", { class: "row" }, button("Take back", takeBack), button("Hint", hint), button("Flip", () => board.toggleOrientation()), button("Resign", resign)),
        analyseBtn,
      ),
    ),
  );

  board.redrawAll(); // bounds are only measurable once attached
  newGame();
  return () => {
    engine().stop();
    board.destroy();
  };
}
