import type { I18nKey } from './en';

/**
 * Russian overrides for English keys that are not yet translated in the
 * historical locale files. Keep this file exhaustive: CI rejects any English
 * fallback that is not explicitly allowlisted as a technical term.
 */
export const fullRussianOverrides: Partial<Record<I18nKey, string>> = {
};
