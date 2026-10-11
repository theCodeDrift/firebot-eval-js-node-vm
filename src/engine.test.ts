import { describe, expect, it } from "vitest";

import { compile, hostGlobals } from "./engine.js";

const globals = hostGlobals(console);
const run = <T>(source: string, parameters: unknown[] = [], timeoutMs = 200) =>
  compile<T>(source, globals, timeoutMs)(parameters);

describe("the Firebot contract", () => {
  it("takes parameters and a top-level return", async () => {
    await expect(run("return parameters[0] * 2;", [21])).resolves.toBe(42);
  });

  it("passes the trigger metadata through", async () => {
    const evaluate = compile<string>("return metadata.username;", globals);
    await expect(
      evaluate([], { metadata: { username: "codedrift" } }),
    ).resolves.toBe("codedrift");
  });

  it("allows top-level await", async () => {
    await expect(run("return await Promise.resolve(7);")).resolves.toBe(7);
  });

  it("rejects with the script's own error", async () => {
    await expect(run('throw new Error("boom");')).rejects.toThrow("boom");
  });

  it("throws a syntax error at compile time, not on first run", () => {
    expect(() => compile("return (;", globals)).toThrow(SyntaxError);
  });
});

describe("isolation", () => {
  it("gives every run a fresh global object", async () => {
    const evaluate = compile<number>(
      "globalThis.count = (globalThis.count || 0) + 1; return globalThis.count;",
      globals,
    );
    await expect(evaluate([])).resolves.toBe(1);
    await expect(evaluate([])).resolves.toBe(1);
  });

  it("has no Node globals", async () => {
    await expect(run("return typeof process;")).resolves.toBe("undefined");
    await expect(run("return typeof require;")).resolves.toBe("undefined");
  });
});

describe("limits", () => {
  it("interrupts a runaway synchronous loop", async () => {
    await expect(run("while (true) {}", [], 50)).rejects.toThrow(/timed out/);
  });

  it("stops waiting on a script that never settles", async () => {
    await expect(run("await new Promise(() => {});", [], 50)).rejects.toThrow(
      "eval timed out",
    );
  });

  it("stops waiting when Firebot aborts the effect", async () => {
    const controller = new AbortController();
    const pending = compile("await new Promise(() => {});", globals)([], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow("eval aborted");
  });
});
