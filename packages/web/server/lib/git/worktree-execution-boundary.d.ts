/** Runtime module retained as JavaScript for the root OpenChamber real-UID
 * Node contract tests; typed declarations cover the TypeScript 2.8 server.
 */
export type WorktreeProcess = {
  platform: string;
  getuid?: (() => number) | undefined;
  env: NodeJS.ProcessEnv;
};
export function isSeparatedRootWorktreeRuntime(processObject?: WorktreeProcess): boolean;
export function worktreeExecutionHome(processObject?: WorktreeProcess): string;
export function worktreeDataPath(processObject?: WorktreeProcess): string;
export function makeWorktreeDirectory(directory: string, options?: { leaf?: boolean }): Promise<void>;
