// Russian translations for keys introduced after the fork's 1.24.x baseline.
// The coverage test rejects non-allowlisted English fallbacks.
export const v2RussianOverrides = {
  'common.language.russian': 'Русский',
  'sessions.sidebar.sessionDialogs.worktree.errorRemoveTitle': 'Не удалось удалить worktree «{name}»',
  'sessions.sidebar.sessionDialogs.worktree.removedTitle': 'Worktree «{name}» удалён',
  'gitView.changes.revertAllDescriptionPlural': 'Отменить изменения в {count} файлах? Это действие нельзя отменить.',
  'gitView.changes.revertAllDescriptionSingle': 'Отменить изменение в {count} файле? Это действие нельзя отменить.',
  'gitView.conflict.detectedDescription': 'Разрешите конфликты операции {operation}, чтобы продолжить.',
  'gitView.conflict.detectedTitle': 'Обнаружены конфликты операции {operation}',
  'inlineComment.input.placeholder': 'Добавить комментарий… ({shortcut} для сохранения)',
} as const;
