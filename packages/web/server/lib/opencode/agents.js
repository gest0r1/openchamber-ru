import fs from 'fs';
import path from 'path';
import {
  CONFIG_FILE,
  AGENT_SCOPE,
  ensureDirs,
  getAgentDirectoryRoots,
  parseMdFile,
  writeMdFile,
  readConfigLayers,
  readConfigFile,
  writeConfig,
  getJsonEntrySource,
  getJsonWriteTarget,
  isPromptFileReference,
  resolvePromptFilePath,
  writePromptFile,
} from './shared.js';

// ============== AGENT SCOPE HELPERS ==============

/**
 * Ensure project-level agent directory exists
 */
function ensureProjectAgentDir(workingDirectory) {
  const projectAgentDir = path.join(workingDirectory, '.opencode', 'agents');
  if (!fs.existsSync(projectAgentDir)) {
    fs.mkdirSync(projectAgentDir, { recursive: true });
  }
  const legacyProjectAgentDir = path.join(workingDirectory, '.opencode', 'agent');
  if (!fs.existsSync(legacyProjectAgentDir)) {
    fs.mkdirSync(legacyProjectAgentDir, { recursive: true });
  }
  return projectAgentDir;
}

/**
 * Get project-level agent path
 */
function getProjectAgentPath(workingDirectory, agentName) {
  const pluralPath = path.join(workingDirectory, '.opencode', 'agents', `${agentName}.md`);
  const legacyPath = path.join(workingDirectory, '.opencode', 'agent', `${agentName}.md`);
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

/**
 * Create a per-request lookup cache for user-level agent path resolution.
 * Indexes are kept per directory root so that one root is fully searched
 * (flat + subfolders) before falling back to the next, lower-priority root.
 */
function createAgentLookupCache() {
  return {
    userAgentIndexByRoot: new Map(),
    userAgentIndexedRoots: new Set(),
    userAgentNormalizedIndexByRoot: new Map(),
    frontmatterNameByRoot: new Map(),
    frontmatterNameScanned: new Set(),
  };
}

/**
 * Reject agent names that could escape the agent directories via path
 * traversal. Called by every mutating entrypoint before the name is used in
 * a path; reads only ever resolve to a default path, so they cannot write.
 */
function assertSafeAgentName(agentName) {
  if (
    typeof agentName !== 'string' ||
    !agentName.trim() ||
    agentName.includes('/') ||
    agentName.includes('\\') ||
    agentName.includes('..') ||
    path.isAbsolute(agentName)
  ) {
    throw new Error(`Invalid agent name: ${agentName}`);
  }
}

/**
 * Extract the `name` field from an agent markdown file's frontmatter without
 * a full YAML parse — display names are plain scalars in practice. Only the
 * block between the opening/closing `---` markers is examined (bounded scan),
 * so body lines like `name: ...` can never false-positive. Returns null when
 * the file has no usable frontmatter `name`.
 */
function getAgentFrontmatterName(filePath) {
  let head;
  try {
    head = fs.readFileSync(filePath, 'utf8').slice(0, 65536);
  } catch {
    return null;
  }
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(head);
  if (!block) return null;
  const nameMatch = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(block[1]);
  return nameMatch ? nameMatch[1].trim() : null;
}

/**
 * Lazily build (once per root) a name -> path index from frontmatter `name`
 * fields. Runtime files are stored under slug basenames (e.g.
 * `senior-technical-plan-reviewer.md`) while their frontmatter `name` holds
 * the display id (e.g. `SeniorTechnicalPlanReviewer`); matching on it lets a
 * UI display name resolve to the existing slug file instead of creating a
 * duplicate. Keys are lowercased so matching is case-insensitive.
 */
function getAgentByFrontmatterName(agentName, rootDir, cache) {
  if (!cache.frontmatterNameScanned.has(rootDir)) {
    cache.frontmatterNameScanned.add(rootDir);
    const map = new Map();
    cache.frontmatterNameByRoot.set(rootDir, map);

    if (!fs.existsSync(rootDir)) return null;

    const dirsToVisit = [rootDir];
    while (dirsToVisit.length > 0) {
      const dir = dirsToVisit.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirsToVisit.push(path.join(dir, entry.name));
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const filePath = path.join(dir, entry.name);
        const frontmatterName = getAgentFrontmatterName(filePath);
        if (frontmatterName && !map.has(frontmatterName.toLowerCase())) {
          map.set(frontmatterName.toLowerCase(), filePath);
        }
      }
    }
  }

  const map = cache.frontmatterNameByRoot.get(rootDir);
  return (map && map.get(agentName.toLowerCase())) || null;
}

