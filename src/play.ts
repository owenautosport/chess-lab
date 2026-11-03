// Play a bot: pick an opponent, pick a colour, play. Bots are Stockfish strengths or Maia (human-like, desktop app only).
import { Chess, type Move, type Square } from "chess.js";
import { askPromotion, button, colorOf, createBoard, h, isPromotion, material, playSound, positionConfig, renderMoves, soundFor, type Color } from "./board";
import { engine } from "./engine";
import { openInAnalysis } from "./router";
import { load, save } from "./store";
import { bridge } from "./ai/coach";
import { title } from "./ui/title";
import { icon, piece } from "./ui/visuals";
import { botAvatar, BOTS, maiaBots, type Bot } from "./bots";

// Rough strength ladder: Stockfish skill level plus a search limit. BOTS[i] plays at LEVELS[i].
export const LEVELS = [
  { name: "1 · Beginner", skill: 0, depth: 1 },
  { name: "2 · Novice", skill: 2, depth: 2 },
  { name: "3 · Casual", skill: 5, depth: 3 },
  { name: "4 · Club", skill: 8, depth: 5 },
  { name: "5 · Strong club", skill: 11, depth: 8 },
  { name: "6 · Expert", skill: 14, depth: 10 },
  { name: "7 · Master", skill: 17, depth: 13 },
  { name: "8 · Maximum", skill: 20, movetime: 1500 },
];

type Side = Color | "random";

