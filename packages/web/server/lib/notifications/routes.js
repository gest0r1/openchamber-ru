const parsePushSubscribeBody = (body) => {
  if (!body || typeof body !== 'object') return null;
  const endpoint = body.endpoint;
  const keys = body.keys;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;

  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) return null;
  if (typeof p256dh !== 'string' || p256dh.trim().length === 0) return null;
  if (typeof auth !== 'string' || auth.trim().length === 0) return null;

  return {
    endpoint: endpoint.trim(),
    keys: { p256dh: p256dh.trim(), auth: auth.trim() },
  };
};

const parsePushUnsubscribeBody = (body) => {
  if (!body || typeof body !== 'object') return null;
  const endpoint = body.endpoint;
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) return null;
  return { endpoint: endpoint.trim() };
};

export const NOTIFICATION_SSE_HEARTBEAT_INTERVAL_MS = 20_000;

export const registerNotificationRoutes = (app, dependencies) => {
  const {
    uiAuthController,
    ensurePushInitialized,
    ensureGlobalWatcherStarted,
    getOrCreateVapidKeys,
    getUiSessionTokenFromRequest,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
    addOrUpdatePushSubscription,
    removePushSubscription,
    addOrUpdateApnsToken,
    removeApnsToken,
    updateUiVisibility,
    clearPendingPushBadge,
    isUiVisible,
    getUiNotificationClients,
    writeSseEvent,
    getSessionActivitySnapshot,
    getSessionStateSnapshot,
    getPendingBlockingRequestsSnapshot,
    getSessionAttentionSnapshot,
    getSessionState,
    getSessionAttentionState,
    markSessionViewed,
    markSessionUnviewed,
    markUserMessageSent,
    setPushInitialized,
    setAutoAcceptSession,
    telegramRuntime,
    persistSettings,
  } = dependencies;

  const ensureSessionWatcher = async () => {
    if (typeof ensureGlobalWatcherStarted !== 'function') {
      return;
    }
    try {
      await ensureGlobalWatcherStarted();
    } catch (error) {
      console.warn('[OpenCodeWatcher] lazy start failed:', error?.message ?? error);
    }
  };

  // Explicit Telegram subscription; the server owns the authoritative store.
  // UI authentication is required independently of the global API gate.
  const telegramAuthorized = async (req, res) => {
    const token = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!token) {
      if (!res.headersSent) res.status(401).json({ error: 'UI session missing' });
      return false;
    }
    return true;
  };
  app.get('/api/notifications/telegram/aliases', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    try {
      res.json({ aliases: await telegramRuntime.listAliasDetails() });
    } catch {
      res.status(500).json({ error: 'Telegram configuration unavailable' });
    }
  });
  app.post('/api/notifications/telegram/aliases', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    try {
      await telegramRuntime.configureAlias(req.body?.alias, req.body?.chatId, req.body?.threadId ?? null, req.body?.kind ?? 'private', req.body?.previousName ?? null);
      if (req.body?.previousName && req.body?.previousName !== req.body?.alias) {
        const settings = await readSettingsFromDiskMigrated();
        if (settings.telegramDefaultAlias?.toLocaleLowerCase() === req.body.previousName.toLocaleLowerCase()) {
          await persistSettings({ telegramDefaultAlias: req.body.alias });
        }
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(error instanceof TypeError ? 400 : 500).json({ error: error instanceof TypeError ? error.message : 'Telegram configuration unavailable' });
    }
  });
  app.post('/api/notifications/telegram/subscribe', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    try {
      await telegramRuntime.subscribe(req.body?.directory, req.body?.sessionId, req.body?.alias, { scope: req.body?.scope, expiresAt: req.body?.expiresAt, origin: 'user' });
      await ensureSessionWatcher();
      res.json({ ok: true });
    } catch (error) {
      const invalid = error instanceof TypeError || error?.message === 'Unknown Telegram alias';
      res.status(invalid ? 400 : 500).json({ error: invalid ? error.message : 'Telegram subscription unavailable' });
    }
  });
  app.post('/api/notifications/telegram/unsubscribe', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    if (typeof req.body?.directory !== 'string' || typeof req.body?.sessionId !== 'string') {
      return res.status(400).json({ error: 'directory and sessionId required' });
    }
    try {
      await telegramRuntime.unsubscribe(req.body.directory, req.body.sessionId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Telegram subscription unavailable' });
    }
  });
  app.delete('/api/notifications/telegram/aliases', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    try {
      await telegramRuntime.deleteAlias(req.body?.alias);
      res.json({ ok: true });
    } catch (error) {
      res.status(error instanceof TypeError ? 400 : 500).json({
        error: error instanceof TypeError ? error.message : 'Telegram alias removal failed',
      });
    }
  });
  app.get('/api/notifications/telegram/config', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    try {
      const settings = await readSettingsFromDiskMigrated();
      res.json({
        enabled: settings.telegramEnabled === true,
        defaultAlias: settings.telegramDefaultAlias || '',
        hasBotToken: await telegramRuntime.hasBotToken(),
      });
    } catch {
      res.status(500).json({ error: 'Telegram settings unavailable' });
    }
  });
  app.post('/api/notifications/telegram/config', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    const changes = {};
    if (req.body?.enabled !== undefined) {
      if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'Invalid enabled value' });
      changes.telegramEnabled = req.body.enabled;
    }
    if (req.body?.defaultAlias !== undefined) {
      if (typeof req.body.defaultAlias !== 'string' || !/^[\p{L}\p{N} _-]{0,80}$/u.test(req.body.defaultAlias)) {
        return res.status(400).json({ error: 'Invalid default alias' });
      }
      changes.telegramDefaultAlias = req.body.defaultAlias.trim();
    }
    if (req.body?.botToken !== undefined && req.body.botToken !== '') {
      if (typeof req.body.botToken !== 'string' || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(req.body.botToken)) {
        return res.status(400).json({ error: 'Invalid bot token' });
      }
      changes.telegramBotToken = req.body.botToken;
    }
    try {
      await persistSettings(changes);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Telegram settings could not be saved' });
    }
  });
  const telegramDeliveryResponse = async (req, res, input) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      if (settings.telegramEnabled !== true) return res.json({ delivered: false, reason: 'telegram-disabled' });
      const result = await telegramRuntime.sendContent(input);
      return res.json(result);
    } catch (error) {
      if (error?.retryAfter) {
        res.setHeader('Retry-After', String(error.retryAfter));
        return res.status(429).json({ error: 'Too many Telegram sends' });
      }
      return res.status(error instanceof TypeError ? 400 : 502).json({
        error: error instanceof TypeError ? error.message : 'Telegram delivery failed',
      });
    }
  };
  app.post('/api/notifications/telegram/send', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    return telegramDeliveryResponse(req, res, {
      alias: req.body?.alias, text: req.body?.text, file: req.body?.file,
      caption: req.body?.caption, mode: req.body?.mode,
    });
  });
  app.post('/api/notifications/telegram/document', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    return telegramDeliveryResponse(req, res, {
      alias: req.body?.alias, file: req.body?.filePath, caption: req.body?.caption, mode: 'document',
    });
  });
  app.post('/api/notifications/telegram/test', async (req, res) => {
    if (!await telegramAuthorized(req, res)) return;
    return telegramDeliveryResponse(req, res, {
      alias: req.body?.alias, text: 'OpenChamber Telegram test',
    });
  });

  app.get('/api/push/vapid-public-key', async (_req, res) => {
    try {
      await ensurePushInitialized();
      const keys = await getOrCreateVapidKeys();
      res.json({ publicKey: keys.publicKey });
    } catch (error) {
      console.warn('[Push] Failed to load VAPID key:', error);
      res.status(500).json({ error: 'Failed to load push key' });
    }
  });

  app.post('/api/push/subscribe', async (req, res) => {
    await ensurePushInitialized();
    await ensureSessionWatcher();

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const parsed = parsePushSubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    const { endpoint, keys } = parsed;

    const origin = typeof req.body?.origin === 'string' ? req.body.origin.trim() : '';
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      try {
        const settings = await readSettingsFromDiskMigrated();
        if (typeof settings?.publicOrigin !== 'string' || settings.publicOrigin.trim().length === 0) {
          await writeSettingsToDisk({
            ...settings,
            publicOrigin: origin,
          });
          setPushInitialized(false);
        }
      } catch {
      }
    }

    const platform = typeof req.body?.platform === 'string' ? req.body.platform : undefined;
    await addOrUpdatePushSubscription(
      uiToken,
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      req.headers['user-agent'],
      platform
    );

    return res.json({ ok: true });
  });

  app.delete('/api/push/subscribe', async (req, res) => {
    await ensurePushInitialized();

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const parsed = parsePushUnsubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    await removePushSubscription(uiToken, parsed.endpoint);
    return res.json({ ok: true });
  });

  // Native iOS APNs device token registration (mirrors /api/push/subscribe). The token
  // is a hex APNs device token from @capacitor/push-notifications, scoped to the UI
  // session like web-push subscriptions.
  app.post('/api/push/apns-token', async (req, res) => {
    await ensureSessionWatcher();

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const deviceToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!deviceToken) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    const platform = req.body?.platform === 'android' ? 'android' : 'ios';
    // APNs environment the token belongs to: Xcode/dev-signed installs report 'sandbox',
    // TestFlight/App Store report 'production'. Absent (older clients, Android) → production.
    const environment = req.body?.environment === 'sandbox' ? 'sandbox' : 'production';
    if (typeof addOrUpdateApnsToken === 'function') {
      // Optional: newer apps send a key so the server can seal push text for this device
      // alone (push-seal.js). Malformed keys are ignored and the device gets plain text.
      await addOrUpdateApnsToken(uiToken, deviceToken, req.headers['user-agent'], platform, environment, req.body?.pushKey);
    }
    return res.json({ ok: true });
  });

  app.delete('/api/push/apns-token', async (req, res) => {
    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const deviceToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!deviceToken) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    if (typeof removeApnsToken === 'function') {
      await removeApnsToken(uiToken, deviceToken);
    }
    return res.json({ ok: true });
  });

  app.post('/api/push/visibility', async (req, res) => {
    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const platform = typeof body.platform === 'string' ? body.platform : undefined;
    updateUiVisibility(uiToken, body.visible === true, platform);
    return res.json({ ok: true });
  });

  app.get('/api/push/visibility', (req, res) => {
    const uiToken = getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    return res.json({
      ok: true,
      visible: isUiVisible(uiToken),
    });
  });

  app.get('/api/notifications/stream', async (req, res) => {
    await ensureSessionWatcher();

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clients = getUiNotificationClients();
    clients.add(res);

    let closed = false;
    let heartbeatTimer = null;

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      clients.delete(res);
    };

    req.on('close', cleanup);
    res.on('error', cleanup);

    const flushSse = () => {
      res.flush?.();
    };

    heartbeatTimer = setInterval(() => {
      if (closed || res.writableEnded || res.destroyed) {
        cleanup();
        return;
      }
      try {
        res.write(':heartbeat\n\n');
        flushSse();
      } catch {
        cleanup();
      }
    }, NOTIFICATION_SSE_HEARTBEAT_INTERVAL_MS);

    try {
      writeSseEvent(res, {
        type: 'openchamber:notification-stream-ready',
        properties: { uiToken },
      });
      flushSse();
    } catch {
      cleanup();
    }
  });

  app.get('/api/session-activity', (_req, res) => {
    void ensureSessionWatcher();
    res.json(getSessionActivitySnapshot());
  });

  app.get('/api/sessions/snapshot', async (_req, res) => {
    await ensureSessionWatcher();
    res.json({
      statusSessions: getSessionStateSnapshot(),
      attentionSessions: getSessionAttentionSnapshot(),
      serverTime: Date.now(),
    });
  });

  // Cross-project seed for clients that do not initialize every directory:
  // live status per session plus the permission requests and forms still
  // waiting for an answer. Both come from the server's single upstream stream.
  app.get('/api/sessions/status', async (_req, res) => {
    await ensureSessionWatcher();
    const snapshot = getSessionStateSnapshot();
    res.json({
      sessions: snapshot,
      pending: typeof getPendingBlockingRequestsSnapshot === 'function' ? getPendingBlockingRequestsSnapshot() : {},
      serverTime: Date.now(),
    });
  });

  app.get('/api/sessions/:id/status', async (req, res) => {
    await ensureSessionWatcher();
    const sessionId = req.params.id;
    const state = getSessionState(sessionId);

    if (!state) {
      return res.status(404).json({
        error: 'Session not found or no state available',
        sessionId,
      });
    }

    return res.json({
      sessionId,
      ...state,
    });
  });

  app.get('/api/sessions/attention', async (_req, res) => {
    await ensureSessionWatcher();
    const snapshot = getSessionAttentionSnapshot();
    res.json({
      sessions: snapshot,
      serverTime: Date.now(),
    });
  });

  app.get('/api/sessions/:id/attention', async (req, res) => {
    await ensureSessionWatcher();
    const sessionId = req.params.id;
    const state = getSessionAttentionState(sessionId);

    if (!state) {
      return res.status(404).json({
        error: 'Session not found or no attention state available',
        sessionId,
      });
    }

    return res.json({
      sessionId,
      ...state,
    });
  });

  app.post('/api/sessions/:id/view', (req, res) => {
    const sessionId = req.params.id;
    const clientId = req.headers['x-client-id'] || req.ip || 'anonymous';

    markSessionViewed(sessionId, clientId);
    // The user is engaging with the app, so the native push badge no longer
    // applies — reset it here too (not only on the visibility beacon), since
    // opening the app reliably marks the opened session viewed.
    if (typeof clearPendingPushBadge === 'function') clearPendingPushBadge();

    return res.json({
      success: true,
      sessionId,
      viewed: true,
    });
  });

  app.post('/api/sessions/:id/unview', (req, res) => {
    const sessionId = req.params.id;
    const clientId = req.headers['x-client-id'] || req.ip || 'anonymous';

    markSessionUnviewed(sessionId, clientId);

    return res.json({
      success: true,
      sessionId,
      viewed: false,
    });
  });

  app.post('/api/sessions/:id/message-sent', (req, res) => {
    const sessionId = req.params.id;

    markUserMessageSent(sessionId);
    // Sending a message means the user is active in the app; reset the native
    // push badge so it counts only notifications since this engagement.
    if (typeof clearPendingPushBadge === 'function') clearPendingPushBadge();

    return res.json({
      success: true,
      sessionId,
      messageSent: true,
    });
  });

  // Mirror client-side Permission Auto-Accept state to the server so it can
  // suppress permission notifications at the source (the 500ms debounce race
  // otherwise leaks notifications for auto-accepted permissions).
  app.post('/api/notifications/auto-accept', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const enabled = body.enabled === true;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    if (typeof setAutoAcceptSession === 'function') {
      setAutoAcceptSession(sessionId, enabled);
    }
    return res.json({ success: true, sessionId, enabled });
  });
};
