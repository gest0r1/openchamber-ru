import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, realpath, stat, chmod } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path';

const keyOf = (directory, sessionId) => createHash('sha256').update(JSON.stringify([directory, sessionId])).digest('hex');
const safeAlias = (value) => typeof value === 'string' && /^[\p{L}\p{N} _-]{1,80}$/u.test(value.trim());
const validChat = (value) => /^-?\d+$/.test(String(value)) || /^@[A-Za-z][A-Za-z0-9_]{4,}$/.test(String(value));
const MAX_TEXT = 4000;

/**
 * Opt-in Telegram delivery. No OpenCode session content is transmitted:
 * automatic messages contain a fixed event title and a session deep link.
 * This runtime is intentionally independent of desktop/web push.
 */
export const createTelegramRuntime = ({
  storePath, getBotToken, getPublicOrigin, activityProbe, fetchImpl = fetch,
  enabled = async () => true,
  allowedFileRoots = [],
  getConfiguredAliases = null,
  persistAliases = null,
  getDefaultAlias = async () => '',
}) => {
  let queue = Promise.resolve();
  let aliasQueue = Promise.resolve();
  const normalizeAlias = (value) => String(value ?? '').trim().toLocaleLowerCase();
  const configuredAliases = async () => {
    if (!getConfiguredAliases) return (await load()).aliases;
    const aliases = await getConfiguredAliases();
    return Object.fromEntries((Array.isArray(aliases) ? aliases : []).map((entry) => [normalizeAlias(entry.name), {
      chatId: String(entry.chat_id), threadId: entry.message_thread_id ?? null, kind: entry.kind ?? 'private',
    }]));
  };
  const recentDelivery = new Map();
  const empty = () => ({ version: 1, aliases: {}, subscriptions: {} });
  const load = async () => {
    try {
      const parsed = JSON.parse(await readFile(storePath, 'utf8'));
      return parsed?.version === 1 && parsed.aliases && parsed.subscriptions ? parsed : empty();
    } catch (error) {
      if (error.code === 'ENOENT') return empty();
      throw error;
    }
  };
  const mutate = (fn) => {
    const task = queue.catch(() => {}).then(async () => {
      const data = await load();
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
    if (!safeAlias(alias) || (chatId !== null && chatId !== '' && !validChat(chatId)) ||
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
    if (!persistAliases) return mutate((data) => { delete data.aliases[normalized]; });
    const task = aliasQueue.catch(() => {}).then(async () => {
      const current = await getConfiguredAliases();
      await persistAliases((Array.isArray(current) ? current : []).filter((entry) => normalizeAlias(entry.name) !== normalized));
    });
    aliasQueue = task;
    return task;
  };
  const selectAlias = async (alias) => {
    const name = normalizeAlias(alias || await getDefaultAlias());
    if (!name) throw new TypeError('Telegram default alias is not configured');
    const aliases = await configuredAliases();
    const target = aliases[name];
    if (!target) throw new TypeError(`Unknown Telegram alias: ${name}`);
    return { name, target };
  };
  const subscribe = async (directory, sessionId, alias, options = {}) => {
    if (typeof directory !== 'string' || !directory.trim() || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new TypeError('Invalid subscription');
    }
    const { name } = await selectAlias(alias);
    const scope = options.scope ?? 'session';
    if (!['once', 'run', 'session'].includes(scope)) throw new TypeError('Invalid Telegram subscription scope');
    const expiresAt = options.expiresAt ?? (Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) throw new TypeError('Invalid Telegram expiry');
    const origin = options.origin === 'agent' ? 'agent' : 'user';
    return mutate((data) => {
      data.subscriptions[keyOf(directory, sessionId)] = {
        opted_in: true, alias: name, scope, created_at: Date.now(), expires_at: expiresAt, origin,
        sessionId,
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
      chat_id_masked: String(value.chatId).replace(/.(?=.{4})/g, '*'),
      message_thread_id: value.threadId,
      kind: value.kind,
    }));
  };
  const request = async (method, fields) => {
    const token = await getBotToken();
    if (!token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Telegram is not configured');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(fields), signal: AbortSignal.timeout(10000),
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true) return result.result;
        if (response.status === 429 || response.status >= 500) {
          if (attempt < 2) {
            const retryAfter = Number(result?.parameters?.retry_after);
            await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 300 * (2 ** attempt)));
            continue;
          }
        }
        throw new Error(`Telegram delivery rejected (HTTP ${response.status})`);
      } catch (error) {
        if (attempt === 2 || !['TimeoutError', 'TypeError'].includes(error?.name)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
      }
    }
  };
  const htmlEscape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const markdownToTelegramHtml = (source) => htmlEscape(source)
    .replace(/^#{1,6} +/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');

  const sendText = async (alias, text, { formatted = false } = {}) => {
    const { target } = await selectAlias(alias);
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('Message is empty');
    if (text.length > 100_000) throw new TypeError('Message exceeds 100000 characters');
    const destination = {
      chat_id: target.chatId, ...(target.threadId ? { message_thread_id: target.threadId } : {}),
    };
    if (!formatted) {
      for (let offset = 0; offset < text.length; offset += MAX_TEXT) {
        await request('sendMessage', { ...destination, text: text.slice(offset, offset + MAX_TEXT) });
      }
      return true;
    }
    let offset = 0;
    while (offset < text.length) {
      let step = Math.min(MAX_TEXT, text.length - offset);
      let html = markdownToTelegramHtml(text.slice(offset, offset + step));
      while (html.length > 4096 && step > 1) {
        step = Math.floor(step / 2);
        html = markdownToTelegramHtml(text.slice(offset, offset + step));
      }
      if (html.length > 4096) throw new TypeError('Formatted message cannot fit Telegram limit');
      await request('sendMessage', { ...destination, text: html, parse_mode: 'HTML' });
      offset += step;
    }
    return true;
  };
  const sendDocument = async (alias, filePath, { directory = null, caption = '' } = {}) => {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('File path required');
    if (typeof caption !== 'string' || caption.length > 1024) throw new TypeError('Caption exceeds 1024 characters');
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
    body.append('document', new Blob([contents], { type: 'text/markdown' }), basename(actual));
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST', body, signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) throw new Error(`Telegram document delivery rejected (HTTP ${response.status})`);
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
  const sendContent = async ({ alias, text, file, caption = '', mode = 'document', directory = null }) => {
    if (!['document', 'formatted'].includes(mode)) throw new TypeError('Invalid Telegram mode');
    if (!text && !file) throw new TypeError('text or file required');
    rateLimitExplicit();
    if (file && mode === 'document') await sendDocument(alias, file, { directory, caption });
    if (file && mode === 'formatted') {
      const actual = await realpath(isAbsolute(file) ? file : resolve(directory || '', file));
      const roots = await Promise.all((directory ? [directory] : allowedFileRoots).map((root) => realpath(root).catch(() => null)));
      if (!roots.some((root) => root && (actual === root || (!relative(root, actual).startsWith('..') && !isAbsolute(relative(root, actual)))))) {
        throw new TypeError('File path is outside allowed roots');
      }
      const metadata = await stat(actual);
      if (!actual.endsWith('.md') || !metadata.isFile() || metadata.size > 10 * 1024 * 1024) throw new TypeError('Markdown file required, up to 10 MB');
      await sendText(alias, await readFile(actual, 'utf8'), { formatted: true });
    }
    if (text) await sendText(alias, text, { formatted: mode === 'formatted' });
    return { delivered: true };
  };
  const hasSubscription = async (directory, sessionId) => {
    const data = await load();
    const record = data.subscriptions[keyOf(directory, sessionId)];
    return Boolean(record?.opted_in === true && (!record.expires_at || record.expires_at > Date.now()));
  };
  const hasBotToken = async () => /^[0-9]+:[A-Za-z0-9_-]+$/.test(String(await getBotToken() || ''));
  const listAliases = async () => {
    return Object.keys(await configuredAliases());
  };
  const notify = async ({ directory, sessionId, type, aborted = false }) => {
    if (!directory || !sessionId || aborted || !['completed', 'needs_input'].includes(type)) return false;
    if (await enabled() !== true) return false;
    const data = await load();
    const subscription = data.subscriptions[keyOf(directory, sessionId)];
    if (!subscription?.opted_in || (subscription.expires_at && subscription.expires_at <= Date.now())) return false;
    const dedupKey = `${directory}\u0000${sessionId}\u0000${type}`;
    if (Date.now() - (recentDelivery.get(dedupKey) ?? 0) < 5000) return false;
    if (type === 'completed') {
      // Unknown activity is not completion. Do not notify prematurely.
      const statuses = await activityProbe.fetchActiveSessionStatuses().catch(() => null);
      if (!statuses || statuses[sessionId]) return false;
      const children = await activityProbe.hasWorkingDescendants(sessionId, statuses).catch(() => null);
      if (children !== false) return false;
    }
    const origin = String(await getPublicOrigin() || '').replace(/\/$/, '');
    const url = /^https:\/\//.test(origin) ? `\n${origin}/?session=${encodeURIComponent(sessionId)}` : '';
    await sendText(subscription.alias, `${type === 'completed' ? 'Agent completed the task' : 'Agent needs your input'}${url}`);
    if (subscription.scope === 'once' || (subscription.scope === 'run' && type === 'completed')) {
      await mutate((latest) => {
        if (latest.subscriptions[keyOf(directory, sessionId)]?.created_at === subscription.created_at) {
          delete latest.subscriptions[keyOf(directory, sessionId)];
        }
      });
    }
    recentDelivery.set(dedupKey, Date.now());
    return true;
  };
  return { configureAlias, deleteAlias, subscribe, unsubscribe, sendText, sendDocument, sendContent, notify, hasSubscription, listAliases, listAliasDetails, hasBotToken };
};
