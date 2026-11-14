# OpenChamber v2.7.1 — промежуточная upstream-first интеграция

**Статус: WIP, не протестировано, не предназначено для выпуска или merge в main.**

## Фактические SHA
- Общий предок 2.6.1: `ce853f415704d1bfe8d076a5cfb2caabac00fffd`
- Fork main до интеграции: `1316bfe99a1de02746fefd1a00e556d0aac23b3c`
- Upstream 2.7.1: `f31748c92aaf1ddb8f177e915c1d92a2a418251f`
- Верифицированное промежуточное дерево: `dae79fb64220a74cb6d9a8c712911190d500d390`.

## Политика сборки WIP
- Только upstream изменил: **2181** файлов — применён upstream.
- Только fork изменил: **135** файлов — сохранён fork.
- Оба изменили: **109** файлов — временно сохранён fork-файл целиком; upstream изменения внутри этих файлов **ещё не адаптированы**.
- Остальные **6207** файлов: совпадают с обеими сторонами.
- Файлы, намеренно удалённые в fork, не восстановлены автоматически. Старый механизм Telegram пока остаётся единственным sender.

## Неприкосновенные функции до эквивалентности
Telegram subscription/recovery/delivery ledger; RU i18n и настройки; Markdown full export/per-tool timing; PR-watch; SHA-bound x64-only publishing и installer/rollback; model/credential/variant continuity; owner permissions.

## Пересечение: требуется diff3/ручная семантическая проверка

