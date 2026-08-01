import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

let home;
let shared;
let agents;

function writeAgentFile(relativePath, content) {
  const fullPath = path.join(home, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

describe('agents', () => {
  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-agents-'));
    // Point the home used for config/runtime path resolution at a temp dir.
    // The override is read at call time, so imports do not need to happen
    // after setting it (and the module cache is safe across test files).
    process.env.OPENCHAMBER_HOME = home;
    shared = await import('./shared.js');
    agents = await import('./agents.js');

    // Guard: if the override did not take effect, fail loudly instead of
    // writing into the real user config dir.
    const roots = shared.getAgentDirectoryRoots();
    if (!roots.every((dir) => dir.startsWith(home))) {
      throw new Error('OPENCHAMBER_HOME override did not take effect');
    }
  });

  afterAll(() => {
    delete process.env.OPENCHAMBER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('getUserAgentPath finds agent in runtime dir (flat)', () => {
    writeAgentFile('.opencode/agent/build.md', '---\n---\nbody');
    expect(agents.getUserAgentPath('build')).toBe(
      path.join(home, '.opencode', 'agent', 'build.md'),
    );
  });

  test('getUserAgentPath finds agent in runtime dir subfolder', () => {
    writeAgentFile('.opencode/agent/subagents/code/reviewer.md', '---\n---\nbody');
    expect(agents.getUserAgentPath('reviewer')).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'reviewer.md'),
    );
  });

  test('runtime dir wins over legacy config dir for the same agent name', () => {
    writeAgentFile('.opencode/agent/senior.md', 'runtime');
    writeAgentFile('.config/opencode/agents/senior.md', 'legacy');
    expect(agents.getUserAgentPath('senior')).toBe(
      path.join(home, '.opencode', 'agent', 'senior.md'),
    );
  });

  test('getUserAgentPath falls back to legacy config agents dir', () => {
    writeAgentFile('.config/opencode/agents/legacy-one.md', '---\n---\nbody');
    expect(agents.getUserAgentPath('legacy-one')).toBe(
      path.join(home, '.config', 'opencode', 'agents', 'legacy-one.md'),
    );
  });

  test('getUserAgentPath falls back to legacy singular agent dir', () => {
    writeAgentFile('.config/opencode/agent/old-singular.md', '---\n---\nbody');
    expect(agents.getUserAgentPath('old-singular')).toBe(
      path.join(home, '.config', 'opencode', 'agent', 'old-singular.md'),
    );
  });

  test('getUserAgentPath defaults to runtime flat path for unknown agent', () => {
    expect(agents.getUserAgentPath('brand-new')).toBe(
      path.join(home, '.opencode', 'agent', 'brand-new.md'),
    );
  });

  test('getAgentCategory: subagent with category, subagent default, primary, absent', () => {
    expect(agents.getAgentCategory('x', { mode: 'subagent', category: 'code' })).toBe(
      path.join('subagents', 'code'),
    );
    expect(agents.getAgentCategory('x', { mode: 'subagent' })).toBe(path.join('subagents', 'core'));
    expect(agents.getAgentCategory('x', { mode: 'primary' })).toBe('core');
    expect(agents.getAgentCategory('x', {})).toBe('core');
  });

  test('getAgentCategory: mode all and absent mode fall to core', () => {
    expect(agents.getAgentCategory('x', { mode: 'all' })).toBe('core');
  });

  test('getAgentCategory: unsafe category throws instead of escaping the dir', () => {
    expect(() => agents.getAgentCategory('x', { mode: 'subagent', category: '../evil' })).toThrow();
    expect(() => agents.getAgentCategory('x', { mode: 'subagent', category: 'a/b' })).toThrow();
    expect(() => agents.getAgentCategory('x', { mode: 'subagent', category: '..' })).toThrow();
    expect(() => agents.getAgentCategory('x', { mode: 'subagent', category: '.' })).toThrow();
    expect(() => agents.getAgentCategory('x', { mode: 'subagent', category: 'foo..bar' })).toThrow();
    expect(() => agents.getAgentCategory('x', { mode: 'subagent', category: 'a\\b' })).toThrow();
  });

  test('getAgentCategory: empty or whitespace category falls back to subagents/core', () => {
    expect(agents.getAgentCategory('x', { mode: 'subagent', category: '' })).toBe(
      path.join('subagents', 'core'),
    );
    expect(agents.getAgentCategory('x', { mode: 'subagent', category: '   ' })).toBe(
      path.join('subagents', 'core'),
    );
  });

  test('runtime subfolder wins over legacy flat for the same agent name', () => {
    writeAgentFile('.opencode/agent/subagents/code/dup.md', 'runtime');
    writeAgentFile('.config/opencode/agents/dup.md', 'legacy');
    expect(agents.getUserAgentPath('dup')).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'dup.md'),
    );
  });

  test('display name resolves to the existing slug file via frontmatter name', () => {
    writeAgentFile(
      '.opencode/agent/subagents/code/senior-technical-plan-reviewer.md',
      '---\nname: SeniorTechnicalPlanReviewer\nmode: subagent\n---\nbody',
    );
    expect(agents.getUserAgentPath('SeniorTechnicalPlanReviewer')).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'senior-technical-plan-reviewer.md'),
    );
  });

  test('display name resolves case-insensitively to slug file', () => {
    writeAgentFile(
      '.opencode/agent/subagents/code/plan-reviewer-x.md',
      '---\nname: PlanReviewerX\nmode: subagent\n---\nbody',
    );
    expect(agents.getUserAgentPath('planreviewerx')).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'plan-reviewer-x.md'),
    );
  });

  test('getAgentWritePath: display name updates existing slug file (no duplicate)', () => {
    writeAgentFile(
      '.opencode/agent/subagents/code/senior-technical-plan-reviewer.md',
      '---\nname: SeniorTechnicalPlanReviewer\nmode: subagent\nmodel: gpt-5.5\n---\nbody',
    );
    const result = agents.getAgentWritePath('SeniorTechnicalPlanReviewer', null, undefined, null, {
      mode: 'subagent',
      model: 'gpt-5.6-luna',
    });
    expect(result.path).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'senior-technical-plan-reviewer.md'),
    );
  });

  test('createAgent refuses to duplicate an agent whose display name already exists', () => {
    writeAgentFile(
      '.opencode/agent/subagents/code/senior-technical-plan-reviewer.md',
      '---\nname: SeniorTechnicalPlanReviewer\nmode: subagent\n---\nbody',
    );
    expect(() =>
      agents.createAgent('SeniorTechnicalPlanReviewer', { mode: 'subagent' }, null, 'user'),
    ).toThrow(/already exists/);
  });

  test('createAgent writes name field into frontmatter', () => {
    agents.createAgent('new-with-name', { mode: 'subagent' }, null, 'user');
    const content = fs.readFileSync(
      path.join(home, '.opencode', 'agent', 'subagents', 'core', 'new-with-name.md'),
      'utf8',
    );
    expect(content).toMatch(/^name: new-with-name$/m);
  });

  test('deleteAgent by display name removes the existing slug file', () => {
    writeAgentFile(
      '.opencode/agent/subagents/code/delete-by-name.md',
      '---\nname: DeleteByName\nmode: subagent\n---\nbody',
    );
    agents.deleteAgent('DeleteByName', null, 'user');
    expect(fs.existsSync(path.join(home, '.opencode', 'agent', 'subagents', 'code', 'delete-by-name.md'))).toBe(
      false,
    );
  });

  test('createAgent/updateAgent/deleteAgent reject traversal agent names', () => {
    expect(() => agents.createAgent('../evil', { mode: 'subagent' }, null, 'user')).toThrow(
      /Invalid agent name/,
    );
    expect(() => agents.updateAgent('a/b', { model: 'x' }, null)).toThrow(/Invalid agent name/);
    expect(() => agents.deleteAgent('..', null, 'user')).toThrow(/Invalid agent name/);
  });

  test('frontmatter name in body does not resolve the agent', () => {
    // The `name:` line lives AFTER the closing frontmatter marker: the block
    // scan must not treat it as the agent's display name.
    writeAgentFile(
      '.opencode/agent/subagents/code/body-name-test.md',
      '---\nmode: subagent\n---\n\nname: FakeDisplayName\nbody',
    );
    expect(agents.getUserAgentPath('FakeDisplayName')).toBe(
      path.join(home, '.opencode', 'agent', 'FakeDisplayName.md'),
    );
  });

  test('updateAgent with name:null still keeps name on fresh override', () => {
    agents.updateAgent('null-name-override', { model: 'gpt-x', mode: 'subagent', name: null }, null);
    const content = fs.readFileSync(
      path.join(home, '.opencode', 'agent', 'subagents', 'core', 'null-name-override.md'),
      'utf8',
    );
    expect(content).toMatch(/^name: null-name-override$/m);
  });

  test('getAgentWritePath: runtime subfolder wins over legacy flat', () => {
    writeAgentFile('.opencode/agent/subagents/code/dup-write.md', 'runtime');
    writeAgentFile('.config/opencode/agents/dup-write.md', 'legacy');
    const result = agents.getAgentWritePath('dup-write', null, undefined, null, {
      mode: 'subagent',
    });
    expect(result.path).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'dup-write.md'),
    );
  });

  test('deleteAgent removes runtime subfolder before legacy flat', () => {
    writeAgentFile('.opencode/agent/subagents/code/dup-del.md', 'runtime');
    writeAgentFile('.config/opencode/agents/dup-del.md', 'legacy');
    agents.deleteAgent('dup-del', null, 'user');
    expect(fs.existsSync(path.join(home, '.opencode', 'agent', 'subagents', 'code', 'dup-del.md'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(home, '.config', 'opencode', 'agents', 'dup-del.md'))).toBe(true);
  });

  test('getAgentSources reports runtime subfolder when legacy flat also exists', () => {
    writeAgentFile('.opencode/agent/subagents/code/src-dup.md', 'runtime');
    writeAgentFile('.config/opencode/agents/src-dup.md', 'legacy');
    const sources = agents.getAgentSources('src-dup', null);
    expect(sources.md.path).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'src-dup.md'),
    );
  });

  test('getAgentWritePath: new subagent goes to runtime subagents dir', () => {
    const result = agents.getAgentWritePath('new-sub', '/tmp/proj', undefined, null, {
      mode: 'subagent',
    });
    expect(result).toEqual({
      scope: 'user',
      path: path.join(home, '.opencode', 'agent', 'subagents', 'core', 'new-sub.md'),
    });
  });

  test('getAgentWritePath: new primary goes to runtime core dir', () => {
    const result = agents.getAgentWritePath('new-primary', null, undefined, null, {
      mode: 'primary',
    });
    expect(result.path).toBe(path.join(home, '.opencode', 'agent', 'core', 'new-primary.md'));
  });

  test('getAgentWritePath: existing legacy agent keeps its legacy location', () => {
    writeAgentFile('.config/opencode/agents/legacy-two.md', '---\n---\nbody');
    const result = agents.getAgentWritePath('legacy-two', null, undefined, null, {
      mode: 'subagent',
    });
    expect(result.path).toBe(path.join(home, '.config', 'opencode', 'agents', 'legacy-two.md'));
  });

  test('getAgentScope: project agent wins over user agent', () => {
    writeAgentFile('.opencode/agent/same.md', 'user');
    const projectDir = path.join(home, 'proj');
    fs.mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.opencode', 'agents', 'same.md'), 'project');

    const result = agents.getAgentScope('same', projectDir);
    expect(result.scope).toBe('project');
    expect(result.path).toBe(path.join(projectDir, '.opencode', 'agents', 'same.md'));
  });

  test('createAgent writes subagent to runtime subagents dir', () => {
    agents.createAgent(
      'new-agent',
      { mode: 'subagent', category: 'planning', description: 'planner' },
      null,
      'user',
    );
    const expected = path.join(home, '.opencode', 'agent', 'subagents', 'planning', 'new-agent.md');
    expect(fs.existsSync(expected)).toBe(true);
    const content = fs.readFileSync(expected, 'utf8');
    expect(content).toContain('mode: subagent');
    expect(content).toContain('description: planner');
  });

  test('createAgent writes primary agent to runtime core dir', () => {
    agents.createAgent('new-primary-agent', { mode: 'primary' }, null, 'user');
    expect(fs.existsSync(path.join(home, '.opencode', 'agent', 'core', 'new-primary-agent.md'))).toBe(
      true,
    );
  });

  test('updateAgent creates builtin override in runtime subagents dir', () => {
    agents.updateAgent('builtin-ghost', { model: 'gpt-x', mode: 'subagent' }, null);
    const expected = path.join(home, '.opencode', 'agent', 'subagents', 'core', 'builtin-ghost.md');
    expect(fs.existsSync(expected)).toBe(true);
  });

  test('getAgentSources reports runtime md path', () => {
    writeAgentFile('.opencode/agent/subagents/code/src-test.md', '---\n---\nbody');
    const sources = agents.getAgentSources('src-test', null);
    expect(sources.md.path).toBe(
      path.join(home, '.opencode', 'agent', 'subagents', 'code', 'src-test.md'),
    );
    expect(sources.md.scope).toBe('user');
  });

  test('deleteAgent removes agent from runtime dir subfolder', () => {
    writeAgentFile('.opencode/agent/core/old-core.md', '---\n---\nbody');
    agents.deleteAgent('old-core', null, 'user');
    expect(fs.existsSync(path.join(home, '.opencode', 'agent', 'core', 'old-core.md'))).toBe(false);
  });
});
