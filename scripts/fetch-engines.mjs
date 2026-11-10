// Fetches the engines bundled into the desktop app (kept out of git), for the platform it runs on:
//   - lc0 (Leela Chess Zero), which runs the Maia networks.
//       macOS: copied from Homebrew (brew install lc0); it only links system frameworks.
//       Windows: the official CPU (OpenBLAS) build from LeelaChessZero/lc0's releases.
//   - Maia 1100–1900: small (~1.3 MB) human-like networks trained on Lichess games (GPL-3.0, CSSLab/maia-chess).
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LC0_VERSION = "v0.32.1";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const engines = path.join(root, "engines");
mkdirSync(path.join(engines, "maia"), { recursive: true });

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

if (process.platform === "darwin") {
  const lc0 = path.join(execSync("brew --prefix lc0").toString().trim(), "libexec", "lc0");
  if (!existsSync(lc0)) throw new Error("lc0 not found. Run: brew install lc0");
  copyFileSync(lc0, path.join(engines, "lc0"));
} else if (process.platform === "win32") {
  if (!existsSync(path.join(engines, "lc0.exe"))) {
    const zip = path.join(engines, "lc0.zip");
    await download(`https://github.com/LeelaChessZero/lc0/releases/download/${LC0_VERSION}/lc0-${LC0_VERSION}-windows-cpu-openblas.zip`, zip);
    // Windows 10+ ships bsdtar, which reads zips. Skip the bundled 18 MB default network: Maia brings its own.
    execFileSync("tar", ["-xf", zip, "-C", engines, "lc0.exe", "libopenblas.dll", "mimalloc-override.dll", "mimalloc-redirect.dll", "COPYING"]);
    rmSync(zip);
  }
} else {
  throw new Error("Desktop engines are only packaged for macOS and Windows.");
}

for (let elo = 1100; elo <= 1900; elo += 100) {
  const f = path.join(engines, "maia", `maia-${elo}.pb.gz`);
  if (!existsSync(f) || statSync(f).size === 0)
    await download(`https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights/maia-${elo}.pb.gz`, f);
}
console.log("Engines ready in", engines);
