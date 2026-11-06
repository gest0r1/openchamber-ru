import { describe, expect, test } from 'bun:test';

import { fileArtifactsI18n } from './file-artifacts.i18n';
import { dict as ruDict } from './ru';

const dictionaries = {
  ...fileArtifactsI18n,
  ru: ruDict,
};

const locales = ['en', 'de', 'fr', 'nl', 'es', 'ja', 'pt-BR', 'uk', 'ko', 'pl', 'zh-CN', 'zh-TW', 'tr', 'ru'] as const;

describe('file artifact translations', () => {
  test('provides every key in every supported locale, translated', () => {
    const english = dictionaries.en;
    // SAFETY: The static English fixture owns every key returned by Object.keys.
    const keys = Object.keys(english) as Array<keyof typeof english>;
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of locales) {
      for (const key of keys) {
        const value = dictionaries[locale][key];
        expect(value).toBeTruthy();
        if (locale !== 'en') expect(value).not.toBe(english[key]);
      }
    }
  });
});
