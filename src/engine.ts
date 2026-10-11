// The evaluation engine behind the "Evaluate JavaScript (vm)" effect. It's also
// exported on its own, so a test harness can run scripts under the same engine
// the effect uses and see the same globals.
//
// Firebot's own Evaluate JavaScript effect runs each evaluation in a hidden
// BrowserWindow on a freshly named session partition, and Electron never frees
// a partition (crowbartools/Firebot#2950). A script on a loop leaked tens of
// thousands of handles until every Chromium surface, OBS overlays included,
// stopped working. A `node:vm` context is an ordinary object, so a finished
// evaluation is garbage collected like anything else.
//
// The contract matches Firebot's so scripts move over unchanged: the source is
// the body of an async function, `parameters` is the effect's parameter list,
// `metadata` is the trigger metadata, and a top-level `return` is the result.
// `Firebot.*` isn't provided.
//
// `node:vm` is not a security boundary. That is fine for scripts we write and
// paste ourselves, which is the only thing this runs.

import vm from "node:vm";

// Firebot's sandbox gives an evaluation 15s, so this does too.
export const TIMEOUT_MS = 15_000;

// A vm context already has the language built-ins (JSON, Math, Promise, ...)
// from its own realm. These are the host APIs Firebot's browser sandbox had
// that the scripts here use, minus `fetch`, which the caller decides on: the
// effect hands over the real one, and tests hand over a stub or nothing.
export function hostGlobals(console: Console): Record<string, unknown> {
  return {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    URLSearchParams,
    atob,
    btoa,
  };
}

export type Evaluate<T = unknown> = (
  parameters: unknown[],
  options?: { metadata?: unknown; signal?: AbortSignal },
) => Promise<T>;

// The trailing newline matters: without it a source ending in a `//` comment
// would swallow the closing brace.
const wrap = (source: string) =>
  `(async function (parameters, metadata) {\n${source}\n})`;

// Compiles once, so a syntax error throws here rather than on first run, then
// gives every evaluation a fresh context. Nothing a script leaves on the global
// object survives into the next run, which is also how Firebot's per-run
// window behaved.
export function compile<T = unknown>(
  source: string,
  globals: Record<string, unknown>,
  timeoutMs = TIMEOUT_MS,
): Evaluate<T> {
  const script = new vm.Script(wrap(source));

  return (parameters, { metadata = {}, signal } = {}) =>
    new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("eval aborted"));
        return;
      }

      const timer = setTimeout(
        () => finish(new Error("eval timed out")),
        timeoutMs,
      );
      const onAbort = () => finish(new Error("eval aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });

      // Errors from inside the context come from its realm, so they fail an
      // `instanceof Error` check out here; pass them through as they are.
      function finish(error: unknown, result?: T) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (error === undefined) resolve(result as T);
        else reject(error as Error);
      }

      try {
        const context = vm.createContext({ ...globals });
        context.__run = script.runInContext(context) as unknown;
        context.__parameters = parameters;
        context.__metadata = metadata;

        // The vm `timeout` option only bounds synchronous code, and calling
        // the function runs the script up to its first await synchronously.
        // Making the call inside the context, under the timeout, turns a
        // runaway loop there into a throw instead of a frozen Firebot. A loop
        // after an await cannot be interrupted; the timer above only stops
        // waiting on it.
        const pending = vm.runInContext(
          "__run(__parameters, __metadata)",
          context,
          { timeout: timeoutMs },
        ) as Promise<T>;

        pending.then(
          (result) => finish(undefined, result),
          (error: unknown) => finish(error ?? new Error("eval failed")),
        );
      } catch (error) {
        finish(error);
      }
    });
}
