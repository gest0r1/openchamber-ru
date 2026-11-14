import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute } from 'node:path';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value, limit = 4096) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const normalizeAlias = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const validAlias = (value) => nonempty(value, 80) && /^[\p{L}\p{N} _-]+$/u.test(value);
const validDestination = (value) => /^-?\d+$/.test(String(value)) || /^@[A-Za-z][A-Za-z0-9_]{4,}$/.test(String(value));
const validSpace = (value) => value == null || nonempty(value, 512);
const fail = (reason) => { throw new Error('MIGRATION_REJECTED: ' + reason); };

// Pure, auditable transformation. No Bot API and no private host imports.
// Legacy raw files remain authoritative; this is NOT a sender ownership switch.
export function prepareLegacySnapshot({ runtime, watch, config, configuredAliases, sourceSha256, now = Date.now() }) {
  if (!plain(runtime) || runtime.version !== 1 || !plain(runtime.subscriptions) ||
      !plain(runtime.deliveries) || !plain(runtime.aliases)) fail('runtime schema');
  if (!plain(watch) || watch.version !== 1 || !Array.isArray(watch.pending)) fail('watch schema');
  if (!plain(config) || config.version !== 1 || typeof config.enabled !== 'boolean' ||
      !(config.botToken === undefined || typeof config.botToken === 'string') ||
      !(config.defaultAlias === undefined || typeof config.defaultAlias === 'string')) fail('config schema');
  if (!plain(sourceSha256) || !['runtime', 'watch', 'config'].every((name) =>
      /^[a-f0-9]{64}$/.test(sourceSha256[name]))) fail('source hashes');
  if (!Number.isSafeInteger(now) || now < 0) fail('snapshot timestamp');

  const aliases = Object.create(null);
  if (configuredAliases !== undefined) {
    if (!Array.isArray(configuredAliases)) fail('configured aliases schema');
    for (const record of configuredAliases) {
      if (!plain(record) || !validAlias(record.name) || !validDestination(record.chat_id) ||
          !(record.message_thread_id == null || (Number.isSafeInteger(record.message_thread_id) && record.message_thread_id > 0)) ||
          !['private', 'group', 'topic'].includes(record.kind ?? 'private')) fail('configured alias');
      const name = normalizeAlias(record.name);
      if (Object.hasOwn(aliases, name)) fail('duplicate alias');
      aliases[name] = { chatId: String(record.chat_id), threadId: record.message_thread_id ?? null, kind: record.kind ?? 'private' };
    }
  } else {
    for (const [name, record] of Object.entries(runtime.aliases)) {
      if (!validAlias(name) || !plain(record) || !validDestination(record.chatId) ||
          !(record.threadId == null || (Number.isSafeInteger(record.threadId) && record.threadId > 0)) ||
          !['private', 'group', 'topic'].includes(record.kind ?? 'private')) fail('runtime alias');
      const key = normalizeAlias(name);
      if (Object.hasOwn(aliases, key)) fail('duplicate alias');
      aliases[key] = { chatId: String(record.chatId), threadId: record.threadId ?? null, kind: record.kind ?? 'private' };
    }
  }
  const subscriptions = Object.create(null);
  for (const [key, record] of Object.entries(runtime.subscriptions)) {
    if (!plain(record) || record.opted_in !== true || !nonempty(record.directory) ||
        !nonempty(record.sessionId, 512) || !validAlias(record.alias) ||
        !['once', 'run', 'session'].includes(record.scope) ||
        !Number.isSafeInteger(record.created_at) || record.created_at < 0 ||
        !(record.expires_at == null || (Number.isSafeInteger(record.expires_at) && record.expires_at >= 0)) ||
        !['user', 'agent'].includes(record.origin) || !validSpace(record.spaceId)) fail('subscription');
    if (key !== sha(JSON.stringify([record.directory, record.sessionId]))) fail('subscription key mismatch');
    const alias = normalizeAlias(record.alias);
    if (!Object.hasOwn(aliases, alias)) fail('subscription alias unresolved: no destination copied');
    subscriptions[key] = { opted_in: true, alias, scope: record.scope, created_at: record.created_at,
      expires_at: record.expires_at ?? null, origin: record.origin, sessionId: record.sessionId,
      directory: record.directory, spaceId: record.spaceId ?? null };
  }
  if (config.defaultAlias && !Object.hasOwn(aliases, normalizeAlias(config.defaultAlias))) fail('default alias unresolved');

  const deliveries = Object.create(null);
  for (const [key, record] of Object.entries(runtime.deliveries)) {
    if (!plain(record) || !nonempty(record.directory) || !nonempty(record.sessionId, 512) ||
        !['completed', 'needs_input', 'error'].includes(record.type) ||
        !(record.eventKey == null || nonempty(record.eventKey, 1024)) ||
        !['reserved', 'sent', 'rejected', 'delivery_unknown'].includes(record.status) ||
        !Number.isSafeInteger(record.at)) fail('delivery');
    if (key !== JSON.stringify([record.directory, record.sessionId, record.type, record.eventKey ?? ''])) {
      fail('delivery key mismatch');
    }
    deliveries[key] = { directory: record.directory, sessionId: record.sessionId,
      type: record.type, eventKey: record.eventKey ?? null, status: record.status, at: record.at,
      reason: typeof record.reason === 'string' ? record.reason.slice(0, 200) : null };
  }

  const pending = [];
  const observed = new Set();
  for (const record of watch.pending) {
    if (!plain(record) || !nonempty(record.directory) || !nonempty(record.sessionId, 512) ||
        !validSpace(record.spaceId) || !(record.baselineIdleId === undefined ||
        record.baselineIdleId === null || nonempty(record.baselineIdleId, 512)) ||
        typeof record.armed !== 'boolean' || !Number.isSafeInteger(record.attempt) ||
        record.attempt < 0 || !Number.isSafeInteger(record.createdAt)) fail('watch checkpoint');
    const key = JSON.stringify([record.spaceId ?? null, record.directory, record.sessionId]);
    if (observed.has(key)) fail('duplicate watch checkpoint');
    observed.add(key);
    pending.push({ directory: record.directory, sessionId: record.sessionId, spaceId: record.spaceId ?? null,
      baselineIdleId: record.baselineIdleId ?? null, armed: record.armed,
      attempt: record.attempt, createdAt: record.createdAt });
  }
  return {
    version: 1, kind: 'telegram-legacy-prepared', preparedAt: now,
    owner: 'legacy', deliveryEnabled: false, cutoverAllowed: false,
    sourceSha256: { runtime: sourceSha256.runtime, watch: sourceSha256.watch, config: sourceSha256.config },
    settings: { enabled: config.enabled, defaultAlias: normalizeAlias(config.defaultAlias), botToken: config.botToken ?? '' },
    aliases, subscriptions, deliveries, pending,
  };
}

