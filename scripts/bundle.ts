// The one esbuild configuration, shared by the build and by the test that loads
// the bundle the way Firebot does.
//
// Firebot loads a script with a bare `require` and uses `module.exports` as the
// script object, so the default export is lifted onto it in the footer.

import fs from "node:fs";
import path from "node:path";

import { build } from "esbuild";

export const OUTPUT = "firebot-eval-js-node-vm.js";

const root = path.join(import.meta.dirname, "..");
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
) as { version: string };

export async function bundle(outfile: string): Promise<void> {
  await build({
    entryPoints: [path.join(root, "src/main.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    define: { VERSION: JSON.stringify(version) },
    footer: { js: "module.exports = module.exports.default;" },
    logLevel: "warning",
  });
}
