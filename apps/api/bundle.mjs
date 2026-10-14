// Builds apps/api/deploy: one bundled index.js (our code + @pinnacle/shared) plus a package.json listing the
// runtime libraries, which Cloud Build installs. Run by `firebase deploy` (see firebase.json predeploy).
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const external = ["fastify", "firebase-admin", "firebase-functions", "mongodb"];
const out = new URL("./deploy/", import.meta.url).pathname;

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
await build({ entryPoints: ["src/function.ts"], bundle: true, platform: "node", target: "node22", format: "esm", outfile: `${out}index.js`, external });
writeFileSync(
  `${out}package.json`,
  JSON.stringify({ name: "oyster-crm-api", private: true, type: "module", main: "index.js", engines: { node: "22" }, dependencies: Object.fromEntries(external.map((d) => [d, pkg.dependencies[d]])) }, null, 2),
);
// The Firebase CLI loads the code locally to find the function, so the libraries must be installed here too.
execSync("npm install --omit=dev --no-audit --no-fund --loglevel=error", { cwd: out, stdio: "inherit" });
console.log("bundled → apps/api/deploy");