// Offline snapshot only, written exclusively in the private extension data directory.
// Existing snapshots never get overwritten, even on a failed retry or modified input.
export async function writePreparedSnapshot({ snapshot, destination, fs }) {
  if (!isAbsolute(destination) || !fs || snapshot?.kind !== 'telegram-legacy-prepared' ||
      snapshot.owner !== 'legacy' || snapshot.deliveryEnabled !== false || snapshot.cutoverAllowed !== false) {
    fail('destination or snapshot is unsafe');
  }
  await fs.mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const serialized = JSON.stringify(snapshot);
  let existing;
  try { existing = await fs.readFile(destination, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing !== undefined) {
    let previous;
    try { previous = JSON.parse(existing); } catch { fail('existing snapshot is corrupt'); }
    if (previous?.kind === snapshot.kind && previous?.owner === 'legacy' &&
        previous?.deliveryEnabled === false && previous?.cutoverAllowed === false &&
        JSON.stringify({ ...previous, preparedAt: snapshot.preparedAt }) === serialized) {
      return { created: false };
    }
    fail('snapshot already exists with different source/state');
  }
  const temporary = destination + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' });
    // Hard-link create is NOREPLACE, unlike rename() which overwrites the target.
    await fs.link(temporary, destination);
  } catch (error) {
    if (error.code === 'EEXIST') fail('snapshot already exists; concurrent preparation refused');
    throw error;
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return { created: true };
}

export async function readLegacyInputs({ paths, fs, maxBytes = 16 * 1024 * 1024 }) {
  if (!paths || !['runtime', 'watch', 'config'].every((key) => isAbsolute(paths[key] || ''))) {
    fail('absolute runtime/watch/config file paths required');
  }
  const values = {}, bytes = {};
  for (const key of ['runtime', 'watch', 'config', 'aliases']) {
    if (key === 'aliases' && !paths.aliases) continue;
    if (!isAbsolute(paths[key])) fail('relative input path');
    const stat = await fs.lstat(paths[key]);
    if (!stat.isFile() || stat.size > maxBytes || stat.size === 0) fail('input not a regular bounded file');
    bytes[key] = await fs.readFile(paths[key], 'utf8');
    try { values[key] = JSON.parse(bytes[key]); } catch { fail('invalid JSON: ' + key); }
  }
  // Detect inputs that changed while being read. A cutover still requires an
  // independently verified frozen/quiescent legacy ownership checkpoint.
  for (const key of Object.keys(bytes)) {
    if ((await fs.readFile(paths[key], 'utf8')) !== bytes[key]) fail('input changed during snapshot: ' + key);
  }
  return {
    runtime: values.runtime, watch: values.watch, config: values.config,
    configuredAliases: values.aliases,
    sourceSha256: { runtime: sha(bytes.runtime), watch: sha(bytes.watch), config: sha(bytes.config) },
  };
}
