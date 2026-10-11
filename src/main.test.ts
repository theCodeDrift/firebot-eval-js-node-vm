import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import type { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import type { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import { describe, expect, it, vi } from "vitest";

import { bundle, OUTPUT } from "../scripts/bundle.js";
import { EFFECT_ID } from "./eval-js-effect.js";

type Effect = Effects.EffectType<{ code: string; parameters?: string[] }>;

// Builds the bundle the way `pnpm build` does and loads it the way Firebot
// does, with a bare require, so the test covers the shape Firebot sees as well
// as the TypeScript.
async function loadBundle(): Promise<Firebot.CustomScript> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eval-js-node-vm-"));
  const outfile = path.join(directory, OUTPUT);
  await bundle(outfile);
  return createRequire(import.meta.url)(outfile) as Firebot.CustomScript;
}

function fakeModules() {
  const registered = new Map<string, Effect>();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const effectManager = {
    registerEffect: (effect: Effect) =>
      registered.set(effect.definition.id, effect),
    unregisterEffect: (id: string) => registered.delete(id),
  };
  return { registered, logger, modules: { effectManager, logger } };
}

const trigger = (metadata: Record<string, unknown> = {}) =>
  ({ type: "manual", metadata }) as unknown as Parameters<
    Effect["onTriggerEvent"]
  >[0]["trigger"];

async function fire(effect: Effect, code: string, parameters: string[] = []) {
  return effect.onTriggerEvent({
    effect: { code, parameters },
    trigger: trigger({ username: "codedrift" }),
    sendDataToOverlay: () => {},
    abortSignal: new AbortController().signal,
  });
}

type RunRequest = Parameters<Firebot.CustomScript["run"]>[0];

async function started() {
  const script = await loadBundle();
  const fake = fakeModules();
  await script.run({ modules: fake.modules } as unknown as RunRequest);
  return { script, ...fake, effect: fake.registered.get(EFFECT_ID)! };
}

describe("the bundled script", () => {
  it("registers the effect on run and removes it on stop", async () => {
    const { script, registered } = await started();

    expect(script.getScriptManifest()).toMatchObject({
      startupOnly: true,
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
    expect([...registered.keys()]).toEqual([EFFECT_ID]);

    script.stop?.();
    expect(registered.size).toBe(0);
  });

  it("evaluates code into the jsResult output", async () => {
    const { effect } = await started();
    await expect(
      fire(effect, "return parameters[0] + ' ' + metadata.username;", ["hi"]),
    ).resolves.toEqual({
      success: true,
      outputs: { jsResult: "hi codedrift" },
    });
  });

  it("logs a failing script and reports failure", async () => {
    const { effect, logger } = await started();
    await expect(fire(effect, 'throw new Error("boom");')).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("routes the script's console into Firebot's log", async () => {
    const { effect, logger } = await started();
    await fire(effect, 'console.log("count", 3);');
    expect(logger.info).toHaveBeenCalledWith("(evalJS vm) count 3");
  });

  it("gives scripts the host's fetch", async () => {
    const { effect } = await started();
    await expect(fire(effect, "return typeof fetch;")).resolves.toMatchObject({
      outputs: { jsResult: "function" },
    });
  });
});
