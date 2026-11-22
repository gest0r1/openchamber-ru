import type {
  Checkout,
  GuidanceOptions,
  KnowledgeEntries,
  KnowledgeInput,
  KnowledgeNote,
  KnowledgePlan,
  KnowledgeSummary,
  MemoryIndex,
  MemoryIndexMeasurement,
  MemoryTitle,
  SessionKnowledgeDependencies,
  SessionMetadata,
  SessionPins,
} from './contracts.js';
import { hasMessage, isNonEmptyString, isOpenChamberMetadata, isSessionMetadata, isStoredPins } from './guards.js';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.js';
import { LEAD_GUIDANCE, leadBriefEntry } from '../session-lead/guidance.js';
import { readLead } from '../session-lead/metadata.js';

const PINS_METADATA_KEY = 'project_context_pins';

export const KNOWLEDGE_ENTRY_KEYS = {
  checkout: 'openchamber.checkout',
  pinned: 'openchamber.pinned',
  memory: 'openchamber.memory',
  guidance: 'openchamber.guidance',
  responseStyle: 'openchamber.response-style',
  extensions: 'openchamber.extensions',
};

const KNOWLEDGE_MAX_LENGTH = 8000;

const truncate = (value: string) => (
  value.length <= KNOWLEDGE_MAX_LENGTH
    ? value
    : `${value.slice(0, KNOWLEDGE_MAX_LENGTH - 1)}…\n\n(truncated)`
);

const describeCheckout = ({ directory, branch, placeholder = false }: Checkout) => {
  if (!branch) return `This session works in \`${directory}\`, with no branch checked out.`;
  const where = `This session works in \`${directory}\`, on branch \`${branch}\`.`;
  return placeholder ? `${where} ${placeholderBranchGuidance(branch)}` : where;
};

const placeholderBranchGuidance = (branch: string) => `Its name \`${branch}\` is a placeholder OpenChamber generated, not one the user chose,`
  + ' and it is not pushed yet. Name the task with work.name, passing branch too: work.name renames the branch to it.'
  + " Follow the naming the repository's other branches use (`git branch -a`); with none, `<type>/<short-kebab-case>`"
  + ' with the conventional commit types, such as `fix/login-timeout`. No tool or app prefix.'
  + ' A placeholder made for an issue (`issue-180-merry-salamander`) keeps the issue number: work.name puts `180-` in front of'
  + " your name's last segment (`fix/180-login-timeout`) unless your name already has it.";

const memoryTitleLines = (entries: MemoryTitle[]) => entries
  .slice()
  .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  .map((entry) => `- ${entry.title}`);

/**
 * When to save, stated in every session where memory is on, and only here. The
 * tool description alone is read only when the agent already means to call it,
 * so agents told nothing here saved only when the user said "remember".
 *
 * Project knowledge goes to the project's own agent docs when it has them.
 * Told only to skip what the docs already hold, agents saved every new rule and
 * recipe to memory, the one-call path: a maintainer's store grew to 205 entries,
 * a third of them copies of module docs, and the rules in it never reached the
 * teammates' agents.
 */
const MEMORY_SAVE_GUIDANCE = 'The openchamber_memory tool keeps memory across sessions. Save to it in the'
  + ' moment, without asking, when the user corrects how you work or states a'
  + ' preference, or confirms a non-obvious approach worked. Project knowledge (a'
  + ' decision and its reason, a rule, a recipe, a gotcha that took real effort to find)'
  + ' goes where the project keeps agent instructions, when it has such a place'
  + ' (AGENTS.md, skills, module docs): add it to the matching file as part of your work'
  + ' and say so, since every agent and teammate reads those and memory reaches only this'
  + ' user. Memory takes project knowledge only when the project has no such place or it'
  + ' must stay out of the repository: people, business, private setups. What the code,'
  + ' docs, skills or the current commit already hold needs no entry, and unfinished'
  + ' work goes to the project\'s todos and plans. A decision is saved once it is made,'
  + ' never while it is still being discussed. Save before your final reply and'
  + ' mention the save there briefly: the app shows only the text after a turn\'s last'
  + ' tool call as the reply.';

/**
 * When to link, stated in every session that has the `openchamber` tool, and
 * only here. Stated only in the action's description, an agent given an issue
 * to investigate never opened the tool and so never linked it.
 */
