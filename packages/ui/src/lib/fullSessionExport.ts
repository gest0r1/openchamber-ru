import type { Part, Session, ToolPart } from '@/lib/opencode/model';
import { opencodeClient } from '@/lib/opencode/client';
import {
  formatMessageRecordAsMarkdown,
  type SessionMessageRecord,
} from '@/lib/exportSession';

const PAGE_LIMIT = 100;

type FullSessionExportNode = {
  session: Session;
  records: SessionMessageRecord[] | null;
  recordsError?: string;
  children: FullSessionExportNode[];
  childrenError?: string;
};

export type FullSessionExportResult = {
  root: FullSessionExportNode;
  incompleteCount: number;
};

type SessionTreeClient = {
  listSessionsPage(options: {
    global: true;
    parentID: string;
    limit: number;
    order: 'asc';
    cursor?: string;
  }): Promise<{ sessions: Session[]; cursor: { next?: string } }>;
};

type LoadRecords = (session: Session) => Promise<SessionMessageRecord[] | null>;

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const text = String(error).trim();
  return text || 'Unknown error';
}

async function listDirectChildren(client: SessionTreeClient, parentID: string): Promise<Session[]> {
  const children: Session[] = [];
  const seenSessionIDs = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await client.listSessionsPage({
      global: true,
      parentID,
      limit: PAGE_LIMIT,
      order: 'asc',
      ...(cursor ? { cursor } : {}),
    });

    for (const session of page.sessions) {
      // The server owns the parent filter. Keep this guard so a mixed or stale
      // page can never make an unrelated session part of the exported tree.
      if (session.parentID !== parentID || seenSessionIDs.has(session.id)) continue;
      seenSessionIDs.add(session.id);
      children.push(session);
    }

    const next = page.cursor.next;
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  } while (cursor);

  return children;
}

async function collectNode(
  session: Session,
  records: SessionMessageRecord[] | null,
  recordsError: string | undefined,
  loadRecords: LoadRecords,
  client: SessionTreeClient,
): Promise<{ node: FullSessionExportNode; incompleteCount: number }> {
  const node: FullSessionExportNode = {
    session,
    records,
    ...(recordsError ? { recordsError } : {}),
    children: [],
  };
  let incompleteCount = recordsError ? 1 : 0;

  let children: Session[];
  try {
    children = await listDirectChildren(client, session.id);
  } catch (error) {
    node.childrenError = errorText(error);
    return { node, incompleteCount: incompleteCount + 1 };
  }

  for (const child of children) {
    let childRecords: SessionMessageRecord[] | null = null;
    let childRecordsError: string | undefined;
    try {
      childRecords = await loadRecords(child);
      if (!childRecords) childRecordsError = 'Session history became unavailable during export';
    } catch (error) {
      childRecordsError = errorText(error);
    }

    // A missing transcript does not make the subtree disappear. We still ask
    // OpenCode for this child's descendants and keep exporting healthy siblings.
    const collected = await collectNode(child, childRecords, childRecordsError, loadRecords, client);
    node.children.push(collected.node);
    incompleteCount += collected.incompleteCount;
  }

  return { node, incompleteCount };
}

/**
 * Collect the authoritative OpenCode session tree, independent of whatever
 * subset the sidebar currently has materialised. Direct children come from
 * session.list(parentID=...), and every child is followed recursively.
 */
export async function collectFullSessionExport(
  rootSession: Session,
  rootRecords: SessionMessageRecord[],
  loadRecords: LoadRecords,
  client: SessionTreeClient = opencodeClient,
): Promise<FullSessionExportResult> {
  const collected = await collectNode(rootSession, rootRecords, undefined, loadRecords, client);
  return { root: collected.node, incompleteCount: collected.incompleteCount };
}

function fencedBlock(value: string, language = ''): string {
  let fenceLength = 3;
  for (const match of value.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
  const fence = '`'.repeat(fenceLength);
  return `${fence}${language}\n${value}\n${fence}`;
}

function formatToolInput(part: ToolPart): string {
  try {
    return JSON.stringify(part.state.input, null, 2);
  } catch {
    return String(part.state.input);
  }
}

function formatToolPart(part: ToolPart): string {
  const blocks = [
    `### Tool: \`${part.tool}\``,
    `**Status:** ${part.state.status}`,
    `**Input**\n\n${fencedBlock(formatToolInput(part), 'json')}`,
  ];

  if (part.state.status === 'completed') {
    blocks.push(`**Result**\n\n${fencedBlock(part.state.output)}`);
  } else if (part.state.status === 'error') {
    if (part.state.output) blocks.push(`**Result (partial)**\n\n${fencedBlock(part.state.output)}`);
    blocks.push(`**Error**\n\n${fencedBlock(part.state.error)}`);
  }

  return blocks.join('\n\n');
}

function formatRecordWithTools(record: SessionMessageRecord): string {
  const transcript = formatMessageRecordAsMarkdown(record);
  const tools = record.parts
    .filter((part: Part): part is ToolPart => part.type === 'tool')
    .map(formatToolPart);
  return [transcript, ...tools].filter(Boolean).join('\n\n');
}

function formatNode(node: FullSessionExportNode, depth: number, root = false): string {
  const heading = '#'.repeat(Math.min(root ? 1 : depth + 1, 6));
  const title = node.session.title.trim() || 'Untitled session';
  const kind = root ? title : `Sub-agent: ${title}`;
  const agent = node.session.agent ? ` — ${node.session.agent}` : '';
  const header = `${heading} ${kind}${agent}\n\n*Session ID: \`${node.session.id}\`*`;
  const warnings: string[] = [];
  if (node.recordsError) warnings.push(`> **Export incomplete:** session history could not be loaded: ${node.recordsError}`);
  if (node.childrenError) warnings.push(`> **Export incomplete:** child sessions could not be listed: ${node.childrenError}`);

  const body = (node.records ?? [])
    .map(formatRecordWithTools)
    .filter(Boolean)
    .join('\n\n---\n\n');

  const parts = [header, ...warnings, body].filter(Boolean);
  for (const child of node.children) {
    parts.push(formatNode(child, depth + 1));
  }
  return parts.join('\n\n---\n\n');
}

export function formatFullSessionAsMarkdown(result: FullSessionExportResult): string {
  const date = new Date().toISOString().split('T')[0];
  return `${formatNode(result.root, 0, true)}\n\n*Full export generated on ${date}*`;
}
