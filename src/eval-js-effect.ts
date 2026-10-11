import { format } from "node:util";

import type { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import type { Logger } from "@crowbartools/firebot-custom-scripts-types/types/modules/logger";

import { compile, hostGlobals } from "./engine.js";

// Firebot ties every configured effect to this id, so it keeps the name it was
// first installed under in ohai. Changing it orphans every effect already set up.
export const EFFECT_ID = "ohai:eval-js";

type Model = { code: string; parameters?: string[] };

// Firebot's sandbox routed the window's console into its log with this prefix;
// keeping it means a search of the log finds both effects' lines.
const line = (args: unknown[]) => `(evalJS vm) ${format(...args)}`;

function firebotConsole(logger: Logger): Console {
  return {
    log: (...args: unknown[]) => logger.info(line(args)),
    info: (...args: unknown[]) => logger.info(line(args)),
    debug: (...args: unknown[]) => logger.debug(line(args)),
    warn: (...args: unknown[]) => logger.warn(line(args)),
    error: (...args: unknown[]) => logger.error(line(args)),
  } as Console;
}

// A drop-in for firebot:eval-js. The model, the options UI and the `jsResult`
// output are the same, so moving a script over is a matter of re-adding it
// under this effect; `$effectOutput[jsResult]` references keep working.
export function evalJsEffect(logger: Logger): Effects.EffectType<Model> {
  const globals = { ...hostGlobals(firebotConsole(logger)), fetch };

  return {
    definition: {
      id: EFFECT_ID,
      name: "Evaluate JavaScript (vm)",
      description:
        "Evaluate a JavaScript expression in a node:vm context instead of a browser window",
      icon: "fab fa-js",
      categories: ["advanced", "scripting"],
      dependencies: [],
      outputs: [
        {
          label: "Code Result",
          defaultName: "jsResult",
          description:
            "The result of the JavaScript code. Note you must use 'return' for a result to be captured.",
        },
      ],
    },
    optionsTemplate: `
    <eos-container header="Code">
        <div
            ui-codemirror="{onLoad : codemirrorLoaded}"
            ui-codemirror-opts="editorSettings"
            ng-model="effect.code"
            replace-variables
            menu-position="under">
        </div>
    </eos-container>

    <eos-container header="Parameters" pad-top="true">
        <editable-list settings="parameterSettings" model="effect.parameters" />
    </eos-container>

    <eos-container>
        <div class="effect-info alert alert-info">
            Things to note:
            <ul>
                <li>JavaScript runs in a node:vm context in Firebot's main process, a fresh one per run</li>
                <li>You must use <code>return</code> to have a result captured as the output</li>
                <li>Parameters can be accessed via <code>parameters[n]</code></li>
                <li>Trigger metadata can be accessed via <code>metadata.*</code></li>
                <li><code>Firebot.*</code> is not available</li>
            </ul>
        </div>
    </eos-container>
    `,
    // Firebot ships this function to its Angular frontend as source, so it
    // may only reference what exists there — nothing imported into this file.
    optionsController: ($scope) => {
      const scope = $scope as unknown as Record<string, unknown>;
      scope.editorSettings = {
        mode: "javascript",
        theme: "blackboard",
        lineNumbers: true,
        autoRefresh: true,
        showGutter: true,
      };
      scope.parameterSettings = {
        sortable: true,
        showIndex: true,
        indexZeroBased: true,
        indexTemplate: "parameters[{index}]",
      };
      scope.codemirrorLoaded = (editor: { refresh: () => void }) => {
        editor.refresh();
      };
    },
    optionsValidator: (effect) =>
      effect.code == undefined ? ["Please enter some JavaScript code."] : [],
    onTriggerEvent: async ({ effect, trigger, abortSignal }) => {
      try {
        const result = await compile(effect.code ?? "", globals)(
          effect.parameters ?? [],
          { metadata: trigger.metadata, signal: abortSignal },
        );
        return { success: true, outputs: { jsResult: result } };
      } catch (error) {
        logger.error(`Error evaluating JavaScript (vm): ${String(error)}`);
        return false;
      }
    },
  };
}
