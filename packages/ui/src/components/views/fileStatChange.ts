export type FileStatSnapshot = {
  path: string;
  size: number;
  mtimeMs?: number;
};

type FileStatChangeInput = {
  size: number;
  mtimeMs?: number;
};

/** The `/api/fs/stat` answer: `path` is the path the server resolved, not the one requested. */
type FileStatAnswer = {
  path: string;
  size: number;
  mtimeMs?: number;
};

/**
 * The metadata poll compares a baseline with the file on screen by its path.
 * The server answers with the real path of a symlinked file, so taking that
 * path would make every poll for a file opened through a symlinked folder (or
 * a symlink itself) look like a new file: it re-baselines each tick and never
 * notices an external write. The answer's path is therefore ignored on
 * purpose; only the requested path identifies the baseline.
 */
export const fileStatSnapshotForRequestedPath = (
  requestedPath: string,
  answer: FileStatAnswer,
): FileStatSnapshot => ({
  path: requestedPath,
  size: answer.size,
  mtimeMs: answer.mtimeMs,
});

// Some filesystems report sub-millisecond mtime jitter for unchanged files.
const MIN_MTIME_CHANGE_MS = 1;

type OpenFilePollInput = {
  stat: 'found' | 'missing' | 'failed';
  showsFailure: boolean;
  sawMissing: boolean;
  hasUnsavedChanges: boolean;
  moving: boolean;
};

export const openFilePollStep = ({
  stat,
  showsFailure,
  sawMissing,
  hasUnsavedChanges,
  moving,
}: OpenFilePollInput): 'check-changes' | 'show-missing' | 'reload' | 'none' => {
  if (stat === 'missing') return hasUnsavedChanges || moving ? 'none' : 'show-missing';
  if (stat === 'failed') return 'none';
  if (!showsFailure) return 'check-changes';
  return sawMissing ? 'reload' : 'none';
};

export const hasFileStatChanged = (
  previous: FileStatChangeInput,
  latest: FileStatChangeInput,
): boolean => latest.size !== previous.size || (
  latest.mtimeMs !== undefined
  && previous.mtimeMs !== undefined
  && Math.abs(latest.mtimeMs - previous.mtimeMs) >= MIN_MTIME_CHANGE_MS
);