export function mountPlay(root: HTMLElement) {
  // `level` is kept for the Learn area, which borrows the Stockfish strength you last played.
  const settings = load("play", { level: 3, side: "white" as Side, bot: "marco" });
  let bots = [...BOTS];
  const findBot = (id: string) => bots.find((b) => b.id === id) ?? BOTS[3];
  let bot: Bot = findBot(settings.bot);

  const chess = new Chess();
  let me: Color = "white";
  let phase: "pick" | "side" | "game" = "pick";
  let thinking = false;
  let over = false;
  let endNote = "";
  let said = "";

  const boardEl = h("div", { class: "board" });
  const topBar = h("div", { class: "player-bar" });
  const bottomBar = h("div", { class: "player-bar" });
  const panel = h("aside", { class: "panel play-panel" });
  const moves = h("div", { class: "moves" });
  const status = h("div", { class: "status" });

  const board = createBoard(boardEl, {
    movable: { events: { after: (from, to) => userMove(from as Square, to as Square) } },
  });

  // Maia bots appear once the desktop app reports which networks are installed.
  bridge?.maiaLevels().then((elos) => {
    if (!elos.length) return;
    bots = [...BOTS, ...maiaBots(elos)];
    bot = findBot(settings.bot);
    if (phase !== "game") render();
  });

  function choose(b: Bot) {
    bot = b;
    settings.bot = b.id;
    const i = BOTS.indexOf(b);
    if (i >= 0) settings.level = i;
    save("play", settings);
    said = b.hello;
    render();
  }

  // ---------- panels ----------

  function botCard() {
    return h("div", { class: "bot-hero" },
      botAvatar(bot, 72),
      h("div", { class: "bot-hero-text" },
        h("div", { class: "bot-name" }, h("b", {}, bot.name), h("span", { class: "bot-rating" }, String(bot.rating))),
        h("div", { class: "muted small" }, bot.maia ? "Human-like · Maia" : `${bot.group} · Stockfish`),
      ),
      h("div", { class: "bubble" }, said || bot.hello),
    );
  }

  function pickPanel() {
    const groups = [...new Set(bots.map((b) => b.group))];
    const list = h("div", { class: "bot-list" });
    for (const g of groups) {
      const grid = h("div", { class: "bot-grid" });
      for (const b of bots.filter((x) => x.group === g)) {
        const tile = h("button", { class: `bot-tile${b.id === bot.id ? " on" : ""}`, type: "button", title: `${b.name} (${b.rating})` }, botAvatar(b, 56), h("span", {}, b.name));
        tile.onclick = () => choose(b);
        tile.ondblclick = () => ((phase = "side"), render());
        grid.append(tile);
      }
      list.append(h("div", { class: "bot-group" }, h("div", { class: "bot-group-head" }, g, h("span", {}, groupRange(g))), grid));
    }
    return [
      title("Bot", "Play Bots", "#81b64c"),
      botCard(),
      list,
      button("Choose", () => ((phase = "side"), render()), "primary wide big"),
    ];
  }

  function groupRange(g: string) {
    const rs = bots.filter((b) => b.group === g).map((b) => b.rating);
    return rs.length > 1 ? `${Math.min(...rs)}–${Math.max(...rs)}` : String(rs[0]);
  }

  function sidePanel() {
    const sides = h("div", { class: "side-pick" });
    for (const s of ["white", "random", "black"] as const) {
      const b = h("button", { class: `side-btn${settings.side === s ? " on" : ""}`, type: "button", title: `Play as ${s}` },
        s === "random" ? h("span", { class: "random-king" }, piece("white", "king", 46), piece("black", "king", 46)) : piece(s, "king", 56),
        h("span", {}, s === "random" ? "Random" : s === "white" ? "White" : "Black"),
      );
      b.onclick = () => {
        settings.side = s;
        save("play", settings);
        render(); // flips the preview board too
      };
      b.ondblclick = () => startGame();
      sides.append(b);
    }
    const back = h("button", { class: "link-btn", type: "button" }, icon("ChevronLeft", 16), "Change bot");
    back.onclick = () => ((phase = "pick"), render());
    return [
      title("Bot", "Play Bots", "#81b64c"),
      botCard(),
      h("div", { class: "field-label" }, "I play as"),
      sides,
      button("Play", startGame, "primary wide big"),
      back,
    ];
  }

  function gamePanel() {
    const ended = over;
    return [
      h("div", { class: "bot-mini" }, botAvatar(bot, 40), h("div", {}, h("b", {}, bot.name), h("span", { class: "bot-rating" }, String(bot.rating))), h("div", { class: "bubble small" }, said)),
      status,
      moves,
      ended
        ? h("div", { class: "row" }, button("Rematch", () => startGame(), "primary"), button("New bot", () => ((phase = "pick"), (said = bot.hello), render())))
        : h("div", { class: "row" }, button("Take back", takeBack), button("Hint", hint), button("Flip", () => board.toggleOrientation()), button("Resign", resign)),
      analyseBtn,
    ];
  }

  function render() {
    panel.replaceChildren(...(phase === "pick" ? pickPanel() : phase === "side" ? sidePanel() : gamePanel()));
    if (phase !== "game") {
      // Preview: start position from the side you'd play.
      chess.reset();
      board.set({ ...positionConfig(chess), orientation: settings.side === "black" ? "black" : "white" });
      board.setAutoShapes([]);
      bars(settings.side === "black" ? "black" : "white");
    } else sync();
  }

  // ---------- game ----------

  function startGame() {
    engine().stop();
    chess.reset();
    over = false;
    endNote = "";
    thinking = false;
    said = bot.hello;
    me = settings.side === "random" ? (Math.random() < 0.5 ? "white" : "black") : settings.side;
    phase = "game";
    board.set({ orientation: me });
    board.setAutoShapes([]);
    engine().newGame();
    render();
    engineMove();
  }

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
    if (phase !== "game" || chess.isGameOver() || colorOf(chess.turn()) === me) return;
    thinking = true;
    sync();
    const started = performance.now();
    const fen = chess.fen();
    const b = bot;
    const res = b.maia && bridge
      ? { best: await bridge.maiaMove(fen, b.maia).catch(() => "(none)"), lines: [] }
      : await engine().search(fen, { skill: b.skill, depth: b.depth, movetime: b.movetime });
    if (fen !== chess.fen() || phase !== "game") return; // a new game started meanwhile
    // Don't let instant replies feel robotic.
    await new Promise((r) => setTimeout(r, Math.max(0, 350 - (performance.now() - started))));
    thinking = false;
    if (!res || res.best === "(none)" || over) return sync();
    const best = res.best;
    apply(chess.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }));
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
    endNote = `You resigned — ${bot.name} wins`;
    said = bot.win;
    render();
  }

  function result(): string {
    if (chess.isCheckmate()) return colorOf(chess.turn()) === me ? `Checkmate — ${bot.name} wins` : "Checkmate — you won!";
    if (chess.isStalemate()) return "Draw by stalemate";
    if (chess.isThreefoldRepetition()) return "Draw by repetition";
    if (chess.isInsufficientMaterial()) return "Draw — insufficient material";
    if (chess.isDraw()) return "Draw by 50-move rule";
    return "";
  }

  function bars(bottom: Color) {
    const mat = material(chess);
    const bar = (c: Color, you: boolean) => {
      const caps = c === "white" ? mat.white : mat.black;
      const adv = c === "white" ? mat.diff : -mat.diff;
      const turn = phase === "game" && !over && colorOf(chess.turn()) === c;
      const avatar = you
        ? h("span", { class: `avatar me${turn ? " turn" : ""}` }, icon("User", 20))
        : botAvatar(bot, 30, `small${turn ? " turn" : ""}`);
      const name = you ? h("b", {}, "You") : h("b", {}, bot.name, h("span", { class: "bot-rating" }, `(${bot.rating})`));
      return [avatar, name, h("span", { class: `dot ${c}` }), h("span", { class: "caps" }, caps), adv > 0 ? h("span", { class: "adv" }, `+${adv}`) : ""];
    };
    const top: Color = bottom === "white" ? "black" : "white";
    topBar.replaceChildren(...bar(top, false));
    bottomBar.replaceChildren(...bar(bottom, true));
  }

  function sync() {
    const wasOver = over;
    if (chess.isGameOver()) over = true;
    board.set(positionConfig(chess, over || thinking ? undefined : me));
    if (!thinking) board.setAutoShapes([]);
    const hist = chess.history();
    renderMoves(moves, hist, hist.length);
    bars(me);

    const end = endNote || result();
    status.className = `status${end ? " over" : ""}`;
    status.textContent = end || (thinking ? `${bot.name} is thinking…` : colorOf(chess.turn()) === me ? (chess.inCheck() ? "Check! Your move" : "Your move") : "");
    analyseBtn.disabled = hist.length === 0;
    if (over && !wasOver) {
      // The game just ended: the bot reacts, and the buttons switch to Rematch / New bot.
      said = chess.isCheckmate() ? (colorOf(chess.turn()) === me ? bot.win : bot.lose) : "A draw. Fair enough!";
      render();
    }
  }

  const analyseBtn = button("Review this game", () => openInAnalysis({ pgn: chess.pgn(), review: true, me }), "primary");

  root.append(h("div", { class: "layout" }, h("div", { class: "board-col" }, topBar, boardEl, bottomBar), panel));

  board.redrawAll(); // bounds are only measurable once attached
  said = bot.hello;
  render();
  return () => {
    engine().stop();
    board.destroy();
  };
}
