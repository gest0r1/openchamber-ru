# Tool timing export evidence

Scope: Markdown tool timing follow-up in commit e531696 and subsequent review fixes.

- Wire source fields: `time.ran` is the execution start; `time.completed` is the end. Projection still supplies legacy fallback numbers for UI compatibility, while recording whether each endpoint was measured.
- Export omits endpoints and duration when projection used `created` / `end=start` fallbacks. Real persisted endpoints, including equal endpoints (0 ms), remain exportable.
- Running calls export a duration snapshot only when start is measured and not after the export clock. The block marks `duration_source=export_snapshot`, `duration_final=false`, records `duration_generated_at`, and leaves `completed_at=unavailable`. Future starts return unavailable duration plus `duration_clock_skew_ms`.
- Interrupted recovery stores a local observed end with `endSource=interruption_observed`; export uses `observed_end_at`, marks duration censored, leaves `completed_at` unavailable, and does not claim final duration or overlap.
- Regression coverage exercises wire projection through Markdown in test `projects real wire timings through Markdown without treating fallbacks as measured` for unknown fallback, valid 0 ms, 1,726,500 ms, and error; projection tests assert provenance for pending/running/error. Export tests cover running snapshot and clock skew. Interrupted-turn test asserts observed end provenance.
- Native Bun/UI tests, typecheck, and build have **not** run: Bun was not found in PATH or searched install locations; workspace checkout/dependencies unavailable. This is not a native test pass.
- Next step: run `bun test packages/ui/src/lib/exportSession*.test.ts packages/ui/src/lib/opencode/projection.test.ts packages/ui/src/sync/__tests__/interrupted-turn-tools.test.ts`, then typecheck/build in an isolated checkout before integration.

## Executed check

- Source SHA: `8f350e52b8978611f8f5a43e0e1a1e7710a79016`.
- Command: `node --import /workspace/scratch/061630f1d1c5/openchamber-work/node_modules/tsx/dist/loader.mjs --input-type=module -e 'import assert from "node:assert/strict"; import {projectToolPart} from "./packages/ui/src/lib/opencode/projection.ts"; …'` from `/tmp/timing-snapshot`; executed actual materialized `projection.ts`, `model.ts`, and `modelIdentifier.ts`.
- Result: projection runtime PASS for pending, running without ran, unknown completed fallback, measured 0 ms, 1,726,500 ms, and error provenance.
- Exporter runtime attempt (from the same directory): `node --import /workspace/scratch/061630f1d1c5/openchamber-work/node_modules/tsx/dist/loader.mjs --input-type=module -e 'import {formatSessionAsMarkdown} from "./packages/ui/src/lib/exportSession.ts"; console.log(typeof formatSessionAsMarkdown)'` → NOT RUN: loader failed with `ERR_MODULE_NOT_FOUND` for `lib/i18n/messages/en` imported from `lib/i18n/store.ts`; the transitive source closure was 85 modules.
- Bun tests, typecheck/build, and sync-context/UI runtime: NOT RUN.