- [x] `.agents/skills/opencode-v2/SKILL.md` (base `37ba6c337960`, fork `f90cadbcb759`, upstream `99593e0fb30b`)
- [x] `.github/workflows/build-macos-arm64-dmg.yml` (base `f8a0ed970215`, fork `∅`, upstream `14677cf2001c`)
- [x] `.github/workflows/mobile-ci.yml` (base `167ac672a303`, fork `∅`, upstream `db1d46b420d9`)
- [x] `.github/workflows/mobile-release.yml` (base `6ff263738be4`, fork `59cfe362138d`, upstream `b2d1521e2f63`)
- [x] `.github/workflows/oc-review.yml` (base `99cdd4484e45`, fork `ed6c975a75b3`, upstream `6f8224d956bb`)
- [x] `.github/workflows/pr-intake.yml` (base `70bd7f0487bf`, fork `∅`, upstream `956fd120a277`)
- [x] `.github/workflows/pr-review.yml` (base `275d46f0fb2b`, fork `∅`, upstream `4578d6d2d7e7`)
- [x] `.github/workflows/release-desktop-smoke.yml` (base `21efa0ef9fa3`, fork `∅`, upstream `7fac6390a4ce`)
- [x] `.github/workflows/release.yml` (base `f1d5ebf374fe`, fork `5154974cd878`, upstream `feae336d3824`)
- [x] `.github/workflows/sdk-preview.yml` (base `afeb8b9919d5`, fork `∅`, upstream `b16b9f1d3bf5`)
- [x] `.github/workflows/stale.yml` (base `ac1b4b358bc1`, fork `∅`, upstream `1e82fc068342`)
- [x] `.github/workflows/vscode-extension.yml` (base `8f51aade1a4d`, fork `∅`, upstream `fb23b34d0177`)
- [x] `README.md` (base `911f1eb3d2fb`, fork `5ecca4a185d8`, upstream `183c364fa7b8`)
- [x] `package.json` (base `a705fd207702`, fork `5ddaf6bed8ae`, upstream `b21b3ed78704`)
- [x] `packages/electron/package.json` (base `4ee6ca77a2ca`, fork `228ac8c9e0d8`, upstream `425531bb116e`)
- [x] `packages/electron/updater-feed.mjs` (base `2f906fda5d2f`, fork `fd5c3c07fc21`, upstream `4eee6e79ee1f`)
- [x] `packages/electron/updater-feed.test.mjs` (base `fe6c975ac8a5`, fork `00ada6b5dbbe`, upstream `66fa2d772c97`)
- [x] `packages/ui/src/components/chat/ChatContainer.tsx` (base `cd648023bf29`, fork `659732fa21ce`, upstream `02538157ff65`)
- [x] `packages/ui/src/components/chat/ChatInput.tsx` (base `81f4ef4644c5`, fork `d50a7dac2e23`, upstream `bc18c7f77c8d`)
- [x] `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md` (base `2d7fc6501138`, fork `8f09137e98b2`, upstream `d42e33e2ac81`)
- [x] `packages/ui/src/components/chat/message/parts/HtmlRenderFrame.tsx` (base `c9cca4ad2b42`, fork `ad8b8fff5d7d`, upstream `a5d8c9b03fc6`)
- [x] `packages/ui/src/components/chat/message/parts/ToolPart.subagent-row.test.tsx` (base `5e9474e50c07`, fork `486ba6b693e2`, upstream `7ca2f0ec491a`)
- [x] `packages/ui/src/components/chat/message/parts/ToolPart.tsx` (base `e850fda1ffe4`, fork `5a5e7032d8a8`, upstream `dbbbfe8fba8b`)
- [x] `packages/ui/src/components/chat/message/parts/UiPageFrame.tsx` (base `c6f4f6c21f0e`, fork `19ba370c6994`, upstream `f2081739eabc`)
- [x] `packages/ui/src/components/chat/work-status/DOCUMENTATION.md` (base `7a25d516a8ab`, fork `f9f54f5ee8b7`, upstream `ab28d2e8ecbc`)
- [x] `packages/ui/src/components/sections/extensions/ExtensionsPage.tsx` (base `c03c651221b5`, fork `abd59b2cd279`, upstream `f00b93d101bb`)
- [x] `packages/ui/src/components/sections/integrations/CatalogExtensionsSection.tsx` (base `d6bf3215588b`, fork `f573a8ba375c`, upstream `a330fb2ed636`)
- [x] `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx` (base `bf9e8d9a2f19`, fork `b4c300b8e9ce`, upstream `c4451e668269`)
- [x] `packages/ui/src/components/session/sidebar/sessions/SessionNodeItem.tsx` (base `76e4f798f242`, fork `91301e88ed72`, upstream `24ab9844e3ed`)
- [x] `packages/ui/src/lib/i18n/messages.test.ts` (base `f89bfa57a3e4`, fork `25787893a715`, upstream `e25f752dc538`)
- [x] `packages/ui/src/lib/i18n/messages/ar.settings.ts` (base `11d7b88afc8e`, fork `2d47ff55fbf6`, upstream `4dd480209c73`)
- [x] `packages/ui/src/lib/i18n/messages/ar.ts` (base `31c45fe978de`, fork `20074d0e8f31`, upstream `d248ff1dd795`)
- [x] `packages/ui/src/lib/i18n/messages/de.settings.ts` (base `f2a992b8f2f1`, fork `056f3ccaa4ff`, upstream `cc0aece8c620`)
- [x] `packages/ui/src/lib/i18n/messages/de.ts` (base `6191bd97c8b4`, fork `cd1fb10d1f68`, upstream `364cc7b22cb2`)
- [x] `packages/ui/src/lib/i18n/messages/en.settings.ts` (base `24ecae83e091`, fork `12b72e5f6a65`, upstream `c8a317ee143b`)
- [x] `packages/ui/src/lib/i18n/messages/en.ts` (base `97c22197f0ee`, fork `fadba4e8dc64`, upstream `171a18d91473`)
- [x] `packages/ui/src/lib/i18n/messages/es.settings.ts` (base `d7baa04ac918`, fork `0d5364d7bfa2`, upstream `8bbbdbb56659`)
- [x] `packages/ui/src/lib/i18n/messages/es.ts` (base `40b3a7c15b6d`, fork `818447ef4255`, upstream `7786d9b2616c`)
- [x] `packages/ui/src/lib/i18n/messages/extensions.settings.i18n.test.ts` (base `a2cf20f1d4ac`, fork `eb24ab688b0a`, upstream `169f38ac18f9`)
- [x] `packages/ui/src/lib/i18n/messages/extensions.settings.i18n.ts` (base `b12e1f0bbd12`, fork `cada5fe0fb83`, upstream `5d109df3eded`)
- [x] `packages/ui/src/lib/i18n/messages/file-artifacts.i18n.ts` (base `db07f8d4b8d4`, fork `218a3c8b513b`, upstream `78090d540e2e`)
- [x] `packages/ui/src/lib/i18n/messages/fr.settings.ts` (base `7a55ce25d109`, fork `3e53a133e9ff`, upstream `79148245073f`)
- [x] `packages/ui/src/lib/i18n/messages/fr.ts` (base `f176b2d791f8`, fork `9ce0d8d55294`, upstream `a223344b0576`)
- [x] `packages/ui/src/lib/i18n/messages/he.settings.ts` (base `c7dc8b9473b1`, fork `8251462372a7`, upstream `cae83a9d033a`)
- [x] `packages/ui/src/lib/i18n/messages/he.ts` (base `e9c192d80bd7`, fork `947740620607`, upstream `5089b14b85dc`)
- [x] `packages/ui/src/lib/i18n/messages/html-render.i18n.ts` (base `836b80dd2412`, fork `719a5b9a2664`, upstream `45d698892131`)
- [x] `packages/ui/src/lib/i18n/messages/ja.settings.ts` (base `b2d369144d4a`, fork `3a207e06a809`, upstream `ed2118a9bd93`)
- [x] `packages/ui/src/lib/i18n/messages/ja.ts` (base `84b5e85e802d`, fork `114a8a776220`, upstream `3dcd761ddeea`)
- [x] `packages/ui/src/lib/i18n/messages/ko.settings.ts` (base `d414956e0221`, fork `b6e042d002ac`, upstream `4ba023a8fa25`)
- [x] `packages/ui/src/lib/i18n/messages/ko.ts` (base `e55c01ddb0ed`, fork `c88ea5233601`, upstream `ce40796a5ad0`)
- [x] `packages/ui/src/lib/i18n/messages/mcp-grid.i18n.ts` (base `8a88b3d47a5c`, fork `51d1736f3d11`, upstream `4cef9ee42f01`)
- [x] `packages/ui/src/lib/i18n/messages/nl.settings.ts` (base `a7086a969364`, fork `9abf91a1257a`, upstream `cdc314b035af`)
- [x] `packages/ui/src/lib/i18n/messages/nl.ts` (base `c87d5a8a75ba`, fork `f4750a028bde`, upstream `392977ed2f53`)
- [x] `packages/ui/src/lib/i18n/messages/overview.i18n.ts` (base `0ac18fab288e`, fork `712b17ae94df`, upstream `47c8634ab41a`)
- [x] `packages/ui/src/lib/i18n/messages/pl.settings.ts` (base `101c85beb77d`, fork `e5bd23e9fffc`, upstream `930301f2ead8`)
- [x] `packages/ui/src/lib/i18n/messages/pl.ts` (base `b84a5f496586`, fork `1fde84df64db`, upstream `6c760711a89c`)
- [x] `packages/ui/src/lib/i18n/messages/plugin-panel.i18n.ts` (base `b840a7933b00`, fork `65747af7a2b6`, upstream `fb8c7c2c3328`)
- [x] `packages/ui/src/lib/i18n/messages/plugins-grid.i18n.ts` (base `8b6e6a998f93`, fork `2e122cd5aca2`, upstream `51fc00f97dd2`)
- [x] `packages/ui/src/lib/i18n/messages/project-knowledge.i18n.ts` (base `22f09dee7bcb`, fork `b14fb9287836`, upstream `93c8a232492b`)
- [x] `packages/ui/src/lib/i18n/messages/providers.i18n.ts` (base `8c07f6ded813`, fork `f64d6b9ecb0f`, upstream `bf6a9b35e499`)
- [x] `packages/ui/src/lib/i18n/messages/pt-BR.settings.ts` (base `924a03171791`, fork `66a0cb333266`, upstream `69d2e359dba0`)
- [x] `packages/ui/src/lib/i18n/messages/pt-BR.ts` (base `18efc2f04b27`, fork `34a0da2c141a`, upstream `e977d6517518`)
- [x] `packages/ui/src/lib/i18n/messages/routing.i18n.ts` (base `45158a30fd45`, fork `49b36bf340ae`, upstream `eaa6c7835ced`)
- [x] `packages/ui/src/lib/i18n/messages/session-menu-hints.i18n.ts` (base `8b956e5dd735`, fork `3dab685cc0f0`, upstream `c5b5985e7fc5`)
- [x] `packages/ui/src/lib/i18n/messages/session-notices.i18n.ts` (base `35afdeed7a2e`, fork `1386297a0e7e`, upstream `c872a4c8433b`)
- [x] `packages/ui/src/lib/i18n/messages/session-warming.i18n.ts` (base `a00c4efe8ad8`, fork `07f7b0b380ca`, upstream `6270d1b4d482`)
- [x] `packages/ui/src/lib/i18n/messages/sidebar-work.i18n.ts` (base `b3182a299276`, fork `fc717767e0f8`, upstream `c2269cc036e9`)
- [x] `packages/ui/src/lib/i18n/messages/source-board.i18n.ts` (base `f61a31e84e68`, fork `99885752697a`, upstream `7ccdd0bb85e0`)
- [x] `packages/ui/src/lib/i18n/messages/surface-panel.i18n.ts` (base `daac0f357c0c`, fork `800d33378fab`, upstream `4fc246e349cf`)
- [x] `packages/ui/src/lib/i18n/messages/tr.settings.ts` (base `543701b5b841`, fork `665ed396f252`, upstream `10f3c927c66a`)
- [x] `packages/ui/src/lib/i18n/messages/tr.ts` (base `6af799f25637`, fork `caa058584161`, upstream `93b0695747b8`)
- [x] `packages/ui/src/lib/i18n/messages/uk.settings.ts` (base `1d154647a95f`, fork `a5e1e82a5c95`, upstream `14ce8c0fab01`)
- [x] `packages/ui/src/lib/i18n/messages/uk.ts` (base `8842f1cf7a9d`, fork `ec7484e539a5`, upstream `a208f03533ee`)
- [x] `packages/ui/src/lib/i18n/messages/usage-stats.i18n.ts` (base `8435b09fb84a`, fork `ceee895fcf03`, upstream `a72c20559405`)
- [x] `packages/ui/src/lib/i18n/messages/websearch.i18n.ts` (base `9cff0a178b3f`, fork `aff48e512d6f`, upstream `8c556489c610`)
- [x] `packages/ui/src/lib/i18n/messages/workflows.i18n.ts` (base `f2cd445a6b16`, fork `bfbbc27be6c8`, upstream `4324148c7cb5`)
- [x] `packages/ui/src/lib/i18n/messages/worktree-archive.i18n.ts` (base `0859f89ef067`, fork `a21fabf71d03`, upstream `a59def58f01c`)
- [x] `packages/ui/src/lib/i18n/messages/zh-CN.settings.ts` (base `e4e1cc4671ba`, fork `8a1bd647fd7e`, upstream `a6c3147fe081`)
- [x] `packages/ui/src/lib/i18n/messages/zh-CN.ts` (base `2128c3ff5873`, fork `b2940be7bf37`, upstream `edd0aeef1c5d`)
- [x] `packages/ui/src/lib/i18n/messages/zh-TW.settings.ts` (base `df6136f8ff99`, fork `ca2557000b8b`, upstream `9698ec28a0bd`)
- [x] `packages/ui/src/lib/i18n/messages/zh-TW.ts` (base `62dfcec6f41e`, fork `92701464ff2e`, upstream `4a9da802b6ea`)
- [x] `packages/ui/src/lib/i18n/store.ts` (base `5b9e3670fd08`, fork `4dae7ae35ce3`, upstream `76e1aa97fb71`)
- [x] `packages/ui/src/lib/opencode/model.ts` (base `a3e139615ec5`, fork `b8d8a9827625`, upstream `fc28c5b75480`)
- [x] `packages/ui/src/lib/opencode/projection.test.ts` (base `d832c7705152`, fork `47ffa390233d`, upstream `5691a83588f3`)
- [x] `packages/ui/src/lib/opencode/projection.ts` (base `4d8ec297b011`, fork `5f61030f3e66`, upstream `0ac31848d9d3`)
- [x] `packages/ui/src/lib/renderPageAnswer.ts` (base `3ce7cbf7e6a0`, fork `a4413080f708`, upstream `eea3ac507e2f`)
- [x] `packages/ui/src/lib/settings/search.ts` (base `9953821e01dc`, fork `a9cdafa14982`, upstream `957b34dd91cd`)
- [x] `packages/ui/src/styles/typography.css` (base `c18f200ea0e1`, fork `85da81011148`, upstream `bb69a62721c9`)
- [x] `packages/ui/src/sync/sync-context.tsx` (base `b52881a2c8d9`, fork `ae599805d0e3`, upstream `d75a03d1b671`)
- [x] `packages/vscode/CHANGELOG.md` (base `aff6fe7f9cc1`, fork `d7f89fa175f3`, upstream `48b6c8a51f63`)
- [x] `packages/web/bin/cli.test.js` (base `421c6fbf47de`, fork `920ce93cee5b`, upstream `b5c831f42a03`)
- [x] `packages/web/bin/lib/DOCUMENTATION.md` (base `71f9cc3162d2`, fork `3954d82bbb4e`, upstream `645848442784`)
- [x] `packages/web/bin/lib/cli-startup.js` (base `c13f42e65aca`, fork `9775b6debb73`, upstream `af1b51bd38d3`)
- [x] `packages/web/package.json` (base `636c1d91368c`, fork `2061c2b478f9`, upstream `8b2b1a1059e2`)
- [x] `packages/web/server/index.js` (base `d31d7cddd1a9`, fork `7695211dd5f2`, upstream `72f759be2640`)
- [x] `packages/web/server/lib/agent-tool/DOCUMENTATION.md` (base `569fb28ad17f`, fork `5411966a396b`, upstream `652fe02db6c6`)
- [x] `packages/web/server/lib/agent-tool/runtime.js` (base `561d6ec565da`, fork `2a8df0714f87`, upstream `b30176342543`)
- [x] `packages/web/server/lib/agent-tool/runtime.test.js` (base `b0573e51f693`, fork `f0d646020114`, upstream `6721b408dc58`)
- [x] `packages/web/server/lib/notifications/DOCUMENTATION.md` (base `c79b12382389`, fork `f1065b831ce0`, upstream `d3576ed3a687`)
- [x] `packages/web/server/lib/openchamber-control/actions.js` (base `3c01cb653404`, fork `2ded16f4a5eb`, upstream `f02eaf510def`)
- [x] `packages/web/server/lib/openchamber-control/render-page.js` (base `c079c7365cb2`, fork `e27b9daa1fc8`, upstream `42d3487ba45d`)
- [x] `packages/web/server/lib/openchamber-control/service.js` (base `254a8d954c0f`, fork `0c3c36940c34`, upstream `522d42420e03`)
- [x] `packages/web/server/lib/opencode/DOCUMENTATION.md` (base `a2c9adf4cec5`, fork `01b6caaeeda6`, upstream `88e35cda0fd0`)
- [x] `packages/web/server/lib/opencode/session-activity.js` (base `b626dcc8db29`, fork `e935c091afed`, upstream `04ad7339537f`)
- [x] `packages/web/server/lib/opencode/session-activity.test.js` (base `ddf7c4b232e5`, fork `2e105734729f`, upstream `f9a0b000727a`)
- [x] `packages/web/server/lib/opencode/settings-helpers.js` (base `a597b01910b7`, fork `a8d6a10f3de2`, upstream `aa2c78a711a9`)
- [x] `packages/web/server/lib/opencode/shutdown-runtime.js` (base `5c9ce114c6b5`, fork `ae09ebba4feb`, upstream `83a763df9e30`)
- [x] `packages/web/server/lib/terminal/DOCUMENTATION.md` (base `9e5da32bc801`, fork `b89dbeff04ea`, upstream `807ed1c28c76`)
- [x] `packages/web/server/lib/terminal/runtime.js` (base `6422ebf174e1`, fork `8685eb08405d`, upstream `e35bdabe9866`)

