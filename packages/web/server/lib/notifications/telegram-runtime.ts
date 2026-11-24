import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readFile, writeFile, mkdir, rename, realpath, stat, chmod } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path';

import { hasErrorCode, hasErrorMessage } from '../guests/input-guards.js';
import type { SessionReadFetch } from '../opencode/session-activity.js';

const scopeSchema = z.enum(['once', 'run', 'session']);
const aliasKindSchema = z.enum(['private', 'group', 'topic']);
const notificationTypeSchema = z.enum(['completed', 'needs_input', 'error']);
const senderSchema = z.enum(['legacy', 'sdk', 'paused']);
const aliasRecordSchema = z.object({ chatId: z.string(), threadId: z.number().nullable(), kind: aliasKindSchema });
const subscriptionSchema = z.object({
  opted_in: z.boolean(), alias: z.string(), scope: scopeSchema, created_at: z.number(),
  expires_at: z.number().nullish(), origin: z.enum(['agent', 'user']).optional(),
  sessionId: z.string(), directory: z.string(), spaceId: z.string().nullish(),
  title: z.string().nullish(), baselineIdleId: z.string().nullish(),
});
const deliverySchema = z.object({
  status: z.enum(['reserved', 'sent', 'rejected', 'delivery_unknown']), at: z.number(),
  directory: z.string(), sessionId: z.string(), type: notificationTypeSchema,
  eventKey: z.string().nullable(), reason: z.string().optional(),
});
const storeSchema = z.object({
  version: z.literal(1), aliases: z.record(z.string(), aliasRecordSchema),
  subscriptions: z.record(z.string(), subscriptionSchema),
  deliveries: z.record(z.string(), deliverySchema).default({}),
});

type Scope = z.infer<typeof scopeSchema>;
type AliasKind = z.infer<typeof aliasKindSchema>;
export type TelegramSender = z.infer<typeof senderSchema>;
type TelegramStore = z.infer<typeof storeSchema>;
type Subscription = z.infer<typeof subscriptionSchema>;
type ConfiguredAlias = { name: string; chat_id: string; message_thread_id?: number | null; kind?: AliasKind };
type TelegramRuntimeOptions = {
  storePath: string;
  getBotToken: () => Promise<string>;
  getPublicOrigin: () => Promise<string>;
  fetchImpl?: SessionReadFetch;
  enabled?: () => Promise<boolean>;
  getSender?: () => Promise<TelegramSender>;
  allowedFileRoots?: string[];
  getConfiguredAliases?: (() => Promise<ConfiguredAlias[]>) | null;
  persistAliases?: ((aliases: ConfiguredAlias[]) => Promise<void>) | null;
  getDefaultAlias?: () => Promise<string>;
};
type SubscribeOptions = {
  scope?: Scope | undefined; expiresAt?: number | null | undefined; origin?: 'agent' | 'user';
  spaceId?: string | null; title?: string | null; baselineIdleId?: string | null;
};
type DeliveryInput = {
  directory: string; sessionId: string; type: z.infer<typeof notificationTypeSchema>;
  eventKey?: string | null; aborted?: boolean; canSend?: () => Promise<boolean>;
  manualRetry?: boolean; sender?: TelegramSender;
};
export type TelegramContent = {
  alias?: string | undefined; text?: string | undefined; file?: string | undefined;
  caption?: string | undefined; mode?: string | undefined; directory?: string | null;
  expectedSha256?: string | null;
};
type Baseline = { directory: string; sessionId: string; createdAt: number; spaceId?: string | null; idleId: string };
type TelegramFields = { chat_id: string; message_thread_id?: number; text?: string; parse_mode?: 'HTML' };

class TelegramDeliveryError extends Error {
  readonly retrySafe: boolean;
  readonly httpStatus: number;

  constructor(status: number) {
    super(`Telegram delivery rejected (HTTP ${status})`);
    this.retrySafe = status === 429;
    this.httpStatus = status;
  }
}

const keyOf = (directory: string, sessionId: string) => createHash('sha256').update(JSON.stringify([directory, sessionId])).digest('hex');
const safeAlias = (value: string) => z.string().trim().regex(/^[\p{L}\p{N} _-]{1,80}$/u).safeParse(value).success;
const validChat = (value: string | number | null | undefined) => /^-?\d+$/.test(String(value)) || /^@[A-Za-z][A-Za-z0-9_]{4,}$/.test(String(value));
const MAX_TEXT = 4000;

