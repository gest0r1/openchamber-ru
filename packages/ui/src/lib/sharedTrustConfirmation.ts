/**
 * The trust prompt for a team's shared project setup.
 *
 * Commands in `<repo>/.openchamber/project.json` run on this machine, and a
 * `git pull` can change them. So the first time a shared setup or teardown
 * command or a shared action is about to run, the app shows exactly what would run and
 * asks. The answer is recorded on the instance against a hash of those
 * commands (`trust.hash`); a pull that changes them brings the prompt back.
 *
 * One request is active at a time; a newer one settles the pending one the way
 * that request is dismissed. A teardown prompt is the exception: dismissing it
 * leaves a stack running, so a newer request waits for its answer. The dialog (`SharedTrustConfirmDialog`) renders
 * the pending request on every surface.
 */

import { fetchProjectSetup, getProjectSetup, updateProjectSetup, type ProjectRef, type ProjectSetup } from './openchamberConfig';

export type SharedTrustChoice = 'trust' | 'skip' | 'cancel';

type SharedTrustDismissChoice = Exclude<SharedTrustChoice, 'trust'>;

type SharedTrustRunsIn = 'machine' | 'space';

type PendingSharedTrustRequest = {
  project: ProjectRef;
  sharedPath: string;
  runsIn: SharedTrustRunsIn;
  dismissChoice: SharedTrustDismissChoice;
  /** Set on a teardown prompt: newer requests wait for this answer instead of settling it. */
  awaitedAnswer: Promise<SharedTrustChoice> | null;
  setupCommands: string[];
  teardownCommands: string[];
  actions: Array<{ id: string; name: string; command: string }>;
  resolve: (choice: SharedTrustChoice) => void;
};

let pendingRequest: PendingSharedTrustRequest | null = null;
// Teardown answers being asked for, by project path and trust hash.
const pendingTeardownAnswers = new Map<string, Promise<SharedTrustChoice>>();
const listeners = new Set<() => void>();

const emitChange = (): void => {
  for (const listener of listeners) listener();
};

export const getSharedTrustConfirmationSnapshot = (): PendingSharedTrustRequest | null => pendingRequest;

export const subscribeSharedTrustConfirmation = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const settleSharedTrustConfirmation = (choice: SharedTrustChoice): void => {
  const request = pendingRequest;
  pendingRequest = null;
  emitChange();
  request?.resolve(choice);
};

const askForTrust = async (
  project: ProjectRef,
  setup: ProjectSetup,
  runsIn: SharedTrustRunsIn,
  dismissChoice: SharedTrustDismissChoice,
  { teardown = false }: { teardown?: boolean } = {},
): Promise<SharedTrustChoice> => {
  while (pendingRequest?.awaitedAnswer) {
    await pendingRequest.awaitedAnswer;
  }
  if (pendingRequest) {
    pendingRequest.resolve(pendingRequest.dismissChoice);
  }
  let resolve!: (choice: SharedTrustChoice) => void;
  const answer = new Promise<SharedTrustChoice>((settle) => { resolve = settle; });
  pendingRequest = {
    project,
    sharedPath: setup.shared.path,
    runsIn,
    dismissChoice,
    awaitedAnswer: teardown ? answer : null,
    setupCommands: setup.shared.setupWorktree,
    teardownCommands: setup.shared.teardownWorktree,
    actions: setup.shared.projectActions.map(({ id, name, command }) => ({ id, name, command })),
    resolve,
  };
  emitChange();
  return answer;
};

const answerSharedTrust = async (
  project: ProjectRef,
  setup: ProjectSetup,
  runsIn: SharedTrustRunsIn,
  dismissChoice: SharedTrustDismissChoice,
  options?: { teardown?: boolean },
): Promise<SharedTrustChoice> => {
  if (setup.trust.trusted || setup.trust.hash === null) {
    return 'trust';
  }
  const choice = await askForTrust(project, setup, runsIn, dismissChoice, options);
  if (choice !== 'trust') {
    return choice;
  }
  const recorded = await updateProjectSetup(project, { sharedTrustHash: setup.trust.hash });
  if (!recorded) {
    console.warn('Failed to record the trust answer; the prompt will return next time.');
  }
  return choice;
};

export const ensureSharedSetupTrusted = async (project: ProjectRef, setup: ProjectSetup, runsIn: SharedTrustRunsIn = 'machine'): Promise<boolean> => {
  return (await answerSharedTrust(project, setup, runsIn, 'skip')) === 'trust';
};

const resolveWorktreeSetupCommandsForDismissal = async (
  project: ProjectRef,
  runsIn: SharedTrustRunsIn,
  dismissChoice: SharedTrustDismissChoice,
): Promise<string[] | null> => {
  const setup = await getProjectSetup(project);
  if (setup.shared.setupWorktree.length === 0 || setup.personal.setupWorktreeMode === 'replace') {
    return setup.setupWorktree;
  }
  const choice = await answerSharedTrust(project, setup, runsIn, dismissChoice);
  if (choice === 'cancel') {
    return null;
  }
  return choice === 'trust' ? setup.setupWorktree : setup.personal.setupWorktree;
};

export const resolveWorktreeSetupCommands = async (project: ProjectRef, runsIn: SharedTrustRunsIn = 'machine'): Promise<string[]> => {
  return (await resolveWorktreeSetupCommandsForDismissal(project, runsIn, 'skip')) ?? [];
};

export const resolveWorktreeSetupCommandsOrCancel = async (project: ProjectRef, runsIn: SharedTrustRunsIn = 'machine'): Promise<string[] | null> => {
  return resolveWorktreeSetupCommandsForDismissal(project, runsIn, 'cancel');
};

/**
 * The teardown commands to run before `project`'s worktree is removed, after
 * the trust prompt when the shared ones have not been trusted yet. A "skip"
 * answer, or closing the prompt, leaves only the user's own commands. A setup
 * that cannot be read rejects: the removal must not go ahead without the
 * teardown it may need. With `ask: false` (a removal nobody started by hand)
 * untrusted shared commands reject instead of opening the prompt.
 */
export const resolveWorktreeTeardownCommands = async (project: ProjectRef, { ask = true }: { ask?: boolean } = {}): Promise<string[]> => {
  const setup = await fetchProjectSetup(project);
  if (setup.shared.teardownWorktree.length === 0) {
    return setup.teardownWorktree;
  }
  if (!ask && !setup.trust.trusted) {
    throw new Error('The repository\'s teardown commands are not trusted yet, so the worktree was kept. Archive or delete it yourself to review them.');
  }
  // Two deletes in one project ask once and share the answer.
  const key = `${project.path}\n${setup.trust.hash}`;
  let answer = pendingTeardownAnswers.get(key);
  if (!answer) {
    answer = answerSharedTrust(project, setup, 'machine', 'skip', { teardown: true }).finally(() => pendingTeardownAnswers.delete(key));
    pendingTeardownAnswers.set(key, answer);
  }
  return (await answer) === 'trust'
    ? setup.teardownWorktree
    : setup.personal.teardownWorktree;
};

/** Forget the recorded trust answer, so the next shared command asks again. */
export const resetSharedSetupTrust = (project: ProjectRef): Promise<boolean> => (
  updateProjectSetup(project, { sharedTrustHash: null })
);