## Незавершённые проверки
- [ ] Разобрать каждый конфликт на уровне строк, а не оставлять fork-версию файла по умолчанию.
- [ ] Согласовать package.json/client/schema/CLI/lockfile с 2.2.7, и удалить лишние fork-обходы после сравнения контрактов.
- [ ] Сохранить bootstrap/runtime readiness, auth, Telegram и release policy.
- [ ] Bun 1.4.4 / Node 24 type-check, lint, tests, build: **NOT RUN**; CI только на принятом SHA, релиз/publish не запускались.
- [ ] Только после PASS и обзора всех конфликтов принимать merge-commit с upstream в истории; этот WIP-коммит одно-родительский и не подменяет подтверждённый merge.

## Подтверждённые решения после начального импорта (2026-11-14)

- **Реконсиляция manifest/CLI pin (3/109 конфликтов):** `package.json` — upstream зависимости/patches, сохранены fork `opencode:pins` и вызов в `type-check`; `packages/web/package.json` — upstream зависимости, сохранён lint server/index.js и увеличена минимальная совместимость до OpenCode 2.2.7; `packages/electron/package.json` — upstream версия/CLI 2.2.7, сохранены publish gest0r1/openchamber-ru и fork NSIS policy. Коммиты `0f6e1ca`, `e63e28a`, `d1b6563`.
- **Static cross-package pins PASS:** root/web/ui/vscode `@opencode/client` и `@opencode/schema` выровнены 2.2.7, Electron CLI 2.2.7, Docker CLI 2.2.7, `bun.lock` 2.2.7; версии всех пяти package.json: 2.7.1. Сопоставлено с правилами `scripts/check-opencode-pins.mjs`; сам скрипт **NOT RUN** (нет isolated checkout / Node 24 / Bun 1.4.4).
- **SDK v2.7.1 contract static review:** `contributes.sessionEvents` включает `turn-finished`, `question-asked`, `permission-asked`; `service.keepRunning` удерживает воркер; `sessionControl.answers` позволяет отвечать на форму/permission после разрешения. `provides: notifications` — штатный host channel, но его семантика **не доказывает** per-root Telegram, дедупликацию после crash/reconnect и учёт detached shells. Запросы service permissions advisory (не OS sandbox). В B требуется сравнение c `telegram-watch.js`, отдельный secure token/migration и shadow без доставок.
- **Оставшиеся пересечения:** 106 файлов (файловая классификация); это не 106 доказанных текстовых конфликтов. Выполнение CI/runtime тестов: **NOT RUN**.

## Закрыт подпакет A2-i18n (2026-11-14)

- **30/30 пересекающихся языковых файлов** `{ar,de,en,es,fr,he,ja,ko,nl,pl,pt-BR,tr,uk,zh-CN,zh-TW}{.ts,.settings.ts}` перенесены на точную структуру upstream 2.7.1, добавления форка интегрированы в проверенную уникальную соседнюю пару строк.
- **Static PASS:** в каждом файле языка ровно одна `common.language.russian`, сохранены upstream release-notes imports; в каждом файле settings 38 **уникальных** `settings.notifications.telegram.*`, сохранены upstream settings keys/imports. Выполнено чтением фактических файлов рабочей ветки после коммитов, без заявлений о typecheck/build.
- Последние коммиты серии `9dfadb1` (labels) и `c065b02` (Telegram settings). Полный audit — сравнение самих blobs и истории рабочей ветки. Функциональные Telegram/locale тесты: **NOT RUN**, включены в финальную матрицу.
- Осталось **76** overlapping file-level изменений; последующие удаления Telegram-строк возможны **только после** эквивалентного SDK cutover.

## Подблок A2-i18n SDK и модель (2026-11-14)

- **24 file-level overlaps resolved by semantic inclusion:** 20 shared i18n modules use the exact v2.7.1 module plus the existing Russian `ru: {...}` section (unique base anchors); `messages.test.ts` and `extensions.settings.i18n.test.ts` are upstream-current tests with RU registration; `store.ts` is upstream RTL-capable locale loader with RU import; `opencode/model.ts` is upstream model plus measured ToolPart timing. All are committed on feature branch.
- Added 5 explicit RU translations for the new v2.7.1 SDK quota capability/settings entries, preserving `{list}` placeholder. An obsolete `settings.page.extensions.description` assertion was removed by adopting upstream test instead of copying it.
- **RU fallback:** Russian `ru.ts` now spreads `enDict` first and overrides it with existing Russian strings, keeping previously untranslated new v2.7.1 keys available. This is a temporary **English fallback**, not complete RU translation; new strings need later localization if required. `ru.settings.ts` remains fork's Russian translations.
- **Static validations:** uniqueness of locale labels/settings from earlier subblock; new quota keys present in RU block; rebase inclusion of RTL and measured timings; upstream tests structurally updated. **Node/Bun/typecheck/test/build: NOT RUN.** Actual translations/screens are not certified until runtime tests.
- Checkpoint last code commit `c6fdfc3`. Marked 24 additional overlap rows. **52 file-level overlaps remain.**

## A2: updater + bounded UI compatibility (2026-11-14)

- **`packages/ui/src/lib/renderPageAnswer.ts` — adapt:** upstream 2.7.1 `declined` request accepted; keep fork directory scope in runtimeFetch, avoiding cross-project misrouting.
- **`packages/ui/src/components/sections/integrations/CatalogExtensionsSection.tsx` — reuse upstream:** fork delta relative to shared base consists solely of a comment rewrite; no production behavioral delta to preserve, obsolete text dropped.
- **`packages/electron/updater-feed.mjs` — adapt with security boundary:** upstream v2.7.1 introduces R2 CDN mirror of upstream's OpenChamber binaries. The fork Stable feed MUST point to `gest0r1/openchamber-ru`. Upstream R2 stable mirror is **not** a compatible source of fork builds. Its exported `STABLE_MIRROR_UPDATER_FEED` is therefore pinned to the fork's GitHub feed, and Canary mirror to the existing Canary GitHub feed; upstream channel/URL validation logic retained.
- **`packages/electron/updater-feed.test.mjs` — adapt tests:** upstream test suite kept, fork owner/repo restored, explicit regression test added for `source: mirror` on Stable channel.
- Code commits include `333f531`, `0f747c1`, `a55a51b`, `16eed0f`. **Static review only.** Node 24/Bun tests and integration smoke: **NOT RUN**.
- **48 overlaps pending.**

