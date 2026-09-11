import os from 'os';
import path from 'path';
import fs from 'fs';

// Keep the upstream implementation byte-for-byte in shared-upstream.js and
// layer only the fork-specific runtime-agent compatibility here. This keeps
// future upstream syncs small and reviewable.
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const homeOverride = process.env.OPENCHAMBER_HOME?.trim();

// Tests and managed installations can point OpenChamber at an isolated HOME.
// Upstream shared.js resolves its constants at module load from XDG_CONFIG_HOME,
// so set it only for that import and restore the process environment afterwards.
if (homeOverride) {
  process.env.XDG_CONFIG_HOME = path.join(homeOverride, '.config');
}

const upstream = await import('./shared-upstream.js');

if (homeOverride) {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
}

export const {
  OPENCODE_CONFIG_DIR,
  AGENT_DIR,
  COMMAND_DIR,
  SKILL_DIR,
  CONFIG_FILE,
  AGENT_SCOPE,
  COMMAND_SCOPE,
  SKILL_SCOPE,
  parseMdFile,
  writeMdFile,
  readConfigFile,
  readConfigLayer,
  isPlainObject,
  readConfigLayers,
  readConfig,
  getConfigForPath,
  writeConfig,
  getJsonEntrySource,
  getJsonWriteTarget,
  getAncestors,
  findWorktreeRoot,
  isPromptFileReference,
  resolvePromptFilePath,
  writePromptFile,
  walkSkillMdFiles,
  addSkillFromMdFile,
  resolveSkillSearchDirectories,
  listSkillSupportingFiles,
  readSkillSupportingFile,
  writeSkillSupportingFile,
  deleteSkillSupportingFile,
} = upstream;

function resolveOpenChamberHome() {
  return process.env.OPENCHAMBER_HOME?.trim() || os.homedir();
}

function resolveConfigDir() {
  if (process.env.OPENCHAMBER_HOME?.trim()) {
    return path.join(resolveOpenChamberHome(), '.config', 'opencode');
  }
  return upstream.OPENCODE_CONFIG_DIR;
}

/**
 * User-level agent roots in read priority order.
 * OpenCode v1.18.30 natively scans $HOME/.opencode/{agent,agents}/**/*.md;
 * the managed fork uses ~/.opencode/agent as the canonical runtime directory
 * while preserving legacy ~/.config/opencode/{agents,agent} fallbacks.
 */
export function getAgentDirectoryRoots() {
  const home = resolveOpenChamberHome();
  const configDir = resolveConfigDir();
  return [
    path.join(home, '.opencode', 'agent'),
    path.join(configDir, 'agents'),
    path.join(configDir, 'agent'),
  ];
}

/**
 * Upstream ensureDirs plus the managed runtime-agent root. Under
 * OPENCHAMBER_HOME this stays fully isolated for tests.
 */
export function ensureDirs() {
  const configDir = resolveConfigDir();
  const dirs = [
    configDir,
    ...getAgentDirectoryRoots(),
    path.join(configDir, 'commands'),
    path.join(configDir, 'skills'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}
