import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

const TYPES = new Set(['turn-started', 'turn-finished', 'turn-failed', 'permission-asked', 'question-asked']);
const MAX_EVENTS = 2048;

/** Validate the public OpenChamber 2.7.1 sessionEvents v1 metadata envelope.
 * Do not accept or persist content: shadow mode never asks for transcript. */
export const parseShadowEvent = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.v !== 1) return null;
  const { requestId, event } = body;
  if (typeof requestId !== 'string' || !requestId || !event || typeof event !== 'object') return null;
  const { id, type, at, session, project, linked } = event;
  if (typeof id !== 'string' || !id || id.length > 512 || !TYPES.has(type) ||
      !Number.isSafeInteger(at) || !session || typeof session !== 'object' ||
      typeof session.id !== 'string' || !session.id || session.id.length > 512 ||
      !(session.parentId === null || (typeof session.parentId === 'string' && session.parentId.length > 0)) ||
      !project || typeof project !== 'object' ||
      !(project.directory === null || (typeof project.directory === 'string' &&
        project.directory.length > 0 && project.directory.length <= 4096)) ||
      !Array.isArray(linked)) return null;
  return { id, type, at, sessionId: session.id, parentId: session.parentId,
    directory: project.directory };
};

/** Durable, metadata-only, bounded shadow record. No Telegram credentials,
 * chat payload, subscriptions or delivery operations are present. */
export const createShadowJournal = ({ filePath, fs, now = Date.now }) => {
  if (!filePath || !fs) throw new TypeError('filePath and fs are required');
  let queue = Promise.resolve();
  let loaded = null;
  const load = async () => {
    if (loaded) return loaded;
    loaded = (async () => {
      let raw;
      try { raw = await fs.readFile(filePath, 'utf8'); }
      catch (error) {
        if (error?.code === 'ENOENT') return { version: 1, events: [] };
        throw error;
      }
      const state = JSON.parse(raw);
      if (state?.version !== 1 || !Array.isArray(state.events) ||
          state.events.length > MAX_EVENTS ||
          state.events.some((entry) => typeof entry?.key !== 'string')) {
        throw new Error('Invalid Telegram shadow journal: refusing silent reset');
      }
      return state;
    })();
    try { return await loaded; } catch (error) { loaded = null; throw error; }
  };
  const record = (event) => {
    const result = queue.catch(() => {}).then(async () => {
      const state = await load();
      const key = JSON.stringify([event.directory, event.sessionId, event.id]);
      if (state.events.some((item) => item.key === key)) return { recorded: false, duplicate: true };
      const entry = { key, sessionId: event.sessionId, directory: event.directory,
        root: event.parentId === null, type: event.type, at: event.at, observedAt: now() };
      const next = { version: 1, events: [...state.events, entry].slice(-MAX_EVENTS) };
      await fs.mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      const temp = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, filePath);
        await fs.chmod(filePath, 0o600);
      } catch (error) {
        await fs.rm(temp, { force: true }).catch(() => {});
        throw error;
      }
      loaded = Promise.resolve(next);
      return { recorded: true, duplicate: false };
    });
    queue = result;
    return result;
  };
  return { record, status: async () => {
    await queue.catch(() => {});
    const state = await load();
    return { version: 1, observed: state.events.length, rootEvents: state.events.filter((e) => e.root).length,
      deliveryEnabled: false };
  } };
};
