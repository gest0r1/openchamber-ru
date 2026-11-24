import { z } from 'zod';
import type { Application, RequestHandler, Response } from '../shared/http-contracts.js';
import type { createUiAuth } from '../ui-auth/ui-auth.js';
import type { createSessionCompletionProof, TelegramSession, TelegramSourceFor } from '../guests/session-completion-proof.js';
import { telegramSessionRecord } from '../guests/session-completion-proof.js';
import type { createTelegramRuntime, TelegramSender } from './telegram-runtime.js';
import type { createTelegramConfig } from './telegram-config.js';
import type { createTelegramWatch } from './telegram-watch.js';
import type { createTelegramApproval } from './telegram-approval.js';

type Runtime = ReturnType<typeof createTelegramRuntime>;
type Subscription = Awaited<ReturnType<Runtime['listSubscriptions']>>[number];
type Config = ReturnType<typeof createTelegramConfig>;
type RoutesOptions = {
  telegram: Runtime;
  config: Config;
  watch: ReturnType<typeof createTelegramWatch>;
  approval: ReturnType<typeof createTelegramApproval>;
  getSource: TelegramSourceFor;
  dispatchPending: () => Promise<readonly { parentSessionId: string }[]>;
  uiAuthController: Pick<ReturnType<typeof createUiAuth>, 'ensureSessionToken'> | null;
  completionProof: ReturnType<typeof createSessionCompletionProof>;
  sdkSenderReady?: () => Promise<boolean>;
};
const inputSchema = z.object({
  sessionId: z.string().trim().min(1),
  directory: z.string().trim().min(1),
  spaceId: z.string().trim().min(1).nullish(),
});
const aliasSchema = z.object({
  alias: z.string(), chatId: z.union([z.string(), z.number()]).nullish(),
  threadId: z.union([z.string(), z.number()]).nullish(),
  kind: z.enum(['private', 'group', 'topic']).optional(),
  previousName: z.string().nullish(),
});
const contentSchema = z.object({
  alias: z.string().optional(), text: z.string().optional(),
  file: z.string().optional(), mode: z.string().optional(), caption: z.string().optional(),
});
const getField = (body: Parameters<typeof contentSchema.safeParse>[0], key: string) =>
  z.record(z.string(), z.json()).safeParse(body).data?.[key];

