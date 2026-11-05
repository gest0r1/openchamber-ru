# Tool timing export evidence

Scope: Markdown tool timing follow-up in commit e531696 and subsequent review fixes.

- Wire source fields: `time.ran` is the execution start; `time.completed` is the end. Projection still supplies legacy fallback numbers for UI compatibility, while recording whether each endpoint was measured.
- Export omits endpoints and duration when projection used `created` / `end=start` fallbacks. Real persisted endpoints, including equal endpoints (0 ms), remain exportable.
- Running calls export a duration snapshot only when start is measured and not after the export clock. The block marks `duration_source=export_snapshot`, `duration_final=false`, records `duration_generated_at`, and leaves `completed_at=unavailable`. Future starts return unavailable duration plus `duration_clock_skew_ms`.
- Interrupted recovery stores a local observed end with `endSource=interruption_observed`; export uses `observed_end_at`, marks duration censored, leaves `completed_at` unavailable, and does not claim final duration or overlap.
- Regression coverage exercises wire projection through Markdown in test `projects real wire timings through Markdown without treating fallbacks as measured` for unknown fallback, valid 0 ms, 1,726,500 ms, and error; projection tests assert provenance for pending/running/error. Export tests cover real wire error completion, running snapshot, clock skew, and censored interruption. Interrupted-turn test asserts running-start provenance false remains false while local interruption end is observed.
- Native Bun/UI tests, typecheck, and build have **not** run: Bun was not found in PATH or searched install locations; workspace checkout/dependencies unavailable. This is not a native test pass.
- Next step: run `bun test packages/ui/src/lib/exportSession*.test.ts packages/ui/src/lib/opencode/projection.test.ts packages/ui/src/sync/__tests__/interrupted-turn-tools.test.ts`, then typecheck/build in an isolated checkout before integration.

## Executed runtime check

- Exact tested source SHA: `647e7377ff2cf82b98d86681c3575cedbda75708`.
- Tested module blob SHAs:
  - `packages/ui/src/lib/opencode/projection.ts`: `5ab3e4deb992515a932d0716475b501a9dd397ea`
  - `packages/ui/src/lib/opencode/model.ts`: `a8e563c883316ed06fdf1afd339bdeefbd1bfcfb`
  - `packages/ui/src/lib/modelIdentifier.ts`: `32282a87a95691d63af56c4f8f7e77d911faf165`
  - `packages/ui/src/lib/exportSession.ts`: `0c2e520c27adedf364ad454891d55378cf5b8be7`
- Materialized the exact TypeScript runtime import closure (83 files, 3,932,258 characters) under `/tmp/timing-export-snapshot` from GitHub API file contents in chunks. No checkout was changed.
- To reproduce from the root of that materialized closure, save the following exact script as `export-check.mjs` and run the command shown below. The script directly imports the actual projection and exporter modules; it does not copy their implementations.

````mjs
import assert from "node:assert/strict";
import { projectToolPart } from "./packages/ui/src/lib/opencode/projection.ts";
import { formatSessionAsMarkdown } from "./packages/ui/src/lib/exportSession.ts";

const owner = { sessionID: "s", messageID: "a" };
const project = (id, time, status = "completed") => projectToolPart({
  type: "tool",
  id,
  name: "shell",
  time,
  state: status === "completed"
    ? { status, input: {}, content: [] }
    : status === "error"
      ? { status, input: {}, error: { type: "failed", message: "failed" }, content: [] }
      : status === "running"
        ? { status, input: {} }
        : { status: "streaming", input: "{}" },
}, owner);
const record = (parts) => ({
  info: { id: "a", sessionID: "s", role: "assistant", agent: "build", providerID: "openai", modelID: "gpt", time: { created: 1 } },
  parts,
});
const calls = (markdown) => [...markdown.matchAll(/\*\*Tool call timing\*\*\n\n```json\n(\{[^\n]+\})\n```/g)].map((match) => JSON.parse(match[1]));

const unknown = project("u", { created: 1000 });
const zero = project("z", { created: 1000, ran: 1000, completed: 1000 });
const long = project("l", { created: 1000, ran: 1000, completed: 1727500 });
const error = project("e", { created: 1, ran: 10, completed: 15 }, "error");
const [u, z, l, e] = calls(formatSessionAsMarkdown([record([unknown, zero, long, error])]));
assert.equal(u.duration_ms, "unavailable");
assert.equal(z.duration_ms, 0);
assert.equal(z.duration_source, "persisted_tool_state");
assert.equal(l.duration_ms, 1726500);
assert.equal(e.duration_final, true);

const active = project("r", { created: 1, ran: Date.now() - 1000 }, "running");
const [r] = calls(formatSessionAsMarkdown([record([active])]));
assert.equal(r.duration_source, "export_snapshot");
assert.equal(r.duration_final, false);
assert.equal(r.completed_at, "unavailable");

const interrupted = {
  ...project("i", { created: 1, ran: 1, completed: 5000 }, "error"),
  timing: { startMeasured: true, endMeasured: false, endSource: "interruption_observed" },
};
const [i] = calls(formatSessionAsMarkdown([record([interrupted])]));
assert.equal(i.duration_source, "observed_interruption");
assert.equal(i.completed_at, "unavailable");
assert.equal(i.duration_censored, true);
console.log("actual projection+export runtime PASS");
````

- Command (from the materialized root):
```sh
node --import /workspace/scratch/061630f1d1c5/openchamber-work/node_modules/tsx/dist/loader.mjs ./export-check.mjs
```
- Result: `actual projection+export runtime PASS`. The check covers unknown fallback, measured 0 ms, 1,726,500 ms, persisted error, running snapshot, and censored interruption.
- Runtime: Node v24.22.1 and TSX 4.21.0 came from an existing different-generation checkout; its Bun install is 1.4.2 and repository is 2.1.1, while this source requires Bun 1.4.4 and package 2.5.2. Fuse.js 7.1.0 was checked against this branch's lock. This is an actual-module Node runtime check, not a locked-dependency or Bun test pass.

## Bun / typecheck / build blocker

- No Bun executable was found in PATH or searched local executable caches; `npm cache ls bun` was empty.
- The allowed Git mirror host responds, but read-only `git ls-remote https://git.chatgpt-team.site/gest0r1/openchamber-ru.git refs/heads/feature/pipeline-optimization-20261104` stops with `could not read Username`. No credential was available through an authorized source.
- The only existing OpenChamber checkout is a dirty different generation; its Git object database does not contain this branch SHA, and its package manager/lock generation differs.
- Therefore native Bun exporter tests, typecheck, and build: **NOT RUN**. No claim of native PASS.
