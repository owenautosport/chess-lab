// Copies Stockfish builds from node_modules into public/engine before dev/build.
// Lite (1.8 MB) plays and drills; the full NNUE build (99 MB) powers Analysis and Game Review.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

mkdirSync("public/engine", { recursive: true });
for (const name of ["stockfish-19-lite-single", "stockfish-19-single"])
  for (const ext of [".js", ".wasm"]) {
    const dest = `public/engine/${name}${ext}`;
    if (!existsSync(dest)) copyFileSync(`node_modules/stockfish/bin/${name}${ext}`, dest);
  }