export const registerTelegramRoutes = (app: Application, { telegram, config, watch, approval, getSource, dispatchPending, uiAuthController, completionProof, sdkSenderReady = async () => false }: RoutesOptions) => {
  app.use('/api/notifications/telegram', async (req, res, next) => {
    if (req.path === '/pending') return next();
    try {
      const token = await uiAuthController?.ensureSessionToken?.(req, res);
      if (!token) {
        if (!res.headersSent) res.status(401).json({ error: 'UI session required' });
        return;
      }
      next();
    } catch (error) { next(error); }
  });
  const asyncRoute = (handler: RequestHandler): RequestHandler => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
  const fail = (res: Response, error: Parameters<typeof contentSchema.safeParse>[0]) => res.status(error instanceof TypeError ? 400 : 502).json({
    error: error instanceof TypeError ? error.message : 'Telegram operation failed',
  });
  const asString = (value: Parameters<typeof contentSchema.safeParse>[0]) => z.string().safeParse(value).data?.trim() ?? '';
  const sessionInput = (body: Parameters<typeof inputSchema.safeParse>[0]) => {
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new TypeError('Session and directory required');
    const { sessionId, directory, spaceId } = parsed.data;
    return { sessionId, directory, spaceId: spaceId ?? null };
  };
  const verify = async (item: TelegramSession) => {
    const source = getSource(item.spaceId ?? null);
    if (!source) throw new TypeError('Session source unavailable');
    const url = source.buildOpenCodeUrl('/api/session/' + encodeURIComponent(item.sessionId), '');
    const response = await source.fetchImpl(url, {
      method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new TypeError('Session not found');
    const raw = await response.json();
    const record = telegramSessionRecord.safeParse(raw?.data ?? raw).data;
    const actual = record?.location?.directory;
    if (record?.id !== item.sessionId || actual !== item.directory || record?.parentID) {
      throw new TypeError('Only a root session in its actual location can be subscribed');
    }
    return record;
  };

  const baselineIdleId = async (item: TelegramSession) => {
    const source = getSource(item.spaceId ?? null);
    if (!source) return undefined;
    try {
      const url = source.buildOpenCodeUrl('/api/session/' + encodeURIComponent(item.sessionId) + '/message', '');
      const response = await source.fetchImpl(url + '?limit=1&order=desc&type=idle', {
        method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return undefined;
      const body = await response.json();
      const rows = z.array(z.json()).safeParse(Array.isArray(body) ? body : body?.data);
      if (!rows.success) return undefined;
      for (const row of rows.data) {
        const idle = z.object({ type: z.literal('idle'), id: z.string() }).safeParse(row);
        if (idle.success) return idle.data.id;
      }
      return null;
    } catch { return undefined; }
  };

  app.get('/api/notifications/telegram/pending', asyncRoute(async (req, res) => {
    const sessionId = asString(req.query?.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const entries = await dispatchPending();
    res.json({ pending: entries.some((entry) => entry.parentSessionId === sessionId) });
  }));

  app.get('/api/notifications/telegram/approvals', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ approvals: approval.list() });
  }));
  app.post('/api/notifications/telegram/approvals/decide', asyncRoute(async (req, res) => {
    const decision = z.object({ id: z.string(), approved: z.boolean() }).safeParse(req.body);
    if (!decision.success) {
      return res.status(400).json({ error: 'id and approved are required' });
    }
    res.json({ resolved: approval.decide(decision.data.id, decision.data.approved) });
  }));
  app.get('/api/notifications/telegram/delivery-issues', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ deliveries: await telegram.listDeliveryIssues() });
  }));
  app.post('/api/notifications/telegram/delivery-issues/retry', asyncRoute(async (req, res) => {
    try {
      res.json({ delivered: await telegram.retryDelivery(asString(getField(req.body, 'key'))) });
    } catch (error) { fail(res, error); }
  }));
  let switchingSender = false;
  let subscriptionsInFlight = 0;
  app.get('/api/notifications/telegram/sender', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ sender: (await config.read()).sender, sdkReady: await sdkSenderReady() });
  }));
  app.post('/api/notifications/telegram/sender', asyncRoute(async (req, res) => {
    const mode = asString(getField(req.body, 'sender'));
    if (mode !== 'legacy' && mode !== 'sdk') return res.status(400).json({ error: 'Invalid sender' });
    if (switchingSender || subscriptionsInFlight > 0) return res.status(409).json({ error: 'Sender change or subscription in progress' });
    switchingSender = true;
    let paused = false;
    let previous: TelegramSender = 'legacy';
    try {
      const current = (await config.read()).sender;
      previous = current;
      if (current === mode) return res.json({ sender: mode });
      if (mode === 'legacy') {
        await config.update({ sender: 'paused' });
        paused = true;
        await telegram.waitForSettledDeliveries();
        await config.update({ sender: 'legacy' });
        paused = false;
        await watch.start();
        return res.json({ sender: 'legacy' });
      }
      if (current !== 'legacy' || !await sdkSenderReady()) {
        return res.status(409).json({ error: 'Approved and ready SDK notifier required' });
      }
      await config.update({ sender: 'paused' });
      paused = true;
      await telegram.waitForSettledDeliveries();
      const entries = await telegram.listSubscriptions();
      const old = await watch.checkpoints();
      if (entries.some((entry) => entry.spaceId)) {
        throw new TypeError('Isolated-space page attention is not yet covered by the SDK notifier');
      }
      const snapshots = [];
      for (const item of entries) {
        const latest = await completionProof(item);
        const checkpoint = old.find((row) =>
          row.directory === item.directory && row.sessionId === item.sessionId &&
          (row.spaceId ?? null) === (item.spaceId ?? null));
        if (latest.kind !== 'idle' || !latest.idle?.id || !checkpoint ||
            checkpoint.baselineIdleId !== latest.idle.id || checkpoint.armed ||
            checkpoint.requireNewIdle) {
          throw new TypeError('Cannot cut over: legacy subscription has unsettled or unknown work');
        }
        snapshots.push({ directory: item.directory, sessionId: item.sessionId,
          spaceId: item.spaceId, createdAt: item.createdAt, idleId: latest.idle.id });
      }
      await telegram.seedBaselines(snapshots);
      if (!await sdkSenderReady()) throw new TypeError('SDK notifier disconnected during cutover');
      await config.update({ sender: 'sdk' });
      paused = false;
      return res.json({ sender: 'sdk' });
    } catch (error) {
      if (paused) {
        const restore = previous === 'sdk' ? 'sdk' : 'legacy';
        await config.update({ sender: restore });
        if (restore === 'legacy') await watch.start();
      }
      return res.status(error instanceof TypeError ? 409 : 502).json({
        error: error instanceof TypeError ? error.message : 'Telegram sender cutover failed',
      });
    } finally { switchingSender = false; }
  }));

  app.get('/api/notifications/telegram/config', asyncRoute(async (_req, res) => {
    res.json(await config.publicConfig());
  }));
  app.post('/api/notifications/telegram/config', asyncRoute(async (req, res) => {
    const input = z.record(z.string(), z.json()).safeParse(req.body).data ?? {};
    const patch: Parameters<Config['update']>[0] = {};
    if (input.enabled !== undefined) {
      const enabled = z.boolean().safeParse(input.enabled);
      if (!enabled.success) return res.status(400).json({ error: 'enabled must be a boolean' });
      patch.enabled = enabled.data;
    }
    if (input.botToken !== undefined && input.botToken !== '') {
      const token = z.string().regex(/^[0-9]+:[A-Za-z0-9_-]+$/).safeParse(input.botToken);
      if (!token.success) {
        return res.status(400).json({ error: 'Invalid bot token' });
      }
      patch.botToken = token.data;
    }
    if (input.defaultAlias !== undefined) {
      const alias = asString(input.defaultAlias);
      if (alias && !(await telegram.listAliases()).includes(alias.toLocaleLowerCase())) {
        return res.status(400).json({ error: 'Unknown Telegram alias' });
      }
      patch.defaultAlias = alias;
    }
    res.json(await config.update(patch));
  }));

  app.get('/api/notifications/telegram/aliases', asyncRoute(async (_req, res) => {
    res.json({ aliases: await telegram.listAliasDetails() });
  }));
  app.post('/api/notifications/telegram/aliases', asyncRoute(async (req, res) => {
    try {
      const parsed = aliasSchema.safeParse(req.body);
      if (!parsed.success) throw new TypeError('Invalid Telegram alias or destination');
      const a = parsed.data;
      await telegram.configureAlias(a.alias, a.chatId ?? null, a.threadId == null || a.threadId === '' ? null : Number(a.threadId), a.kind ?? 'private', a.previousName || null);
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  }));
  app.delete('/api/notifications/telegram/aliases', asyncRoute(async (req, res) => {
    try {
      const alias = asString(getField(req.body, 'alias'));
      await telegram.deleteAlias(alias);
      if ((await config.read()).defaultAlias.toLocaleLowerCase() === alias.toLocaleLowerCase()) {
        await config.update({ defaultAlias: '' });
      }
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/test', asyncRoute(async (req, res) => {
    try {
      const result = await telegram.sendContent({ alias: asString(getField(req.body, 'alias')), text: 'OpenChamber Telegram test' });
      res.json(result);
    } catch (error) { fail(res, error); }
  }));
  const subscriptionLiveTitle = async (item: Subscription) => {
    let title = item.title || item.sessionId;
    const source = getSource(item.spaceId ?? null);
    if (source) {
      try {
        const url = source.buildOpenCodeUrl('/api/session/' + encodeURIComponent(item.sessionId), '');
        const answer = await source.fetchImpl(url, {
          method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
          signal: AbortSignal.timeout(4000),
        });
        if (answer.ok) {
          const data = await answer.json();
          const row = telegramSessionRecord.safeParse(data?.data ?? data).data;
          if (row?.id === item.sessionId && row?.location?.directory === item.directory &&
              row.title?.trim()) title = row.title.slice(0, 200);
        }
      } catch { void 0; }
    }
    return { ...item, title };
  };
  const refreshTitles = async (items: Subscription[]) => {
    let cursor = 0;
    const rows: Subscription[] = new Array(items.length);
    const worker = async () => {
      while (cursor < items.length) {
        const i = cursor++;
        const item = items[i];
        if (item) rows[i] = await subscriptionLiveTitle(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
    return rows;
  };
  app.get('/api/notifications/telegram/subscriptions', asyncRoute(async (req, res) => {
    try {
      const page = Math.max(0, Math.min(100000, Number.parseInt(asString(req.query?.page) || '0', 10) || 0));
      const limit = 30;
      const query = asString(req.query?.q).slice(0, 120).toLocaleLowerCase();
      const entries = (await telegram.listSubscriptions())
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const candidates = query ? await refreshTitles(entries) : entries;
      const matches = candidates.filter((item) => !query ||
        [item.title, item.directory, item.sessionId, item.alias]
          .some((field) => field?.toLocaleLowerCase().includes(query)));
      const slice = matches.slice(page * limit, (page + 1) * limit);
      const subscriptions = query ? slice : await refreshTitles(slice);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ subscriptions, total: matches.length, page, hasMore: (page + 1) * limit < matches.length });
    } catch (error) { fail(res, error); }
  }));
  app.get('/api/notifications/telegram/subscription', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.query);
      res.json({ subscribed: await telegram.hasSubscription(item.directory, item.sessionId) });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/subscription/status', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.body);
      res.json({ subscribed: await telegram.hasSubscription(item.directory, item.sessionId) });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/subscribe', asyncRoute(async (req, res) => {
    if (switchingSender) return res.status(409).json({ error: 'Sender cutover in progress' });
    subscriptionsInFlight += 1;
    try {
      const item = sessionInput(req.body);
      const senderAtStart = (await config.read()).sender;
      if (senderAtStart === 'paused') return res.status(409).json({ error: 'Sender cutover in progress' });
      const record = await verify(item);
      const baseline = await baselineIdleId(item);
      if (switchingSender || (await config.read()).sender !== senderAtStart) {
        return res.status(409).json({ error: 'Sender changed during subscription' });
      }
      if (senderAtStart === 'sdk' && baseline === undefined) {
        throw new TypeError('Cannot establish a safe Telegram subscription baseline');
      }
      await telegram.subscribe(item.directory, item.sessionId, asString(getField(req.body, 'alias')), {
        origin: 'user', spaceId: item.spaceId, title: record.title ?? null,
        baselineIdleId: baseline ?? null,
      });
      try {
        await watch.track(item);
      } catch (error) {
        await telegram.unsubscribe(item.directory, item.sessionId);
        await watch.cancel(item.sessionId, item.directory, item.spaceId);
        throw error;
      }
      res.json({ subscribed: true });
    } catch (error) { fail(res, error); }
    finally { subscriptionsInFlight -= 1; }
  }));
  app.post('/api/notifications/telegram/unsubscribe', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.body);
      await telegram.unsubscribe(item.directory, item.sessionId);
      await watch.cancel(item.sessionId, item.directory, item.spaceId);
      res.json({ subscribed: false });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/send', asyncRoute(async (req, res) => {
    try {
      const parsed = contentSchema.safeParse(req.body);
      if (!parsed.success) throw new TypeError('Invalid Telegram message');
      const result = await telegram.sendContent(parsed.data);
      res.json(result);
    } catch (error) { fail(res, error); }
  }));
};