## A2-session runtime, native jobs + legacy Telegram (2026-11-14)

- `packages/web/server/index.js`: **rebase on upstream 2.7.1, selectively graft embedded Telegram** (config/approval/source/watch, one-time user confirmation for explicit Markdown/text, route registration, reconnect, event callbacks, tunnel origin, graceful shutdown). A static comparison against fork/main and common ancestor found **103 original fork-only content lines; all 103 preserved**. The old watcher remains the **only active Telegram sender**; SDK extension not installed/enabled, cutover has NOT happened. Upstream new features (session todos, hidden sessions, SDK service lifetime, memory dreaming, extension waits, native notifications) remain in rebased entry point.
- `session-activity.js`: preserve strict descendant depth (unknown after 8), pending form/permission and detached shell guard; add official 2.2.7 job.list path to track background subagent, shell and image jobs with 31-minute timeout. Unknown responses remain fail-closed. `session-activity.test.js`: retain upstream job.list regression and fork strict depth/shell tests, add form/permission cases.
- `shutdown-runtime.js`: retain stop of Telegram watcher, approval and reconnect subscription; adopt upstream session todos, extension waits and service lifetime cleanup.
- Static checks: one Telegram route, one embedded Telegram sender, one watcher start, one watcher event subscription; upstream lifecycle handlers and fork completion guards exist in exact branch blobs. **PASS (static)**; no Node/Bun runtime, endpoint contracts, typecheck, or CI executed: **NOT RUN**. Separate interactions with `openchamber-control/service.js`, `agent-tool/runtime.js`, UI forms and new OpenCode 2.2.7 require full integration tests before certifying this subblock.
- Code commits: `407c594`, `e336b74`, `596e5fd`, `206e538`. **44 unresolved file-level overlaps remain.**

## A2 control/agent-tool runtime + Telegram compatibility (2026-11-14)

- **5 overlap paths resolved statically:** `openchamber-control/actions.js`, `render-page.js`, `service.js`, `agent-tool/runtime.js`, `agent-tool/runtime.test.js`. Rebased on complete upstream v2.7.1, restored only existing fork `notify.telegram_send`, schema parameters and page `isWaiting` contract.
- Preserved upstream `releaseAnswerWaits` cleanup, `secretFields`, `stopSession`, `answerPermission`, `answerForm`, and `dismissOpenForms`. No second automatic Telegram sender introduced. Existing Telegram send still requires callback, actual session+checkout and incumbent confirmation runtime. No changes to persisted delivery keys.
- Extended upstream `openchamber-control/service.test.js` with session/path refusal (400), unavailable channel (503), forwarded payload/explicit approval and page wait lifecycle assertions; updated `agent-tool/runtime.test.js` to expect all eight notify params.
- **Static cross-file assertions: PASS (8/8)** including exact action, handler and service wiring in `server/index.js`. **Node/Bun runtime tests: NOT RUN**, so this is a static-resolution checkpoint, not an acceptance declaration.
- Commits: `cbab33b`, `e48fa0e`, `bd414b7`, `c58ebf5`, `1b5f0e4`, `c80b294`. **39 overlapping paths remain** (five fewer than previous checkpoint).

## A2 small nonoverlap merge — locale, terminal, projection, typography (2026-11-14)

- **5 overlapping paths reconciled via independent base→fork and base→v2.7.1 line hunks.** Every hunk set was checked for overlap before replaying both deltas; no ambiguous hunk. `settings-helpers.js`: preserve `ru` in UI locale enum while taking upstream settings. `terminal/runtime.js`: preserve injected-environment marker while taking upstream terminal behavior. `projection.ts` / `projection.test.ts`: keep persisted/fallback tool timings and test cases alongside upstream model projection; `typography.css`: preserve eight responsive 80rem width rules alongside upstream typography.
- Code commits `62ce886`, `eadd077`, `8f74206`, projection-test commit (see branch history), `dff437d`. **Static hunk nonoverlap PASS; Bun/Node24/type-check/layout tests NOT RUN**. Remaining overlap paths **34**.

## A2 UI page responses, Telegram settings and OpenCode guidance (2026-11-14)

- **6 overlapping paths closed statically:** `.agents/skills/opencode-v2/SKILL.md` carries fork cross-repo pin instruction on upstream 2.7.1; `ToolPart.subagent-row.test.tsx` retains agent color test on upstream subagent rendering; `NotificationSettings.tsx` retains legacy Telegram settings section until B migration; `settings/search.ts` retains one searchable Telegram settings entry.
- `UiPageFrame.tsx` and `HtmlRenderFrame.tsx`: upstream 2.7.1 decline UI, page actions, accessibility and state retained. Existing fork `useSessionDirectory` lookup now applies to both normal page answer and decline / parser-error submission; shared upstream `usePageDecline.ts` accepts optional directory and forwards it through `answerRenderedPage`. Prevents wrong project-directory routing on remote/multi-project OpenCode. No change to Telegram sender or stored settings.
- Commits `f9599b0`, `ac49b22`, `a6dcd70`, `4181024`, `f59c4a6`, `b238481`, `ff1a7ae`. Static 3-way hunk check PASS for 5/6 overlaps, explicit manual adaptation for `UiPageFrame` with upstream decline contract. **Bun/Node24/typecheck/tests/browser: NOT RUN**.
- **28 overlapping paths remain.** Need inspect `sync-context.tsx` hook export and `ToolPart.tsx`/ChatInput lifecycle during remaining A2; full runtime/CI gates remain open.

## A2 CI/workflow pruning + mobile-release compatibility (2026-11-14)

- **Eight workflow deletions preserved on purpose**, not mechanically resurrected from upstream: `build-macos-arm64-dmg.yml`, `mobile-ci.yml`, `pr-intake.yml`, `pr-review.yml`, `release-desktop-smoke.yml`, `sdk-preview.yml`, `stale.yml`, `vscode-extension.yml`. No new Actions jobs/minutes enabled by this integration. This is a preserve-fork-deletion decision, NOT a code merge or assertion that upstream functions are unnecessary.
- **Three content overlaps statically reconciled** from nonoverlapping base/fork/upstream hunks: `oc-review.yml` retains four fork GitHub-hosted jobs and explicit release-policy tests; `mobile-release.yml` preserves exact `source_ref`, Android release + build number, and disabled-by-default iOS while incorporating upstream updates; `README.md` retains fork installer and release policy alongside new upstream prose.
- Static guard **7/7 PASS**: all eight deleted workflows remain absent, no release workflow call requires them, fork checks in PR CI, four CI jobs present, mobile source SHA authoritative, iOS default false, release still x64-only. **GitHub Actions, package tests, YAML parse, release dry-run NOT RUN.** Authoritative rollout still waits for `.github/workflows/release.yml` semantic resolution and CI.
- Commits `oc-review` see branch history; `mobile-release` `6a9edc1`, `README` `5188b7e`. **17 overlapping paths remain**.

## A2 main chat, Composer, ToolPart and sync-context (2026-11-14)

- **Four overlapping implementation paths reconciled:** `ChatContainer.tsx` rebased with TelegramSessionButton and upstream chat changes; `ChatInput.tsx` rebased manually (upstream now has repository URL matcher, pasted issue chips and reference recording): reused existing upstream `repositoryUrls` and `linkedReferencesToSend` instead of adding a duplicate matcher; kept fork `buildLinkedGitHubIssueRefsContext` for already-linked and newly attached GitHub issues, excluding `/btw`.
- `ToolPart.tsx`: upstream localized tool display name, background task/session lifecycle and new rendering retained; fork subagent agent-name and chosen color reintroduced as optional header fields, error title color still takes precedence. Existing fork subagent-row tests updated earlier. `sync-context.tsx`: the isolated fork interruption-observed timing block merged with upstream session synchronization.
- Static symbol/contracts check **PASS** (single new issue context injection, upstream reference resolver preserved, subagent title/color logic, background behavior and Telegram button retained); **TypeScript/Bun/browser tests NOT RUN**. Need runner validation especially React hooks and OpenCode 2.2.7 message projection.
- Commits: `236939b` ChatInput, `0e32528` ChatContainer, `e08b300` sync-context, `e749ed2` ToolPart. **13 overlaps remain.**

