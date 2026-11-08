import { beforeEach, describe, expect, test } from 'bun:test';
import { DEFAULT_LOCALE, type Locale } from './runtime';
import { resetI18nDictionaryCacheForTests, useI18nStore } from './store';

const defaultDictionary = useI18nStore.getState().dictionary;

const resetStore = () => {
  resetI18nDictionaryCacheForTests();
  useI18nStore.setState({
    locale: DEFAULT_LOCALE,
    dictionary: defaultDictionary,
    loadingLocale: null,
  });
};

const waitForLocaleLoadToSettle = async (locale: Locale) => {
  if (useI18nStore.getState().loadingLocale !== locale) return;

  let unsubscribe = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      unsubscribe = useI18nStore.subscribe((state) => {
        if (state.loadingLocale !== locale) resolve();
      });
      timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${locale} dictionary load`)), 2_000);
      // Close the race between the initial state check and subscription setup.
      if (useI18nStore.getState().loadingLocale !== locale) resolve();
    });
  } finally {
    unsubscribe();
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

describe('i18n store', () => {
  beforeEach(resetStore);

  test('retries loading the active locale when it is not cached', async () => {
    useI18nStore.setState({
      locale: 'es',
      dictionary: defaultDictionary,
      loadingLocale: null,
    });

    try {
      useI18nStore.getState().setLocale('es');

      expect(useI18nStore.getState().loadingLocale).toBe('es');
      await waitForLocaleLoadToSettle('es');
    } finally {
      resetStore();
    }
  });

  test('loads Russian translations for existing and upstream keys', async () => {
    try {
      useI18nStore.getState().setLocale('ru');
      await waitForLocaleLoadToSettle('ru');
      const dictionary = useI18nStore.getState().dictionary;
      expect(dictionary['opencodeCompatibility.title']).toBe('Требуется OpenCode v2');
      expect(dictionary['chat.agentStatus.browser.capture']).toBe('делает снимок экрана');
    } finally {
      resetStore();
    }
  });

  test('loads the french dictionary', async () => {
    try {
      useI18nStore.getState().setLocale('fr');

      expect(useI18nStore.getState().loadingLocale).toBe('fr');
      await waitForLocaleLoadToSettle('fr');
      expect(useI18nStore.getState().dictionary['common.language.french']).toBe('Français');
    } finally {
      resetStore();
    }
  });
});