export const SESSION_LINK_GUIDANCE = "Link to this session with session.link (tools.openchamber inside a Code Mode execute script),"
  + " as soon as you know it, each issue or pull or merge request the user gives you to"
  + " work on, fix, investigate or review, that you open for this work, or that the work"
  + " resolves. One merely mentioned in passing stays unlinked. The reply need not say you linked it.";

/**
 * When to name the task, stated with the linking guidance for the same reason:
 * an action only its description mentions is never called. The sidebar lists
 * a task under this name, so it is set early and changed only with the task.
 */
export const WORK_NAME_GUIDANCE = "Name the task with work.name (tools.openchamber inside execute) as soon as it is clear what"
  + " the task is: at most 4 words naming the task itself, such as \"Login timeout fix\" or \"Sidebar task rows\","
  + " never a step of it. Write it in the language of the user's latest message, even when you work in"
  + " English: \"Таймаут входу\" for a user who writes Ukrainian. A branch name stays in English. Rename it only when the work"
  + " becomes a different task; finishing a step, fixing something on the way or a follow-up within the"
  + " same task is no reason. A name the user gave stays.";

/**
 * How to hand work to another session, stated with the linking guidance for
 * the same reason (#6608). The call path is spelled out, here and in every
 * line that names an openchamber action: an agent that read
 * only "the openchamber tool" looked for a direct tool of that name, found
 * openchamber_secret and openchamber_render, and called those instead. The
 * subagent line keeps it from dispatching what is part of its own task.
 */
export const DISPATCH_GUIDANCE = "To hand work to another session, call tools.openchamber inside execute:"
  + " session.create starts a new session, session.send gives a task to an existing one (session.list finds it by title)."
  + " Only for a separate session the user asks for; part of your own task goes to your subagent tool.";

/**
 * The managed tools the chat draws from their own call stay direct tools; the
 * rest sit behind Code Mode (../agent-tool/runtime.js). OpenCode's Code Mode
 * teaches the model that tools live in `execute`'s catalog, and a model that
 * called a direct tool from a script got "Unknown tool" and concluded the tool
 * did not exist. Names only the direct tools this session has.
 */
export const directToolsGuidance = (names) => (names.length === 1
  ? `${names[0]} is a direct tool call: never call it from inside a Code Mode execute script, where it does not exist.`
  : `${names.join(', ')} are direct tool calls: never call them from inside a Code Mode execute script, where they do not exist.`);

export const RENDER_PAGE_GUIDANCE = "The openchamber_render tool draws an HTML page inline in the chat, above your reply."
  + " Use it for what UI blocks cannot show: how something looks (a proposed interface change, before and after, layout options),"
  + " or a custom drawing the block components do not cover. Never for data: charts, tables and comparisons are UI blocks, even when the user asks to see them."
  + " At most one page per answer."
  + " A mockup of the user's own project takes its look from that project's code (theme tokens, CSS variables, styles), not from OpenChamber's theme."
  + " Draw a page that only shows right before your final reply, and keep the reply to what the page does not show."
  + " A choice that sets the direction of the work goes through ui with awaitAnswer (see UI blocks);"
  + " a choice between visual designs, through an html page with awaitAnswer."
  + " When the rest of the task does not wait on the choice, send answerLater instead of awaitAnswer and keep working: the answer arrives later as a message.";

const buildMemoryBlock = ({ global, project, enabled = false, complete = false }: MemoryIndex) => {
  if (global.length === 0 && project.length === 0) {
    if (!enabled) return '';
    return complete
      ? `${MEMORY_SAVE_GUIDANCE}\n\nNothing is stored yet.`
      : MEMORY_SAVE_GUIDANCE;
  }

  const preamble = [
    ...(enabled ? [MEMORY_SAVE_GUIDANCE] : []),
    'Stored memory from earlier sessions, titles only, newest first. A title leaves out the'
      + ' conditions and reasons that decide how a memory applies, a self-explanatory'
      + ' one most of all: read each entry that bears on the task with openchamber_memory'
      + ' before acting on it, once per conversation, again only after your context was'
      + ' summarized. Memory was true when written; verify the files, flags and'
      + ' commands it names.',
  ].join('\n\n');
  const scopes = [
    { heading: '### About the user', lines: memoryTitleLines(global) },
    { heading: '### About this project', lines: memoryTitleLines(project) },
  ].filter((scope) => scope.lines.length > 0);

  const OMITTED_NOTE_RESERVE = 120;
  let budget = KNOWLEDGE_MAX_LENGTH - preamble.length - OMITTED_NOTE_RESERVE
    - scopes.reduce((sum, scope) => sum + scope.heading.length + 4, 0);
  let omitted = 0;
  const sections = scopes.map((scope) => {
    const kept = [];
    for (const line of scope.lines) {
      if (line.length + 1 > budget) {
        budget = 0;
        omitted += 1;
        continue;
      }
      kept.push(line);
      budget -= line.length + 1;
    }
    return kept.length > 0 ? `${scope.heading}\n\n${kept.join('\n')}` : '';
  }).filter(Boolean);

  return [
    preamble,
    ...sections,
    ...(omitted > 0 ? [`${omitted} older titles did not fit here; memory.list gives every title.`] : []),
  ].join('\n\n');
};

