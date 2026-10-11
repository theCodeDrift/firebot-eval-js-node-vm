import type {
  Firebot,
  ScriptModules,
} from "@crowbartools/firebot-custom-scripts-types";

import { EFFECT_ID, evalJsEffect } from "./eval-js-effect.js";

// Replaced at build time with the version in package.json.
declare const VERSION: string;

let modules: ScriptModules | undefined;

// A startup script: it only registers the effect, and the effect does the
// work. Everything registered in `run` is torn down in `stop`.
const script: Firebot.CustomScript = {
  getScriptManifest: () => ({
    name: "Evaluate JavaScript (vm)",
    description:
      "Evaluate JavaScript in a node:vm context, without the browser window per run that leaks in Firebot's own effect (crowbartools/Firebot#2950).",
    author: "codedrift",
    version: VERSION,
    firebotVersion: "5",
    startupOnly: true,
  }),

  getDefaultParameters: () => ({}),

  run: (runRequest) => {
    modules = runRequest.modules;
    modules.effectManager.registerEffect(evalJsEffect(modules.logger));
    modules.logger.info(`Registered ${EFFECT_ID}`);
  },

  stop: () => {
    modules?.effectManager.unregisterEffect(EFFECT_ID);
    modules = undefined;
  },
};

export default script;
