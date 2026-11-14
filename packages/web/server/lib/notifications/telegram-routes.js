import { z } from 'zod';

/** UI-authenticated routes. The server stores all credentials and destinations. */
export const registerTelegramRoutes = (app, { telegram, config, watch, approval, getSource, dispatchPending, uiAuthController, completionProof, sdkSenderReady = async () => false }) => {
  // The route that the host asks inside a space must remain accessible over
  // the trusted dispatcher. All user-facing configuration/send routes require
  // a UI session independently of the upstream OpenCode API auth gate.
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
  const asyncRoute = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
  const fail = (res, error) => res.status(error instanceof TypeError ? 400 : 502).json({
    error: error instanceof TypeError ? error.message : 'Telegram operation failed',
  });
  const asString = (value) => z.string().safeParse(value).data?.trim() ?? '';
  const sessionInput = (body) => {
    const sessionId = asString(body?.sessionId);
    const directory = asString(body?.directory);
    const spaceId = body?.spaceId == null ? null : asString(body.spaceId);
    if (!sessionId || !directory || (body?.spaceId != null && !spaceId)) throw new TypeError('Session and directory required');
    return { sessionId, directory, spaceId };
  };
  const verify = async (item) => {
    const source = getSource(item.spaceId);
    if (!source) throw new TypeError('Session source unavailable');
    const url = source.buildOpenCodeUrl('/api/session/' + encodeURIComponent(item.sessionId), '');
    const response = await source.fetchImpl(url, {
      method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new TypeError('Session not found');
    const raw = await response.json();
    const record = raw?.data ?? raw;
    const actual = record?.location?.directory;
    if (record?.id !== item.sessionId || actual !== item.directory || record?.parentID) {
      throw new TypeError('Only a root session in its actual location can be subscribed');
    }
    return record;
  };

  // Capture a pre-opt-in terminal checkpoint. If unreadable, the SDK sender
  // must not start from an arbitrary old completion.
  const baselineIdleId = async (item) => {
    const source = getSource(item.spaceId);
    if (!source) return undefined;
    try {
      const url = source.buildOpenCodeUrl('/api/session/' + encodeURIComponent(item.sessionId) + '/message', '');
      const response = await source.fetchImpl(url + '?limit=1&order=desc&type=idle', {
        method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return undefined;
      const body = await response.json();
      const rows = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(rows)) return undefined;
      const idle = rows.find((row) => row?.type === 'idle' && typeof row.id === 'string');
      return idle?.id ?? null;
    } catch { return undefined; }
  };

  // The host reads this status inside an isolated space over its authenticated
  // dispatcher. The external space proxy refuses /api/notifications routes.
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
    if (!z.object({ id: z.string(), approved: z.boolean() }).safeParse(req.body).success) {
      return res.status(400).json({ error: 'id and approved are required' });
    }
    res.json({ resolved: approval.decide(req.body.id, req.body.approved) });
  }));
  app.get('/api/notifications/telegram/delivery-issues', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ deliveries: await telegram.listDeliveryIssues() });
  }));
  app.post('/api/notifications/telegram/delivery-issues/retry', asyncRoute(async (req, res) => {
    try {
      res.json({ delivered: await telegram.retryDelivery(req.body?.key) });
    } catch (error) { fail(res, error); }
  }));
  // UI-auth operator change; exactly one sender may own automatic delivery.
  // Pause before draining the previous sender's live verification and Bot API
  // operations, then validate a quiescent checkpoint before SDK ownership.
  let switchingSender = false;
  app.get('/api/notifications/telegram/sender', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ sender: (await config.read()).sender, sdkReady: await sdkSenderReady() });
  }));
  app.post('/api/notifications/telegram/sender', asyncRoute(async (req, res) => {
    const mode = asString(req.body?.sender);
    if (!['legacy', 'sdk'].includes(mode)) return res.status(400).json({ error: 'Invalid sender' });
    if (switchingSender) return res.status(409).json({ error: 'Sender change already in progress' });
    switchingSender = true;
    let paused = false;
    let previous = 'legacy';
    try {
      const current = (await config.read()).sender;
      previous = current;
      if (current === mode) return res.json({ sender: mode });
      if (mode === 'legacy') {
        // Also supports explicit recovery from a persisted paused state.
        await config.update({ sender: 'paused' });
        paused = true;
        await telegram.waitForSettledDeliveries();
        await config.update({ sender: 'legacy' });
        paused = false;
        watch.reconcileAll();
        return res.json({ sender: 'legacy' });
      }
      if (current !== 'legacy' || !await sdkSenderReady() || typeof completionProof !== 'function') {
        return res.status(409).json({ error: 'Approved and ready SDK notifier required' });
      }
      await config.update({ sender: 'paused' });
      paused = true;
      await telegram.waitForSettledDeliveries();
      // Legacy subscriptions must match a known, quiescent checkpoint.
      // None of the already-recorded ambiguous deliveries may be replayed.
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
        // Failed cutover must not create a second owner. Restore only the
        // originally selected sender; the previous ledger remains intact.
        const restore = previous === 'sdk' ? 'sdk' : 'legacy';
        await config.update({ sender: restore });
        if (restore === 'legacy') watch.reconcileAll();
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
    const input = req.body || {};
    const patch = {};
    if (input.enabled !== undefined) {
      if (!z.boolean().safeParse(input.enabled).success) return res.status(400).json({ error: 'enabled must be a boolean' });
      patch.enabled = input.enabled;
    }
    if (input.botToken !== undefined && input.botToken !== '') {
      if (!z.string().regex(/^[0-9]+:[A-Za-z0-9_-]+$/).safeParse(input.botToken).success) {
        return res.status(400).json({ error: 'Invalid bot token' });
      }
      patch.botToken = input.botToken;
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
      const a = req.body ?? {};
      await telegram.configureAlias(a.alias, a.chatId, a.threadId == null || a.threadId === '' ? null : Number(a.threadId), a.kind ?? 'private', a.previousName || null);
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  }));
  app.delete('/api/notifications/telegram/aliases', asyncRoute(async (req, res) => {
    try {
      const alias = asString(req.body?.alias);
      await telegram.deleteAlias(alias);
      if ((await config.read()).defaultAlias.toLocaleLowerCase() === alias.toLocaleLowerCase()) {
        await config.update({ defaultAlias: '' });
      }
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/test', asyncRoute(async (req, res) => {
    try {
      const result = await telegram.sendContent({ alias: req.body?.alias, text: 'OpenChamber Telegram test' });
      res.json(result);
    } catch (error) { fail(res, error); }
  }));
  // Includes older subscriptions outside the latest-session chooser. Refresh
  // titles from the authoritative space when reachable; retain saved title
  // (or ID) when that session can no longer be read.
  app.get('/api/notifications/telegram/subscriptions', asyncRoute(async (req, res) => {
    try {
      const page = Math.max(0, Math.min(100000, Number.parseInt(asString(req.query?.page) || '0', 10) || 0));
      const limit = 30;
      const query = asString(req.query?.q).slice(0, 120).toLocaleLowerCase();
      const entries = (await telegram.listSubscriptions())
        .filter((item) => !query || [item.title, item.directory, item.sessionId, item.alias]
          .some((field) => typeof field === 'string' && field.toLocaleLowerCase().includes(query)))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const slice = entries.slice(page * limit, (page + 1) * limit);
      const subscriptions = await Promise.all(slice.map(async (item) => {
        let title = item.title || item.sessionId;
        const source = getSource(item.spaceId);
        if (source) {
          try {
            const url = source.buildOpenCodeUrl('/api/session/' + encodeURIComponent(item.sessionId), '');
            const answer = await source.fetchImpl(url, {
              method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
              signal: AbortSignal.timeout(4000),
            });
            if (answer.ok) {
              const data = await answer.json();
              const row = data?.data ?? data;
              if (row?.id === item.sessionId && row?.location?.directory === item.directory &&
                  typeof row.title === 'string' && row.title.trim()) title = row.title.slice(0, 200);
            }
          } catch { /* Name lookup must not hide the unsubscribe button. */ }
        }
        return { ...item, title };
      }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ subscriptions, total: entries.length, page, hasMore: (page + 1) * limit < entries.length });
    } catch (error) { fail(res, error); }
  }));
  app.get('/api/notifications/telegram/subscription', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.query);
      res.json({ subscribed: await telegram.hasSubscription(item.directory, item.sessionId) });
    } catch (error) { fail(res, error); }
  }));
  // An isolated space is selected by directory query/header *before* this
  // host-only route is reached. POST keeps the directory in the request body,
  // so subscription status is answered by the host's subscription store.
  app.post('/api/notifications/telegram/subscription/status', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.body);
      res.json({ subscribed: await telegram.hasSubscription(item.directory, item.sessionId) });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/subscribe', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.body);
      if ((await config.read()).sender === 'paused') return res.status(409).json({ error: 'Sender cutover in progress' });
      const record = await verify(item);
      const baseline = await baselineIdleId(item);
      if ((await config.read()).sender === 'sdk' && baseline === undefined) {
        throw new TypeError('Cannot establish a safe Telegram subscription baseline');
      }
      await telegram.subscribe(item.directory, item.sessionId, req.body?.alias, {
        origin: 'user', spaceId: item.spaceId, title: record.title,
        baselineIdleId: baseline ?? null,
      });
      try {
        await watch.track(item);
      } catch (error) {
        // A subscription without its durable checkpoint could miss every
        // subsequent end-of-run after a server restart. Fail the operation.
        await telegram.unsubscribe(item.directory, item.sessionId);
        await watch.cancel(item.sessionId, item.directory, item.spaceId);
        throw error;
      }
      res.json({ subscribed: true });
    } catch (error) { fail(res, error); }
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
      const result = await telegram.sendContent({
        alias: req.body?.alias, text: req.body?.text, file: req.body?.file,
        mode: req.body?.mode, caption: req.body?.caption,
      });
      res.json(result);
    } catch (error) { fail(res, error); }
  }));
};
