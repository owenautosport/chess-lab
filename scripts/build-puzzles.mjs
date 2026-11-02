// Builds public/data/puzzles.json from a slice of the Lichess puzzle CSV (CC0).
//   curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | head -n 200001 > head.csv
//   node scripts/build-puzzles.mjs head.csv
import { readFileSync, writeFileSync } from "node:fs";

const PER_BUCKET = 400; // puzzles kept per 100-point rating band
const PER_THEME = 80; // minimum per theme, so Learn lessons on rare patterns have enough practice
const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/build-puzzles.mjs <puzzles.csv>");

const buckets = new Map();
const byTheme = new Map(); // looser quality bar, used only to top up rare themes
for (const line of readFileSync(src, "utf8").split("\n").slice(1)) {
  const [id, fen, moves, rating, rd, pop, plays, themes] = line.split(",");
  if (!id) continue;
  const row = [id, fen, moves, +rating, themes];
  if (+rd <= 90 && +pop >= 80 && +plays >= 200) for (const t of themes.split(" ")) byTheme.set(t, [...(byTheme.get(t) ?? []), row]);
  if (+rd > 90 || +pop < 85 || +plays < 300) continue;
  const band = Math.floor(+rating / 100);
  const list = buckets.get(band) ?? [];
  if (list.length < PER_BUCKET) list.push(row);
  buckets.set(band, list);
}

const picked = new Map([...buckets.values()].flat().map((r) => [r[0], r]));
for (const rows of byTheme.values()) {
  const have = rows.filter((r) => picked.has(r[0])).length;
  if (have >= PER_THEME) continue;
  // Spread the top-up evenly across the theme's rating range.
  const sorted = rows.filter((r) => !picked.has(r[0])).sort((a, b) => a[3] - b[3]);
  const need = Math.min(PER_THEME - have, sorted.length);
  for (let i = 0; i < need; i++) {
    const r = sorted[Math.floor((i * sorted.length) / need)];
    picked.set(r[0], r);
  }
}

const out = [...picked.values()].sort((a, b) => a[3] - b[3]);
writeFileSync("public/data/puzzles.json", JSON.stringify(out));
console.log(`${out.length} puzzles, ratings ${out[0][3]}–${out.at(-1)[3]}`);
