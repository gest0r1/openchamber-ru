import React from 'react';
import { z } from 'zod';
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
const telegramConfigSchema = z.object({
  enabled: z.boolean(), defaultAlias: z.string(), hasBotToken: z.boolean(),
});
const telegramAliasesSchema = z.object({
  aliases: z.array(z.object({
    name: z.string(),
    chat_id_masked: z.string(),
    message_thread_id: z.number().nullable(),
    kind: z.enum(['private', 'group', 'topic']),
  })),
});
type TelegramConfig = z.infer<typeof telegramConfigSchema>;
type ListedSession = { id: string; title: string; directory: string; spaceId: string | null };
type Approval = { id: string; sessionId: string; alias: string; file: string | null; preview: string; mode: string };
type DeliveryIssue = { key: string; status: string; sessionId: string; type: string; at: number; reason?: string };
type AliasDraft = { name: string; chatId: string; threadId: string; kind: TelegramKind; previousName: string };
const blankAlias = (): AliasDraft => ({ name: '', chatId: '', threadId: '', kind: 'private', previousName: '' });

const telegramRequest = async (path: string, method = 'GET', body?: object): Promise<unknown> => {
  const response = await runtimeFetch(`/api/notifications/telegram/${path}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${response.status}`);
  return data;
};

export const TelegramNotificationSettings: React.FC = () => {
  const { t } = useI18n();
  const [config, setConfig] = React.useState<TelegramConfig | null>(null);
  const [aliases, setAliases] = React.useState<TelegramAlias[]>([]);
  const [botToken, setBotToken] = React.useState('');
  const [draft, setDraft] = React.useState<AliasDraft>(blankAlias);
  const [busy, setBusy] = React.useState(false);
  const [sessions, setSessions] = React.useState<ListedSession[]>([]);
  const [selectedSession, setSelectedSession] = React.useState('');
  const [subscribed, setSubscribed] = React.useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = React.useState(false);
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [deliveryIssues, setDeliveryIssues] = React.useState<DeliveryIssue[]>([]);
  const [approvalBusy, setApprovalBusy] = React.useState(false);
  const [loadingError, setLoadingError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await runtimeFetch('/api/session?limit=50&order=desc');
        if (!response.ok) return;
        const body: unknown = await response.json();
        const rows = z.object({ data: z.array(z.object({
          id: z.string(), title: z.string().optional(),
          parentID: z.string().nullish(),
          location: z.object({ directory: z.string() }),
        }).passthrough()) }).safeParse(body);
        if (!rows.success || cancelled) return;
        setSessions(rows.data.data.filter((row) => !row.parentID).map((row) => ({
          id: row.id, title: row.title || row.id, directory: row.location.directory,
          spaceId: /^\/spaces\/([^/]+)(?:\/|$)/.exec(row.location.directory)?.[1] ?? null,
        })));
      } catch { /* The channel can be configured without a connected OpenCode. */ }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const sessionFromSelection = React.useCallback(() =>
    sessions.find((session) => session.id === selectedSession), [sessions, selectedSession]);

  const chooseSession = async (sessionId: string) => {
    setSelectedSession(sessionId);
    setSubscribed(false);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    try {
      const params = new URLSearchParams({ sessionId: session.id, directory: session.directory });
      const result = await telegramRequest('subscription?' + params, 'GET');
      setSubscribed(z.object({ subscribed: z.boolean() }).parse(result).subscribed);
    } catch {
      setLoadingError(t('settings.notifications.telegram.subscriptionFailed'));
    }
  };
  const toggleSubscription = async () => {
    const session = sessionFromSelection();
    if (!session) return;
    setSubscriptionBusy(true);
    try {
      const action = subscribed ? 'unsubscribe' : 'subscribe';
      await telegramRequest(action, 'POST', { sessionId: session.id, directory: session.directory, spaceId: session.spaceId });
      setSubscribed(!subscribed);
      setLoadingError('');
    } catch {
      setLoadingError(t('settings.notifications.telegram.subscriptionFailed'));
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const refreshAttention = React.useCallback(async () => {
    const [queue, deliveries] = await Promise.all([
      telegramRequest('approvals'), telegramRequest('delivery-issues'),
    ]);
    const parsedApprovals = z.object({ approvals: z.array(z.object({
      id: z.string(), sessionId: z.string(), alias: z.string(), file: z.string().nullable(),
      preview: z.string(), mode: z.string(),
    })) }).parse(queue);
    const parsedDeliveries = z.object({ deliveries: z.array(z.object({
      key: z.string(), status: z.string(), sessionId: z.string(), type: z.string(),
      at: z.number(), reason: z.string().optional(),
    })) }).parse(deliveries);
    setApprovals(parsedApprovals.approvals);
    setDeliveryIssues(parsedDeliveries.deliveries);
  }, []);

  React.useEffect(() => {
    void refreshAttention().catch(() => {});
    const id = window.setInterval(() => void refreshAttention().catch(() => {}), 3000);
    return () => window.clearInterval(id);
  }, [refreshAttention]);

  const decideApproval = async (id: string, approved: boolean) => {
    setApprovalBusy(true);
    try {
      await telegramRequest('approvals/decide', 'POST', { id, approved });
      await refreshAttention();
    } catch { setLoadingError(t('settings.notifications.telegram.saveFailed')); }
    finally { setApprovalBusy(false); }
  };
  const retryUnknownDelivery = async (key: string) => {
    setApprovalBusy(true);
    try {
      await telegramRequest('delivery-issues/retry', 'POST', { key });
      await refreshAttention();
    } catch { setLoadingError(t('settings.notifications.telegram.testFailed')); }
    finally { setApprovalBusy(false); }
  };

  const refresh = React.useCallback(async () => {
    const [settings, recipients] = await Promise.all([
      telegramRequest('config'),
      telegramRequest('aliases'),
    ]);
    setConfig(telegramConfigSchema.parse(settings));
    setAliases(telegramAliasesSchema.parse(recipients).aliases);
    setLoadingError('');
  }, []);

  React.useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const [settings, recipients] = await Promise.all([
          telegramRequest('config'),
          telegramRequest('aliases'),
        ]);
        if (!disposed) {
          setConfig(telegramConfigSchema.parse(settings));
          setAliases(telegramAliasesSchema.parse(recipients).aliases);
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
      const result = await telegramRequest('test', 'POST', { alias: name });
      setLoadingError(z.object({ delivered: z.boolean() }).parse(result).delivered
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
        {approvals.length > 0 && <section aria-label={t('settings.notifications.telegram.approvalsTitle')} className="space-y-3">
          <p className="typography-ui-label">{t('settings.notifications.telegram.approvalsTitle')}</p>
          {approvals.map((item) => <div key={item.id} className="space-y-2 rounded-md border p-3">
            <p className="typography-meta">{item.alias || t('settings.notifications.telegram.defaultAlias')} · {item.sessionId}</p>
            <p className="typography-meta break-all">{item.file || item.preview}</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={approvalBusy} onClick={() => { void decideApproval(item.id, true); }}>{t('settings.notifications.telegram.approve')}</Button>
              <Button size="sm" variant="outline" disabled={approvalBusy} onClick={() => { void decideApproval(item.id, false); }}>{t('settings.notifications.telegram.reject')}</Button>
            </div>
          </div>)}
        </section>}
        {deliveryIssues.length > 0 && <section className="space-y-3">
          <p className="typography-ui-label">{t('settings.notifications.telegram.deliveryIssuesTitle')}</p>
          <p className="typography-meta text-muted-foreground">{t('settings.notifications.telegram.deliveryIssuesWarning')}</p>
          {deliveryIssues.map((item) => <div key={item.key} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <span className="typography-meta min-w-0 flex-1">{item.sessionId} — {item.type}: {item.status}</span>
            <Button size="sm" variant="outline" disabled={approvalBusy} onClick={() => { void retryUnknownDelivery(item.key); }}>{t('settings.notifications.telegram.retryDelivery')}</Button>
          </div>)}
        </section>}
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
            <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue placeholder={t('settings.notifications.telegram.noAlias')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t('settings.notifications.telegram.noAlias')}</SelectItem>
              {aliases.map((alias) => <SelectItem key={alias.name} value={alias.name}>{alias.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.notifications.telegram.session')}>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedSession || '_none'} onValueChange={(value) => { void chooseSession(value); }}>
              <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
                <SelectValue placeholder={t('settings.notifications.telegram.noSessions')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t('settings.notifications.telegram.noSessions')}</SelectItem>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>{session.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!selectedSession || selectedSession === '_none' || subscriptionBusy || (!subscribed && !config?.defaultAlias)} onClick={() => { void toggleSubscription(); }}>
              {subscribed ? t('settings.notifications.telegram.unsubscribe') : t('settings.notifications.telegram.subscribe')}
            </Button>
          </div>
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
          <Select value={draft.kind} onValueChange={(kind) => {
            if (kind === 'private' || kind === 'group' || kind === 'topic') {
              setDraft((old) => ({ ...old, kind }));
            }
          }}>
            <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
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