## A2 CLI/startup, extensions, release graph disposition (2026-11-14)

- **CLI startup**: merged disjoint fork/upstream hunks in `packages/web/bin/lib/cli-startup.js`. Fork custom absolute `OPENCHAMBER_STARTUP_LAUNCHER`, managed drop-in migration only with marker, `startup --no-start` and explicit systemd restart preserved. Upstream 2.7.1 `findStartupServiceInstance`, Windows restart helper, PATH/systemd improvements preserved. Companion `packages/web/bin/cli.test.js` contains both upstream tests and fork no-start/deferred tests. `packages/web/bin/lib/DOCUMENTATION.md` merged semantically: fork startup rules + injected-env marker and upstream PATH/Windows restart. Commits `f5aa013`, `aef4efc`, `c365683`.
- **ExtensionsPage.tsx**: fork RU locale registration retained on upstream 2.7.1, disjoint line diff. Commit `980d077`.
- **Release workflow: preserve fork graph intentionally** (unchanged file, decision now resolved): upstream 2.7.1's seven deltas to `.github/workflows/release.yml` concern Node 26 runner changes, macOS notarization retry and R2 mirror publication sequencing. MacOS/R2/other new publishing targets are **excluded by explicit fork release policy**; Node 26 is not required by checked `engines.node >=24.14.0`. Fork SHA-bound, x64 Windows/Linux, Android, verified web package reuse, draft finalizer kept exactly. See `scripts/check-fork-release-policy.mjs`. No additional Actions minutes or target expansion.
- Static inspected: `startService === false` branches before systemd restart; no-start reports `startDeferred`; Windows helper and unit PID logic retained; release contains x64+Android and no macOS/npm publishing. **Static PASS.** Full Bun/Node24 tests, installer/rollback, YAML parse, actual release simulation **NOT RUN**.
- **8 overlapping paths remain**. Remaining: session sidebar full Markdown export; documentation/CHANGELOG reconciliation; typecheck and CI.

## A2 shared full Markdown export (2026-11-14)

- **SessionNodeItem.tsx: CLOSED STATICALLY.** Accepted upstream v2.7.1 SessionNodeItem (menu, worktree and selection extraction), removed the old fork's three overlapping custom patches. **Preserved the separate full Markdown export** by moving the call into the existing shared `SessionActionsMenuItems.tsx`, used by both sidebar and header. This reuses the upstream menu instead of maintaining an obsolete duplicate in SessionNodeItem.
- The new option invokes unchanged fork `collectFullSessionExport` and `formatFullSessionAsMarkdown` (authoritative parentID pagination, tool calls and partial branch warnings); each child's records use that child's own directory. Existing built-in standard Markdown export stays unchanged. Added a menu presence test to `HeaderSessionActionsMenuItems.test.tsx`. Commits `568d090`, `adf8adc`, `7527aee`.
- Static selection/exports checks **PASS**; Bun/React full run **NOT RUN**. **7 overlaps remain**; no production changes.

## A2 documentation and changelog reconciliation (2026-11-14)

- **7/7 remaining file-level overlaps statically reconciled; overlap checklist now 0.** 5 independent source doc changes merged through verified disjoint 3-way hunks: chat parts (`useAgentColors`/scoped page submission), work-status (linked GitHub issue context), agent-tool (`notify.telegram_send`), notifications (legacy Telegram watcher + upstream SDK notification channels), terminal (injected terminal env marker). Commits `65bf251`, `6bcf26e`, `6e85b0f`, `16295b7`, `bd5fec2`.
- `packages/web/server/lib/opencode/DOCUMENTATION.md` merged manually at the one overlapping sentence to document both upstream OpenCode 2.2.7 global `job.list` behavior and preserved fork `hasRunningShells` / `fetchRunningShells` fail-closed fallback. Verified both symbols exist in candidate `session-activity.js`. Commit `d840589`.
- `packages/vscode/CHANGELOG.md`: original fork-only 2.5.0.1/2.3.3.1/2.3.1.5 historical headings combined with upstream 2.7.1/2.7.0 entries via disjoint hunks. Commit `bb136cc`. Release-generator verification **NOT RUN**; regenerated outputs must be checked against `changelog/` sources prior to accepting a release.
- **This closes source-path classification, NOT architecture acceptance**: all content overlaps have a proposed resolution, but source is not typechecked/tested, release artifacts not built, and no upstream two-parent merge commit has been made. Run `bun run check:changed`, pinned `opencode:pins`, tests, lint, builds and fork policy contract checks on the exact candidate SHA. Only after validation/acceptance record a proper Git merge ancestry. No production update.

## PR #27 CI recovery — checkpoint 2026-11-14 (not a green gate)

- CI run `43559716245` at old candidate `3dc46da`: **build PASS**; **type-check FAIL 4 errors** (missing RU records/keys), **lint FAIL only in `changelog:check`** (oxlint passed), **tests FAIL 13/1360 files** (RU tests, two Markdown mocks, select labels), separate Russian-coverage workflow `43559716276`: **12/79 failed, 829 English fallback labels**. These are genuine observed failures, not inferred from static diff.
- Fixed two Markdown test mocks: added missing `resolveEffectiveDirectory` to the mock; Telegram SelectValue rows now render visible alias, session title and translated kind, rather than raw IDs/kinds.
- Fixed RU parity in eight upstream sub-dictionaries: source-board +3, isolated-spaces +12, reference-picker +3, session-menu-hints +14, file-artifacts +64, surface-panel +1, usage-stats +1, openchamber-tools-layout +14. Key and placeholder parity of all eight checked **STATIC PASS**; layout is now explicitly imported/spread in RU dictionary. These changes were not re-executed in CI yet.
- Rebuilt generated `changelog/index.json` and legacy `CHANGELOG.md` from seven existing fork source notes, preserving the original 168 upstream release entries and adding seven fork versions. Static original legacy sections unchanged; **changelog:check NOT RUN**.
- Additional genuine RU coverage: 100 new settings strings in `ru.settings.ts` (shortcut labels, plugin policy, worktree lifecycle, memory dreaming, typography and releases); nine tooltip dictionaries translated and wired to `ru.ts` (diff16, files15, terminal/browser7, walkthrough7, git36, tracker26, workspace28, panel8, chat32 = **175 tooltips**). No English stubs inserted deliberately.
- **Remaining:** RU fallback coverage is NOT complete, previously 829; all extra candidate commits use `[skip ci]` to minimize repeated Actions minutes. Need finish remaining high-volume RU groups and run CI once on the final candidate. Do not certify runtime readiness from static checks. No merge or production deployment.

## RU completion candidate and correction of failed static write — 2026-11-14

- **Important correction:** initial 9 tooltip module writes attempted to replace `}; as const` suffix and were NO-OP: these modules end in `};`. This was detected by inspecting actual branch content during static verification, after their imports had already been added to `ru.ts`. The subsequent nine fix commits actually insert `ru: {...}`: diff `5690354`, files `b4c3551`, terminal `d5eb9b6`, walkthrough `3220b3d`, git `6a96b45`, tracker `e62f3f1`, workspace `80d2ffa`, panel `eeebd5a`, chat `b89f98f`. All nine modules re-fetched from GitHub and checked against English: **175 RU keys, zero missing, zero identical English values, zero placeholder mismatches (STATIC PASS)**. No runtime test claimed.
- Added and wired `agent-status.i18n.ts` (81 RU keys), `openchamber-tool-output.i18n.ts` (141), `opencode-tool-output.i18n.ts` (39), static per-module en/ru key parity; one unchanged technical label `Cron {value}` corrected to meaningful `По cron: {value}` in commit `3a43fc2`.
- Expanded `ru.settings.ts` with 79 actual Russian extensions, settings, provider and plugin-authorization texts. `ru.ts` adds 130 new UI labels (sessions, search, release notes, Git etc.) and 68 chat/extension status messages; all are direct translations, not English stubs.
- Initial failed `Russian i18n coverage` job had **829 English fallback keys**. Static mapping against current GitHub branch found **377 explicit RU overrides and 452 RU module keys; 0 original failed keys remain without a translation path**. All 377 direct entries were checked for placeholder parity: **0 mismatches**. Four intentionally locale-neutral values (code.example.com, `{name}: {text}`, SDK, `{author}:`) are documented in `ru-coverage.test.ts` allowlist, not changed to fake Russian translations. `ru-coverage.test.ts` and all module-level tests are **NOT RUN** since patches.
- **Acceptance state:** staged RU candidate only, not verified by Bun / actual UI. Next gate: one grouped PR CI run on a deliberate candidate SHA, check type-check, 1360+ test files, changelog generator and RU coverage. Must inspect any remaining failures and fix. No main merge or deployment.

