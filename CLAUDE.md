# firebot-eval-js-node-vm

A Firebot startup script that registers an Evaluate JavaScript (vm) effect. See `README.md` for what it does and why.

## Constraints

- The build produces one self-contained CommonJS file, since Firebot loads exactly one file per script. `scripts/bundle.ts` is the only esbuild config. The build and `src/main.test.ts` both use it.
- Don't change `EFFECT_ID` (`ohai:eval-js`). Every effect configured in Firebot points at it.
- `optionsController` in `src/eval-js-effect.ts` gets shipped to Firebot's Angular frontend as source, so it can't reference anything imported.
- `src/engine.ts` is the package's public export (`firebot-eval-js-node-vm/engine`), and ohai's test harness depends on it. Keep it free of dependencies.

## Checks

Run all of these before calling a change done:

```bash
pnpm typecheck
pnpm test
pnpm format:check
```

## Git commits

- Always run `git commit` with `-S`. If signing fails, offer the commit message instead.
- Never add AI attribution, co-author trailers, session ids, or transcript links.
