// Play a bot: pick an opponent, pick a colour, play. Bots are Stockfish strengths or Maia (human-like, desktop app only).
// The in-game coach points out tactics and threats as you play, and judges each of your moves.
import { Chess, type Move, type Square } from "chess.js";
import type { DrawShape } from "@lichess-org/chessground/draw";
import { askPromotion, button, colorOf, createBoard, h, isPromotion, material, playSound, positionConfig, renderMoves, soundFor, uciOf, type Color } from "./board";
import { engine } from "./engine";
import { openInAnalysis } from "./router";
import { load, save } from "./store";
import { bridge, coachPanel, describeLines, describePosition } from "./ai/coach";
import { title } from "./ui/title";
import { icon, piece } from "./ui/visuals";
import { botAvatar, BOTS, maiaBots, type Bot } from "./bots";
import { findHint, judgeMove, type Hint, type Judgement } from "./coach/hints";
import { adaptiveSystem, profile, record } from "./coach/profile";
import { MATES, TACTICS } from "./learn/lessons-data";

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
  const settings = load("play", { level: 3, side: "white" as Side, bot: "marco", coach: true });
  let bots = [...BOTS];
  const findBot = (id: string) => bots.find((b) => b.id === id) ?? BOTS[3];
  let bot: Bot = findBot(settings.bot);
  // The bot a little above your estimated level, for a game that stretches you.
  const skill = profile().skill;
  const recommended = BOTS.reduce((a, b) => (Math.abs(b.rating - (skill + 100)) < Math.abs(a.rating - (skill + 100)) ? b : a));

  const chess = new Chess();
  let me: Color = "white";
  let phase: "pick" | "side" | "game" = "pick";
  let thinking = false;
  let over = false;
  let endNote = "";
  let said = "";

  // Coach state for the current position.
  let hint: Hint | null = null;
  let hintFen = "";
  let hintStep = 0; // how much of the hint is shown (0-3)
  let feedback: Judgement | null = null;
  let warnings = 0; // mistakes and blunders the coach flagged this game

  const boardEl = h("div", { class: "board" });
  const topBar = h("div", { class: "player-bar" });
  const bottomBar = h("div", { class: "player-bar" });
  const panel = h("aside", { class: "panel play-panel" });
  const moves = h("div", { class: "moves" });
  const status = h("div", { class: "status" });
  const coachBox = h("div", { class: "coach-box" });

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
        const tile = h("button", { class: `bot-tile${b.id === bot.id ? " on" : ""}`, type: "button", title: `${b.name} (${b.rating})` },
          botAvatar(b, 56), h("span", {}, b.name), b === recommended ? h("i", { class: "rec", title: "A good challenge at your level" }, "For you") : "");
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
      coachToggle(),
      button("Play", startGame, "primary wide big"),
      back,
    ];
  }

  function coachToggle() {
    const box = h("input", { type: "checkbox" }) as HTMLInputElement;
    box.checked = settings.coach;
    box.onchange = () => {
      settings.coach = box.checked;
      save("play", settings);
      if (phase === "game") {
        if (settings.coach) refreshHint();
        else ((hint = null), (feedback = null), renderCoach(), board.setAutoShapes([]));
      }
    };
    return h("label", { class: "toggle coach-toggle" }, box, icon("GraduationCap", 16), "Coach: point out tactics, threats and mistakes");
  }

  function gamePanel() {
    const ended = over;
    return [
      h("div", { class: "bot-mini" }, botAvatar(bot, 40), h("div", {}, h("b", {}, bot.name), h("span", { class: "bot-rating" }, String(bot.rating))), h("div", { class: "bubble small" }, said)),
      status,
      settings.coach ? coachBox : "",
      moves,
      ended
        ? h("div", { class: "row" }, button("Rematch", () => startGame(), "primary"), button("New bot", () => ((phase = "pick"), (said = bot.hello), render())))
        : h("div", { class: "row" }, button("Take back", takeBack), button("Hint", showHint), button("Flip", () => board.toggleOrientation()), button("Resign", resign)),
      analyseBtn,
      coachToggle(),
      settings.coach ? aiCoach.el : "",
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
    } else {
      sync();
      renderCoach();
    }
  }

  // ---------- coach ----------

  const LESSONS = new Map([...TACTICS, ...MATES].map((l) => [l.key, l.title]));

  /** Look at the position on your turn; tactics and threats are mentioned straight away. */
  function refreshHint() {
    hint = null;
    hintStep = 0;
    const fen = chess.fen();
    hintFen = fen;
    if (!settings.coach || over || colorOf(chess.turn()) !== me) return renderCoach();
    renderCoach();
    findHint(fen).then((hn) => {
      if (fen !== chess.fen() || phase !== "game") return;
      hint = hn;
      if (hn && hn.kind !== "quiet") hintStep = 1;
      renderCoach();
    });
  }

  async function showHint() {
    if (thinking || over || colorOf(chess.turn()) !== me) return;
    if (!hint || hintFen !== chess.fen()) {
      const fen = chess.fen();
      hintFen = fen;
      hint = await findHint(fen);
      if (fen !== chess.fen()) return;
    }
    hintStep = Math.min(3, hintStep + 1);
    renderCoach();
  }

  function hintShapes(): DrawShape[] {
    if (!hint || hintStep < 2 || hintFen !== chess.fen()) return [];
    const shapes: DrawShape[] = [{ orig: hint.square, brush: hint.kind === "threat" ? "red" : "green" }];
    if (hintStep >= 3) {
      if (hint.threat) shapes.push({ orig: hint.threat.from, dest: hint.threat.to, brush: "red" });
      shapes.push({ orig: hint.best.from, dest: hint.best.to, brush: "green" });
    }
    return shapes;
  }

  function renderCoach() {
    const parts: (Node | string)[] = [];
    if (feedback) {
      const row = h("div", { class: `coach-feedback ${feedback.verdict}` }, h("i", { class: `mark ${feedback.verdict}` }, MARK[feedback.verdict]), h("span", {}, feedback.text));
      if (feedback.verdict === "blunder" && !over) row.append(button("Take back", takeBack, "small"));
      parts.push(row);
    }
    if (hint && hintStep > 0 && hintFen === chess.fen()) {
      const icons = { mate: "Crown", tactic: "Lightbulb", threat: "TriangleAlert", quiet: "Compass" } as const;
      const body = h("div", { class: `coach-hint ${hint.kind}` }, icon(icons[hint.kind], 18), h("div", {}, ...hint.steps.slice(0, hintStep).map((s) => h("p", {}, s))));
      parts.push(body);
      const actions = h("div", { class: "row" });
      if (hintStep < 3) actions.append(button("Show me more", showHint, "small"));
      if (hintStep >= 3 && hint.lesson && LESSONS.has(hint.lesson)) {
        actions.append(h("a", { class: "btn small", href: `#learn/lesson/${hint.lesson}` }, icon("Dumbbell", 14), `Practise ${LESSONS.get(hint.lesson)!.toLowerCase()}`));
      }
      if (actions.childElementCount) parts.push(actions);
    } else if (!over && !thinking && colorOf(chess.turn()) === me && !feedback) {
      parts.push(h("div", { class: "muted small" }, "Press Hint if you'd like a nudge."));
    }
    coachBox.replaceChildren(...parts);
    if (phase === "game" && !thinking) board.setAutoShapes(hintShapes());
  }

  const aiCoach = coachPanel({
    context: async () => {
      const fen = chess.fen();
      const res = await engine().search(fen, { depth: 14, multipv: 3 });
      return [
        `I'm playing ${me} against a bot (${bot.name}, about ${bot.rating}).`,
        `Moves so far: ${chess.history().join(" ") || "none"}`,
        describePosition(fen),
        describeLines(fen, res?.lines ?? []),
        hint && hintFen === fen ? `The engine coach's hint for this position: ${hint.steps.join(" ")}` : "",
        feedback ? `Its verdict on my last move: ${feedback.text}` : "",
      ].filter(Boolean).join("\n");
    },
    actions: () => [
      { label: "Explain the hint", prompt: "Explain the idea behind the hint in this position, so I learn to spot it myself next time. Don't just give the move." },
      { label: "Explain my last move", prompt: "Was my last move good? Explain what it did and what I should look for instead, in plain English." },
      { label: "What's the plan?", prompt: "What should I be aiming for in this position over the next few moves?" },
    ],
    placeholder: "Ask the coach about this game…",
    system: adaptiveSystem,
  });

  // ---------- game ----------

  function startGame() {
    engine().stop();
    chess.reset();
    over = false;
    endNote = "";
    thinking = false;
    said = bot.hello;
    feedback = null;
    warnings = 0;
    me = settings.side === "random" ? (Math.random() < 0.5 ? "white" : "black") : settings.side;
    phase = "game";
    board.set({ orientation: me });
    board.setAutoShapes([]);
    engine().newGame();
    render();
    refreshHint();
    engineMove();
  }

  async function userMove(from: Square, to: Square) {
    let promotion: string | undefined;
    if (isPromotion(chess, from, to)) {
      promotion = (await askPromotion(boardEl, to, me, me)) ?? undefined;
      if (!promotion) return sync();
    }
    const before = chess.fen();
    const m = chess.move({ from, to, promotion });
    hint = null;
    feedback = null;
    apply(m);
    if (settings.coach) {
      const after = chess.fen();
      const ply = chess.history().length;
      judgeMove(before, uciOf(m), after).then((j) => {
        if (!j || chess.history().length < ply || phase !== "game") return; // taken back or new game
        feedback = j;
        if (j.verdict === "mistake" || j.verdict === "blunder") warnings++;
        renderCoach();
      });
    }
    engineMove();
  }

  function apply(m: Move) {
    soundFor(chess, m);
    sync();
    renderCoach();
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
    refreshHint();
  }

  function takeBack() {
    if (thinking || over) return;
    chess.undo();
    if (colorOf(chess.turn()) !== me) chess.undo();
    feedback = null;
    sync();
    refreshHint();
  }

  function resign() {
    if (over || chess.history().length === 0) return;
    over = true;
    playSound("end");
    endNote = `You resigned — ${bot.name} wins`;
    said = bot.win;
    finish(0);
    render();
  }

  /** Save the result to your profile, which the Coach tab uses to estimate your level. */
  function finish(result: 1 | 0.5 | 0) {
    hint = null;
    if (chess.history().length < 4) return; // too short to say anything
    record.game({ bot: bot.name, botRating: bot.rating, result, moves: Math.ceil(chess.history().length / 2), coachWarnings: warnings });
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
    board.setAutoShapes(thinking ? [] : hintShapes());
    const hist = chess.history();
    renderMoves(moves, hist, hist.length);
    bars(me);

    const end = endNote || result();
    status.className = `status${end ? " over" : ""}`;
    status.textContent = end || (thinking ? `${bot.name} is thinking…` : colorOf(chess.turn()) === me ? (chess.inCheck() ? "Check! Your move" : "Your move") : "");
    analyseBtn.disabled = hist.length === 0;
    if (over && !wasOver) {
      // The game just ended: the bot reacts, the result is saved, and the buttons switch to Rematch / New bot.
      const mated = chess.isCheckmate();
      const iLost = mated && colorOf(chess.turn()) === me;
      said = mated ? (iLost ? bot.win : bot.lose) : "A draw. Fair enough!";
      finish(mated ? (iLost ? 0 : 1) : 0.5);
      render();
    }
  }

  const MARK = { best: "★", good: "✓", inaccuracy: "?!", mistake: "?", blunder: "??" };

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
