import { isRecord } from '../shared/guards.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { JsonObject, JsonValue } from '../magic-prompts/runtime.js';
import type { ActionPlatform, DraftStarter, PersonalProjectSetup, ProjectAction, SharedProjectConfig, SharedProjectDocument, SharedProjectRead, StoredProjectSetupPatch } from './contracts.js';

const isObjectRecord = (value: unknown): value is SharedProjectDocument => isRecord(value);
const isInputArray = (value: unknown): value is unknown[] => Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNumber = (value: unknown): value is number => typeof value === 'number';
const isWorktreeMode = (value: unknown): value is 'append' | 'replace' => isText(value) && SETUP_WORKTREE_MODES.has(value);
const isActionPlatform = (value: string): value is ActionPlatform => ACTION_PLATFORMS.has(value);

const ACTION_NAME_MAX_LENGTH = 80;
const ACTION_COMMAND_MAX_LENGTH = 4000;
const ACTION_OPEN_URL_MAX_LENGTH = 2000;
const ACTION_DESKTOP_FORWARD_MAX_LENGTH = 300;
const SETUP_COMMAND_MAX_LENGTH = 4000;
const SETUP_COMMANDS_MAX = 50;

const ACTION_PLATFORMS = new Set(['macos', 'linux', 'windows']);
const SETUP_WORKTREE_MODES = new Set(['append', 'replace']);

const clamp = (value: string, maxLength: number) => (value.length > maxLength ? value.slice(0, maxLength) : value);

const trimmedString = z.unknown().transform((value) => (isText(value) ? value.trim() : '')).parse;

/**
 * The command that creates a project's worktrees in place of the built-in
 * `git worktree add`: one trimmed string, `''` when the project uses the
 * built-in creation. Personal only: it names a tool installed on this
 * machine, which a teammate who pulls the shared file may not have.
 */
const sanitizeCreateWorktreeCommand = (value) => clamp(trimmedString(value), SETUP_COMMAND_MAX_LENGTH);

/** Setup commands: non-empty trimmed strings, capped in count and length. */
export const sanitizeSetupCommands = (value) => {
  if (!Array.isArray(value)) return [];
  const commands = [];
  for (const entry of value) {
    const command = clamp(trimmedString(entry), SETUP_COMMAND_MAX_LENGTH);
    if (!command) continue;
    commands.push(command);
    if (commands.length >= SETUP_COMMANDS_MAX) break;
  }
  return commands;
}).parse;

const sanitizeActionPlatforms = z.unknown().transform((value): ActionPlatform[] => {
  if (!isInputArray(value)) return [];
  const platforms: ActionPlatform[] = [];
  for (const entry of value) {
    const platform = trimmedString(entry).toLowerCase();
    if (isActionPlatform(platform) && !platforms.includes(platform)) platforms.push(platform);
  }
  return platforms;
}).parse;

export const sanitizeProjectActions = z.unknown().transform((value): ProjectAction[] => {
  if (!isInputArray(value)) return [];
  const actions = [];
  const seenIds = new Set();
  for (const entry of value) {
    if (!isObjectRecord(entry)) continue;
    const id = trimmedString(entry.id);
    const name = clamp(trimmedString(entry.name), ACTION_NAME_MAX_LENGTH);
    const command = clamp(trimmedString(entry.command), ACTION_COMMAND_MAX_LENGTH);
    if (!id || !name || !command || seenIds.has(id)) continue;
    seenIds.add(id);

    const icon = trimmedString(entry.icon);
    const platforms = sanitizeActionPlatforms(entry.platforms);
    const openUrl = clamp(trimmedString(entry.openUrl), ACTION_OPEN_URL_MAX_LENGTH);
    const desktopOpenSshForward = clamp(trimmedString(entry.desktopOpenSshForward), ACTION_DESKTOP_FORWARD_MAX_LENGTH);

    const action: ProjectAction = { id, name, command, icon: icon || null };
    if (entry.autoOpenUrl === true) action.autoOpenUrl = true;
    if (openUrl) action.openUrl = openUrl;
    if (desktopOpenSshForward) action.desktopOpenSshForward = desktopOpenSshForward;
    if (platforms.length > 0) action.platforms = platforms;
    if (entry.runIn === 'parent') action.runIn = 'parent';
    actions.push(action);
  }
  return actions;
}).parse;

