import { defineConfig } from "vite";

// The dev server relays chess.com's public API so the browser never needs
// cross-origin access to it.
const chesscom = {
  target: "https://api.chess.com",
  changeOrigin: true,
  rewrite: (p: string) => p.replace(/^\/chesscom/, ""),
  headers: { "User-Agent": "chess-lab (personal training app)" },
};

export default defineConfig({
  server: { proxy: { "/chesscom": chesscom } },
  preview: { proxy: { "/chesscom": chesscom } },
});
