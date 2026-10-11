# Evaluate JavaScript (vm) for Firebot

A [Firebot](https://github.com/crowbartools/Firebot) startup script that adds an **Evaluate JavaScript (vm)** effect. It runs the same code as Firebot's built-in Evaluate JavaScript, in a `node:vm` context.

Firebot's own effect runs every evaluation in a hidden `BrowserWindow` on a freshly named session partition, and Electron never frees a partition ([crowbartools/Firebot#2950](https://github.com/crowbartools/Firebot/issues/2950)). Run it often enough (a loop, or a trigger on every chat message) and it leaks tens of thousands of handles. Eventually every Chromium surface on the machine stops working, OBS browser sources included. This effect gives each run its own `node:vm` context, which is garbage collected like any other object once the run finishes.

## Installing

Build the bundle:

```bash
pnpm install
pnpm build
```

That writes `dist/firebot-eval-js-node-vm.js` and copies it into `~/Library/Application Support/Firebot/v5/profiles/Main/scripts` if that folder exists. Set `FIREBOT_SCRIPTS_DIR` to copy it somewhere else, such as the profile on your streaming machine:

```bash
FIREBOT_SCRIPTS_DIR="/path/to/Firebot/v5/profiles/Main/scripts" pnpm build
```

Then in Firebot, go to **Settings → Scripts**, turn on custom scripts, add `firebot-eval-js-node-vm.js` as a **startup script**, and restart Firebot.

If you installed this from ohai as `ohai-eval-js.js`, remove that file from the startup scripts when you add this one. Both register the same effect id (`ohai:eval-js`), so effects you already set up keep working.

## Moving a script over

The effect keeps Firebot's contract, so moving a script is a matter of adding it again under **Evaluate JavaScript (vm)**. References to `$effectOutput[jsResult]` keep working.

|                          | Firebot's effect                        | This effect                                          |
| ------------------------ | --------------------------------------- | ---------------------------------------------------- |
| Source                   | async function body, top-level `return` | same                                                 |
| `parameters`, `metadata` | yes                                     | yes                                                  |
| Output                   | `jsResult`                              | `jsResult`                                           |
| `$variables` in the code | expanded by Firebot                     | expanded by Firebot                                  |
| Time limit               | 15s                                     | 15s, and a synchronous runaway loop gets interrupted |
| `console.*`              | Firebot log, `($evalJS Sandbox)`        | Firebot log, `(evalJS vm)`                           |
| `fetch`                  | Chromium's                              | Node's                                               |
| `Firebot.*`              | yes                                     | no                                                   |
| Other browser APIs       | everything a window has                 | timers, `AbortController`, `URL`, `atob`/`btoa`      |

Each run gets a fresh global object, so nothing a script leaves on `globalThis` carries into the next run. That matches how Firebot's window-per-run behaved.

`node:vm` isn't a security boundary. Only run code you wrote or trust, the same as you would with Firebot's own effect.

## Testing your scripts on the same engine

The engine is exported on its own, so a test suite can run your Firebot scripts with the globals the effect gives them:

```ts
import { compile, hostGlobals } from "firebot-eval-js-node-vm/engine";

const evaluate = compile<number>(
  "return parameters[0] * 2;",
  hostGlobals(console),
);
await evaluate([21]); // 42
```

`hostGlobals` leaves out `fetch` so a test can pass a stub or nothing at all. The effect adds Node's real one. Install it straight from GitHub:

```bash
pnpm add -D github:theCodeDrift/firebot-eval-js-node-vm
```

The export is TypeScript source. Under Vitest, list the package in `server.deps.inline` so it gets transformed:

```ts
export default defineConfig({
  test: {
    server: { deps: { inline: ["firebot-eval-js-node-vm"] } },
  },
});
```

## Development

```bash
pnpm test           # vitest, including a test that builds the bundle and loads it like Firebot does
pnpm typecheck      # tsc
pnpm format:check   # prettier
pnpm build          # bundle to dist/ and copy into Firebot
```

## License

MIT