export const sanitizeDraftStarters = z.unknown().transform((value): DraftStarter[] => {
  if (!isInputArray(value)) return [];
  const starters: DraftStarter[] = [];
  const seen = new Set();
  for (const entry of value) {
    if (!isObjectRecord(entry)) continue;
    const type = entry.type === 'command' || entry.type === 'skill' ? entry.type : null;
    const name = trimmedString(entry.name);
    if (!type || !name) continue;
    const key = `${type}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    starters.push({ type, name });
  }
  return starters;
}).parse;

const sanitizeIdList = z.unknown().transform((value): string[] => {
  if (!isInputArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    const id = trimmedString(entry);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}).parse;

export const projectSetupViewOf = z.unknown().transform((raw): PersonalProjectSetup => {
  const document = isObjectRecord(raw) ? raw : {};
  const projectActions = sanitizeProjectActions(document.projectActions);
  const primaryRaw = trimmedString(document.projectActionsPrimaryId);
  return {
    setupWorktree: sanitizeSetupCommands(document['setup-worktree']),
    setupWorktreeWait: typeof document['setup-worktree-wait'] === 'boolean' ? document['setup-worktree-wait'] : null,
    setupWorktreeMode: SETUP_WORKTREE_MODES.has(document.setupWorktreeMode) ? document.setupWorktreeMode : 'append',
    teardownWorktree: sanitizeSetupCommands(document.teardownWorktree),
    createWorktreeCommand: sanitizeCreateWorktreeCommand(document.createWorktreeCommand),
    projectActions,
    projectActionsPrimaryId: primaryRaw && projectActions.some((action) => action.id === primaryRaw) ? primaryRaw : null,
    draftStarters: sanitizeDraftStarters(document.draftStarters),
    hiddenSharedActionIds: sanitizeIdList(document.hiddenSharedActionIds),
    sharedTrust: sharedTrustOf(document.sharedTrust),
    notesTodosInRepository: document.notesTodosInRepository === true,
  };
}).parse;

const sharedTrustOf = z.unknown().transform((value): PersonalProjectSetup['sharedTrust'] => {
  if (!isObjectRecord(value)) return null;
  const hash = trimmedString(value.hash);
  if (!hash) return null;
  return { hash, trustedAt: isNumber(value.trustedAt) && Number.isFinite(value.trustedAt) ? value.trustedAt : 0 };
}).parse;

export const projectSetupPatchToStored = z.unknown().transform((patch): StoredProjectSetupPatch => {
  if (!isObjectRecord(patch)) {
    throw new Error('patch must be an object');
  }
  const stored: StoredProjectSetupPatch = {};
  if ('setupWorktree' in patch) {
    if (!Array.isArray(patch.setupWorktree)) throw new Error('setupWorktree must be an array of commands');
    stored['setup-worktree'] = sanitizeSetupCommands(patch.setupWorktree);
  }
  if ('setupWorktreeWait' in patch) {
    if (!isBoolean(patch.setupWorktreeWait)) throw new Error('setupWorktreeWait must be a boolean');
    stored['setup-worktree-wait'] = patch.setupWorktreeWait;
  }
  if ('teardownWorktree' in patch) {
    if (!Array.isArray(patch.teardownWorktree)) throw new Error('teardownWorktree must be an array of commands');
    stored.teardownWorktree = sanitizeSetupCommands(patch.teardownWorktree);
  }
  if ('createWorktreeCommand' in patch) {
    if (typeof patch.createWorktreeCommand !== 'string') throw new Error('createWorktreeCommand must be a string');
    stored.createWorktreeCommand = sanitizeCreateWorktreeCommand(patch.createWorktreeCommand) || undefined;
  }
  if ('projectActions' in patch) {
    if (!Array.isArray(patch.projectActions)) throw new Error('projectActions must be an array');
    stored.projectActions = sanitizeProjectActions(patch.projectActions);
  }
  if ('projectActionsPrimaryId' in patch) {
    const primary = patch.projectActionsPrimaryId;
    if (primary !== null && !isText(primary)) throw new Error('projectActionsPrimaryId must be a string or null');
    stored.projectActionsPrimaryId = trimmedString(primary) || undefined;
  }
  if ('draftStarters' in patch) {
    if (!Array.isArray(patch.draftStarters)) throw new Error('draftStarters must be an array');
    stored.draftStarters = sanitizeDraftStarters(patch.draftStarters);
  }
  if ('hiddenSharedActionIds' in patch) {
    if (!Array.isArray(patch.hiddenSharedActionIds)) throw new Error('hiddenSharedActionIds must be an array');
    stored.hiddenSharedActionIds = sanitizeIdList(patch.hiddenSharedActionIds);
  }
  if ('setupWorktreeMode' in patch) {
    if (!isWorktreeMode(patch.setupWorktreeMode)) throw new Error('setupWorktreeMode must be "append" or "replace"');
    stored.setupWorktreeMode = patch.setupWorktreeMode;
  }
  if ('sharedTrustHash' in patch) {
    const hash = patch.sharedTrustHash;
    if (hash !== null && (!isText(hash) || !hash.trim())) throw new Error('sharedTrustHash must be a non-empty string or null');
    stored.sharedTrust = hash === null ? undefined : { hash: hash.trim(), trustedAt: Date.now() };
  }
  if ('notesTodosInRepository' in patch) {
    if (patch.notesTodosInRepository !== true && patch.notesTodosInRepository !== false) {
      throw new Error('notesTodosInRepository must be a boolean');
    }
    stored.notesTodosInRepository = patch.notesTodosInRepository || undefined;
  }
  if ('projectPath' in patch) {
    if (!isText(patch.projectPath)) throw new Error('projectPath must be a string');
    const projectPath = patch.projectPath.trim();
    if (projectPath) stored.projectPath = projectPath;
  }
  return stored;
}).parse;

export const SHARED_CONFIG_RELATIVE_PATH = '.openchamber/project.json';
export const DEFAULT_PLANS_DIR = '.openchamber/plans';
export const NOTES_TODOS_RELATIVE_PATH = '.openchamber/notes-todos.json';
const SHARED_CONFIG_VERSION = 1;
/**
 * The keys of the shared file the setup writer owns. Every other key
 * (`magicPrompts`, keys from newer builds) belongs to another writer and goes
 * back out exactly as it was read.
 */
export const SHARED_SETUP_KEYS = Object.freeze(['version', 'setupWorktree', 'setupWorktreeWait', 'teardownWorktree', 'projectActions', 'draftStarters', 'plansDir']);
const SHARED_SETUP_KEY_SET = new Set(SHARED_SETUP_KEYS);

const foreignSharedEntriesOf = (document: SharedProjectDocument) => (
  isObjectRecord(document) ? Object.entries(document).filter(([key]) => !SHARED_SETUP_KEY_SET.has(key)) : []
);

export const defineOwnEntry = <Value>(target: SharedProjectDocument, key: string, value: Value) => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

export const normalizePlansDir = z.unknown().transform((value) => {
  const raw = trimmedString(value).replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;
  const segments = raw.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) return null;
  return segments.join('/');
}).parse;

const EMPTY_SHARED: Readonly<SharedProjectConfig> = Object.freeze({
  setupWorktree: [],
  setupWorktreeWait: null,
  teardownWorktree: [],
  projectActions: [],
  draftStarters: [],
  plansDir: null,
});

const isJsonObject = (value: JsonValue): value is JsonObject => isObjectRecord(value);

export const parseSharedProjectConfig = (raw: string): Exclude<SharedProjectRead<JsonObject>, { status: 'missing' }> => {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { status: 'invalid', reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!isJsonObject(parsed)) return { status: 'invalid', reason: 'not an object' };
  if (parsed.version !== SHARED_CONFIG_VERSION) return { status: 'invalid', reason: `unsupported version ${JSON.stringify(parsed.version)}` };
  const document = parsed;
  const invalid = (reason: string): Extract<SharedProjectRead<JsonObject>, { status: 'invalid' }> => ({ status: 'invalid', reason, document });
  if ('setupWorktree' in parsed && !Array.isArray(parsed.setupWorktree)) return invalid('setupWorktree must be an array');
  if ('setupWorktreeWait' in parsed && typeof parsed.setupWorktreeWait !== 'boolean') return invalid('setupWorktreeWait must be a boolean');
  if ('teardownWorktree' in parsed && !Array.isArray(parsed.teardownWorktree)) return invalid('teardownWorktree must be an array');
  if ('projectActions' in parsed && !Array.isArray(parsed.projectActions)) return invalid('projectActions must be an array');
  if ('draftStarters' in parsed && !Array.isArray(parsed.draftStarters)) return invalid('draftStarters must be an array');
  let plansDir: string | null = null;
  if ('plansDir' in parsed && parsed.plansDir !== null) {
    plansDir = normalizePlansDir(parsed.plansDir);
    if (!plansDir) return invalid('plansDir must be a relative path inside the repository');
  }
  return {
    status: 'ok',
    document: parsed,
    config: {
      setupWorktree: sanitizeSetupCommands(parsed.setupWorktree),
      setupWorktreeWait: typeof parsed.setupWorktreeWait === 'boolean' ? parsed.setupWorktreeWait : null,
      teardownWorktree: sanitizeSetupCommands(parsed.teardownWorktree),
      projectActions: sanitizeProjectActions(parsed.projectActions),
      draftStarters: sanitizeDraftStarters(parsed.draftStarters),
      plansDir,
    },
  };
};

const withSource = <Entry extends ProjectAction | DraftStarter>(entries: Entry[], source: 'shared' | 'personal') => entries.map((entry) => ({ ...entry, source }));

/**
 * What a trust answer covers: the shared setup and teardown commands and the
 * shared actions' commands, in a canonical order, hashed. A pull that changes
 * any of them changes the hash, so the prompt returns for the new commands.
 * `null` when the shared config has nothing that executes.
 */
export const sharedTrustHashOf = (shared) => {
  const commands = shared.setupWorktree;
  const teardown = shared.teardownWorktree;
  const actions = shared.projectActions
    .map((action) => {
      const executable: Pick<ProjectAction, 'id' | 'command' | 'runIn'> = { id: action.id, command: action.command };
      if (action.runIn) executable.runIn = action.runIn;
      return executable;
    })
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (commands.length === 0 && teardown.length === 0 && actions.length === 0) return null;
  // Teardown enters the hash only when there is some, so answers recorded
  // before teardown commands existed still match.
  const executable = teardown.length > 0
    ? { setupWorktree: commands, projectActions: actions, teardownWorktree: teardown }
    : { setupWorktree: commands, projectActions: actions };
  const digest = crypto.createHash('sha256').update(JSON.stringify(executable)).digest('hex');
  return `sha256:${digest}`;
};

/**
 * One merged view from the personal view and the shared read. Rules:
 * - setup commands: shared first, then personal; personal `setupWorktreeMode`
 *   `replace` uses only the personal list;
 * - wait flag: personal when the personal file sets it, else shared, else off;
 * - teardown commands: shared first, then personal; `setupWorktreeMode` does
 *   not apply to them;
 * - actions: union by id, a personal action replaces the shared one with the
 *   same id, hidden shared ids are dropped, primary is personal only;
 * - draft starters: union by `type:name`, shared first.
 * Every merged action and starter carries `source`. The `shared` and
 * `personal` blocks are returned too so a page can edit one without guessing
 * which entries came from where.
 */
export const mergeProjectSetup = (personal, sharedRead) => {
  const shared = sharedRead.status === 'ok' ? sharedRead.config : EMPTY_SHARED;
  const hidden = new Set(personal.hiddenSharedActionIds);
  const personalIds = new Set(personal.projectActions.map((action) => action.id));
  const sharedActions = shared.projectActions.filter((action) => !hidden.has(action.id) && !personalIds.has(action.id));
  const starterKeys = new Set(shared.draftStarters.map((starter) => `${starter.type}:${starter.name}`));
  const personalStarters = personal.draftStarters.filter((starter) => !starterKeys.has(`${starter.type}:${starter.name}`));
  const trustHash = sharedTrustHashOf(shared);
  return {
    trust: { hash: trustHash, trusted: trustHash === null || personal.sharedTrust?.hash === trustHash },
    setupWorktree: personal.setupWorktreeMode === 'replace'
      ? personal.setupWorktree
      : [...shared.setupWorktree, ...personal.setupWorktree],
    setupWorktreeWait: personal.setupWorktreeWait !== null
      ? personal.setupWorktreeWait
      : shared.setupWorktreeWait === true,
    teardownWorktree: [...shared.teardownWorktree, ...personal.teardownWorktree],
    projectActions: [...withSource(sharedActions, 'shared'), ...withSource(personal.projectActions, 'personal')],
    projectActionsPrimaryId: personal.projectActionsPrimaryId,
    draftStarters: [...withSource(shared.draftStarters, 'shared'), ...withSource(personalStarters, 'personal')],
    shared: sharedBlockOf(sharedRead, shared),
    personal,
  };
};

const sharedBlockOf = (sharedRead: SharedProjectRead, shared: SharedProjectConfig) => {
  const block: SharedProjectConfig & { status: SharedProjectRead['status']; path: string; reason?: string } = { status: sharedRead.status, path: SHARED_CONFIG_RELATIVE_PATH, ...shared };
  if (sharedRead.status === 'invalid') block.reason = sharedRead.reason;
  return block;
};

const withoutEmptyIcon = (action: ProjectAction) => {
  if (action.icon !== null) return action;
  const { icon: _emptyIcon, ...rest } = action;
  return rest;
};

export const isSharedProjectConfigEmpty = (config: SharedProjectConfig, document: SharedProjectDocument = {}) => (
  config.setupWorktree.length === 0
  && config.setupWorktreeWait === null
  && config.teardownWorktree.length === 0
  && config.projectActions.length === 0
  && config.draftStarters.length === 0
  && config.plansDir === null
  && foreignSharedEntriesOf(document).length === 0
);

export const serializeSharedProjectConfig = (config: SharedProjectConfig, document: SharedProjectDocument = {}) => {
  const output: SharedProjectDocument = { version: SHARED_CONFIG_VERSION };
  if (config.setupWorktree.length > 0) output.setupWorktree = config.setupWorktree;
  if (config.setupWorktreeWait !== null) output.setupWorktreeWait = config.setupWorktreeWait;
  if (config.teardownWorktree.length > 0) output.teardownWorktree = config.teardownWorktree;
  if (config.projectActions.length > 0) output.projectActions = sanitizeProjectActions(config.projectActions).map(withoutEmptyIcon);
  if (config.draftStarters.length > 0) output.draftStarters = config.draftStarters;
  if (config.plansDir !== null) output.plansDir = config.plansDir;
  for (const [key, value] of foreignSharedEntriesOf(document)) defineOwnEntry(output, key, value);
  return `${JSON.stringify(output, null, 2)}\n`;
};

const sharedProjectSetupPatch = z.unknown().transform((patch) => {
  if (!isObjectRecord(patch)) throw new Error('patch must be an object');
  return patch;
});

export const applySharedProjectSetupPatch = (current: SharedProjectConfig, patchInput: SharedProjectDocument) => {
  const patch = sharedProjectSetupPatch.parse(patchInput);
  const next = { ...current };
  if ('setupWorktree' in patch) {
    if (!Array.isArray(patch.setupWorktree)) throw new Error('setupWorktree must be an array of commands');
    next.setupWorktree = sanitizeSetupCommands(patch.setupWorktree);
  }
  if ('setupWorktreeWait' in patch) {
    if (patch.setupWorktreeWait !== null && !isBoolean(patch.setupWorktreeWait)) throw new Error('setupWorktreeWait must be a boolean or null');
    next.setupWorktreeWait = patch.setupWorktreeWait;
  }
  if ('teardownWorktree' in patch) {
    if (!Array.isArray(patch.teardownWorktree)) throw new Error('teardownWorktree must be an array of commands');
    next.teardownWorktree = sanitizeSetupCommands(patch.teardownWorktree);
  }
  if ('projectActions' in patch) {
    if (!Array.isArray(patch.projectActions)) throw new Error('projectActions must be an array');
    next.projectActions = sanitizeProjectActions(patch.projectActions);
  }
  if ('draftStarters' in patch) {
    if (!Array.isArray(patch.draftStarters)) throw new Error('draftStarters must be an array');
    next.draftStarters = sanitizeDraftStarters(patch.draftStarters);
  }
  if ('plansDir' in patch) {
    if (patch.plansDir === null || (isText(patch.plansDir) && !patch.plansDir.trim())) {
      next.plansDir = null;
    } else {
      const plansDir = normalizePlansDir(patch.plansDir);
      if (!plansDir) throw new Error('plansDir must be a relative path inside the repository');
      next.plansDir = plansDir;
    }
  }
  return next;
};

export const EMPTY_SHARED_PROJECT_CONFIG = EMPTY_SHARED;

export const isProjectSetupValidationError = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : '';
  return message.includes('must be') || message.includes('is required') || message.includes('unsupported characters') || message.includes('not found');
};
