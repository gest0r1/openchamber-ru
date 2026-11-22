import { isFilePathWithinDirectory } from '@/lib/path-utils';

/**
 * Which discovered nested repository a surface may select on its own.
 *
 * A project root that is not a repository can contain several: a wrapper
 * folder with one checkout, or a home directory with a dozen tool installs.
 * Discovery reports them all so a picker can offer them; picking one without
 * being asked is only defensible when the choice is not arbitrary. A
 * repository under a dot-directory (`~/.oh-my-zsh`, `~/.cache/...`) is tooling
 * that happens to carry a `.git`, never the project the user opened the folder
 * for (#5357), so those are offered in the picker and never picked
 * automatically.
 */

const SEPARATOR = /[\\/]+/;

const segmentsUnderRoot = (root: string, repository: string): string[] => {
  const normalizedRoot = root.replace(/[\\/]+$/, '');
  const relative = repository.startsWith(normalizedRoot)
    ? repository.slice(normalizedRoot.length)
    : repository;
  return relative.split(SEPARATOR).filter((segment) => segment.length > 0);
};

const isHiddenRepository = (root: string, repository: string): boolean =>
  segmentsUnderRoot(root, repository).some((segment) => segment.startsWith('.'));

export const chooseAutoNestedRepo = (
  root: string,
  repositories: readonly string[] | null | undefined,
): string | null => {
  if (!Array.isArray(repositories) || repositories.length === 0) return null;
  const visible = repositories.find((repository) => !isHiddenRepository(root, repository));
  return visible ?? null;
};

/**
 * The repository a file belongs to, among those known: the deepest one holding
 * it, since a nested repository's files are not its parent's.
 */
export const findFileRepository = (file: string, repositories: readonly string[]): string | null => {
  let found: string | null = null;
  for (const repository of repositories) {
    if (!isFilePathWithinDirectory(file, repository)) continue;
    if (found === null || repository.length > found.length) found = repository;
  }
  return found;
};

const withoutTrailingSeparator = (value: string): string => value.replace(/[\\/]+$/, '');

export const discoversNestedRepos = (root: string, homeDirectory: string | null | undefined): boolean => {
  if (!homeDirectory) return true;
  return withoutTrailingSeparator(root) !== withoutTrailingSeparator(homeDirectory);
};