## CI dictionary parity reconciliation — 2026-11-14

- First PR #27 `messages.test.ts` failed because Russian dict still contained **100 keys absent from the current English contract** (`+100` in test diff), not simply missing RU translations. Previous PR CI also had 829 English fallbacks and both problems must be fixed separately.
- On current fork branch retired 61 stale RU-only entries from `ru.ts`, 32 from `ru.settings.ts`, and seven from RU locale sections of `mcp-grid`, `html-render`, `workflows`, `extensions.settings`, `routing`, `websearch`, `providers`. No EN or other locale values modified. The exact original 100 keys and their contexts remain recoverable from PR #27 CI run `43559716245` and the parent Git objects. **Static check**: none of the 100 remain in their original RU runtime sources. Treat these as upstream-retired dictionary entries, not proven unreachable dynamic UI; CI/browser runtime must validate impact before acceptance.
- Current static RU coverage of initial 829 fallback strings: 377 explicit RU strings + 452 strings in RU dictionaries, including nine tooltip dictionaries, three agent/tool-output dictionaries, eight previously updated locale dictionaries. Four locale-neutral tokens kept with narrow explicit allowlist in `ru-coverage.test.ts`; compare placeholders unchanged. **Not yet confirmed by new CI.**
- Next: single combined CI rerun on feature PR #27; inspect all jobs and fix new, verifiable failures before any merge/deploy.

## PR #27 verification requested on repaired candidate

- Requested one grouped PR verification after source, i18n and generated-changelog corrections; this commit intentionally does **not** contain `[skip ci]`.
- Acceptance still requires actual PASS for relevant build/typecheck/lint/tests/RU coverage on the exact head SHA. No merge or publication permitted from this request alone.

## PR #27 CI review and narrow Markdown test fixture repair — 2026-11-14

- PR #27 CI on candidate `2d0fe34` (jobs `43570617753`, `43570617756`): `type-check` PASS (4,278 source files / 7 projects), `lint` PASS, changelog check PASS, web/VSCode/mobile assets build PASS, `tests` FAIL (1355/1360 test files passed), standalone RU coverage FAIL. Final fork release/installer contract tests were skipped after tests failure; **not accepted**.
- Failures: three Russian coverage modules (`isolated-spaces`, `source-board`, `ru-coverage`); already addressed since that SHA by locale ordering and remaining four `outline preview` translations. Separate failures in `MarkdownRendererImpl.test.ts` and `markdown/guestLinks.render.test.ts` occur during import of upstream `useConfigStore` (`useUIStore.subscribe is not a function`; async home resolution then reports circular initialization). Production `useConfigStore.ts` and `useUIStore.ts` at tested candidate were exact upstream 2.7.1 blobs, so the evidence points to incomplete test mocks, not evidence of a broken live store.
- Repaired only both Markdown renderer fixtures to add the no-op `useUIStore.subscribe` API; guestLinks mock also exports `normalizeContextPanelDirectoryKey`. Existing component implementations untouched. Commits `151e7ba`, `f8195c5`. May still expose another test initialization issue; **no claim PASS until actual CI confirms**.
- Request one grouped PR #27 CI verification on the current candidate. Do not merge in main or deploy. Inspect any remaining failures, especially direct RU coverage and Markdown renders; do not broaden product changes without reproduced production regression.

## PR #27 second CI: translation module syntax (2026-11-14)

- Grouped candidate `f1488a6`, runs `43583858959` and `43583858938` **FAIL**. All four PR checks and RU coverage failed at import/parsing because the earlier ordered Russian dictionary patch in `source-board.i18n.ts` and `isolated-spaces.i18n.ts` omitted the `ru: {` opening before the Russian content, leaving `} as const` extra at EOF. Confirmed from GitHub source (at source-board line 1608, isolated-spaces line 5403) and Bun logs at lines 1714/5762. Other test results on this SHA are invalidated by the parse failure.
- Repair: insert exactly one missing `ru: {` into each file, preserve all 15 prior language blocks and Russian key strings, no content rewrite: commits `7927c93`, `9ab05eb`. Static check: each dictionary now has all **16 locale blocks**; bundled tests **NOT RUN** since repair.
- This was a syntax/merge regression, not evidence of upstream runtime bug. The earlier 2 Markdown renderer fixture updates remain staged. Next grouped CI run should cover both classes; **do not merge/deploy** until all checks PASS.

## PR #27 third CI (SHA 88b47710) and x64-only release manifest correction — 2026-11-14

- `Russian i18n coverage` run `43584121852`: **dictionary coverage + linked issue/catalog PASS**, final `Check fork updater and release manifest contracts` FAIL. Exact failure: `finalize-latest-yml.mjs` demanded `Both x64 and arm64 Windows update manifests are required`; fork regression `finalize-latest-yml.test.mjs` expects only x64 and requires error `x64 Windows update manifest is required` when missing. This is a confirmed fork release contract defect, not an optional test expansion.
- Inspected `.github/workflows/release.yml` and `scripts/check-fork-release-policy.mjs`: fork release remains Windows x64/Linux x64/Android only, forbids arm64/macOS/npm publishing. Current `release.yml` does not call the helper; nevertheless keep its published x64 contract consistent.
- Fixed `packages/electron/scripts/finalize-latest-yml.mjs` by removing inappropriate upstream Windows-arm64 and macOS manifest requirements; retains x64 recovery from an existing draft release and SHA512/size verification when rebuilding from a release installer. Commit `5c6e270`, **[skip ci]**, not yet runtime-tested.
- PR `pr checks` run `43584121866` remains to be read at final status before any next verification run. One grouped validation for all known fixes will be required. No merge/deploy.

## PR #27 third CI remainder: one Markdown first-mount assertion — 2026-11-14

- On `88b47710` run `43584121866`: **type-check PASS**, **lint/changelog PASS**, **build PASS**, **tests FAIL** (1359/1360 test files PASS; only `src/components/chat/markdown/guestLinks.render.test.ts` FAIL). Separate RU coverage/checks: language dictionaries and linked issues/catalog PASS, exact x64 manifest regression discovered and fixed afterwards in `5c6e270`.
- The remaining Markdown test's *first* mount expected clickable `DEMO-2` immediately, observed no mark; its subsequent *re-render* test and remaining four tests in that file passed. Logs show first mount still initializing filesystem/home/locale and dispatching an invalid Happy DOM Event; production renderer `MarkdownRendererImpl.tsx`, `remarkGuestLinks.ts` and `MarkdownLink.tsx` match upstream 2.7.1 exact SHA. No evidence that our fork changed the production implementation.
- `guestLinks.render.test.ts` now waits boundedly for the initial settled guest mark while still asserting that missing/unmatched marks remain absent and that the subsequent interaction works. Commit `79e1175` (test only, no production change), **not yet tested**. Do not assert this fixes all render issues unless CI passes.
- Final grouped PR #27 checks requested on this combined candidate, including x64-only manifest. Source/build/pass records above belong to **88b47710**, not this new SHA; CI acceptance requires new exact-SHA results. No main merge or deployment.

## PR #27 combined CI and B1 isolated SDK event shadow — 2026-11-14

- Candidate `a072961`: **Russian i18n/release/updater checks PASS**, **type-check PASS**, **lint/changelog PASS**, **web/VSCode/mobile build PASS**. Full tests **FAIL**: 1359/1360 test files PASS; only `guestLinks.render.test.ts` fails on first mount of a claimed guest link, then re-render also fails after bounded test wait. This is the third independent negative result for the same Markdown test integration class (`2d0fe34`, `88b4771`, `a072961`); **do not keep guessing patches**. Logs also show test-only localhost fetch ECONNREFUSED and Happy DOM mismatched Event. Production `MarkdownRendererImpl.tsx`, `remarkGuestLinks.ts`, `MarkdownLink.tsx` match upstream 2.7.1 exact blobs; test may expose an upstream defect or a fixture issue — neither established. Need targeted root-cause evidence before another change.
- **B1 shadow package created**, `extensions/telegram-shadow`, commits `413d389` and `cb0f7a3`. Independent public OpenChamber SDK manifest: `sessionEvents` v1, `keepRunning`, metadata-only v1 journal, bearer auth on loopback, 64KB bounded event input, atomic state writes with mode 0600, idempotence on `[directory,sessionId,event.id]` within last 2048 events, distinguishes root/subagent; never requests transcript or notification-provider role. **No Bot API/credentials/subscriptions/cutover**, incumbent sender untouched. Event journal does not claim completion or replay lost events.
- B1 test file `service/state.test.js` covers protocol reject/accept, stripped transcript, concurrent append, idempotence, restart, root flags, 0600 and fail-closed corrupt file. **Node test execution NOT RUN**; installability and user approval **NOT RUN**. This is a passive SDK extension scaffold, **not migration parity**.
- Since CI PASS is tied to `a072961` and B1 adds untested files in later commits, no final exact-HEAD acceptance is claimed. PR stays draft, no main merge/deploy.