export const createTelegramRuntime = ({
  storePath, getBotToken, getPublicOrigin, fetchImpl = fetch,
  enabled = async () => true,
  getSender = async () => 'legacy',
  allowedFileRoots = [],
  getConfiguredAliases = null,
  persistAliases = null,
  getDefaultAlias = async () => '',
}: TelegramRuntimeOptions) => {
  let queue: Promise<void> = Promise.resolve();
  let aliasQueue = Promise.resolve();
  const normalizeAlias = (value: string | undefined | null) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const configuredAliases = async () => {
    if (!getConfiguredAliases) return (await load()).aliases;
    const aliases = await getConfiguredAliases();
    return Object.fromEntries((Array.isArray(aliases) ? aliases : []).map((entry) => [normalizeAlias(entry.name), {
      chatId: String(entry.chat_id), threadId: entry.message_thread_id ?? null, kind: entry.kind ?? 'private',
    }]));
  };
  const recentDelivery = new Map<string, number>();
  const inflightDelivery = new Set<string>();
  const inflightVerification = new Set<string>();
  const empty = (): TelegramStore => ({ version: 1, aliases: {}, subscriptions: {}, deliveries: {} });
  const load = async () => {
    try {
      const input = JSON.parse(await readFile(storePath, 'utf8'));
      return storeSchema.parse(input);
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') return empty();
      throw error;
    }
  };
  const isExpired = (record: Subscription | undefined, now = Date.now()) =>
    record?.expires_at != null && Number.isFinite(record.expires_at) && record.expires_at <= now;
  const expireSubscriptions = (data: TelegramStore) => {
    const now = Date.now();
    for (const [key, record] of Object.entries(data.subscriptions)) {
      if (isExpired(record, now)) delete data.subscriptions[key];
    }
  };
  const mutate = (fn: (data: TelegramStore) => void) => {
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
  const configureAlias = (alias: string, chatId: string | number | null, threadId: number | null = null, kind: AliasKind = 'private', previousName: string | null = null) => {
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
      if (persistAliases && getConfiguredAliases) {
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
  const deleteAlias = (alias: string) => {
    if (!safeAlias(alias)) throw new TypeError('Invalid Telegram alias');
    const normalized = normalizeAlias(alias);
    const task = aliasQueue.catch(() => {}).then(async () => {
      if (persistAliases && getConfiguredAliases) {
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
  const selectAlias = async (alias?: string | null) => {
    const name = normalizeAlias(alias || await getDefaultAlias());
    if (!name) throw new TypeError('Telegram default alias is not configured');
    const aliases = await configuredAliases();
    const target = aliases[name];
    if (target) return { name, target };
    const withoutPreposition = name.replace(/^(?:в|во|на|для|к)\s+/u, '');
    const shortenedTarget = aliases[withoutPreposition];
    if (withoutPreposition !== name && shortenedTarget) {
      return { name: withoutPreposition, target: shortenedTarget };
    }
    throw new TypeError(`Unknown Telegram alias: ${name}`);
  };
  const subscribe = async (directory: string, sessionId: string, alias: string | null, options: SubscribeOptions = {}) => {
    if (!z.string().trim().min(1).safeParse(directory).success || !z.string().trim().min(1).safeParse(sessionId).success) {
      throw new TypeError('Invalid subscription');
    }
    const { name } = await selectAlias(alias);
    const scope = options.scope ?? 'session';
    if (!['once', 'run', 'session'].includes(scope)) throw new TypeError('Invalid Telegram subscription scope');
    const expiresAt = options.expiresAt ?? null;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) {
      throw new TypeError('Invalid Telegram expiry');
    }
    const origin = options.origin === 'agent' ? 'agent' : 'user';
    return mutate((data) => {
      data.subscriptions[keyOf(directory, sessionId)] = {
        opted_in: true, alias: name, scope, created_at: Date.now(), expires_at: expiresAt, origin,
        sessionId, directory, spaceId: options.spaceId ?? null,
        title: options.title?.trim() ? options.title.slice(0, 200) : null,
        baselineIdleId: options.baselineIdleId ?? null,
      };
    });
  };
  const unsubscribe = (directory: string, sessionId: string) => mutate((data) => {
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
  const request = async (method: string, fields: TelegramFields | FormData) => {
    const token = await getBotToken();
    if (!token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Telegram is not configured');
    const multipart = fields instanceof FormData;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const requestOptions: RequestInit = {
        method: 'POST',
        body: multipart ? fields : JSON.stringify(fields),
        signal: AbortSignal.timeout(multipart ? 30000 : 10000),
      };
      if (!multipart) requestOptions.headers = { 'content-type': 'application/json' };
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, requestOptions);
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok === true) return result.result;
      if (response.status === 429) {
        if (attempt < 2) {
          const retryAfter = Number(result?.parameters?.retry_after);
          await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 300 * (2 ** attempt)));
          continue;
        }
      }
      throw new TelegramDeliveryError(response.status);
    }
  };
  const htmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const markdownToTelegramHtml = (source: string) => {
    const protectedSpans: string[] = [];
    const protect = (markup: string) => {
      const key = protectedSpans.length;
      protectedSpans.push(markup);
      return `\uE000${key}\uE001`;
    };
    let html = htmlEscape(source.replace(/\r\n?/g, '\n'));
    html = html.replace(/^```[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm, (_match, code) =>
      protect(`<pre>${code}</pre>`));
    html = html.replace(/`([^`\n]+)`/g, (_match, code) => protect(`<code>${code}</code>`));
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"'<>]+)\)/gi, (_match, label, url) =>
      protect(`<a href="${url}">${label}</a>`));
    html = html
      .replace(/^#{1,6} +([^\n]+)$/gm, '<b>$1</b>')
      .replace(/^&gt; ?([^\n]+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_\n]+)__/g, '<b>$1</b>')
      .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    return html.replace(/\uE000(\d+)\uE001/g, (_match, key) => protectedSpans[Number(key)] ?? '');
  };
  const safeChunkEnd = (value: string, start: number, maxLength: number) => {
    let end = Math.min(value.length, start + maxLength);
    if (end > start && end < value.length &&
      value.charCodeAt(end - 1) >= 0xD800 && value.charCodeAt(end - 1) <= 0xDBFF &&
      value.charCodeAt(end) >= 0xDC00 && value.charCodeAt(end) <= 0xDFFF) end -= 1;
    return end;
  };
  const sendText = async (alias: string | undefined, text: string, { formatted = false } = {}) => {
    const { target } = await selectAlias(alias);
    if (!z.string().trim().min(1).safeParse(text).success) throw new TypeError('Message is empty');
    if (text.length > 100_000) throw new TypeError('Message exceeds 100000 characters');
    const destination: TelegramFields = { chat_id: target.chatId };
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
  const sendDocument = async (alias: string | undefined, filePath: string, { directory = null, caption = '', expectedSha256 = null }: Pick<TelegramContent, 'directory' | 'caption' | 'expectedSha256'> = {}) => {
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
    await request('sendDocument', body);
    return true;
  };
  let rateWindow = 0;
  let rateCount = 0;
  const rateLimitExplicit = () => {
    const now = Date.now();
    if (now - rateWindow >= 10000) { rateWindow = now; rateCount = 0; }
    if (rateCount >= 10) {
      throw Object.assign(new Error('Too many Telegram sends'), {
        retryAfter: Math.max(1, Math.ceil((rateWindow + 10000 - now) / 1000)),
      });
    }
    rateCount += 1;
  };
  const sendContent = async ({ alias, text, file, caption = '', mode = 'document', directory = null, expectedSha256 = null }: TelegramContent) => {
    if (!['document', 'formatted'].includes(mode)) throw new TypeError('Invalid Telegram mode');
    if (!text && !file) throw new TypeError('text or file required');
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
  const getSubscription = async (directory: string, sessionId: string) => {
    const data = await load();
    const record = data.subscriptions[keyOf(directory, sessionId)];
    return record?.opted_in && !isExpired(record) ? record : null;
  };
  const listSubscriptions = async () => {
    const data = await load();
    return Object.values(data.subscriptions).filter((entry) => entry?.opted_in === true && !isExpired(entry))
      .map((entry) => ({ directory: entry.directory, sessionId: entry.sessionId,
        spaceId: entry.spaceId ?? null, alias: entry.alias, scope: entry.scope,
        title: entry.title ?? null, createdAt: entry.created_at,
        baselineIdleId: entry.baselineIdleId ?? null })).filter((entry) => entry.directory && entry.sessionId);
  };
  const seedBaselines = async (snapshots: Baseline[]) => mutate((data) => {
    for (const item of snapshots) {
      const record = data.subscriptions[keyOf(item.directory, item.sessionId)];
      if (!record?.opted_in || record.created_at !== item.createdAt ||
          (record.spaceId ?? null) !== (item.spaceId ?? null) ||
          !item.idleId) {
        throw new Error('Telegram cutover snapshot no longer matches subscriptions');
      }
    }
    for (const item of snapshots) {
      const record = data.subscriptions[keyOf(item.directory, item.sessionId)];
      if (record) record.baselineIdleId = item.idleId;
    }
  });
  const hasSubscription = async (directory: string, sessionId: string) => {
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
  const notify = async ({ directory, sessionId, type, eventKey = null, aborted = false, canSend = async () => true, manualRetry = false, sender = 'legacy' }: DeliveryInput) => {
    if (!directory || !sessionId || aborted || !['completed', 'needs_input', 'error'].includes(type)) return false;
    if (await enabled() !== true || await getSender() !== sender) return false;
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
    if (inflightDelivery.has(dedupKey) || inflightVerification.has(dedupKey) ||
      Date.now() - (recentDelivery.get(dedupKey) ?? 0) < 5000) return false;
    if (type === 'completed' && eventKey?.startsWith('idle:') !== true) return false;
    inflightVerification.add(dedupKey);
    let url = '';
    try {
      const origin = String(await getPublicOrigin() || '').replace(/\/$/, '');
      url = /^https:\/\//.test(origin) ? `\n${origin}/?session=${encodeURIComponent(sessionId)}` : '';
      const current = (await load()).subscriptions[keyOf(directory, sessionId)];
      if (!current?.opted_in || current.alias !== subscription.alias ||
        current.created_at !== subscription.created_at ||
        current.scope !== subscription.scope ||
        current.expires_at !== subscription.expires_at ||
        (current.expires_at && current.expires_at <= Date.now()) ||
        await enabled() !== true) return false;
      if (!await canSend()) return false;
      inflightDelivery.add(dedupKey);
    } finally {
      inflightVerification.delete(dedupKey);
    }
    let sendAttempted = false;
    try {
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
      const finalSubscription = (await load()).subscriptions[keyOf(directory, sessionId)];
      if (!finalSubscription?.opted_in ||
        finalSubscription.created_at !== subscription.created_at ||
        finalSubscription.alias !== subscription.alias ||
        finalSubscription.scope !== subscription.scope ||
        finalSubscription.expires_at !== subscription.expires_at ||
        isExpired(finalSubscription) || await enabled() !== true || await getSender() !== sender) {
        await mutate((latest) => { delete latest.deliveries[dedupKey]; });
        return false;
      }
      sendAttempted = true;
      await sendText(subscription.alias, `${type === 'completed' ? 'Agent completed the task' : type === 'error' ? 'Agent encountered an error' : 'Agent needs your input'}${url}`);
      await mutate((latest) => {
        const entry = latest.deliveries[dedupKey];
        if (entry) entry.status = 'sent';
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
        const oldest = recentDelivery.keys().next();
        if (oldest.done) break;
        recentDelivery.delete(oldest.value);
      }
      return true;
    } catch (error) {
      await mutate((latest) => {
        if (!sendAttempted || (error instanceof TelegramDeliveryError && error.retrySafe)) {
          delete latest.deliveries[dedupKey];
          return;
        }
        const entry = latest.deliveries[dedupKey];
        if (!entry) return;
        entry.status = error instanceof TelegramDeliveryError && error.httpStatus < 500 ? 'rejected' : 'delivery_unknown';
        entry.reason = String(hasErrorMessage(error) ? error.message : 'Unknown delivery result').slice(0, 200);
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
  const waitForSettledDeliveries = async ({ timeoutMs = 30_000 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (inflightVerification.size || inflightDelivery.size) {
      if (Date.now() >= deadline) {
        throw new Error('Telegram delivery remains in flight; sender switch refused');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const retryDelivery = async (key: string) => {
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
    return notify({ directory: entry.directory, sessionId: entry.sessionId,
      type: entry.type, eventKey: entry.eventKey, manualRetry: true, sender: await getSender() });
  };
  return { configureAlias, deleteAlias, subscribe, unsubscribe, sendText, sendDocument, sendContent,
    notify, hasSubscription, getSubscription, listSubscriptions, seedBaselines, waitForSettledDeliveries, listAliases, listAliasDetails, hasBotToken, listDeliveryIssues, retryDelivery };
};
