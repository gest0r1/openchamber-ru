import { randomUUID } from 'node:crypto';

import type { TelegramContent } from './telegram-runtime.js';

type ApprovalRequest = TelegramContent & { sessionId: string; filePreview?: string; fileSize?: number };
type PendingApproval = Required<Pick<ApprovalRequest, 'sessionId' | 'filePreview'>> & {
  id: string; alias: string; text: string; file: string; caption: string;
  fileSize: number | null; mode: string; createdAt: number;
  resolve: (approved: boolean) => void; timer: NodeJS.Timeout;
};
type ApprovalOptions = {
  timeoutMs?: number;
  onRequested?: (item: Pick<PendingApproval, 'id' | 'sessionId' | 'alias'>) => void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

export const createTelegramApproval = ({
  timeoutMs = 120_000,
  onRequested = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: ApprovalOptions = {}) => {
  const pending = new Map<string, PendingApproval>();
  const list = () => Array.from(pending.values(), (item) => ({
    id: item.id, sessionId: item.sessionId, alias: item.alias,
    file: item.file || null, preview: item.text?.slice(0, 500) ?? '',
    text: item.text ?? '', caption: item.caption ?? '',
    filePreview: item.filePreview ?? '', fileSize: item.fileSize ?? null,
    mode: item.mode || 'document', createdAt: item.createdAt,
  }));
  const request = ({ sessionId, alias, text, file, mode, caption, filePreview, fileSize }: ApprovalRequest) => {
    if (!sessionId || (!text && !file)) throw new TypeError('Telegram approval requires a session and content');
    if (pending.size >= 10) throw new Error('Too many pending Telegram approvals');
    return new Promise<boolean>((resolve) => {
      const id = randomUUID();
      const timer = setTimer(() => {
        pending.delete(id);
        resolve(false);
      }, timeoutMs);
      const item: PendingApproval = {
        id, sessionId, alias: alias || '', text: text || '', file: file || '',
        caption: caption || '', filePreview: filePreview || '', fileSize: fileSize ?? null,
        mode: mode || 'document', createdAt: Date.now(), resolve, timer,
      };
      timer.unref?.();
      pending.set(id, item);
      try { onRequested({ id, sessionId, alias: item.alias }); } catch { void 0; }
    });
  };
  const decide = (id: string, approved: boolean) => {
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