/**
 * Build (once per root) the agent index for a single root: name -> full path,
 * first file wins within the root, subfolders are walked in sorted order.
 */
function indexAgentRoot(cache, rootDir) {
  if (cache.userAgentIndexedRoots.has(rootDir)) {
    return cache.userAgentIndexByRoot.get(rootDir);
  }
  cache.userAgentIndexedRoots.add(rootDir);
  const index = new Map();
  cache.userAgentIndexByRoot.set(rootDir, index);
  const normalizedIndex = new Map();
  cache.userAgentNormalizedIndexByRoot.set(rootDir, normalizedIndex);

  if (!fs.existsSync(rootDir)) return index;

  const dirsToVisit = [rootDir];
  while (dirsToVisit.length > 0) {
    const dir = dirsToVisit.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const agentName = entry.name.slice(0, -3);
      if (!index.has(agentName)) {
        index.set(agentName, path.join(dir, entry.name));
      }
      const normalizedKey = normalizeAgentName(agentName);
      if (!normalizedIndex.has(normalizedKey)) {
        normalizedIndex.set(normalizedKey, path.join(dir, entry.name));
      }
    }

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.isDirectory()) {
        dirsToVisit.push(path.join(dir, entry.name));
      }
    }
  }

  return index;
}

/**
 * Normalize an agent name for case-insensitive basename matching: lowercase
 * and strip every non-alphanumeric character, so `SeniorTechnicalPlanReviewer`
 * and `senior-technical-plan-reviewer` normalize to the same key. Used as a
 * last-resort fallback for files that lack a frontmatter `name`.
 */
function normalizeAgentName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve an agent within a single root: flat basename, then subfolder
 * basename, then frontmatter `name`, then normalized basename
 * (case-insensitive, punctuation-insensitive). Returns null when the agent is
 * not present in this root.
 */
function getAgentPathInRoot(agentName, rootDir, cache) {
  const flatPath = path.join(rootDir, `${agentName}.md`);
  if (fs.existsSync(flatPath)) return flatPath;
  const indexed = indexAgentRoot(cache, rootDir).get(agentName);
  if (indexed) return indexed;
  const byFrontmatter = getAgentByFrontmatterName(agentName, rootDir, cache);
  if (byFrontmatter) return byFrontmatter;
  const normalizedIndex = cache.userAgentNormalizedIndexByRoot.get(rootDir);
  if (normalizedIndex) {
    const byNormalized = normalizedIndex.get(normalizeAgentName(agentName));
    if (byNormalized) return byNormalized;
  }
  return null;
}

/**
 * Get user-level agent path — walks subfolders to support grouped layouts.
 * Priority: each root is fully searched (flat then subfolders) before moving
 * to the next root, so the runtime dir (~/.opencode/agent) always wins over
 * legacy dirs for reads. Default (new agent) is runtime dir flat path.
 */
function getUserAgentPath(agentName, lookupCache = null) {
  const cache = lookupCache || createAgentLookupCache();
  for (const root of getAgentDirectoryRoots()) {
    const found = getAgentPathInRoot(agentName, root, cache);
    if (found) return found;
  }
  return path.join(getAgentDirectoryRoots()[0], `${agentName}.md`);
}

/**
 * Validate a user-supplied agent category so it cannot escape the runtime
 * agent dir via path traversal. Falls back to 'core' when absent.
 */
