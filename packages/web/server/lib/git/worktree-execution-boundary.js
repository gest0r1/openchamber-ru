import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const EXECUTION_HOME = '/home/opencode';

/**
 * A root UI is not the owner of OpenCode's checkout storage. The trusted
 * installer fixes the execution account to opencode and preloads a child
 * process boundary which drops privileges before invoking any command.
 */
export const isSeparatedRootWorktreeRuntime = (processObject = process) =>
  processObject.platform === 'linux'
  && processObject.getuid?.() === 0
  && processObject.env.OPENCHAMBER_ROOT_MODE === 'separated';

export const worktreeExecutionHome = (processObject = process) => {
  if (!isSeparatedRootWorktreeRuntime(processObject)) {
    return processObject.env.HOME || os.homedir();
  }
  if (processObject.env.OPENCHAMBER_EXECUTION_USER !== 'opencode') {
    throw new Error('ROOT_WORKTREE_EXECUTION_USER_INVALID');
  }
  return EXECUTION_HOME;
};

export const worktreeDataPath = (processObject = process) => {
  const home = worktreeExecutionHome(processObject);
  const dataHome = isSeparatedRootWorktreeRuntime(processObject)
    ? path.join(home, '.local', 'share')
    : (processObject.env.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  return path.join(dataHome, 'opencode');
};

/** Worktree folders must be created by the same UID that runs Git, never by
 * the root UI. No fallback to root mkdir on a broken or absent preload.
 */
export const makeWorktreeDirectory = async (directory, { leaf = false } = {}) => {
  if (!isSeparatedRootWorktreeRuntime()) {
    return fs.mkdir(directory, { recursive: !leaf });
  }
  worktreeExecutionHome();
  if (process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE !== '1') {
    throw new Error('ROOT_WORKTREE_CHILD_BOUNDARY_MISSING');
  }
  const args = leaf ? ['-m', '0700', '--', directory] : ['-p', '-m', '0700', '--', directory];
  await execFileAsync('/usr/bin/mkdir', args, { timeout: 30000 });
};