/**
 * How a store's titles fit the index a session is given, as dreaming reads it
 * (`../agent-memory/dreaming.js`): the characters the memory entry has, the
 * characters the index takes, and how many titles it leaves out.
 */
export const measureMemoryIndex = ({ global, project }) => {
  const block = buildMemoryBlock({ global, project, enabled: true, complete: true });
  const omitted = Number(/(\d+) older titles did not fit here/.exec(block)?.[1] ?? 0);
  return { budget: KNOWLEDGE_MAX_LENGTH, used: block.length, omitted };
};

const buildPinnedBlock = ({ notes, plans }) => {
  const sections = [];
  if (notes.length > 0) {
    const rendered = notes
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((note) => `- ${note.body.trim()}`)
      .join('\n');
    sections.push(`## Pinned notes\n\n${rendered}`);
  }
  for (const plan of plans) {
    sections.push(plan.body
      ? `## Pinned plan: ${plan.title}\n\n${plan.body}`
      : `## Pinned plan: ${plan.title}\n\n(plan content unavailable)`);
  }
  if (sections.length === 0) return '';

  return [
    'The user pinned the following project context.',
    ...sections,
  ].join('\n\n');
};

/**
 * What a shell fence in a reply does, stated in every session that has the
 * `openchamber_render` tool, which marks a session a person reads. Without it
 * an agent writes such a command in a plain fence, which gets no run button,
 * and asks the user to report back. OpenCode runs it with stdin closed, where
 * the session runs, so it is no way to reach a password prompt or the user's
 * own machine.
 */
export const REPLY_COMMAND_GUIDANCE = "A command the user should run themselves, such as one that deletes or publishes something:"
  + " put it in a ```bash block in your reply and end the turn. The block has a Run button; the command runs in this session's folder with no input,"
  + " so nothing that prompts, and when it ends you get its output and continue on your own without a message from the user.";

/**
 * When to reach for a workflow, stated in every session that has the
 * `openchamber_workflow` tool. A run costs many agents, so the agent starts
 * one only when the user asks; spotting a task that fits is the agent's job
 * too, and it offers one instead of starting it. The models are agreed with
 * the user before the run: without them every agent runs on the session's
 * own model, often the most expensive one.
 */
export const WORKFLOW_GUIDANCE = 'The openchamber_workflow tool runs a script that fans a large task out to many agents in the background.'
  + ' Start one when the user asks for a workflow.'
  + ' When the task in front of you has many similar independent pieces (a review per file, an audit across many routes, a migration of many files)'
  + ' or needs results cross-checked at that scale, say so and offer a workflow; never start one unasked.'
  + ' A single feature, a few steps or a short loop over files you can do yourself never gets one.'
  + ' Every agent runs on your own model unless the script names another, and dozens of agents on a top model cost many times what a cheap one does.'
  + ' So when you propose a workflow, give each phase a model in the same message (look them up with models.list, tools.openchamber inside execute, when you have it):'
  + ' a cheap one for reading and checking against a fixed list, a strong one where a phase weighs judgement or writes what lands.'
  + ' Start the run once the user agrees to the models.'
  + ' When the user lets runs start without approval in Settings, workflow.run starts the run at once instead of showing it for approval, so agree on the plan and the models in the chat first all the same.';

export const SECRET_REQUEST_GUIDANCE = "The openchamber_secret tool asks the user for a secret (API key, token, password) on a private card in the chat."
  + " Whenever you need one, call it: never ask for a secret in the chat or tell the user to paste one there.";