function sanitizeAgentCategory(category) {
  const value = typeof category === 'string' ? category.trim() : '';
  if (!value) return 'core';
  if (value === '.' || value.includes('..') || value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid agent category: ${value}`);
  }
  return value;
}

/**
 * Determine the category subdirectory an agent should be written to.
 * - `mode: subagent` -> `subagents/{category}` (category from config or 'core')
 * - anything else (`primary`, absent, `all`) -> `core`
 * @returns {string} relative category path, e.g. 'subagents/code' or 'core'
 */
function getAgentCategory(agentName, config = {}) {
  if (config.mode === 'subagent') {
    return path.join('subagents', sanitizeAgentCategory(config.category));
  }
  return 'core';
}

/**
 * Write path for a new user-level agent: runtime dir + category subfolder.
 */
function getUserAgentWritePath(agentName, config = {}, lookupCache = null) {
  const existing = getUserAgentPath(agentName, lookupCache);
  if (fs.existsSync(existing)) return existing;
  return path.join(getAgentDirectoryRoots()[0], getAgentCategory(agentName, config), `${agentName}.md`);
}

/**
 * Determine agent scope based on where the .md file exists
 * Priority: project level > user level > null (built-in only)
 */
function getAgentScope(agentName, workingDirectory, lookupCache = null) {
  if (workingDirectory) {
    const projectPath = getProjectAgentPath(workingDirectory, agentName);
    if (fs.existsSync(projectPath)) {
      return { scope: AGENT_SCOPE.PROJECT, path: projectPath };
    }
  }
  
  const userPath = getUserAgentPath(agentName, lookupCache);
  if (fs.existsSync(userPath)) {
    return { scope: AGENT_SCOPE.USER, path: userPath };
  }
  
  return { scope: null, path: null };
}

/**
 * Get the path where an agent should be written based on scope.
 * Existing agents keep their current location (incl. legacy dirs); new user
 * agents go to the runtime dir with a category subfolder.
 */
function getAgentWritePath(agentName, workingDirectory, requestedScope, lookupCache = null, config = {}) {
  // For updates: check existing location first (project takes precedence)
  const existing = getAgentScope(agentName, workingDirectory, lookupCache);
  if (existing.path) {
    return existing;
  }

  // For new agents or built-in overrides: use requested scope or default to user
  const scope = requestedScope || AGENT_SCOPE.USER;
  if (scope === AGENT_SCOPE.PROJECT && workingDirectory) {
    return {
      scope: AGENT_SCOPE.PROJECT,
      path: getProjectAgentPath(workingDirectory, agentName)
    };
  }

  return {
    scope: AGENT_SCOPE.USER,
    path: getUserAgentWritePath(agentName, config, lookupCache)
  };
}

/**
 * Detect where an agent's permission field is currently defined
 * Priority: project .md > user .md > project JSON > user JSON
 * Returns: { source: 'md'|'json'|null, scope: 'project'|'user'|null, path: string|null }
 */
function getAgentPermissionSource(agentName, workingDirectory, lookupCache = null) {
  // Check project-level .md first
  if (workingDirectory) {
    const projectMdPath = getProjectAgentPath(workingDirectory, agentName);
    if (fs.existsSync(projectMdPath)) {
      const { frontmatter } = parseMdFile(projectMdPath);
      if (frontmatter.permission !== undefined) {
        return { source: 'md', scope: AGENT_SCOPE.PROJECT, path: projectMdPath };
      }
    }
  }

  // Check user-level .md
  const userMdPath = getUserAgentPath(agentName, lookupCache);
  if (fs.existsSync(userMdPath)) {
    const { frontmatter } = parseMdFile(userMdPath);
    if (frontmatter.permission !== undefined) {
      return { source: 'md', scope: AGENT_SCOPE.USER, path: userMdPath };
    }
  }

  // Check JSON layers in effective override order. readConfigLayers merges
  // user -> project -> custom, so custom wins over project, project over user.
  const layers = readConfigLayers(workingDirectory);

  const customJsonPermission = layers.customConfig?.agent?.[agentName]?.permission;
  if (customJsonPermission !== undefined && layers.paths.customPath) {
    return { source: 'json', scope: 'custom', path: layers.paths.customPath };
  }

  const projectJsonPermission = layers.projectConfig?.agent?.[agentName]?.permission;
  if (projectJsonPermission !== undefined && layers.paths.projectPath) {
    return { source: 'json', scope: AGENT_SCOPE.PROJECT, path: layers.paths.projectPath };
  }

  const userJsonPermission = layers.userConfig?.agent?.[agentName]?.permission;
  if (userJsonPermission !== undefined) {
    return { source: 'json', scope: AGENT_SCOPE.USER, path: layers.paths.userPath };
  }

  return { source: null, scope: null, path: null };
}

function applyAgentPermission(target, newPermission) {
  if (newPermission == null) {
    delete target.permission;
  } else {
    target.permission = newPermission;
  }
}

function getAgentSources(agentName, workingDirectory, lookupCache = createAgentLookupCache()) {
  const projectPath = workingDirectory ? getProjectAgentPath(workingDirectory, agentName) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);

  const userPath = getUserAgentPath(agentName, lookupCache);
  const userExists = fs.existsSync(userPath);

  const mdPath = projectExists ? projectPath : (userExists ? userPath : null);
  const mdExists = !!mdPath;
  const mdScope = projectExists ? AGENT_SCOPE.PROJECT : (userExists ? AGENT_SCOPE.USER : null);

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  const jsonSection = jsonSource.section;
  const jsonPath = jsonSource.path || layers.paths.customPath || layers.paths.projectPath || layers.paths.userPath;
  const jsonScope = jsonSource.path === layers.paths.projectPath ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER;

  const sources = {
    md: {
      exists: mdExists,
      path: mdPath,
      scope: mdScope,
      fields: []
    },
    json: {
      exists: jsonSource.exists,
      path: jsonPath,
      scope: jsonSource.exists ? jsonScope : null,
      fields: []
    },
    projectMd: {
      exists: projectExists,
      path: projectPath
    },
    userMd: {
      exists: userExists,
      path: userPath
    }
  };

  if (mdExists) {
    const { frontmatter, body } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
    if (body) {
      sources.md.fields.push('prompt');
    }
  }

  if (jsonSection) {
    sources.json.fields = Object.keys(jsonSection);
  }

  return sources;
}

function getAgentConfig(agentName, workingDirectory, lookupCache = createAgentLookupCache()) {
  const projectPath = workingDirectory ? getProjectAgentPath(workingDirectory, agentName) : null;
  const projectExists = projectPath && fs.existsSync(projectPath);

  const userPath = getUserAgentPath(agentName, lookupCache);
  const userExists = fs.existsSync(userPath);

  if (projectExists || userExists) {
    const mdPath = projectExists ? projectPath : userPath;
    const { frontmatter, body } = parseMdFile(mdPath);

    return {
      source: 'md',
      scope: projectExists ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER,
      config: {
        ...frontmatter,
        ...(typeof body === 'string' && body.length > 0 ? { prompt: body } : {}),
      },
    };
  }

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);

  if (jsonSource.exists && jsonSource.section) {
    const scope = jsonSource.path === layers.paths.projectPath ? AGENT_SCOPE.PROJECT : AGENT_SCOPE.USER;
    return {
      source: 'json',
      scope,
      config: { ...jsonSource.section },
    };
  }

  return {
    source: 'none',
    scope: null,
    config: {},
  };
}

function createAgent(agentName, config, workingDirectory, scope) {
  assertSafeAgentName(agentName);
  ensureDirs();
  const lookupCache = createAgentLookupCache();

  const projectPath = workingDirectory ? getProjectAgentPath(workingDirectory, agentName) : null;
  const userPath = getUserAgentPath(agentName, lookupCache);

  if (projectPath && fs.existsSync(projectPath)) {
    throw new Error(`Agent ${agentName} already exists as project-level .md file`);
  }

  if (fs.existsSync(userPath)) {
    throw new Error(`Agent ${agentName} already exists as user-level .md file`);
  }

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  if (jsonSource.exists) {
    throw new Error(`Agent ${agentName} already exists in opencode.json`);
  }

  let targetPath;
  let targetScope;

  if (scope === AGENT_SCOPE.PROJECT && workingDirectory) {
    ensureProjectAgentDir(workingDirectory);
    targetPath = projectPath;
    targetScope = AGENT_SCOPE.PROJECT;
  } else {
    targetPath = getUserAgentWritePath(agentName, config, lookupCache);
    targetScope = AGENT_SCOPE.USER;
  }

  const { prompt, scope: _scopeFromConfig, ...rawFrontmatter } = config;
  const frontmatter = Object.fromEntries(
    Object.entries(rawFrontmatter).filter(([, value]) => value !== null && value !== undefined)
  );
  // The runtime registers agents by their frontmatter `name`; without it the
  // file would be identified by its basename only and future edits using the
  // display name would miss it (creating a duplicate file).
  if (typeof frontmatter.name !== 'string' || !frontmatter.name.trim()) {
    frontmatter.name = agentName;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  writeMdFile(targetPath, frontmatter, prompt || '');
  console.log(`Created new agent: ${agentName} (scope: ${targetScope}, path: ${targetPath})`);
}

function updateAgent(agentName, updates, workingDirectory) {
  assertSafeAgentName(agentName);
  ensureDirs();
  const lookupCache = createAgentLookupCache();

  const { scope, path: mdPath } = getAgentWritePath(agentName, workingDirectory, undefined, lookupCache, updates);
  const mdExists = mdPath && fs.existsSync(mdPath);

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  const jsonSection = jsonSource.section;
  const hasJsonFields = jsonSource.exists && jsonSection && Object.keys(jsonSection).length > 0;
  const jsonTarget = jsonSource.exists
    ? { config: jsonSource.config, path: jsonSource.path }
    : getJsonWriteTarget(layers, AGENT_SCOPE.USER);
  let config = jsonTarget.config || {};

  const isBuiltinOverride = !mdExists && !hasJsonFields;

  let targetPath = mdPath;
  let targetScope = scope;

  if (!mdExists && isBuiltinOverride) {
    // Newly created override file: write to the category path computed by
    // getAgentWritePath (runtime dir + category subfolder).
    targetPath = mdPath;
    targetScope = AGENT_SCOPE.USER;
  }

  let mdData = mdExists ? parseMdFile(mdPath) : (isBuiltinOverride ? { frontmatter: {}, body: '' } : null);

  if (mdData && typeof mdData.frontmatter.name !== 'string') {
    // Register the agent under its display name like createAgent does, so the
    // runtime keys it by `name` instead of the raw basename. Applies to both
    // fresh overrides and pre-existing files that lost their `name` field.
    mdData.frontmatter.name = agentName;
  }

  let mdModified = false;
  let jsonModified = false;
  const creatingNewMd = isBuiltinOverride;

  for (const [field, value] of Object.entries(updates)) {
    // Skip undefined values — they would overwrite existing frontmatter fields with nothing
    if (value === undefined) continue;

    if (field === 'prompt') {
      if (value === null) {
        if (mdExists || creatingNewMd) {
          if (mdData) {
            mdData.body = '';
            mdModified = true;
          }
          continue;
        }

        if (isPromptFileReference(jsonSection?.prompt)) {
          const promptFilePath = resolvePromptFilePath(jsonSection.prompt);
          if (!promptFilePath) {
            throw new Error(`Invalid prompt file reference for agent ${agentName}`);
          }
          writePromptFile(promptFilePath, '');
          continue;
        }

        if (config.agent?.[agentName]) {
          delete config.agent[agentName].prompt;

          if (Object.keys(config.agent[agentName]).length === 0) {
            delete config.agent[agentName];
          }
          if (Object.keys(config.agent).length === 0) {
            delete config.agent;
          }

          jsonModified = true;
        }
        continue;
      }

      const normalizedValue = typeof value === 'string' ? value : (value == null ? '' : String(value));

      if (mdExists || creatingNewMd) {
        if (mdData) {
          mdData.body = normalizedValue;
          mdModified = true;
        }
        continue;
      } else if (isPromptFileReference(jsonSection?.prompt)) {
        const promptFilePath = resolvePromptFilePath(jsonSection.prompt);
        if (!promptFilePath) {
          throw new Error(`Invalid prompt file reference for agent ${agentName}`);
        }
        writePromptFile(promptFilePath, normalizedValue);
        continue;
      } else if (isPromptFileReference(normalizedValue)) {
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName].prompt = normalizedValue;
        jsonModified = true;
        continue;
      }

      if (!config.agent) config.agent = {};
      if (!config.agent[agentName]) config.agent[agentName] = {};
      config.agent[agentName].prompt = normalizedValue;
      jsonModified = true;
      continue;
    }

    if (field === 'permission') {
      const permissionSource = getAgentPermissionSource(agentName, workingDirectory, lookupCache);
      // The client edits the complete source permission map; persist it verbatim.
      // (The old non-wildcard re-merge resurrected rules the user deleted.)
      const newPermission = value && typeof value === 'object' && Object.keys(value).length === 0 ? null : value;

      if (permissionSource.source === 'md') {
        if (mdData && permissionSource.path === targetPath) {
          applyAgentPermission(mdData.frontmatter, newPermission);
          mdModified = true;
        } else {
          const existingMdData = parseMdFile(permissionSource.path);
          applyAgentPermission(existingMdData.frontmatter, newPermission);
          writeMdFile(permissionSource.path, existingMdData.frontmatter, existingMdData.body);
          console.log(`Updated permission in .md file: ${permissionSource.path}`);
        }
      } else if (permissionSource.source === 'json') {
        if (permissionSource.path === (jsonTarget.path || CONFIG_FILE)) {
          if (!config.agent) config.agent = {};
          if (!config.agent[agentName]) config.agent[agentName] = {};
          applyAgentPermission(config.agent[agentName], newPermission);
          jsonModified = true;
        } else {
          const existingConfig = readConfigFile(permissionSource.path);
          if (!existingConfig.agent) existingConfig.agent = {};
          if (!existingConfig.agent[agentName]) existingConfig.agent[agentName] = {};
          applyAgentPermission(existingConfig.agent[agentName], newPermission);
          writeConfig(existingConfig, permissionSource.path);
          console.log(`Updated permission in JSON: ${permissionSource.path}`);
        }
      } else {
        if (mdExists && mdData) {
          applyAgentPermission(mdData.frontmatter, newPermission);
          mdModified = true;
        } else if (hasJsonFields) {
          if (!config.agent) config.agent = {};
          if (!config.agent[agentName]) config.agent[agentName] = {};
          applyAgentPermission(config.agent[agentName], newPermission);
          jsonModified = true;
        } else {
          const writeTarget = getJsonWriteTarget(layers, AGENT_SCOPE.USER);
          if (!writeTarget.config.agent) writeTarget.config.agent = {};
          if (!writeTarget.config.agent[agentName]) writeTarget.config.agent[agentName] = {};
          applyAgentPermission(writeTarget.config.agent[agentName], newPermission);
          writeConfig(writeTarget.config, writeTarget.path);
          console.log(`Created permission in JSON: ${writeTarget.path}`);
        }
      }
      continue;
    }

    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSection?.[field] !== undefined;

    if (value === null) {
      if (mdData && inMd) {
        delete mdData.frontmatter[field];
        mdModified = true;
      }

      if (inJson && config.agent?.[agentName]) {
        delete config.agent[agentName][field];

        if (Object.keys(config.agent[agentName]).length === 0) {
          delete config.agent[agentName];
        }
        if (Object.keys(config.agent).length === 0) {
          delete config.agent;
        }

        jsonModified = true;
      }

      continue;
    }

    if (inJson) {
      if (!config.agent) config.agent = {};
      if (!config.agent[agentName]) config.agent[agentName] = {};
      config.agent[agentName][field] = value;
      jsonModified = true;
    } else if (inMd || creatingNewMd) {
      if (mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      }
    } else {
      if ((mdExists || creatingNewMd) && mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        if (!config.agent) config.agent = {};
        if (!config.agent[agentName]) config.agent[agentName] = {};
        config.agent[agentName][field] = value;
        jsonModified = true;
      }
    }
  }

  if (mdModified && mdData) {
    // Fresh override files must keep their frontmatter `name` — a payload
    // with `name: null` would otherwise strip the registration field. Existing
    // files that lack it also get it backfilled so later lookups resolve.
    if (typeof mdData.frontmatter.name !== 'string') {
      mdData.frontmatter.name = agentName;
      mdModified = true;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    writeMdFile(targetPath, mdData.frontmatter, mdData.body);
  }

  if (jsonModified) {
    writeConfig(config, jsonTarget.path || CONFIG_FILE);
  }

  console.log(`Updated agent: ${agentName} (scope: ${targetScope}, md: ${mdModified}, json: ${jsonModified})`);
}

function deleteJsonAgentEntry(config, agentName) {
  const agentMap = config.agent;
  if (!agentMap || typeof agentMap !== 'object' || Array.isArray(agentMap) || !agentMap[agentName]) return false;
  delete agentMap[agentName];
  if (Object.keys(agentMap).length === 0) {
    delete config.agent;
  }
  return true;
}

function deleteAgent(agentName, workingDirectory, scope) {
  assertSafeAgentName(agentName);
  const lookupCache = createAgentLookupCache();
  const requestedScope = scope === AGENT_SCOPE.PROJECT || scope === AGENT_SCOPE.USER ? scope : null;

  if ((!requestedScope || requestedScope === AGENT_SCOPE.PROJECT) && workingDirectory) {
    const projectPath = getProjectAgentPath(workingDirectory, agentName);
    if (fs.existsSync(projectPath)) {
      fs.unlinkSync(projectPath);
      console.log(`Deleted project-level agent .md file: ${projectPath}`);
      return;
    }
  }

  if (!requestedScope || requestedScope === AGENT_SCOPE.USER) {
    const userPath = getUserAgentPath(agentName, lookupCache);
    if (fs.existsSync(userPath)) {
      fs.unlinkSync(userPath);
      console.log(`Deleted user-level agent .md file: ${userPath}`);
      return;
    }
  }

  const layers = readConfigLayers(workingDirectory);

  if (requestedScope === AGENT_SCOPE.PROJECT) {
    if (layers.paths.projectPath && deleteJsonAgentEntry(layers.projectConfig, agentName)) {
      writeConfig(layers.projectConfig, layers.paths.projectPath);
      console.log(`Removed project-level agent from opencode.json: ${agentName}`);
      return;
    }
    throw new Error(`Project agent ${agentName} not found`);
  }

  if (requestedScope === AGENT_SCOPE.USER) {
    const userJsonPath = layers.paths.customPath || layers.paths.userPath;
    const userJsonConfig = layers.paths.customPath ? layers.customConfig : layers.userConfig;
    if (userJsonPath && deleteJsonAgentEntry(userJsonConfig, agentName)) {
      writeConfig(userJsonConfig, userJsonPath);
      console.log(`Removed user-level agent from opencode.json: ${agentName}`);
      return;
    }
    throw new Error(`User agent ${agentName} not found`);
  }

  const jsonSource = getJsonEntrySource(layers, 'agent', agentName);
  if (jsonSource.exists && jsonSource.config && jsonSource.path && deleteJsonAgentEntry(jsonSource.config, agentName)) {
    writeConfig(jsonSource.config, jsonSource.path);
    console.log(`Removed agent from opencode.json: ${agentName}`);
    return;
  }

  throw new Error(`Agent ${agentName} is built-in or not deletable`);
}

export {
  getAgentSources,
  getAgentConfig,
  createAgent,
  updateAgent,
  deleteAgent,
  getUserAgentPath,
  getUserAgentWritePath,
  getAgentScope,
  getAgentWritePath,
  getAgentCategory,
};
