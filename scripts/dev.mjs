/**
 * `npm run dev` — runs the indexer and the API together with prefixed,
 * colour-coded output. Zero dependencies; Ctrl+C stops both.
 *
 * Run them separately instead if you want independent restarts:
 *   npm run dev:indexer
 *   npm run dev:api
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const targets = [
  { name: "indexer", entry: "src/indexer/index.ts", color: "\x1b[36m" }, // cyan
  { name: "api", entry: "src/api/index.ts", color: "\x1b[35m" }, // magenta
  { name: "stats", entry: "src/workers/statistics.ts", color: "\x1b[33m" }, // yellow
];
const RESET = "\x1b[0m";

// Resolve tsx's CLI entry and run it with the current node binary. Avoids
// spawning npx / a .cmd shim (which throws EINVAL on recent Node for Windows).
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

const children = targets.map(({ name, entry, color }) => {
  const child = spawn(process.execPath, [tsxCli, "watch", entry], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  const tag = `${color}[${name}]${RESET} `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    process.stdout.write(`${tag}exited (code ${code})\n`);
    shutdown();
  });
  return child;
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill("SIGINT");
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
