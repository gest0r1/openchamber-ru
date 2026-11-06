> Historical merge preparation note. Current acceptance and rollout instructions: https://github.com/gest0r1/my-opencode/blob/feature/pipeline-optimization-20261104/project/pipeline-optimization-20261104/REPORT.md

# Still requires semantic review

This is a review draft. Do not promote the source tree or infer production readiness.

- `.github/workflows/release.yml`: the integrated fork-policy-preserving proposal is in the draft tree. Upstream macOS, arm64, npm publication and artifact aggregation conflict with explicit fork policy checks and are not silently enabled. Confirm pinned `softprops/action-gh-release` replaces same-name assets on draft resume.
- `packages/web/server/index.js`: review space-local page waiting and settlement routing end-to-end; `change` has no spaceId, so do not infer space from directory. The duplicate session-event call found during semantic review is removed.
- `packages/web/server/lib/opencode/session-activity.js`: `fetchRunningShells` appears in the merged test but no production caller in the prepared merge results. Confirm it has a consumer and that `hasBlockingRequests` remains wired into completion gates.
- `packages/web/server/lib/openchamber-control/service.js`: search the assembled tree for callers of both `answerPage` and `answerSecret`; only page-answer callers were present in the prepared results.
- `.github/workflows/mobile-release.yml`: verify callers use `source_ref`, exact SHA, and intended iOS/Android behavior.
- Generated changelog snapshots were selected from upstream, but release history/version provenance still needs maintainer review per AGENTS.md.
- An isolated harness reports check-fork-release-policy PASS and release tests 7/8; one legacy assertion expects literal `draft: false`, but finalization calls `gh api -F draft=false`. Align test or implementation. Bun/TypeScript, builds, integration or platform validation were not run.
