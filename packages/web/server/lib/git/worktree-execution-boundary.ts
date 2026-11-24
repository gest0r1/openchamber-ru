import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
type WorktreeProcess = Pick<NodeJS.Process, 'env' | 'getuid' | 'platform'>;

const EXECUTION_HOME = '/home/opencode';

export const isSeparatedRootWorktreeRuntime = (processObject: WorktreeProcess = process) =>
  processObject.platform === 'linux'
  && processObject.getuid?.() === 0
  && processObject.env.OPENCHAMBER_ROOT_MODE === 'separated';

export const worktreeExecutionHome = (processObject: WorktreeProcess = process) => {
  if (!isSeparatedRootWorktreeRuntime(processObject)) {
    return processObject.env.HOME || os.homedir();
  }
  if (processObject.env.OPENCHAMBER_EXECUTION_USER !== 'opencode') {
    throw new Error('ROOT_WORKTREE_EXECUTION_USER_INVALID');
  }
  return EXECUTION_HOME;
};

export const worktreeDataPath = (processObject: WorktreeProcess = process) => {
  const home = worktreeExecutionHome(processObject);
  const dataHome = isSeparatedRootWorktreeRuntime(processObject)
    ? path.join(home, '.local', 'share')
    : (processObject.env.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  return path.join(dataHome, 'opencode');
};

export const makeWorktreeDirectory = async (directory: string, { leaf = false } = {}): Promise<void> => {
  if (!isSeparatedRootWorktreeRuntime()) {
    await fs.mkdir(directory, { recursive: !leaf });
    return;
  }
  worktreeExecutionHome();
  if (process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE !== '1') {
    throw new Error('ROOT_WORKTREE_CHILD_BOUNDARY_MISSING');
  }
  const args = leaf ? ['-m', '0700', '--', directory] : ['-p', '-m', '0700', '--', directory];
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('/usr/bin/mkdir', args, { timeout: 30000 });
};
