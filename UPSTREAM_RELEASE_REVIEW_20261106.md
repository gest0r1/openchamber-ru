> Historical merge preparation note. Current acceptance and rollout instructions: https://github.com/gest0r1/my-opencode/blob/feature/pipeline-optimization-20261104/project/pipeline-optimization-20261104/REPORT.md

# Release workflow integration proposal — 2026-11-06

## Inputs and provenance

| Parent | Blob SHA | Size | Meaning |
|---|---|---:|---|
| Merge base (`.github/workflows/release.yml`) | `42c4be28d8c20932ed7fb0f51d5f27562d552175` | 30,085 | Common ancestor |
| Fork (`openchamber-ru`) | `5b36befded66e3cb811bf874f7b264e4e2ae2a62` | 19,305 | Current fork release policy and SHA authorization |
| Upstream (`openchamber`, v2.6.1) | `f1d5ebf374fedd0f79b91c079a0060ce72cbb4c8` | 29,738 | Upstream build/publish graph |
| Proposed file | `5154974cd878ad9a2d767ac6442377215be2b7bd` | 19,576 | Fork graph with scoped token permissions |

The proposal intentionally uses the fork workflow as its behavioral base. This matches the fork-specific release-policy checker and workflow contract test identified in the parallel merge review: x64-only, no macOS, Linux arm64, npm publishing, Blacksmith runners, or `upload-artifact` aggregation. The fork's policy includes immutable source-SHA authorization, fork version suffixes (`x.y.z.n` tag, `x.y.z` app/package version), workflow-run gating, exact-SHA web-package reuse, Windows x64/Linux x64 builds, Android upload, and an exact draft asset inventory before publishing. These are safety and product behaviors absent from the upstream workflow.

## Graph comparison and integration decision

Fork graph:

`authorize-release → create-release → {package-web, Windows, Linux, mobile} → finalize-release`

Upstream v2.6.1 graph additionally contains npm publishing, macOS builds, Linux arm64, Linux artifact aggregation, combined updater manifests, and Discord/website notifications. The fork graph has removed/replaced those jobs as a deliberate policy change; restoring them from upstream without product-owner confirmation would silently broaden publishing targets, credentials, release assets, and runner cost. The proposal therefore retains the existing fork graph and its final asset contract. This is not claiming upstream parity for those omitted release targets; if those targets are still required, they need an explicit policy decision and separate end-to-end review (including signing/notarization secrets and updater manifest expectations).

Upstream's draft-first publication invariant is already present in the fork graph: create/asset upload steps retain a draft, then finalization checks the required asset set and flips the release public. The proposed change narrows the workflow default token to `contents: read` and grants `contents: write` only to jobs that create/upload/finalize releases. No release behavior is otherwise changed.

## Static checks (no CI run)

- Parsed the proposed YAML with PyYAML `BaseLoader` (preserves GitHub's `on` key).
- Enumerated all seven jobs and their `needs`; every referenced dependency exists.
- Dependency closure: `authorize-release → create-release`; `create-release → package-web, build-desktop-electron-windows, build-desktop-electron-linux, mobile-release`; all four feed `finalize-release`.
- Checked the finalizer's expected names against upload paths/steps: web tarball; Windows installer, blockmap and `latest.yml`; Linux AppImage/deb/rpm and `latest-linux.yml`; one Android APK and AAB. Android naming is produced by the existing reusable mobile workflow.
- No Git refs, branches, upstream sources, production systems, or CI were modified/run. The policy tests themselves were not available in this scratch checkout; they should run during the full project validation.

## Review notes / remaining gate before rollout

1. Workflow topology and source-SHA plumbing are statically coherent. The finalizer has no dangling `needs` references.
2. `dry_run` still performs builds and the exact-SHA web artifact lookup, but skips GitHub release mutation/upload/finalization. This is inherited behavior; it is useful as a build validation but not a no-work preview.
3. Existing-draft resumption depends on upload steps replacing same-named assets as intended by `softprops/action-gh-release`; confirm this behavior against the pinned action version or its official docs before production rollout. If it does not replace assets, stale assets can make exact inventory fail or leave incorrect artifacts.
4. Release credentials/secret presence, the triggering web-package workflow artifact retention/name, source-SHA availability, Android signing, and real release dry-run/resume behavior were not exercised. This proposal is static-review ready, not production-tested.
5. The upstream graph has a Linux arm64 matrix, npm publication, macOS signing/notarization and manifest merge. They remain intentionally out of this proposal per current fork behavior; omission is not an accidental merge hunk resolution.

## Proposed artifact

`release.yml.proposed` is a review artifact only. Copying it into the repository should happen only as part of the broader upstream merge/review after the omitted-target policy and action asset replacement behavior are confirmed.
