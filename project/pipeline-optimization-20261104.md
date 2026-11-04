# Pipeline optimization — 20261104

Статус: **частично, не готово к слиянию или установке**.

Канонический отчёт: [my-opencode REPORT.md](https://github.com/gest0r1/my-opencode/blob/feature/pipeline-optimization-20261104/project/pipeline-optimization-20261104/REPORT.md).

- Исходный `main` OpenChamber RU: `f9521f168c894cb17dc60ba4f929d4df0722e263`.
- Рабочая ветка: [feature/pipeline-optimization-20261104](https://github.com/gest0r1/openchamber-ru/tree/feature/pipeline-optimization-20261104).
- Commit `279a2b4` добавил assertions для endSource и зафиксировал повторный Node PASS на актуальном projection source; продолжение и evidence: [timing-evidence.md](pipeline-optimization-20261104/timing-evidence.md).
- Источник времени: уже сохранённые `ToolPart.state.time.start/end`, `sessionID/callID`; **нельзя** выдавать в MD как точное процессное время, если OpenCode проецирует `wire.time.created` в start или синтезирует end=start.
- Экспорт по-прежнему не очищает секреты из текста сообщений, но новый timing-блок не включает input/output.
- Официальный upstream stable ориентир: OpenChamber `v2.6.1` `ce853f415704d1bfe8d076a5cfb2caabac00fffd`. Текущий fork и этот stable расходятся по истории: GitHub compare `behind_by=323`, `ahead_by=482`, merge-base `c4919abc1e7a0a3beeaa126666487806bf79cfe0`. **Upstream не интегрирован.** Нужен независимый checkout для безопасного merge/conflict resolution.
- OpenCode stable ориентир `v2.2.5` `9bbb8ce18c80f099e0e448775f59d965ead40a21`. Binary/client/plugin pins **не изменены**, поскольку не выполнены проверки совместимости.
- Тесты `bun test packages/ui/src/lib/exportSession*.test.ts`, `bun run check:changed`, type-check/build/UI не запускались: GitHub connector поддерживает remote read/write, но не предоставляет checkout/shell; основной контейнер не резолвит github.com. Запрещено использовать production сервер `sevami` для испытаний.
- Релизы/merge/main/deploy/restart не выполнялись. Продолжать из основной записи my-opencode и тестировать оба репозитория **до** интеграции.

Пример синтетического Markdown и provenance: [timing-evidence.md](https://github.com/gest0r1/my-opencode/blob/feature/pipeline-optimization-20261104/project/pipeline-optimization-20261104/timing-evidence.md).
