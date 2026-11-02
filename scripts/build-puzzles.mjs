// Builds public/data/puzzles.json from a slice of the Lichess puzzle CSV (CC0).
//   curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | head -n 200001 > head.csv
//   node scripts/build-puzzles.mjs head.csv
import { readFileSync, writeFileSync } from "node:fs";

const PER_BUCKET = 400; // puzzles kept per 100-point rating band
const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/build-puzzles.mjs <puzzles.csv>");

const buckets = new Map();
for (const line of readFileSync(src, "utf8").split("\n").slice(1)) {
  const [id, fen, moves, rating, rd, pop, plays, themes] = line.split(",");
  if (!id) continue;
  if (+rd > 90 || +pop < 85 || +plays < 300) continue;
  const band = Math.floor(+rating / 100);
  const list = buckets.get(band) ?? [];
  if (list.length < PER_BUCKET) list.push([id, fen, moves, +rating, themes]);
  buckets.set(band, list);
}

const out = [...buckets.values()].flat().sort((a, b) => a[3] - b[3]);
writeFileSync("public/data/puzzles.json", JSON.stringify(out));
console.log(`${out.length} puzzles, ratings ${out[0][3]}–${out.at(-1)[3]}`);
