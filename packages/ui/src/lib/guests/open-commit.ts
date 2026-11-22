import { isGuestCommitSha, type HostRequestErrorCode } from '@openchamber/sdk';

import type { GitAPI } from '@/lib/api/types';
import { openMobileWorkspace } from '@/lib/mobileWorkspaceTabs';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { isMobileSurfaceRuntime } from '@/lib/runtimeSurface';
import { commitSelectionKey, useCommitSelectionStore } from '@/stores/useCommitSelectionStore';
import { useGitStore } from '@/stores/useGitStore';
import { useUIStore } from '@/stores/useUIStore';

export type GuestOpenCommitResult =
  | { ok: true }
  | { ok: false; code: HostRequestErrorCode; message: string };

type OpenGuestCommitOptions = {
  sha: string;
  directory: string | null;
  git: Pick<GitAPI, 'getGitLog'> | null;
  currentBranch: (directory: string) => Promise<string | null>;
  /** VS Code has no Diff view commit scope for guests. */
  supported: boolean;
};

export const openGuestCommit = async ({ sha, directory, git, currentBranch, supported }: OpenGuestCommitOptions): Promise<GuestOpenCommitResult> => {
  if (!supported) return { ok: false, code: 'UNSUPPORTED', message: 'This OpenChamber surface has no Diff view.' };
  if (!isGuestCommitSha(sha)) return { ok: false, code: 'HOST_REJECTED', message: 'Commit id must be 7 to 64 hex characters.' };
  if (!directory) return { ok: false, code: 'NO_DIRECTORY', message: 'No project is open.' };
  if (!git) return { ok: false, code: 'HOST_UNAVAILABLE', message: 'Git is not available yet.' };
  const runtimeKey = getRuntimeKey();
  let entry;
  if (!git.getGitLog) return { ok: false, code: 'HOST_UNAVAILABLE', message: 'Git log is not available yet.' };
  try {
    const log = await git.getGitLog(directory, { maxCount: 1, to: sha });
    entry = log.all[0];
  } catch {
    return { ok: false, code: 'NOT_FOUND', message: 'That commit is not in this project.' };
  }
  if (!entry || !entry.hash.toLowerCase().startsWith(sha.toLowerCase())) {
    return { ok: false, code: 'NOT_FOUND', message: 'That commit is not in this project.' };
  }
  const branch = await currentBranch(directory);
  if (getRuntimeKey() !== runtimeKey) return { ok: false, code: 'HOST_UNAVAILABLE', message: 'The connection changed.' };
  useCommitSelectionStore.getState().select(commitSelectionKey(directory, branch, useGitStore.getState().runtimeKey), entry);
  // The phone's Changes tab reads the same selection in its commit scope, once
  // it shows this repository: the request names it, as the desktop opens the
  // Diff tab under this directory.
  if (isMobileSurfaceRuntime()) {
    return openMobileWorkspace({ tab: 'changes', commit: { directory } })
      ? { ok: true }
      : { ok: false, code: 'UNSUPPORTED', message: 'This OpenChamber surface has no Diff view.' };
  }
  useUIStore.getState().openContextPanelTab(directory, { mode: 'diff', diffScope: 'commit' });
  return { ok: true };
};

export const readCurrentBranch = async (git: GitAPI, directory: string): Promise<string | null> => {
  await useGitStore.getState().ensureStatus(directory, git).catch(() => undefined);
  return useGitStore.getState().directories.get(directory)?.status?.current ?? null;
};
