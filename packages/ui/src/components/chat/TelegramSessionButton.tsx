import React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { spaceIdOfDirectory } from '@/lib/spaces/space-route';

const request = async (path: string, method = 'GET', data?: { sessionId: string; directory: string; spaceId: string | null }) => {
  const init: RequestInit = { method };
  if (data) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(data);
  }
  const response = await runtimeFetch('/api/notifications/telegram/' + path, init);
  if (!response.ok) throw new Error('Telegram settings unavailable');
  return response.json();
};

/** Opt-in is a user action and belongs to the current root session, not a global setting. */
export const TelegramSessionButton: React.FC<{ sessionId: string | null; directory?: string | null }> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const [ready, setReady] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let canceled = false;
    setReady(false);
    setSubscribed(false);
    if (!sessionId || !directory) return;
    const fetchStatus = async () => {
      try {
        // The space dispatcher rejects host-only notification routes when a
        // space directory appears in the query or directory header.
        // Put it in the POST body so the host owns this lookup.
        const [config, subscription] = await Promise.all([
          request('config'),
          request('subscription/status', 'POST', {
            sessionId, directory, spaceId: spaceIdOfDirectory(directory),
          }),
        ]);
        if (canceled) return;
        setSubscribed(subscription?.subscribed === true);
        setReady(config?.enabled === true && (subscription?.subscribed === true || Boolean(config?.defaultAlias)));
      } catch { if (!canceled) setReady(false); }
    };
    void fetchStatus();
    return () => { canceled = true; };
  }, [sessionId, directory]);

  if (!sessionId || !directory || !ready) return null;

  const onToggle = async () => {
    setBusy(true);
    try {
      const spaceId = spaceIdOfDirectory(directory);
      await request(subscribed ? 'unsubscribe' : 'subscribe', 'POST', { sessionId, directory, spaceId });
      setSubscribed(!subscribed);
    } catch { /* The server refuses invalid or non-root sessions. */ }
    finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => { void onToggle(); }}
      aria-label={subscribed ? t('settings.notifications.telegram.unsubscribe') : t('settings.notifications.telegram.subscribe')}>
      Telegram: {subscribed ? t('settings.notifications.telegram.unsubscribe') : t('settings.notifications.telegram.subscribe')}
    </Button>
  );
};
