import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenCode } from '@opencode/client';
import { z } from 'zod';
import { readMergedSettingsSync } from '../settings/settings-files.js';
import { loadAssistContext } from '../session-assist/context.js';
import { turnsToHistory, excerptHead, excerptHeadTail } from '../routing/history.js';
import { buildTurnEndRequest, decideAssist, decideReviewReady, decideWrapUp } from './questions.js';
import { clearSuggestionPatch, offerReviewPatch, openPatch, readWork, suggestDonePatch } from './state.js';
import { createWorkMembership } from './membership.js';

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

const readSessionWorkSettings = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  return {
    enabled: settings.sessionWorkEnabled !== false,
    reviewOffer: settings.sessionReviewOfferEnabled === true,
  };
};

const READ_TIMEOUT_MS = 5_000;
const REQUEST_CHARS = 1_500;
const ANSWER_EDGE_CHARS = 500;
const SEEN_MESSAGES_LIMIT = 500;
const OPEN_RETRY_DELAYS_MS = [2_000, 10_000, 60_000];
/**
 * How long the user stays quiet after a turn that looks done before the hint
 * shows. Most false hints fall on a finished subtask the user moves past within
 * minutes; a message in the meantime cancels the hint (see DOCUMENTATION.md).
 */
const DONE_HINT_DELAY_MS = 10 * 60_000;
/**
 * A shell command the agent started in the turn counts as work it waits on for
 * this long, the goal loop's wait; past it, it is a server left running.
 */
const BACKGROUND_SHELL_WAIT_MS = 30 * 60_000;

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const userMessageSchema = z.object({
  type: z.literal('message.updated'),
  properties: z.object({
    sessionID: z.string().min(1),
    info: z.object({
      id: z.string().min(1),
      role: z.literal('user'),
      time: z.object({ created: z.number() }).partial().optional(),
    }),
  }),
});

const shellSchema = z.object({
  type: z.literal('session.shell.started'),
  id: z.string().min(1),
  created: z.number(),
  properties: z.object({ sessionID: z.string().min(1) }),
});

const unarchivedSchema = z.object({
  type: z.literal('session.unarchived'),
  properties: z.object({ sessionID: z.string().min(1) }),
});

const busySchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.literal('busy') }) }),
});