const directToolNames = ({ rendering, secrets, workflows }) => [
  rendering ? 'openchamber_render' : '',
  secrets ? 'openchamber_secret' : '',
  workflows ? 'openchamber_workflow' : '',
].filter(Boolean);

const buildGuidance = ({ linking, naming, rendering, secrets, workflows }) => {
  const directTools = directToolNames({ rendering, secrets, workflows });
  return [
    linking ? SESSION_LINK_GUIDANCE : '',
    linking && naming ? WORK_NAME_GUIDANCE : '',
    linking ? DISPATCH_GUIDANCE : '',
    rendering ? UI_BLOCKS_GUIDANCE : '',
    rendering ? RENDER_PAGE_GUIDANCE : '',
    rendering ? REPLY_COMMAND_GUIDANCE : '',
    secrets ? SECRET_REQUEST_GUIDANCE : '',
    workflows ? WORKFLOW_GUIDANCE : '',
    directTools.length > 0 ? directToolsGuidance(directTools) : '',
  ].filter(Boolean).join('\n\n');
};

/**
 * The text each entry should hold now. An empty text means the entry goes
 * away; a key left out keeps what the session holds, which is what a branch
 * that could not be read means.
 */
export const buildKnowledgeEntries = ({ notes, plans, memory, linking = false, naming = false, rendering = false, secrets = false, workflows = false, checkout = null, responseStyleInstruction, extensions }) => {
  const entries = {
    [KNOWLEDGE_ENTRY_KEYS.pinned]: truncate(buildPinnedBlock({ notes, plans })),
    [KNOWLEDGE_ENTRY_KEYS.memory]: truncate(buildMemoryBlock(memory)),
    [KNOWLEDGE_ENTRY_KEYS.guidance]: buildGuidance({ linking, naming, rendering, secrets, workflows }),
  };
  if (responseStyleInstruction !== undefined) {
    entries[KNOWLEDGE_ENTRY_KEYS.responseStyle] = (responseStyleInstruction ?? '').trim();
  }
  // Absent when the catalog could not be read: the session keeps what it holds.
  if (extensions !== undefined) entries[KNOWLEDGE_ENTRY_KEYS.extensions] = truncate(extensions);
  // The branch is told while the agent has the tool, whose worktree move is
  // the one thing it can do about a busy branch.
  if (!linking) entries[KNOWLEDGE_ENTRY_KEYS.checkout] = '';
  else if (checkout) entries[KNOWLEDGE_ENTRY_KEYS.checkout] = describeCheckout(checkout);
  if (!linking || lead === null) {
    entries[KNOWLEDGE_ENTRY_KEYS.lead] = '';
    entries[KNOWLEDGE_ENTRY_KEYS.leadBrief] = '';
  } else if (lead) {
    entries[KNOWLEDGE_ENTRY_KEYS.lead] = LEAD_GUIDANCE;
    if (lead.brief !== undefined) entries[KNOWLEDGE_ENTRY_KEYS.leadBrief] = leadBriefEntry(lead.brief);
  }
  return entries;
};

