#!/usr/bin/env node
/**
 * Patch yoga-wasm-web/dist/node.js to use the ASM.js version.
 *
 * Only needed on Linux: Bun's compiled binary (bun build --compile) cannot
 * load yoga.wasm via fs.readFile because the virtual filesystem (/$bunfs/root/)
 * is not accessible to the host OS at runtime. The ASM.js version is
 * self-contained JS with no external file dependency.
 *
 * On Windows/macOS, bun run works fine without this patch — skip silently.
 * This runs automatically after `bun install` via the `postinstall` script.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

// Only needed for Linux compiled binaries
if (process.platform !== "linux") {
  process.exit(0);
}

const nodePath = fileURLToPath(new URL("../node_modules/yoga-wasm-web/dist/node.js", import.meta.url));

if (!existsSync(nodePath)) {
  // yoga-wasm-web not installed yet — bun install will retry postinstall
  process.exit(0);
}

const content = readFileSync(nodePath, "utf8");

if (content.includes("asmInit")) {
  // Already patched
  process.exit(0);
}

// Extract the shared enum re-export block present in both node.js and asm.js
const enumMatch = content.match(/export\{A as ALIGN_AUTO.*?\}from"\.\/wrapAsm-f766f97f\.js";/);
if (!enumMatch) {
  console.error("patch-yoga: could not find enum export block — skipping patch");
  process.exit(0);
}

const patched = `${enumMatch[0]}
import asmInit from"./asm.js";const Yoga=asmInit();export{Yoga as default};`;

writeFileSync(nodePath, patched);
console.log("patch-yoga: patched yoga-wasm-web/dist/node.js to use ASM.js");
