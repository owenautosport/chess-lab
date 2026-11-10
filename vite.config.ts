import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The dev server relays chess.com's public API so the browser never needs
// cross-origin access to it.
const chesscom = {
  target: "https://api.chess.com",
  changeOrigin: true,
  rewrite: (p: string) => p.replace(/^\/chesscom/, ""),
  headers: { "User-Agent": "chess-lab (personal training app)" },
};

export default defineConfig({
  // GitHub Pages serves the site from /chess-lab/; the desktop app and dev server use /.
  base: process.env.PAGES_BASE ?? "/",
  // The app shows its version (from package.json) in Settings → About.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { proxy: { "/chesscom": chesscom } },
  preview: { proxy: { "/chesscom": chesscom } },
});
