// Bundles the script into the single CommonJS file Firebot loads, and copies it
// into the Firebot profile's scripts folder when there is one. Run with
// `pnpm build`.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bundle, OUTPUT } from "./bundle.js";

// FIREBOT_SCRIPTS_DIR wins; otherwise the default macOS profile.
const firebotScripts =
  process.env.FIREBOT_SCRIPTS_DIR ??
  path.join(
    os.homedir(),
    "Library/Application Support/Firebot/v5/profiles/Main/scripts",
  );

const outfile = path.join(import.meta.dirname, "..", "dist", OUTPUT);

await bundle(outfile);
console.log(`built ${path.relative(process.cwd(), outfile)}`);

if (fs.existsSync(firebotScripts)) {
  fs.copyFileSync(outfile, path.join(firebotScripts, OUTPUT));
  console.log(`copied to ${firebotScripts}`);
} else {
  console.log(
    `no Firebot scripts folder at ${firebotScripts}; set FIREBOT_SCRIPTS_DIR to copy`,
  );
}
