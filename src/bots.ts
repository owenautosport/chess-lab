// The bot line-up for Play: each bot is a Stockfish strength (or a Maia rating) with a face and a voice.
import { h } from "./board";
import { piece } from "./ui/visuals";

export type Bot = {
  id: string;
  name: string;
  rating: number; // rough Elo, for picking
  group: string;
  color: string; // avatar background
  role: string; // piece shown on the avatar
  pieceColor: "white" | "black";
  hello: string;
  win: string; // said when the bot wins
  lose: string; // said when you win
  // Engine settings: Stockfish skill + limits, or a Maia net.
  skill?: number;
  depth?: number;
  movetime?: number;
  maia?: number;
};

export const BOTS: Bot[] = [
  { id: "pip", name: "Pip", rating: 250, group: "Beginner", color: "#6fb3e0", role: "pawn", pieceColor: "white", skill: 0, depth: 1,
    hello: "Hi! I only just learned how the pieces move. Go easy on me?", win: "Wait… did I just win?!", lose: "Good game! I'll practise more." },
  { id: "bea", name: "Bea", rating: 400, group: "Beginner", color: "#e88fb0", role: "knight", pieceColor: "white", skill: 2, depth: 2,
    hello: "I love moving my knights. They jump!", win: "Hooray, my knights did it!", lose: "You got me. Well played!" },
  { id: "casey", name: "Casey", rating: 700, group: "Intermediate", color: "#f0b44c", role: "bishop", pieceColor: "black", skill: 5, depth: 3,
    hello: "I play at the park every Sunday. Let's see what you've got.", win: "Sunday practice pays off.", lose: "Nice one. I'll get you next time." },
  { id: "marco", name: "Marco", rating: 1000, group: "Intermediate", color: "#8bc34a", role: "rook", pieceColor: "black", skill: 8, depth: 5,
    hello: "Control the centre, castle early. That's my whole plan.", win: "Solid chess wins games.", lose: "Ha, you out-played me there." },
  { id: "nadia", name: "Nadia", rating: 1300, group: "Intermediate", color: "#ab7fd8", role: "queen", pieceColor: "white", skill: 11, depth: 8,
    hello: "Club captain. I don't give away free pieces.", win: "Tactics decide games.", lose: "Impressive. You'd make my club team." },
  { id: "viktor", name: "Viktor", rating: 1600, group: "Advanced", color: "#e0634f", role: "rook", pieceColor: "white", skill: 14, depth: 10,
    hello: "I've studied my openings. Have you?", win: "Preparation wins.", lose: "Hmm. I need to look at that game again." },
  { id: "grace", name: "Grace", rating: 2000, group: "Advanced", color: "#3f8f8a", role: "king", pieceColor: "white", skill: 17, depth: 13,
    hello: "Every move has a reason. Let's play a proper game.", win: "A clean game. Review it and you'll see why.", lose: "Very strong play. Congratulations." },
  { id: "stockfish", name: "Stockfish", rating: 3200, group: "Master", color: "#2b2b2b", role: "king", pieceColor: "black", skill: 20, movetime: 1500,
    hello: "Full strength. No mercy.", win: "As calculated.", lose: "…that shouldn't be possible." },
];

const MAIA_COLORS = ["#7c6bc4", "#6a5bb3", "#5b4ea2", "#4d4291", "#403780"];

/** Human-like opponents, one per Maia network that's installed (desktop app only). */
export function maiaBots(elos: number[]): Bot[] {
  return elos.map((e, i) => ({
    id: `maia${e}`, name: `Maia ${e}`, rating: e, group: "Human-like", color: MAIA_COLORS[i % MAIA_COLORS.length],
    role: "pawn", pieceColor: "white", maia: e,
    hello: `I play like a real ${e}-rated human — including the mistakes they make.`, win: "That's how people at my level win!", lose: "Good game — you beat a human-style player.",
  }));
}

export function botAvatar(bot: Bot, size = 48, cls = "") {
  const el = h("span", { class: `bot-avatar ${cls}`.trim() }, piece(bot.pieceColor, bot.role, Math.round(size * 0.78)));
  el.style.background = bot.color;
  el.style.width = el.style.height = `${size}px`;
  return el;
}
