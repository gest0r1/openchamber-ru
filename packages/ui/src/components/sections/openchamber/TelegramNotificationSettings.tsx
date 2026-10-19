import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import {
  SettingsSection, SettingsCheckboxRow, SettingsFieldRow,
  SETTINGS_FIELDS_STACK_CLASS, SETTINGS_SELECT_ROW_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';

type TelegramKind = 'private' | 'group' | 'topic';
type TelegramAlias = {
  name: string;
  chat_id_masked: string;
  message_thread_id: number | null;
  kind: TelegramKind;
};
type TelegramConfig = { enabled: boolean; defaultAlias: string; hasBotToken: boolean };
type AliasDraft = { name: string; chatId: string; threadId: string; kind: TelegramKind; previousName: string };
const blankAlias = (): AliasDraft => ({ name: '', chatId: '', threadId: '', kind: 'private', previousName: '' });

const telegramRequest = async <T,>(path: string, method = 'GET', body?: object): Promise<T> => {
  const response = await runtimeFetch(`/api/notifications/telegram/${path}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${response.status}`);
  return data as T;
};

export const TelegramNotificationSettings: React.FC = () => {
  const { t } = useI18n();
  const [config, setConfig] = React.useState<TelegramConfig | null>(null);
  const [aliases, setAliases] = React.useState<TelegramAlias[]>([]);
  const [botToken, setBotToken] = React.useState('');
  const [draft, setDraft] = React.useState<AliasDraft>(blankAlias);
  const [busy, setBusy] = React.useState(false);
  const [loadingError, setLoadingError] = React.useState('');

  const refresh = React.useCallback(async () => {
    const [settings, recipients] = await Promise.all([
      telegramRequest<TelegramConfig>('config'),
      telegramRequest<{ aliases: TelegramAlias[] }>('aliases'),
    ]);
    setConfig(settings);
    setAliases(recipients.aliases);
    setLoadingError('');
  }, []);

  React.useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const [settings, recipients] = await Promise.all([
          telegramRequest<TelegramConfig>('config'),
          telegramRequest<{ aliases: TelegramAlias[] }>('aliases'),
        ]);
        if (!disposed) {
          setConfig(settings);
          setAliases(recipients.aliases);
        }
      } catch {
        if (!disposed) setLoadingError(t('settings.notifications.telegram.unavailable'));
      }
    };
    void load();
    return () => { disposed = true; };
  }, [t]);

  const saveConfig = async (changes: { enabled?: boolean; defaultAlias?: string; botToken?: string }) => {
    setBusy(true);
    try {
      await telegramRequest('config', 'POST', changes);
      await refresh();
      setBotToken('');
    } catch {
      setLoadingError(t('settings.notifications.telegram.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveAlias = async () => {
    setBusy(true);
    try {
      await telegramRequest('aliases', 'POST', {
        alias: draft.name,
        previousName: draft.previousName || undefined,
        chatId: draft.chatId || null,
        threadId: draft.threadId.trim() ? Number(draft.threadId) : null,
        kind: draft.kind,
      });
      setDraft(blankAlias());
      await refresh();
    } catch {
      setLoadingError(t('settings.notifications.telegram.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const removeAlias = async (name: string) => {
    setBusy(true);
    try {
      await telegramRequest('aliases', 'DELETE', { alias: name });
      if (config?.defaultAlias.toLocaleLowerCase() === name.toLocaleLowerCase()) {
        await telegramRequest('config', 'POST', { defaultAlias: '' });
      }
      await refresh();
    } catch {
      setLoadingError(t('settings.notifications.telegram.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const testAlias = async (name: string) => {
    setBusy(true);
    try {
      const result = await telegramRequest<{ delivered: boolean }>('test', 'POST', { alias: name });
      setLoadingError(result.delivered
        ? t('settings.notifications.telegram.testSent')
        : t('settings.notifications.telegram.disabled'));
    } catch {
      setLoadingError(t('settings.notifications.telegram.testFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection settingsItem="notifications.telegram" title={t('settings.notifications.telegram.title')}>
      <div className={SETTINGS_FIELDS_STACK_CLASS}>
        <SettingsCheckboxRow
          checked={config?.enabled === true}
          disabled={!config || busy}
          onChange={(enabled) => { void saveConfig({ enabled }); }}
          label={t('settings.notifications.telegram.enabled')}
          ariaLabel={t('settings.notifications.telegram.enabled')}
        />
        <p className="typography-meta text-muted-foreground">{t('settings.notifications.telegram.optInHint')}</p>
        <SettingsFieldRow label={t('settings.notifications.telegram.botToken')}>
          <div className="flex max-w-[24rem] flex-wrap items-center gap-2">
            <Input
              type="password"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder={config?.hasBotToken ? t('settings.notifications.telegram.tokenSaved') : t('settings.notifications.telegram.tokenPlaceholder')}
              autoComplete="new-password"
              aria-label={t('settings.notifications.telegram.botToken')}
              className="h-8 min-w-0 flex-1"
            />
            <Button size="sm" variant="outline" disabled={busy || !botToken} onClick={() => { void saveConfig({ botToken }); }}>
              {t('settings.notifications.telegram.save')}
            </Button>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.notifications.telegram.defaultAlias')}>
          <Select
            value={config?.defaultAlias || '_none'}
            onValueChange={(value) => { void saveConfig({ defaultAlias: value === '_none' ? '' : value }); }}
            disabled={!config || busy}
          >
            <SelectTrigger size="settings" className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue placeholder={t('settings.notifications.telegram.noAlias')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t('settings.notifications.telegram.noAlias')}</SelectItem>
              {aliases.map((alias) => <SelectItem key={alias.name} value={alias.name}>{alias.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsFieldRow>
        <p className="typography-meta text-muted-foreground">{t('settings.notifications.telegram.formatHint')}</p>
        {aliases.map((alias) => (
          <div key={alias.name} className="flex flex-wrap items-center gap-2">
            <span className="typography-ui-label min-w-0 flex-1">
              {alias.name} ({alias.chat_id_masked}{alias.message_thread_id ? ` / ${alias.message_thread_id}` : ''})
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft({
              previousName: alias.name, name: alias.name, chatId: '',
              threadId: alias.message_thread_id ? String(alias.message_thread_id) : '', kind: alias.kind,
            })}>{t('settings.notifications.telegram.edit')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void testAlias(alias.name); }}>
              {t('settings.notifications.telegram.test')}
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => { void removeAlias(alias.name); }}>
              {t('settings.notifications.telegram.remove')}
            </Button>
          </div>
        ))}
        <div className="grid max-w-[32rem] grid-cols-1 gap-2 @xl:grid-cols-2">
          <Input
            value={draft.name} onChange={(event) => setDraft((old) => ({ ...old, name: event.target.value }))}
            aria-label={t('settings.notifications.telegram.name')}
            placeholder={t('settings.notifications.telegram.name')}
            className="h-8"
          />
          <Input
            value={draft.chatId} onChange={(event) => setDraft((old) => ({ ...old, chatId: event.target.value }))}
            aria-label={t('settings.notifications.telegram.chatId')}
            placeholder={draft.previousName ? t('settings.notifications.telegram.keepChatId') : t('settings.notifications.telegram.chatId')}
            className="h-8"
          />
          <Input
            value={draft.threadId} onChange={(event) => setDraft((old) => ({ ...old, threadId: event.target.value }))}
            aria-label={t('settings.notifications.telegram.threadId')}
            placeholder={t('settings.notifications.telegram.threadId')}
            className="h-8"
            inputMode="numeric"
          />
          <Select value={draft.kind} onValueChange={(kind) => setDraft((old) => ({ ...old, kind: kind as TelegramKind }))}>
            <SelectTrigger size="settings" className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{t('settings.notifications.telegram.private')}</SelectItem>
              <SelectItem value="group">{t('settings.notifications.telegram.group')}</SelectItem>
              <SelectItem value="topic">{t('settings.notifications.telegram.topic')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy || !draft.name.trim()} onClick={() => { void saveAlias(); }}>
            {t('settings.notifications.telegram.saveAlias')}
          </Button>
          {draft.previousName && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(blankAlias())}>
            {t('settings.notifications.telegram.cancel')}
          </Button>}
        </div>
        {loadingError && <p role="status" className="typography-meta text-muted-foreground">{loadingError}</p>}
      </div>
    </SettingsSection>
  );
};