## B1 logic smoke (2026-11-14)

- Exact published blob `extensions/telegram-shadow/service/state.js` SHA `3af7c9c91cb3696ee5885567514d3cd87bd0b967` executed as JavaScript in isolated V8 with simulated filesystem implementing `readFile/writeFile/rename/chmod` (not Node native HTTP). **PASS 8 focused assertions:** public SDK metadata v1 parse, reject wrong protocol/missing parent, strip agent transcript, serial concurrent journal mutations, duplicate suppression, root-vs-child accounting, 0600 file permission request, state recover from simulated restart, malformed saved JSON fail-closed. Event count after two unique + one replay: `observed:2,rootEvents:1,deliveryEnabled:false`. This validates pure logic only, not Node API integration, actual disk permissions or SDK host wiring. `node --test service/state.test.js`: **NOT RUN**; no shadow delivery/cutover.

## B1 Node HTTP contract test added — 2026-11-14

- **Root-cause evidence for last PR #27 test failure:** exact SHA `a072961`, tests job `132417021341`: only `guestLinks.render.test.ts` failing (1359/1360 PASS). Its isolated Happy DOM global wiring omitted `CustomEvent: browser.CustomEvent`, while `persistence.ts:272` dispatches `new CustomEvent` to the Happy DOM window; error is `EventTarget.dispatchEvent: parameter 1 is not of type Event`. The parallel `MarkdownRendererImpl.test.ts` already includes this mapping. Narrow fixture-only fix `4e70b190`. **This fixes a demonstrated test-environment exception, not yet a proven fix for all guest link assertions.** No production Markdown renderer touched. Test after fix NOT RUN.
- **Shadow SDK 2.7.1 contract rechecked:** SessionEvents spec explicitly documents `POST /session-events`, metadata-only subscription and reply `{ok:false,error}` for persistence failure. Existing service status=200 with `ok:false` is contract-consistent; no unnecessary HTTP error code change. Root terminal equivalence NOT established.
- **B1 real Node/HTTP test candidate:** `e3b5689` added `extensions/telegram-shadow/service/http.test.js` covering independent Node child service, bearer auth, /health,/session-events,/status, metadata-only durable journal, 0600, replay and corrupt-file fail-closed. `f5652be` integrates both state and HTTP tests with the package test script. `630a5c4` adds a **single short step** to existing `oc-review.yml` tests job before its Bun test suite; no new workflow or runner. **Node and host SDK integration NOT RUN** as of this note. Host install/grant, dropped-events reconciliation, migration/cutover and any Bot API sender are NOT IMPLEMENTED.
- Request a single grouped PR #27 run on this consolidated candidate. Do not treat previous PASS on `a072961` as exact-head PASS; no main merge, release or production deployment.

## E / PR #27 fourth grouped CI and resolved minimum-version regression (2026-11-14)

- SHA `c2ec99c`: Russian coverage PASS, PR `type-check` PASS, `lint` PASS, `build` PASS; `tests` FAIL with exactly **1 Vitest assertion / 602 test files (592 passed, nine skipped, one failed)**. Full log for run 43597603968/tests job 132455348003: `server/lib/opencode/compatibility.test.js:63` expected minimum `2.2.4` but package engines is `>=2.2.7`; **no Markdown/guestLinks test failures on this run**. The earlier Happy DOM `CustomEvent` fixture fix therefore resolves the previously seen test failure in this run. The new `extensions/telegram-shadow` real Node/HTTP test step completed successfully before `bun run test` (no independent OpenChamber SDK host install/grant proof).
- Production compatibility invariant: fork Electron/Docker/web/package pins are all `2.2.7` and `packages/web/package.json` already declares `>=2.2.7`; upstream `compatibility.js` still enforced `2.2.4`. Align runtime minimum to the published contract (`695aadd9`) and update test matrices, including managed 2.2.4 eligible for upgrade (`fb412df0`). This is a real readiness/manifest mismatch; the code change is limited to the compatibility version floor, not the SDK protocol.
- **Exact-head test verification after this repair: NOT RUN.** Run one grouped PR #27 CI on the new candidate; no merge, release or production deploy. Telegram SDK terminal parity/migration/cutover remain unproven and disabled.

## E / upstream-compatible OpenCode minimum floor (2026-11-14)

- PR CI on `2255d08f`, run 43598571371: RU coverage, type-check, lint, build, and Telegram SDK Node HTTP test step all PASS. Vitest **591 passed / 2 failed files (12 failed assertions among 11,153)**. All failures in `lifecycle.test.js` and `v2-install.test.js` arose after raising the runtime minimum from upstream 2.2.4 to the chosen install pin 2.2.7: these existing tests intentionally exercise 2.2.5 as supported. This stricter minimum was an unjustified compatibility change, not required by the approved **distribution target pin**.
- **Correction / lean upstream reuse:** Restore exact upstream `compatibility.js` and `compatibility.test.js` blobs from prior `c2ec99c` (`257cf3cb`, `ff443cee`); align published `packages/web/package.json` `engines.opencode` to the existing runtime floor `>=2.2.4` (`d95d3b03`). The fork still pins distribution Electron/Docker/`@opencode/*` to **2.2.7**. Do not introduce a new rejection of otherwise-supported older OpenCode. This avoids needless fixes to 12 valid upstream tests and preserves supported compatibility.
- **Exact-head tests after this correction: NOT RUN**. Request a single grouped PR CI on current candidate. Telegram sender remains disabled. No production and no main merge.

## E / accepted review CI and safe mobile-workflow syntax repair (2026-11-14)

- **Verified PR #27 CI at exact source SHA `16d3b690006fd0ec7dc7c20be444fb63e10025ad`, run `43599552433`: tests, type-check, lint, build all PASS.** Separate Russian i18n coverage run `43599552469` PASS at the same SHA. Existing tests job also ran `node --test extensions/telegram-shadow/service/state.test.js extensions/telegram-shadow/service/http.test.js` before the Bun suite; this step PASS. Previous guest link test errors and version floor errors are not present. This confirms the upstream-compatible minimum `>=2.2.4` and distribution pin 2.2.7 coexist; no requirement to reject supported 2.2.5.
- **Post-CI changes have NOT been re-tested**: workflow-only `f8e9bbec` removes duplicate `retention-days` key in `.github/workflows/mobile-release.yml`, fixes `inputs.ref` to declared `inputs.source_ref`, and `inputs.app_version` to `inputs.version_name`. GitHub push run `43599546588` on the older SHA failed **before any jobs were created**, consistent with invalid workflow config; this is not a mobile build failure. No mobile build or release was started. Documentation-only `b18dd89a` updates shadow test invocation.
- Current branch head after those source-only commits is not the SHA that passed review CI; **exact-head PASS is still unproven**. Any new source, workflow or package change requires appropriately scoped verification before declaring acceptance. Telegram shadow remains **passive**; host approval/grant, independent completion fence, parity, migration and dual-sender prevention during cutover remain NOT RUN/NOT IMPLEMENTED. No main merge, release or deployment.

## B2 offline legacy preparation — 2026-11-14

- Added isolated `extensions/telegram-shadow/service/migration.js` (`91a318df`, strengthened `19f0d66b`) and operator-only `prepare-legacy.js` (`722bd157`); the SDK service never invokes or reads the prepared snapshot. The source runtime/watch/config and optional external aliases are read using explicit absolute filenames. The prepared v1 state preserves alias/chat/topic selection, token, per-root `once/run/session` subscription, checkpoint baseline, exact legacy dedup keys and statuses `sent/reserved/rejected/delivery_unknown`, plus SHA256 provenance for each source. No Bot API delivery and no sender handover.
- Verified source and tests by exact Git blob comparison to locally executed Node 22 fixtures: `migration.js` blob `62205a736a5edf37db56dc7b63d4cfada2eece3e`, `migration.test.js` `c2b7865dd0e2e3699b3c11272b8a3c329857c78a`, `prepare-legacy.js` `91d73c85f826dd8bf550352952b91dbd91e22535`. **Node 22 offline migration test: 5/5 PASS**; Node 24 PR workflow test not yet run. No dependency install and no real server connected.
- Migration is explicitly fail-closed: rejects wrong hashes/keys, missing destinations, duplicate checkpoints, incompatible state; copies only validated fields, checks inputs for mutation, private file 0600, exclusive no-overwrite/idempotent prepare, never modifies legacy originals. CLI prints only aggregate counts. Existing `shadow` journal still records metadata only; imported secrets are stored solely in private offline snapshot and are NOT served by HTTP.
- Verified SDK v2.7.1 public `opencode` role allows limited read-only session/message/active list, but **does not expose detached shells or pending dispatch**; sessionEvents is at-most-once. Therefore **terminal parity, catch-up, owner fencing, cutover/rollback and real sender remain unimplemented**. No silent fallback to `turn-finished` as equivalent to verified idle. Conditional minimal SDK/host adapter would need approval and integration proof before cutover; do not remove legacy sender.
- Updated `oc-review.yml` to run `migration.test.js` with existing Node state/HTTP tests (`b7958723`); package script updated (`5fd80b86`), operator docs (`bd0d9e24`). No new workflow/runners, no release or production.

