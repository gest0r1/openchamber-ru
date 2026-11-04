# Tool timing export evidence

Scope: Markdown tool timing follow-up in commit e531696 and subsequent review fixes.

- Wire source fields: `time.ran` is the execution start; `time.completed` is the end. Projection still supplies legacy fallback numbers for UI compatibility, while recording whether each endpoint was measured.
- Export omits endpoints and duration when projection used `created` / `end=start` fallbacks. Real persisted endpoints, including equal endpoints (0 ms), remain exportable.
- Running calls export a duration snapshot only when start is measured and not after the export clock. The block marks `duration_source=export_snapshot`, `duration_final=false`, records `duration_generated_at`, and leaves `completed_at=unavailable`. Future starts return unavailable duration plus `duration_clock_skew_ms`.
- Interrupted recovery supplies an observed end timestamp and marks that endpoint measured.
- Regression coverage exercises wire projection through Markdown in test `projects real wire timings through Markdown without treating fallbacks as measured` for unknown fallback, valid 0 ms, 1,726,500 ms, and error; projection tests assert provenance for pending/running/error. Export tests cover running snapshot and clock skew. Interrupted-turn test asserts observed end provenance.
- Native Bun/UI tests, typecheck, and build have **not** run: Bun was not found in PATH or searched install locations; workspace checkout/dependencies unavailable. This is not a native test pass.
- Next step: run `bun test packages/ui/src/lib/exportSession*.test.ts packages/ui/src/lib/opencode/projection.test.ts packages/ui/src/sync/__tests__/interrupted-turn-tools.test.ts`, then typecheck/build in an isolated checkout before integration.