export const createSessionKnowledgeRuntime = (dependencies: SessionKnowledgeDependencies) => {
  const {
    projectContextRuntime,
    agentMemoryRuntime,
    resolveProjectId,
    // The memory switch: what the panel counts.
    isAgentMemoryEnabled,
    // Whether this session's agent has the `openchamber_memory` tool: what
    // the session is told. The switch alone is not enough, since an OpenCode
    // OpenChamber did not launch never gets the tool.
    isMemoryToolAvailable,
    // Whether this session's agent has the `openchamber` tool to link with.
    isSessionLinkingAvailable = null,
    isWorkNamingAvailable = async () => false,
    readCheckoutBranch = null,
    readPlaceholderBranch = null,
    isPageRenderingAvailable = async () => false,
    isSecretRequestAvailable = async () => false,
    isWorkflowAvailable = async () => false,
    // `(directory)`: what active extensions add for this session, or null when
    // that cannot be told. Reads no process, since every send waits on it.
    readExtensionInstructions = async () => '',
    // Pins live in OpenChamber's own session metadata store.
    readSessionMetadata = null,
    persistSessionMetadata = null,
    instructionEntries = null,
  } = dependencies;

  const requireMetadataStore = () => {
    if (!readSessionMetadata || !persistSessionMetadata) {
      throw new Error('project knowledge needs a session metadata store');
    }
    return { readSessionMetadata, persistSessionMetadata };
  };

  const readStoredSession = async (sessionId: string) => {
    if (!readSessionMetadata) throw new TypeError('readSessionMetadata is not a function');
    return { metadata: await readSessionMetadata(sessionId) };
  };

  const readPins = (session?: { metadata?: unknown } | null): SessionPins => {
    const metadata = isSessionMetadata(session?.metadata) ? session.metadata : {};
    const openchamber = isOpenChamberMetadata(metadata.openchamber) ? metadata.openchamber : {};
    const pins = isStoredPins(openchamber[PINS_METADATA_KEY]) ? openchamber[PINS_METADATA_KEY] : {};
    return {
      notes: Array.isArray(pins.notes)
        ? [...new Set(pins.notes.filter(isNonEmptyString).map((entry) => entry.trim()))]
        : [],
      plans: Array.isArray(pins.plans)
        ? [...new Set(pins.plans.filter(isNonEmptyString).map((entry) => entry.trim()))]
        : [],
    };
  };

  const collect = async (directory: string, pins: SessionPins = { notes: [], plans: [] }) => {
    const projectId = directory ? await resolveProjectId(directory) : '';

    let notes: KnowledgeNote[] = [];
    let plans: KnowledgePlan[] = [];
    if (projectId) {
      try {
        const context = await projectContextRuntime.readContext(projectId);
        const noteIds = new Set(pins.notes);
        const planIds = new Set(pins.plans);
        notes = (context.notes || []).filter((note) => noteIds.has(note.id));
        const pinnedPlans = (context.plans || []).filter((plan) => planIds.has(plan.id));
        plans = await Promise.all(pinnedPlans.map(async (plan) => {
          try {
            const content = await projectContextRuntime.readPlan(projectId, plan.id);
            return { id: plan.id, title: plan.title, body: content?.body?.trim() || '' };
          } catch {
            return { id: plan.id, title: plan.title, body: '' };
          }
        }));
      } catch {
        notes = [];
        plans = [];
      }
    }

    let memory = { global: [], project: [], enabled: false, complete: false };
    const memoryEnabled = typeof isMemoryToolAvailable === 'function'
      ? await isMemoryToolAvailable().catch(() => false)
      : true;
    if (memoryEnabled) {
      try {
        const stored = await agentMemoryRuntime.readAll(projectId || null);
        const visible = (entries: MemoryTitle[]) => entries.filter((entry) => !entry.flagged);
        memory = {
          global: stored.globalFailed ? [] : visible(stored.global),
          project: stored.projectFailed ? [] : visible(stored.project),
          enabled: true,
          complete: !stored.globalFailed && !stored.projectFailed,
        };
      } catch {
        memory = { global: [], project: [], enabled: true, complete: false };
      }
    }

    const linking = isSessionLinkingAvailable
      ? await Promise.resolve(isSessionLinkingAvailable()).catch(() => false)
      : false;
    const naming = linking && Boolean(directory)
      && await Promise.resolve(isWorkNamingAvailable(directory)).catch(() => false);
    const branch = linking && directory && readCheckoutBranch
      ? await Promise.resolve(readCheckoutBranch(directory)).catch(() => null)
      : null;
    const placeholder = branch && readPlaceholderBranch
      ? await Promise.resolve(readPlaceholderBranch(directory, branch)).then((name) => name === branch, () => false)
      : false;
    const checkout = branch !== null ? { directory, branch, placeholder } : null;

    const rendering = await Promise.resolve(isPageRenderingAvailable()).catch(() => false);
    const secrets = await Promise.resolve(isSecretRequestAvailable()).catch(() => false);
    const workflows = await Promise.resolve(isWorkflowAvailable()).catch(() => false);

    return { notes, plans, memory, linking, naming, rendering, secrets, workflows, checkout };
  };

  const collectSummary = async (directory: string, pins: SessionPins = { notes: [], plans: [] }): Promise<KnowledgeSummary> => {
    const projectId = directory ? await resolveProjectId(directory) : '';
    const empty = { notes: [], plans: [], memory: { global: 0, project: 0 } };
    if (!projectId) return empty;

    let notes: KnowledgeSummary['notes'] = [];
    let plans: KnowledgeSummary['plans'] = [];
    try {
      const context = await projectContextRuntime.readContext(projectId);
      const noteIds = new Set(pins.notes);
      const planIds = new Set(pins.plans);
      notes = (context.notes || []).filter((note) => noteIds.has(note.id))
        .map((note) => ({ id: note.id, body: note.body }));
      plans = (context.plans || []).filter((plan) => planIds.has(plan.id))
        .map((plan) => ({ id: plan.id, title: plan.title }));
    } catch {
      notes = [];
      plans = [];
    }

    let memory = { global: 0, project: 0 };
    const memoryEnabled = isAgentMemoryEnabled
      ? await isAgentMemoryEnabled().catch(() => false)
      : true;
    if (memoryEnabled) {
      try {
        const stored = await agentMemoryRuntime.readAll(projectId);
        memory = {
          global: stored.globalFailed ? 0 : stored.global.length,
          project: stored.projectFailed ? 0 : stored.project.length,
        };
      } catch {
        memory = { global: 0, project: 0 };
      }
    }

    return { notes, plans, memory };
  };

  const collectSummaryForSession = async (sessionId: string, directory: string) => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return collectSummary(directory, readPins(session));
  };

  const syncOnce = async (sessionId: string, directory: string, responseStyleInstruction?: string | null) => {
    if (!instructionEntries || !sessionId) return false;
    try {
      const session = await readStoredSession(sessionId).catch(() => null);
      const entries = buildKnowledgeEntries({
        ...await collect(directory, readPins(session)),
        responseStyleInstruction,
        extensions: await readExtensionInstructions(directory).catch(() => null) ?? undefined,
      });
      const writes = await Promise.allSettled(Object.entries(entries).map(([key, text]) => (text
        ? instructionEntries.put(sessionId, directory, key, text)
        : instructionEntries.remove(sessionId, directory, key))));
      const failed = writes.find((write) => write.status === 'rejected');
      if (failed) console.warn('[session-knowledge] entry write failed:', failed.reason?.message || failed.reason);
      return !failed;
    } catch (error) {
      console.warn('[session-knowledge] sync failed:', (hasMessage(error) ? error.message : undefined) || error);
      return false;
    }
  };

  const readLeadContext = async (sessionId: string, session: { metadata: SessionMetadata | undefined } | null): Promise<KnowledgeInput['lead'] | undefined> => {
    if (!session) return undefined;
    if (!readLead(session.metadata)) return null;
    if (!readLeadBrief) return { brief: undefined };
    return { brief: await readLeadBrief(sessionId).catch(() => undefined) };
  };

  const syncLeadBrief = async (sessionId: string, directory: string, brief: string) => {
    if (!instructionEntries) return false;
    await instructionEntries.put(sessionId, directory, KNOWLEDGE_ENTRY_KEYS.leadBrief, leadBriefEntry(brief));
    return true;
  };

  const syncTails = new Map<string, Promise<boolean>>();
  const sync = (sessionId: string, directory: string, responseStyleInstruction?: string | null) => {
    if (!sessionId) return Promise.resolve(false);
    const previous = syncTails.get(sessionId) ?? Promise.resolve(false);
    const current = previous
      .catch(() => false)
      .then(() => syncOnce(sessionId, directory, responseStyleInstruction));
    syncTails.set(sessionId, current);
    return current.finally(() => {
      if (syncTails.get(sessionId) === current) syncTails.delete(sessionId);
    });
  };

  const setPin = async (sessionId: string, directory: string, kind: 'note' | 'plan', id: string, pinned: boolean): Promise<SessionPins> => {
    const { persistSessionMetadata } = requireMetadataStore();
    const pins = readPins(await readStoredSession(sessionId));
    const key = kind === 'note' ? 'notes' : 'plans';
    const next = new Set(pins[key]);
    if (pinned) next.add(id);
    else next.delete(id);
    await persistSessionMetadata(sessionId, directory, {
      openchamber: { [PINS_METADATA_KEY]: { ...pins, [key]: [...next] } },
    });
    return { ...pins, [key]: [...next] };
  };

  return {
    collect,
    collectSummary,
    collectSummaryForSession,
    sync,
    syncLeadBrief,
    readPins,
    setPin,
  };
};
