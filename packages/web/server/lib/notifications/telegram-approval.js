import { randomUUID } from 'node:crypto';

/**
 * An agent cannot attest to the user's intent. Telegram sends therefore need
 * a one-time decision from an authenticated OpenChamber UI. The decision is
 * bound to the original request object and expires without approval.
 */
export const createTelegramApproval = ({
  timeoutMs = 120_000,
  onRequested = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) => {
  const pending = new Map();
  const list = () => Array.from(pending.values(), (item) => ({
    id: item.id, sessionId: item.sessionId, alias: item.alias,
    file: item.file || null, preview: item.text?.slice(0, 500) ?? '',
    text: item.text ?? '', caption: item.caption ?? '',
    filePreview: item.filePreview ?? '', fileSize: item.fileSize ?? null,
    mode: item.mode || 'document', createdAt: item.createdAt,
  }));
  const request = ({ sessionId, alias, text, file, mode, caption, filePreview, fileSize }) => {
    if (!sessionId || (!text && !file)) throw new TypeError('Telegram approval requires a session and content');
    if (pending.size >= 10) throw new Error('Too many pending Telegram approvals');
    return new Promise((resolve) => {
      const id = randomUUID();
      const item = {
        id, sessionId, alias: alias || '', text: text || '', file: file || '',
        caption: caption || '', filePreview: filePreview || '', fileSize: fileSize ?? null,
        mode: mode || 'document', createdAt: Date.now(), resolve, timer: null,
      };
      item.timer = setTimer(() => {
        pending.delete(id);
        resolve(false);
      }, timeoutMs);
      item.timer.unref?.();
      pending.set(id, item);
      try { onRequested({ id, sessionId, alias: item.alias }); } catch { /* presentation is best effort */ }
    });
  };
  const decide = (id, approved) => {
    const item = pending.get(id);
    if (!item) return false;
    pending.delete(id);
    clearTimer(item.timer);
    item.resolve(approved === true);
    return true;
  };
  const stop = () => {
    for (const id of pending.keys()) decide(id, false);
  };
  return { request, list, decide, stop };
};