export function createSessionWorkRuntime({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  getSettings = readSessionWorkSettings,
  classifierEndpoint,
  jev,
  readMetadata,
  updateMetadata,
  isSessionArchived = async () => false,
  /** Whether a folder is inside a worktree the user pinned: its sessions are never in work. */
  isWorktreePinned = async () => false,
  /** Roots of managed Chats: plain conversations, never work. */
  chatRoots = [],
  lineage = null,
  /** `../opencode/session-activity.js`: background work still running for a session; null asks nothing. */
  activityProbe = null,
  now = Date.now,
  openRetryDelaysMs = OPEN_RETRY_DELAYS_MS,
  doneHintDelayMs = DONE_HINT_DELAY_MS,
}) {
  const { canBeInWork } = createWorkMembership({ chatRoots });
  let stopped = false;
  const seenMessages = new Set<string>();
  const pendingOpens = new Map<string, PendingOpen>();
  const suggested = new Map<string, string>();
  const turnGenerations = new Map<string, number>();
  let lastTurnGeneration = 0;
  // A looks-done hint waiting out the quiet pause, at most one per session.
  // In memory only: a server restart drops it, and the session simply gets no
  // hint for that turn.
  const pendingDoneHints = new Map();
  const cancelDoneHint = (sessionId) => {
    clearTimeout(pendingDoneHints.get(sessionId));
    pendingDoneHints.delete(sessionId);
  };
  const turnGeneration = (sessionId) => turnGenerations.get(sessionId) ?? 0;
  const advanceTurn = (sessionId) => {
    cancelDoneHint(sessionId);
    lastTurnGeneration += 1;
    turnGenerations.delete(sessionId);
    turnGenerations.set(sessionId, lastTurnGeneration);
    while (turnGenerations.size > SEEN_MESSAGES_LIMIT) {
      const oldest = turnGenerations.keys().next();
      if (!oldest.done) turnGenerations.delete(oldest.value);
    }
  };

  const openCodeClient = (directory: string) => {
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    return OpenCode.make({ baseUrl: buildOpenCodeUrl('/', '').replace(/\/$/, ''), headers });
  };

  const readPages = (client: Client, sessionId: string, signal: AbortSignal) => ({ limit, cursor }: { limit: number; cursor: string | undefined }) => client.message.list(
    { sessionID: sessionId, limit, ...(cursor ? { cursor } : { order: 'desc' }) },
    { signal },
  );

  /**
   * The session record when it is one this feature serves, archived or not: a
   * top-level project session that is not a review, a `/btw` side question or
   * a scheduled task's run. Chats are plain conversations and never in work.
   * Null otherwise.
   */
  const workSession = async (client, sessionId, signal) => {
    const session = await client.session.get({ sessionID: sessionId }, { signal });
    if (session?.id === sessionId) lineage?.remember(sessionId, session.parentID ?? null);
    return session?.id === sessionId && canBeInWork(session) ? session : null;
  };

  const eligibleSession = async (client: Client, sessionId: string, signal: AbortSignal) => {
    const session = await workSession(client, sessionId, signal);
    return session && !(await isSessionArchived(sessionId)) ? session : null;
  };

  const markSuggested = (sessionId: string, directory: string) => {
    suggested.delete(sessionId);
    suggested.set(sessionId, directory);
    while (suggested.size > SEEN_MESSAGES_LIMIT) {
      const oldest = suggested.keys().next();
      if (!oldest.done) suggested.delete(oldest.value);
    }
  };

  const takeMessage = (messageId: string) => {
    if (seenMessages.has(messageId)) return false;
    seenMessages.add(messageId);
    while (seenMessages.size > SEEN_MESSAGES_LIMIT) {
      const oldest = seenMessages.values().next();
      if (!oldest.done) seenMessages.delete(oldest.value);
    }
    return true;
  };

  /**
   * One try at the open a message owes. `archived` when the session has to be
   * restored first, `settled` when nothing more is owed: it opened, was
   * already open, the user closed it after the message, it can never be in
   * work, it is pinned, or In work is off. Throws when a read or the write failed.
   */
  const tryOpen = async ({ sessionId, directory, createdAt }) => {
    if (stopped || !getSettings().enabled) return 'settled';
    if (readWork(await readMetadata(sessionId, directory))?.state === 'open') return 'settled';
    const session = await workSession(openCodeClient(directory), sessionId, AbortSignal.timeout(READ_TIMEOUT_MS));
    if (!session) return 'settled';
    // A pinned worktree's sessions are never in work; a pinned session's own
    // pin is checked by `openPatch`, against the record at write time.
    if (await isWorktreePinned(session.location?.directory ?? session.directory ?? directory)) return 'settled';
    if (await isSessionArchived(sessionId)) return 'archived';
    if (stopped) return 'settled';
    await updateMetadata(sessionId, (metadata) => openPatch(metadata, { requestAt: createdAt, now: now() }), { directory });
    return 'settled';
  };

  const dropPending = (pending: PendingOpen) => {
    clearTimeout(pending.timer ?? undefined);
    if (pendingOpens.get(pending.sessionId) === pending) pendingOpens.delete(pending.sessionId);
  };

  const attemptOpen = async (pending: PendingOpen) => {
    pending.timer = null;
    pending.restored = false;
    pending.inFlight = true;
    let outcome: unknown;
    try {
      outcome = await tryOpen(pending);
    } catch (error) {
      outcome = error;
    }
    pending.inFlight = false;
    if (pendingOpens.get(pending.sessionId) !== pending) return;
    if (outcome === 'settled') {
      dropPending(pending);
      return;
    }
    if (outcome === 'archived') {
      if (pending.restored) void attemptOpen(pending);
      return;
    }
    const gone = isSessionNotFound(outcome);
    if (gone || pending.failures >= openRetryDelaysMs.length) {
      dropPending(pending);
      console.warn('[session-work] gave up opening a session for a sent message:', outcome instanceof Error ? outcome.message : String(outcome));
      return;
    }
    const delay = openRetryDelaysMs[pending.failures];
    pending.failures += 1;
    pending.timer = setTimeout(() => void attemptOpen(pending), delay);
    pending.timer.unref?.();
  };

  const onUserMessage = ({ sessionId, directory, createdAt }: OpenRequest) => {
    if (!getSettings().enabled) return;
    const previous = pendingOpens.get(sessionId);
    if (previous) dropPending(previous);
    const pending: PendingOpen = { sessionId, directory, createdAt, failures: 0, timer: null, inFlight: false, restored: false };
    pendingOpens.set(sessionId, pending);
    while (pendingOpens.size > SEEN_MESSAGES_LIMIT) {
      const oldest = pendingOpens.values().next();
      if (!oldest.done) dropPending(oldest.value);
    }
    void attemptOpen(pending);
  };

  const onSessionRestored = (sessionId: string) => {
    const pending = pendingOpens.get(sessionId);
    if (!pending || pending.timer) return;
    if (pending.inFlight) pending.restored = true;
    else void attemptOpen(pending);
  };

  const retireSuggestion = (sessionId: string) => {
    if (!suggested.has(sessionId)) return;
    const directory = suggested.get(sessionId);
    suggested.delete(sessionId);
    Promise.resolve(updateMetadata(sessionId, clearSuggestionPatch, { directory }))
      .catch((error) => console.warn('[session-work] could not retire a hint:', error instanceof Error ? error.message : String(error)));
  };

  const processPayload = (payload: WorkEvent, directoryHint = '') => {
    if (stopped) return;
    const busy = busySchema.safeParse(payload);
    if (busy.success) {
      advanceTurn(busy.data.properties.sessionID);
      retireSuggestion(busy.data.properties.sessionID);
      return;
    }
    const unarchived = unarchivedSchema.safeParse(payload);
    if (unarchived.success) {
      onSessionRestored(unarchived.data.properties.sessionID);
      return;
    }
    const shell = shellSchema.safeParse(payload);
    if (shell.success) {
      const { sessionID } = shell.data.properties;
      if (lineage?.isChild(sessionID) === true || !takeMessage(shell.data.id)) return;
      onUserMessage({
        sessionId: sessionID,
        directory: payload.properties?.directory || directoryHint,
        createdAt: shell.data.created,
      });
      return;
    }
    const message = userMessageSchema.safeParse(payload);
    if (!message.success) return;
    const { sessionID, info } = message.data.properties;
    if (lineage?.isChild(sessionID) === true || !takeMessage(info.id)) return;
    advanceTurn(sessionID);
    onUserMessage({
      sessionId: sessionID,
      directory: payload.properties?.directory || directoryHint,
      createdAt: info.time?.created ?? now(),
    });
  };

  /**
   * Writes a hint about the turn `generation` names. Decided at write time: a
   * turn that started since makes the hint about an older turn, and it is dropped.
   */
  const writeHint = async ({ sessionId, directory, generation, patch }) => {
    const { changed } = await updateMetadata(
      sessionId,
      (metadata) => (turnGeneration(sessionId) === generation ? patch(metadata, { now: now() }) : null),
      { directory },
    );
    if (changed) markSuggested(sessionId, directory);
  };

  /** Shows the looks-done hint once the user stayed quiet for the pause; the next turn cancels it. */
  const scheduleDoneHint = ({ sessionId, directory, generation }) => {
    // A late answer about an older turn must not replace a newer turn's hint.
    if (turnGeneration(sessionId) !== generation) return;
    cancelDoneHint(sessionId);
    const timer = setTimeout(() => {
      pendingDoneHints.delete(sessionId);
      if (stopped) return;
      writeHint({ sessionId, directory, generation, patch: suggestDonePatch })
        .catch((error) => console.warn('[session-work] could not write a done hint:', errorMessage(error)));
    }, doneHintDelayMs);
    timer.unref?.();
    pendingDoneHints.set(sessionId, timer);
  };

  /**
   * Whether the agent ended its turn waiting on its own background work: a
   * subagent, an image, a working child session, or a shell command it started
   * in this turn that has run under 30 minutes. It goes on by itself once that
   * finishes. Null when OpenCode could not tell.
   */
  const waitsOnBackground = async (sessionId, turnStartedAt) => {
    if (!activityProbe) return null;
    const jobs = await activityProbe.fetchRunningBackgroundJobs(sessionId);
    const waitedOn = (job) => job.kind !== 'shell'
      || (job.startedAt >= turnStartedAt && now() - job.startedAt < BACKGROUND_SHELL_WAIT_MS);
    if (jobs?.some(waitedOn)) return true;
    const statuses = await activityProbe.fetchActiveSessionStatuses();
    const children = statuses ? await activityProbe.hasWorkingChildren(sessionId, statuses) : null;
    if (children === true) return true;
    // Jobs this OpenCode cannot list (an older one, or no answer) leave it unknown.
    return Array.isArray(jobs) && children === false ? false : null;
  };

  /**
   * One Jev call when a turn ended. `assist` says which assist fields the user
   * has on. Resolves which of them are worth the Small Model, or null when Jev
   * was not asked about them (no Jev, a failure, an ineligible session): the
   * caller then behaves as it always did.
   */
  const evaluateTurnEnd = async ({ sessionId, directory, assist }) => {
    if (stopped || lineage?.isChild(sessionId) === true) return null;
    const settings = getSettings();
    if (!settings.enabled && !settings.reviewOffer && !assist.recap && !assist.suggestion) return null;
    if (!turnGenerations.has(sessionId)) advanceTurn(sessionId);
    const generation = turnGeneration(sessionId);
    let background = null;
    try {
      const endpoint = await classifierEndpoint();
      if (!endpoint) return null;
      const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
      const client = openCodeClient(directory);
      const session = await eligibleSession(client, sessionId, signal);
      if (!session || session.revert?.messageID) return null;
      const work = settings.enabled ? readWork(await readMetadata(sessionId, directory)) : null;
      const context = await loadAssistContext({ readPage: readPages(client, sessionId, signal), signal });
      if (!context) return null;
      const turn = context.turns.at(-1);
      // A turn that changed no file on disk has nothing to review. Files that
      // did change may be another session's in the same folder, so Jev still
      // reads whether the agent says it changed the project.
      const changedFiles = turn.changedFiles ? turn.changedFiles.size > 0 : null;
      const ask = {
        wrapUp: settings.enabled && work?.state === 'open',
        reviewReady: settings.reviewOffer && changedFiles !== false,
        recap: assist.recap,
        nextStep: assist.suggestion,
      };
      background = ask.wrapUp || ask.nextStep ? await waitsOnBackground(sessionId, turn.user.created ?? 0) : null;
      const request = buildTurnEndRequest({
        history: turnsToHistory(context.turns.slice(0, -1)),
        request: excerptHead(turn.user.text, REQUEST_CHARS),
        answer: excerptHeadTail(turn.assistant.text, ANSWER_EDGE_CHARS, ANSWER_EDGE_CHARS),
        ask,
      });
      if (!request) return null;
      const { answers } = await jev.ask(request, endpoint);
      if (stopped) return null;
      // The review offer shows at once, while the user looks at the changes;
      // looks done waits out the pause and then replaces it.
      if (ask.reviewReady && decideReviewReady(answers)) {
        await writeHint({ sessionId, directory, generation, patch: offerReviewPatch });
      }
      // An agent waiting on its own background work goes on by itself: the
      // work is not done, and there is no next step to suggest.
      if (ask.wrapUp && background !== true && decideWrapUp(answers)) scheduleDoneHint({ sessionId, directory, generation });
      if (!ask.recap && !ask.nextStep) return null;
      const gate = decideAssist(answers);
      return background === true ? { ...gate, suggestion: false } : gate;
    } catch (error) {
      console.warn('[session-work] turn-end check failed:', errorMessage(error));
      // Known background work still rules out a next step when Jev failed.
      return background === true && assist.suggestion ? { recap: true, suggestion: false } : null;
    }
  };

  const stop = () => {
    stopped = true;
    seenMessages.clear();
    for (const pending of pendingOpens.values()) clearTimeout(pending.timer ?? undefined);
    pendingOpens.clear();
    for (const timer of pendingDoneHints.values()) clearTimeout(timer);
    pendingDoneHints.clear();
    suggested.clear();
    turnGenerations.clear();
  };

  return { processPayload, evaluateTurnEnd, stop };
}
