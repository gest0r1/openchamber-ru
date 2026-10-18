import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

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
}) => {
  let queue = Promise.resolve();
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
      return result;
    });
    queue = task;
    return task;
  };
  const configureAlias = (alias, chatId, threadId = null) => {
    if (!safeAlias(alias) || !validChat(chatId) || (threadId !== null && (!Number.isSafeInteger(threadId) || threadId < 1))) {
      throw new TypeError('Invalid Telegram alias or destination');
    }
    return mutate((data) => { data.aliases[alias.trim().toLowerCase()] = { chatId: String(chatId), threadId }; });
  };
  const subscribe = (directory, sessionId, alias) => {
    if (!directory || !sessionId || !safeAlias(alias)) throw new TypeError('Invalid subscription');
    return mutate((data) => {
      const name = alias.trim().toLowerCase();
      if (!data.aliases[name]) throw new Error('Unknown Telegram alias');
      data.subscriptions[keyOf(directory, sessionId)] = { alias: name, sessionId };
    });
  };
  const unsubscribe = (directory, sessionId) => mutate((data) => {
    delete data.subscriptions[keyOf(directory, sessionId)];
  });
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
  const sendText = async (alias, text) => {
    const data = await load();
    const target = data.aliases[String(alias).trim().toLowerCase()];
    if (!target) throw new Error('Unknown Telegram alias');
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('Message is empty');
    for (let offset = 0; offset < text.length; offset += MAX_TEXT) {
      await request('sendMessage', {
        chat_id: target.chatId, ...(target.threadId ? { message_thread_id: target.threadId } : {}),
        text: text.slice(offset, offset + MAX_TEXT),
      });
    }
  };
  const hasSubscription = async (directory, sessionId) => {
    const data = await load();
    return Boolean(data.subscriptions[keyOf(directory, sessionId)]);
  };
  const listAliases = async () => {
    const data = await load();
    return Object.keys(data.aliases);
  };
  const notify = async ({ directory, sessionId, type, aborted = false }) => {
    if (!directory || !sessionId || aborted || !['completed', 'needs_input'].includes(type)) return false;
    if (await enabled() !== true) return false;
    const data = await load();
    const subscription = data.subscriptions[keyOf(directory, sessionId)];
    if (!subscription) return false;
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
    recentDelivery.set(dedupKey, Date.now());
    return true;
  };
  return { configureAlias, subscribe, unsubscribe, sendText, notify, hasSubscription, listAliases };
};
