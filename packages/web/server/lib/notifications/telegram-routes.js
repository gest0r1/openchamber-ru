/** UI-authenticated routes. The server stores all credentials and destinations. */
export const registerTelegramRoutes = (app, { telegram, config, watch, getSource, dispatchPending }) => {
  const asyncRoute = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
  const fail = (res, error) => res.status(error instanceof TypeError ? 400 : 502).json({
    error: error instanceof TypeError ? error.message : 'Telegram operation failed',
  });
  const asString = (value) => typeof value === 'string' ? value.trim() : '';
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
  };

  // The host reads this status inside an isolated space over its authenticated
  // dispatcher. The external space proxy refuses /api/notifications routes.
  app.get('/api/notifications/telegram/pending', asyncRoute(async (req, res) => {
    const sessionId = asString(req.query?.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const entries = await dispatchPending();
    res.json({ pending: entries.some((entry) => entry.parentSessionId === sessionId) });
  }));
  app.get('/api/notifications/telegram/config', asyncRoute(async (_req, res) => {
    res.json(await config.publicConfig());
  }));
  app.post('/api/notifications/telegram/config', asyncRoute(async (req, res) => {
    const input = req.body || {};
    const patch = {};
    if (input.enabled !== undefined) {
      if (typeof input.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      patch.enabled = input.enabled;
    }
    if (input.botToken !== undefined && input.botToken !== '') {
      if (typeof input.botToken !== 'string' || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(input.botToken)) {
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
  app.get('/api/notifications/telegram/subscription', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.query);
      res.json({ subscribed: await telegram.hasSubscription(item.directory, item.sessionId) });
    } catch (error) { fail(res, error); }
  }));
  app.post('/api/notifications/telegram/subscribe', asyncRoute(async (req, res) => {
    try {
      const item = sessionInput(req.body);
      await verify(item);
      await telegram.subscribe(item.directory, item.sessionId, req.body?.alias, { origin: 'user' });
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
