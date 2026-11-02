// Validates every opening line is legal and every note points at a real ply.
import { Chess } from "chess.js";
import { OPENINGS } from "../src/learn/openings-data.ts";

let bad = 0;
for (const o of OPENINGS)
  for (const l of o.lines) {
    const c = new Chess();
    const sans = l.moves.split(" ");
    for (const [i, san] of sans.entries()) {
      try {
        c.move(san);
      } catch {
        console.log(`✗ ${l.id}: ply ${i + 1} ${san} is illegal`);
        bad++;
        break;
      }
    }
    for (const k of Object.keys(l.notes)) if (+k < 1 || +k > sans.length) (console.log(`✗ ${l.id}: note on ply ${k} beyond line`), bad++);
    const userPlies = sans.length - (o.side === "white" ? Math.floor(sans.length / 2) : Math.ceil(sans.length / 2));
    console.log(`${bad ? " " : "✓"} ${o.side.padEnd(5)} ${l.id.padEnd(22)} ${sans.length} plies, ${userPlies} for you`);
  }
console.log(bad ? `${bad} problem(s)` : "all lines legal");
process.exit(bad ? 1 : 0);