## B2 / E consolidated acceptance candidate — 2026-11-14

- Verified PR check on **exact `d33e5d5807087a900924fe0032eb60775e93e4c0`** (run `43602937432`): **type-check, lint, build, tests all PASS**, including standalone Node shadow + migration unit/HTTP tests in the existing workflow. RU i18n coverage run `43602937435` PASS on same SHA. PR workflow runs Node **26** (`packages/web` engines >=24.14.0); local offline pure migration tests use Node **22**. Neither constitutes real host install/grant/cutover.
- Prior PR `ba5bba09` failed at 1359/1360 files with the 1ms polling test race (`600000` expected vs `599999`) under real wall-clock; corrected only the test's already-supported `now` argument to deterministic zero (`c8071d02`). Production scheduler unchanged.
- After green `d33e5d58`, scoped changes: `migration.test.js` adds `once/run/session` across worktrees/spaces, all four dedup outcomes, real input-change-on-second-read and 0644 refusal, and source-tree rejection (`f0b4b9f394b182de93c5971ce434548ab634d484`); CLI refuses writing a private credential snapshot inside checked-out extension sources (`3c736466dd3f77963d4d37bab5383e4360b7b922`), docs updated. Revalidated local **6/6 Node22 PASS** on exact Git blobs (`migration.js` SHA `62205a736a5edf37db56dc7b63d4cfada2eece3e`).
- This entry is deliberately the **final grouped PR validation trigger** after consolidating the source and tests; **exact current branch HEAD CI remains NOT RUN at commit time**. Preserve the last known-green `d33e5d58` until the new run succeeds. No sender enabled, no import of real credentials, no main merge or release.
- The key open gap is architectural, **not a missing test retry**: public SDK 2.7.1 has at-most-once delivery and no detached-shell/pending-dispatch read route; its turn-finished handler may treat unreadable child state as no active child. Maintaining the accepted terminal-notification guarantee requires independent trustworthy completion proof + exclusive sender ownership/rollback. Do not activate SDK delivery on guesswork.

## E / browser visibility timing after final candidate — 2026-11-14

- Grouped PR run `43604001823` on SHA `bab256ac` reported tests FAIL at **`scripts/perf/json-tree-view.browser.test.mjs:178`**, while `type-check` and `lint` PASS. Failure: after hiding/revealing the host, the test assumed the virtual scroller existed after a fixed five animation frames; `host.querySelector('[dir="ltr"]')` returned null and `getBoundingClientRect` threw. Previous `d33e5d58` run had the whole suite PASS, so the one-off browser mount race is a plausible fixture scheduling problem, not evidence of a production renderer regression. Verify again rather than relaxing the assertion.
- A narrow **test-only** patch `f30ebf5a` waits for the actual visible scroller with a 3s deadline after redisplay, then runs the original geometry/virtualization/tail assertions unchanged. A scroller that stays absent still fails. No production code touched, no retry of the whole test, and no new runner/workflow.
- Current candidate requires grouped PR CI again on the revised SHA. Do not cite the `bab256ac` run as PASS, and do not merge/release until checks and Telegram host parity are separately accepted.


## B1 native SDK-host integration + fail-closed terminal read — 2026-11-14

- **At exact SHA \`9d2b66131832866a5f73cdc857696a4231058131\`:** grouped PR check run \`43604262706\` PASS (tests, type-check, lint, build) and RU i18n run \`43604262707\` PASS. This is a verified upstream 2.7.1 + fork reconciliation base, not an SDK Telegram cutover.
- Added \`packages/web/server/lib/guests/telegram-shadow.integration.test.js\` in commit \`c4b66860\`. Unlike earlier direct Node tests, it inspects the **real packaged extension** with the production manifest parser, exercises host service bearer/grant validation via \`proxyGuestServiceRequest\`, durable root/subagent event dedup, actual data path permissions, process restart/recovery, and capability revocation. Follow-up \`117ca7bb\` routes actual busy/idle announcements through \`createExtensionSessionEvents\` and the same host into the shadow journal with a precise bounded persisted-state assertion. **Live host install and grant on a user machine NOT RUN**; this is isolated CI test coverage.
- **Confirmed SDK defect in source:** \`packages/web/server/lib/guests/session-events.js\` treated a failed OpenCode \`/api/session/active\` or child enumeration as "no children", emitting \`turn-finished\` even though activity was unknown. Changed only this predicate to fail closed (\`c8c315fd\`): cannot emit positive completion when child state cannot be proven. Added negative regression for both read failures plus healthy control (\`5e6de6c2\`). No behavior change to the incumbent \`telegram-watch.js\`. **These two commits NOT RUN in CI at this checkpoint**.
- PR run \`43606304427\` on older \`c4b66860\`: type-check and lint PASS; build PASS; tests IN PROGRESS when this note was written. It does not test the later real router test or fail-closed code. One grouped final candidate CI is still required on the final source SHA.
- **Remaining architectural blocker is separate:** SDK event delivery remains at-most-once and \`provides: ["opencode"]\` lacks detached shells and pending dispatch; false completion fix alone does not prove legacy watcher parity. Do not enable a second sender or remove legacy. For a new host adapter apply C2 owner's approval path; no unapproved internal contract added.


## B1 SDK host admission failure and correction — 2026-11-14

- First real SDK-host contract run \`43606304427\` on \`c4b668606590fa8fa6445ffa37d6539d19f022ae\`: typecheck PASS, lint PASS, build PASS; **tests FAIL** (593/594 executed test files passed, 1 failed). Only new test \`server/lib/guests/telegram-shadow.integration.test.js:36\`: \`inspectGuestPackage(...).ok\` returned false, so extension admission had never actually been verified by earlier Node-only service tests. A real missing feature was caught before deployment.
- Inspected public SDK sessionEvents contribution type and manifest: \`content?: true\` is optional for an SDK extension with metadata-only events. Shadow \`package.json\` incorrectly declared \`"content": false\`, which the strict parser does not accept. Removed false key (\`e6c4feea\`); now missing means no transcript grant, as required by the privacy design. Adjusted test to assert metadata-only (\`c7bf070d\`, \`049c14cc\`) and to print full admission code/reason on failure. **Diagnosis is source-based; final PASS not asserted until next CI.**
- Additional pending test in same file \`117ca7bb\`: actual event router => SDK service shadow integration, no Bot API. Protection \`c8c315fd\` and regression \`5e6de6c2\` prevent a false \`turn-finished\` on unreadable child status. No production sender change or unapproved cross-provider adapter.
- This is the **grouped final candidate CI** trigger after all scoped fixes. Tests must confirm native extension admission, real routing, service restart/grant revocation, and fail-closed negative case alongside regular typecheck/lint/build. No merge/release until exact HEAD green and remaining my-opencode/Telegram parity acceptance.


## SDK host real router integration — second bounded checkpoint (2026-11-14)

- PR \`eefefdb839ff6cb93f62ca904c1cd3248f46f3c4\`, run \`43607289584\`: type-check/lint/build PASS, RU i18n PASS, tests **FAIL only new integration** \`telegram-shadow.integration.test.js:148\` (593 passed / 1 failed file). First test (real SDK manifest admission, host service access/grant, root/child durable journal, restart and revoke) PASS. The second test immediately sent busy and idle, then observed 1 persisted event rather than expected 2; logs did not name which one. No production SDK exceptions in other 11,013 tests; newly added fail-closed unit tests passed as part of the suite.
- Scoped fix \`45afda303\` in **test fixture only**: serialize the scenario as a real turn (verify \`turn-started\` persisted before announcing idle), return OpenCode's native page shape exactly as already used by \`session-events.test.js\` (\`{data:[],cursor:{}}\`), then require \`turn-finished\`; bounded 6s wait per phase. Any failure now logs only synthetic test event types, active/read routes and warnings to diagnose root cause, not secrets or production data. No weakening of expected 2 events, no production source changed.
- Re-run grouped CI on final source HEAD and read full failure evidence before any further change. Do not mark this test PASS based on other tests. Keep Telegram sender disabled.

