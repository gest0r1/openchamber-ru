/**
 * Whether agents can use an installed skill, from OpenCode's own policy
 * config: a skill is off when the `skill.use` statement that decides it
 * (projected as `skill:<id>`) is a deny. The skills list is the installed inventory (OpenCode's
 * list merged with a disk scan), so a switched-off skill is still in it; this
 * module tells which of them agents are offered.
 */
import { findIntegrationPolicy, type IntegrationPolicy } from '@/lib/opencode/projection';

/**
 * The id OpenCode's `skill.use` policies name: the folder of a `SKILL.md`, or
 * a loose `<id>.md` file's name (`config/plugin/skill-file.ts` upstream). A
 * built-in skill's id is its name.
 */
export const skillIdFromPath = (path: string, name: string): string => {
  if (path === '<built-in>') return name;
  const parts = path.split(/[\\/]/).filter(Boolean);
  const file = parts.at(-1) ?? '';
  if (file === 'SKILL.md') return parts.at(-2) ?? name;
  if (file.endsWith('.md')) return file.slice(0, -3) || name;
  return name;
};

interface SkillSwitchState {
  enabled: boolean;
  rule: IntegrationPolicy | null;
  switchable: boolean;
}

export const getSkillSwitchState = (policies: readonly IntegrationPolicy[], id: string): SkillSwitchState => {
  const resource = `skill:${id}`;
  const rule = findIntegrationPolicy(policies, resource);
  return {
    enabled: rule?.effect !== 'deny',
    rule,
    switchable: rule === null || rule.effect === 'allow' || (rule.resource === resource && rule.path !== null),
  };
};

export const filterAvailableSkills = <T extends { id: string }>(
  skills: T[],
  policies: readonly IntegrationPolicy[] | null,
): T[] => {
  if (!policies || policies.length === 0) return skills;
  const available = skills.filter((skill) => getSkillSwitchState(policies, skill.id).enabled);
  return available.length === skills.length ? skills : available;
};

export const keepSwitchedOffSkills = <T extends { id: string }>(
  skills: T[],
  previous: readonly T[],
  policies: readonly IntegrationPolicy[],
  fromId: (id: string) => T,
): T[] => {
  const listed = new Set(skills.map((skill) => skill.id));
  const deniedIds = policies.flatMap((policy) => {
    if (policy.effect !== 'deny' || !policy.resource.startsWith('skill:')) return [];
    const id = policy.resource.slice('skill:'.length);
    return /[*?]/.test(id) ? [] : [id];
  });
  const missing = [...new Set(deniedIds)]
    .filter((id) => !listed.has(id) && !getSkillSwitchState(policies, id).enabled);
  if (missing.length === 0) return skills;
  return [...skills, ...missing.map((id) => previous.find((skill) => skill.id === id) ?? fromId(id))];
};

export const applySkillSwitch = (
  policies: readonly IntegrationPolicy[],
  id: string,
  enabled: boolean,
  changed: readonly string[],
): IntegrationPolicy[] => {
  const resource = `skill:${id}`;
  if (!enabled) {
    return changed.length > 0 ? [...policies, { resource, effect: 'deny', path: changed[0] }] : [...policies];
  }
  return policies.filter((policy) => !(
    policy.resource === resource && policy.effect === 'deny' && policy.path !== null && changed.includes(policy.path)
  ));
};

export const isSwitchedOffByOwnDeny = (policies: readonly IntegrationPolicy[] | null, id: string): boolean => {
  if (!policies) return false;
  const state = getSkillSwitchState(policies, id);
  return !state.enabled && state.switchable;
};
