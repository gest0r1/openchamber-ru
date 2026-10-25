import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readFile, writeFile, mkdir, rename, realpath, stat, chmod } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path';

const keyOf = (directory, sessionId) => createHash('sha256').update(JSON.stringify([directory, sessionId])).digest('hex');
const safeAlias = (value) => z.string().trim().regex(/^[\p{L}\p{N} _-]{1,80}$/u).safeParse(value).success;
const validChat = (value) => /^-?\d+$/.test(String(value)) || /^@[A-Za-z][A-Za-z0-9_]{4,}$/.test(String(value));
const MAX_TEXT = 4000;

/**
 * Opt-in Telegram delivery. No OpenCode session content is transmitted:
 * automatic messages contain a fixed event title and a session deep link.
 * This runtime is intentionally independent of desktop/web push.
 */
export const createTelegramRuntime = ({
  storePath, getBotToken, getPublicOrigin, fetchImpl = fetch,
  enabled = async () => true,
  allowedFileRoots = [],
  getConfiguredAliases = null,
  persistAliases = null,
  getDefaultAlias = async () => '',
}) => {
  let queue = Promise.resolve();
  let aliasQueue = Promise.resolve();
  const normalizeAlias = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const configuredAliases = async () => {
    if (!getConfiguredAliases) return (await load()).aliases;
    const aliases = await getConfiguredAliases();
    return Object.fromEntries((Array.isArray(aliases) ? aliases : []).map((entry) => [normalizeAlias(entry.name), {
      chatId: String(entry.chat_id), threadId: entry.message_thread_id ?? null, kind: entry.kind ?? 'private',
    }]));
  };
  const recentDelivery = new Map();
  const inflightDelivery = new Set();
  const empty = () => ({ version: 1, aliases: {}, subscriptions: {}, deliveries: {} });
  const load = async () => {
    try {
      const parsed = JSON.parse(await readFile(storePath, 'utf8'));
      return parsed?.version === 1 && parsed.aliases && parsed.subscriptions ? parsed : empty();
    } catch (error) {
      if (error.code === 'ENOENT') return empty();
      throw error;
    }
  };
  const isExpired = (record, now = Date.now()) =>
    Number.isFinite(record?.expires_at) && record.expires_at <= now;
  const expireSubscriptions = (data) => {
    const now = Date.now();
    for (const [key, record] of Object.entries(data.subscriptions)) {
      if (isExpired(record, now)) delete data.subscriptions[key];
    }
  };
  const mutate = (fn) => {
    const task = queue.catch(() => {}).then(async () => {
      const data = await load();
      expireSubscriptions(data);
      const result = fn(data);
      await mkdir(dirname(storePath), { recursive: true });
      const temporary = `${storePath}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, storePath);
      await chmod(storePath, 0o600);
      return result;
    });
    queue = task;
    return task;
  };
  const configureAlias = (alias, chatId, threadId = null, kind = 'private', previousName = null) => {
    if (!safeAlias(alias) || (previousName && !safeAlias(previousName)) ||
      (chatId !== null && chatId !== '' && !validChat(chatId)) ||
      (threadId !== null && (!Number.isSafeInteger(threadId) || threadId < 1)) ||
      !['private', 'group', 'topic'].includes(kind)) {
      throw new TypeError('Invalid Telegram alias or destination');
    }
    const normalized = normalizeAlias(alias);
    const oldName = previousName ? normalizeAlias(previousName) : normalized;
    const save = async () => {
      const current = await configuredAliases();
      const peer = chatId || current[oldName]?.chatId;
      if (!validChat(peer)) throw new TypeError('Chat ID is required for a new Telegram alias');
      if (persistAliases) {
        const saved = await getConfiguredAliases();
        const next = (Array.isArray(saved) ? saved : []).filter((entry) => ![normalized, oldName].includes(normalizeAlias(entry.name)));
        next.push({ name: alias.trim(), chat_id: String(peer), message_thread_id: threadId, kind });
        await persistAliases(next);
      } else {
        await mutate((data) => {
          delete data.aliases[oldName];
          data.aliases[normalized] = { chatId: String(peer), threadId, kind };
        });
      }
      if (oldName !== normalized) await mutate((data) => {
        for (const subscription of Object.values(data.subscriptions)) {
          if (subscription.alias === oldName) subscription.alias = normalized;
        }
      });
    };
    const task = aliasQueue.catch(() => {}).then(save);
    aliasQueue = task;
    return task;
  };
  const deleteAlias = (alias) => {
    if (!safeAlias(alias)) throw new TypeError('Invalid Telegram alias');
    const normalized = normalizeAlias(alias);
    const task = aliasQueue.catch(() => {}).then(async () => {
      if (persistAliases) {
        const current = await getConfiguredAliases();
        await persistAliases((Array.isArray(current) ? current : []).filter((entry) => normalizeAlias(entry.name) !== normalized));
      }
      await mutate((data) => {
        delete data.aliases[normalized];
        for (const [key, subscription] of Object.entries(data.subscriptions)) {
          if (subscription.alias === normalized) delete data.subscriptions[key];
        }
      });
    });
    aliasQueue = task;
    return task;
  };
  const selectAlias = async (alias) => {
    const name = normalizeAlias(alias || await getDefaultAlias());
    if (!name) throw new TypeError('Telegram default alias is not configured');
    const aliases = await configuredAliases();
    const target = aliases[name];
    if (target) return { name, target };
    // Natural agent requests may include a Russian destination preposition.
    // Resolve only an exact known name after removing it; never guess a chat.
    const withoutPreposition = name.replace(/^(?:в|во|на|для|к)\s+/u, '');
    if (withoutPreposition !== name && aliases[withoutPreposition]) {
      return { name: withoutPreposition, target: aliases[withoutPreposition] };
    }
    throw new TypeError(`Unknown Telegram alias: ${name}`);
  };
  const subscribe = async (directory, sessionId, alias, options = {}) => {
    if (!z.string().trim().min(1).safeParse(directory).success || !z.string().trim().min(1).safeParse(sessionId).success) {
      throw new TypeError('Invalid subscription');
    }
    const { name } = await selectAlias(alias);
    const scope = options.scope ?? 'session';
    if (!['once', 'run', 'session'].includes(scope)) throw new TypeError('Invalid Telegram subscription scope');
    // A session subscription remains in effect until the user opts out.
    // Expiry applies only if a caller explicitly requests a deadline.
    const expiresAt = options.expiresAt ?? null;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) {
      throw new TypeError('Invalid Telegram expiry');
    }
    const origin = options.origin === 'agent' ? 'agent' : 'user';
    return mutate((data) => {
      data.subscriptions[keyOf(directory, sessionId)] = {
        opted_in: true, alias: name, scope, created_at: Date.now(), expires_at: expiresAt, origin,
        sessionId, directory, spaceId: options.spaceId ?? null,
      };
    });
  };
  const unsubscribe = (directory, sessionId) => mutate((data) => {
    delete data.subscriptions[keyOf(directory, sessionId)];
  });
  const listAliasDetails = async () => {
    const aliases = await configuredAliases();
    return Object.entries(aliases).map(([name, value]) => ({
      name,
      chat_id_masked: String(value.chatId).length <= 4
        ? '*'.repeat(String(value.chatId).length)
        : '*'.repeat(String(value.chatId).length - 4) + String(value.chatId).slice(-4),
      message_thread_id: value.threadId,
      kind: value.kind,
    }));
  };
  const request = async (method, fields, { multipart = false } = {}) => {
    const token = await getBotToken();
    if (!token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Telegram is not configured');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const requestOptions = {
          method: 'POST',
          body: multipart ? fields : JSON.stringify(fields),
          signal: AbortSignal.timeout(multipart ? 30000 : 10000),
        };
        if (!multipart) requestOptions.headers = { 'content-type': 'application/json' };
        const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, requestOptions);
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true) return result.result;
        // Rate limiting is a confirmed refusal. A 5xx may be ambiguous:
        // Telegram could have accepted the message before failing to reply.
        if (response.status === 429) {
          if (attempt < 2) {
            const retryAfter = Number(result?.parameters?.retry_after);
            await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 300 * (2 ** attempt)));
            continue;
          }
        }
        const error = new Error(`Telegram delivery rejected (HTTP ${response.status})`);
        error.retrySafe = response.status === 429;
        error.httpStatus = response.status;
        throw error;
      } catch (error) {
        // A lost response can mean Telegram already accepted the message.
        // Retrying an ambiguous POST would send duplicates.
        throw error;
      }
    }
  };
  const htmlEscape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Telegram HTML is deliberately a small Markdown subset, not arbitrary HTML.
  // Protect code and links before converting emphasis so user text remains data.
  const markdownToTelegramHtml = (source) => {
    const protectedSpans = [];
    const protect = (markup) => {
      const key = protectedSpans.length;
      protectedSpans.push(markup);
      return `\uE000${key}\uE001`;
    };
    let html = htmlEscape(source.replace(/\r\n?/g, '\n'));
    html = html.replace(/^\`\`\`[^\n]*\n([\s\S]*?)\n\`\`\`[ \t]*$/gm, (_match, code) =>
      protect(`<pre>${code}</pre>`));
    html = html.replace(/\`([^\`\n]+)\`/g, (_match, code) => protect(`<code>${code}</code>`));
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)\"'<>]+)\)/gi, (_match, label, url) =>
      protect(`<a href=\"${url}\">${label}</a>`));
    html = html
      .replace(/^#{1,6} +([^\n]+)$/gm, '<b>$1</b>')
      .replace(/^&gt; ?([^\n]+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_\n]+)__/g, '<b>$1</b>')
      .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    return html.replace(/\uE000(\d+)\uE001/g, (_match, key) => protectedSpans[Number(key)] ?? '');
  };
  const safeChunkEnd = (value, start, maxLength) => {
    let end = Math.min(value.length, start + maxLength);
    // Do not split a Unicode surrogate pair between Telegram messages.
    if (end > start && end < value.length &&
      value.charCodeAt(end - 1) >= 0xD800 && value.charCodeAt(end - 1) <= 0xDBFF &&
      value.charCodeAt(end) >= 0xDC00 && value.charCodeAt(end) <= 0xDFFF) end -= 1;
    return end;
  };
  const sendText = async (alias, text, { formatted = false } = {}) => {
    const { target } = await selectAlias(alias);
    if (!z.string().trim().min(1).safeParse(text).success) throw new TypeError('Message is empty');
    if (text.length > 100_000) throw new TypeError('Message exceeds 100000 characters');
    const destination = { chat_id: target.chatId };
    if (target.threadId) destination.message_thread_id = target.threadId;
    if (!formatted) {
      for (let offset = 0; offset < text.length;) {
        const end = safeChunkEnd(text, offset, MAX_TEXT);
        await request('sendMessage', { ...destination, text: text.slice(offset, end) });
        offset = end;
      }
      return true;
    }
    let offset = 0;
    while (offset < text.length) {
      let end = safeChunkEnd(text, offset, MAX_TEXT);
      let html = markdownToTelegramHtml(text.slice(offset, end));
      while (html.length > 4096 && end - offset > 2) {
        end = safeChunkEnd(text, offset, Math.max(2, Math.floor((end - offset) / 2)));
        html = markdownToTelegramHtml(text.slice(offset, end));
      }
      if (html.length > 4096) throw new TypeError('Formatted message cannot fit Telegram limit');
      await request('sendMessage', { ...destination, text: html, parse_mode: 'HTML' });
      offset = end;
    }
    return true;
  };
  const sendDocument = async (alias, filePath, { directory = null, caption = '', expectedSha256 = null } = {}) => {
    if (!z.string().trim().min(1).safeParse(filePath).success) throw new TypeError('File path required');
    if (!z.string().max(1024).safeParse(caption).success) throw new TypeError('Caption exceeds 1024 characters');
    const actual = await realpath(isAbsolute(filePath) ? filePath : resolve(directory || '', filePath));
    const candidateRoots = directory ? [directory] : allowedFileRoots;
    const allowed = await Promise.all(candidateRoots.map(async (root) => realpath(root).catch(() => null)));
    if (!allowed.some((root) => root && (actual === root || (!relative(root, actual).startsWith('..') && !isAbsolute(relative(root, actual)))))) {
      throw new TypeError('File path is outside allowed roots');
    }
    if (!actual.toLowerCase().endsWith('.md')) throw new TypeError('Only Markdown documents are allowed');
    const info = await stat(actual);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new TypeError('Document exceeds 10 MB or is not a file');
    const { target } = await selectAlias(alias);
    const token = await getBotToken();
    if (!token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Telegram is not configured');
    const body = new FormData();
    body.append('chat_id', target.chatId);
    if (target.threadId) body.append('message_thread_id', String(target.threadId));
    if (caption) body.append('caption', caption);
    const contents = await readFile(actual);
    if (expectedSha256 && createHash('sha256').update(contents).digest('hex') !== expectedSha256) {
      throw new TypeError('Markdown document changed after the user approved the send');
    }
    body.append('document', new Blob([contents], { type: 'text/markdown' }), basename(actual));
    await request('sendDocument', body, { multipart: true });
    return true;
  };
  let rateWindow = 0;
  let rateCount = 0;
  const rateLimitExplicit = () => {
    const now = Date.now();
    if (now - rateWindow >= 10000) { rateWindow = now; rateCount = 0; }
    if (rateCount >= 10) {
      const error = new Error('Too many Telegram sends');
      error.retryAfter = Math.max(1, Math.ceil((rateWindow + 10000 - now) / 1000));
      throw error;
    }
    rateCount += 1;
  };
  const sendContent = async ({ alias, text, file, caption = '', mode = 'document', directory = null, expectedSha256 = null }) => {
    if (!['document', 'formatted'].includes(mode)) throw new TypeError('Invalid Telegram mode');
    if (!text && !file) throw new TypeError('text or file required');
    // Explicit delivery bypasses the per-session opt-in, not the channel switch.
    if (await enabled() !== true) return { delivered: false, reason: 'telegram-disabled' };
    rateLimitExplicit();
    if (file && mode === 'document') await sendDocument(alias, file, { directory, caption, expectedSha256 });
    if (file && mode === 'formatted') {
      const actual = await realpath(isAbsolute(file) ? file : resolve(directory || '', file));
      const roots = await Promise.all((directory ? [directory] : allowedFileRoots).map((root) => realpath(root).catch(() => null)));
      if (!roots.some((root) => root && (actual === root || (!relative(root, actual).startsWith('..') && !isAbsolute(relative(root, actual)))))) {
        throw new TypeError('File path is outside allowed roots');
      }
      const metadata = await stat(actual);
      if (!actual.endsWith('.md') || !metadata.isFile() || metadata.size > 10 * 1024 * 1024) throw new TypeError('Markdown file required, up to 10 MB');
      const contents = await readFile(actual);
      if (expectedSha256 && createHash('sha256').update(contents).digest('hex') !== expectedSha256) {
        throw new TypeError('Markdown document changed after the user approved the send');
      }
      await sendText(alias, contents.toString('utf8'), { formatted: true });
    }
    if (text) await sendText(alias, text, { formatted: mode === 'formatted' });
    return { delivered: true };
  };
  const getSubscription = async (directory, sessionId) => {
    const data = await load();
    const record = data.subscriptions[keyOf(directory, sessionId)];
    return record?.opted_in && !isExpired(record) ? record : null;
  };
  const listSubscriptions = async () => {
    const data = await load();
    return Object.values(data.subscriptions).filter((entry) => entry?.opted_in === true && !isExpired(entry))
      .map((entry) => ({ directory: entry.directory, sessionId: entry.sessionId,
        spaceId: entry.spaceId ?? null })).filter((entry) => entry.directory && entry.sessionId);
  };
  const hasSubscription = async (directory, sessionId) => {
    const data = await load();
    const key = keyOf(directory, sessionId);
    const record = data.subscriptions[key];
    if (isExpired(record)) {
      await mutate((latest) => { if (isExpired(latest.subscriptions[key])) delete latest.subscriptions[key]; });
      return false;
    }
    return record?.opted_in === true;
  };
  const hasBotToken = async () => /^[0-9]+:[A-Za-z0-9_-]+$/.test(String(await getBotToken() || ''));
  const listAliases = async () => {
    return Object.keys(await configuredAliases());
  };
  const notify = async ({ directory, sessionId, type, eventKey = null, aborted = false, canSend = async () => true, manualRetry = false }) => {
    if (!directory || !sessionId || aborted || !['completed', 'needs_input', 'error'].includes(type)) return false;
    if (await enabled() !== true) return false;
    const data = await load();
    const subscription = data.subscriptions[keyOf(directory, sessionId)];
    if (isExpired(subscription)) {
      await mutate((latest) => {
        const key = keyOf(directory, sessionId);
        if (isExpired(latest.subscriptions[key])) delete latest.subscriptions[key];
      });
      return false;
    }
    if (!subscription?.opted_in) return false;
    const dedupKey = JSON.stringify([directory, sessionId, type, eventKey ?? '']);
    if (data.deliveries?.[dedupKey] && !manualRetry) return true;
    if (inflightDelivery.has(dedupKey) || Date.now() - (recentDelivery.get(dedupKey) ?? 0) < 5000) return false;
    // Completion is only accepted from the server-owned durable verifier.
    // It checks the run outcome, descendants, shells and dispatch results.
    if (type === 'completed' && eventKey?.startsWith('idle:') !== true) return false;
    const origin = String(await getPublicOrigin() || '').replace(/\/$/, '');
    const url = /^https:\/\//.test(origin) ? `\n${origin}/?session=${encodeURIComponent(sessionId)}` : '';
    // Live probes and URL resolution can take several seconds. Honor an opt-out,
    // expiry, alias switch, or channel disable that happened while awaiting them.
    const current = (await load()).subscriptions[keyOf(directory, sessionId)];
    if (!current?.opted_in || current.alias !== subscription.alias ||
      current.created_at !== subscription.created_at ||
      current.scope !== subscription.scope ||
      current.expires_at !== subscription.expires_at ||
      (current.expires_at && current.expires_at <= Date.now()) ||
      await enabled() !== true) return false;
    if (inflightDelivery.has(dedupKey) || !await canSend()) return false;
    inflightDelivery.add(dedupKey);
    // A failed verification before sendText cannot have reached the Bot API.
    // Keep it distinct from an ambiguous network failure during delivery.
    let sendAttempted = false;
    try {
      // Reserve this event before the Bot API request. Network failure or a
      // restart after the request can leave its status ambiguous; do not retry
      // automatically. Validation failures before sendText have no such risk
      // and must release the reservation so verification can run again.
      await mutate((latest) => {
        latest.deliveries ??= {};
        latest.deliveries[dedupKey] = {
          status: 'reserved', at: Date.now(), directory, sessionId, type, eventKey,
        };
        const keys = Object.keys(latest.deliveries);
        if (keys.length > 1000) for (const key of keys.slice(0, keys.length - 1000)) delete latest.deliveries[key];
      });
      if (!await canSend()) {
        await mutate((latest) => { delete latest.deliveries[dedupKey]; });
        return false;
      }
      sendAttempted = true;
      await sendText(subscription.alias, `${type === 'completed' ? 'Agent completed the task' : type === 'error' ? 'Agent encountered an error' : 'Agent needs your input'}${url}`);
      await mutate((latest) => {
        if (latest.deliveries?.[dedupKey]) latest.deliveries[dedupKey].status = 'sent';
      });
      if (subscription.scope === 'once' || (subscription.scope === 'run' && type === 'completed')) {
        await mutate((latest) => {
          if (latest.subscriptions[keyOf(directory, sessionId)]?.created_at === subscription.created_at) {
            delete latest.subscriptions[keyOf(directory, sessionId)];
          }
        });
      }
      recentDelivery.delete(dedupKey);
      recentDelivery.set(dedupKey, Date.now());
      while (recentDelivery.size > 1000) {
        recentDelivery.delete(recentDelivery.keys().next().value);
      }
      return true;
    } catch (error) {
      // Validation can fail after reservation but before the first Bot API
      // request. Only an attempted request can have an ambiguous outcome.
      await mutate((latest) => {
        if (!sendAttempted || error?.retrySafe === true) delete latest.deliveries?.[dedupKey];
        else if (latest.deliveries?.[dedupKey]) {
          latest.deliveries[dedupKey].status = error?.httpStatus && error.httpStatus < 500 ? 'rejected' : 'delivery_unknown';
          latest.deliveries[dedupKey].reason = String(error?.message ?? 'Unknown delivery result').slice(0, 200);
        }
      });
      throw error;
    } finally {
      inflightDelivery.delete(dedupKey);
    }
  };
  const listDeliveryIssues = async () => {
    const data = await load();
    return Object.entries(data.deliveries ?? {}).filter(([, entry]) =>
      z.object({ status: z.enum(['reserved', 'delivery_unknown', 'rejected']) }).passthrough().safeParse(entry).success)
      .slice(-100).map(([key, entry]) => ({ key, ...entry }));
  };
  const retryDelivery = async (key) => {
    if (!z.string().safeParse(key).success) throw new TypeError('Delivery key is required');
    const data = await load();
    const entry = data.deliveries?.[key];
    if (!entry || !['reserved', 'delivery_unknown', 'rejected'].includes(entry.status)) {
      throw new TypeError('No unresolved delivery with this key');
    }
    if (key !== JSON.stringify([entry.directory, entry.sessionId, entry.type, entry.eventKey ?? ''])) {
      throw new TypeError('Delivery identifier is inconsistent');
    }
    if (!await hasSubscription(entry.directory, entry.sessionId)) {
      throw new TypeError('The original session is no longer subscribed');
    }
    // Manual action from an authenticated user, never background retry.
    return notify({ directory: entry.directory, sessionId: entry.sessionId,
      type: entry.type, eventKey: entry.eventKey, manualRetry: true });
  };
  return { configureAlias, deleteAlias, subscribe, unsubscribe, sendText, sendDocument, sendContent,
    notify, hasSubscription, getSubscription, listSubscriptions, listAliases, listAliasDetails, hasBotToken, listDeliveryIssues, retryDelivery };
};
