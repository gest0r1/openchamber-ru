import type { Message, Part } from '@/lib/opencode/model';
import { hasParts } from '@/lib/opencode/model';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { getCurrentIntlLocale } from '@/lib/i18n';
import { isVSCodeRuntime, openDesktopPath, revealDesktopPath, saveDesktopMarkdownFile } from '@/lib/desktop';
import { getRevealLabelKey } from '@/lib/utils';
import { readContextPart } from '@/lib/messages/contextParts';
import { formatContextMessage, formatMessageText } from '@/lib/messages/messageMarkdown';

export type SessionMessageRecord = { info: Message; parts: Part[] };

export type ChildSessionExport = {
  title: string;
  agent?: string;
  records: SessionMessageRecord[];
  children: ChildSessionExport[];
};

function formatTimestamp(timestamp: number | undefined): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const monthPart = date.toLocaleString(getCurrentIntlLocale(), { month: 'short' });
  const dayPart = date.getDate();
  const yearPart = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${monthPart} ${dayPart}, ${yearPart}, ${hours}:${minutes}`;
}

function formatAssistantModel(record: SessionMessageRecord): string {
  if (record.info.role !== 'assistant') {
    return '';
  }

  const providerID = record.info.providerID.trim();
  const modelID = record.info.modelID.trim();
  const model = providerID && modelID ? `${providerID}/${modelID}` : (modelID || providerID);

  // OpenCode records `default` when no level was picked; like the chat
  // footer, the export names only a level the user chose.
  const variant = record.info.variant?.trim();
  if (!model || !variant || ['default', 'none'].includes(variant.toLowerCase())) {
    return model;
  }

  return `${model}, thinking: ${variant}`;
}

function formatMessageHeader(record: SessionMessageRecord): string {
  const label = record.info.role === 'user' ? 'User' : record.info.role === 'synthetic' ? 'Context' : 'Assistant';
  const timestamp = formatTimestamp(record.info.time?.created);
  const assistantModel = formatAssistantModel(record);
  const details = timestamp && assistantModel
    ? `${timestamp} (${assistantModel})`
    : (timestamp || assistantModel);

  return details ? `**${label}**\n\n*${details}*` : `**${label}**`;
}

/**
 * A message's text the way the Markdown export renders it. Guest message and
 * session items carry the same text, so an extension sees what the export
 * file would.
 */
export function formatMessageRecordText(record: SessionMessageRecord): string {
  return formatMessageText(record.parts, { user: record.info.role === 'user' });
}

type ToolTiming = { nextStartedAt?: number };

// Tool part times are persisted OpenCode millisecond timestamps, not message times
// or the elapsed timer derived by the UI while a call is running.
function persistedMillis(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isFinite(new Date(value).getTime()) ? value : undefined;
}

function toolStartedAt(part: Extract<Part, { type: 'tool' }>): number | undefined {
  return part.state.status === 'pending' || part.timing?.startMeasured === false ? undefined : persistedMillis(part.state.time?.start);
}

function toolSequence(records: SessionMessageRecord[]): Map<string, ToolTiming> {
  const calls: Array<{ key: string; sessionID: string; start: number; order: number }> = [];
  for (const record of records) {
    for (const part of record.parts) {
      if (part.type !== 'tool') continue;
      const start = toolStartedAt(part);
      if (start === undefined) continue;
      calls.push({ key: `${part.sessionID}:${part.callID}`, sessionID: part.sessionID, start, order: calls.length });
    }
  }
  const nextByCall = new Map<string, ToolTiming>();
  const bySession = new Map<string, typeof calls>();
  for (const call of calls) {
    let sessionCalls = bySession.get(call.sessionID);
    if (!sessionCalls) {
      sessionCalls = [];
      bySession.set(call.sessionID, sessionCalls);
    }
    sessionCalls.push(call);
  }
  for (const sessionCalls of bySession.values()) {
    sessionCalls.sort((a, b) => a.start - b.start || a.order - b.order);
    sessionCalls.forEach((call, index) => nextByCall.set(call.key, { nextStartedAt: sessionCalls[index + 1]?.start }));
  }
  return nextByCall;
}

function formatToolCalls(record: SessionMessageRecord, nextByCall?: Map<string, ToolTiming>): string {
  const snapshotAt = Date.now();
  const snapshotISO = new Date(snapshotAt).toISOString();
  return record.parts.filter((part): part is Extract<Part, { type: 'tool' }> => part.type === 'tool')
    .map((part) => {
      const start = toolStartedAt(part);
      const stateEnd = part.state.status === 'completed' || part.state.status === 'error'
        ? persistedMillis(part.state.time?.end) : undefined;
      const persistedEnd = stateEnd !== undefined && part.timing?.endMeasured !== false && part.timing?.endSource !== 'interruption_observed'
        ? stateEnd : undefined;
      const observedEnd = part.timing?.endSource === 'interruption_observed' ? stateEnd : undefined;
      const finalDuration = start !== undefined && persistedEnd !== undefined && persistedEnd >= start ? persistedEnd - start : undefined;
      const interruptedDuration = start !== undefined && observedEnd !== undefined && observedEnd >= start ? observedEnd - start : undefined;
      const clockSkewMs = part.state.status === 'running' && start !== undefined && start > snapshotAt ? start - snapshotAt : undefined;
      const runningSnapshot = part.state.status === 'running' && start !== undefined && clockSkewMs === undefined ? snapshotAt - start : undefined;
      const duration = finalDuration ?? interruptedDuration ?? runningSnapshot;
      const next = nextByCall?.get(`${part.sessionID}:${part.callID}`)?.nextStartedAt;
      const iso = (time: number | undefined) => time === undefined ? 'unavailable' : new Date(time).toISOString();
      const fields = {
        session_id: part.sessionID,
        call_id: part.callID,
        name: part.tool,
        status: part.state.status,
        started_at: iso(start),
        completed_at: iso(persistedEnd),
        observed_end_at: iso(observedEnd),
        duration_ms: duration ?? 'unavailable',
        duration_source: finalDuration !== undefined ? 'persisted_tool_state' : interruptedDuration !== undefined ? 'observed_interruption' : runningSnapshot !== undefined ? 'export_snapshot' : 'unavailable',
        duration_final: finalDuration !== undefined,
        duration_censored: interruptedDuration !== undefined,
        duration_generated_at: runningSnapshot !== undefined ? snapshotISO : 'unavailable',
        duration_clock_skew_ms: clockSkewMs ?? 'unavailable',
        next_tool_started_at: iso(next),
        next_tool_start_gap_ms: start !== undefined && next !== undefined ? next - start : 'unavailable',
        overlaps_next: next !== undefined && persistedEnd !== undefined ? next < persistedEnd : 'unavailable',
      };
      return `**Tool call timing**\n\n\`\`\`json\n${JSON.stringify(fields)}\n\`\`\``;
    }).join('\n\n');
}
/** A single record exactly as the regular Markdown export renders it. */
function formatRecordWithToolTiming(record: SessionMessageRecord, nextByCall?: Map<string, ToolTiming>): string {
  // Only the conversation roles carry parts. A synthetic message is either
  // context the user attached to the next prompt — exported as Context, the
  // way v1 exported it from inside the user message — or prompt plumbing a
  // server plugin injected. Plumbing is not something the user wrote or the
  // agent said, so it stays out of the transcript entirely.
  if (record.info.role === 'synthetic') {
    if (!readContextPart(record.info)) return '';
    const context = formatContextMessage(record.info).trim();
    return context ? `${formatMessageHeader(record)}\n\n${context}` : '';
  }
  if (!hasParts(record.info)) return '';

  const role = formatMessageHeader(record);
  const text = formatMessageRecordText(record);

  const timing = formatToolCalls(record, nextByCall);
  if (!text && !timing) return '';
  return `${role}\n\n${[text, timing].filter(Boolean).join('\n\n')}`;
}

/** A single record as exported Markdown, including already persisted tool timings. */
export function formatMessageRecordAsMarkdown(record: SessionMessageRecord): string {
  return formatRecordWithToolTiming(record);
}

function formatChildSessionAsMarkdown(child: ChildSessionExport, depth: number): string {
  const heading = '#'.repeat(Math.min(depth + 1, 6));
  const agentLabel = child.agent ? ` — ${child.agent}` : '';
  const childHeader = `${heading} Sub-agent: ${child.title}${agentLabel}\n\n---\n\n`;

  const childSequence = toolSequence(child.records);
  const childBody = child.records
    .map(record => formatRecordWithToolTiming(record, childSequence))
    .filter(Boolean)
    .join('\n\n---\n\n');

  const parts = [childHeader + childBody];

  for (const grandchild of child.children) {
    parts.push(formatChildSessionAsMarkdown(grandchild, depth + 1));
  }

  return parts.join('\n\n---\n\n');
}

export function formatSessionAsMarkdown(
  messages: SessionMessageRecord[],
  sessionTitle?: string | null,
  childSessions?: ChildSessionExport[],
): string {
  const title = sessionTitle?.trim() || 'Session';
  const generatedAt = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unavailable';
  const date = generatedAt.split('T')[0];

  const header = `# ${title}\n\n*Exported on ${date}*\n\n*generated_at: ${generatedAt}; timezone: ${timezone}; timestamps: UTC ISO-8601*\n\n---\n\n`;

  const sequence = toolSequence(messages);
  const body = messages
    .map(record => formatRecordWithToolTiming(record, sequence))
    .filter(Boolean)
    .join('\n\n---\n\n');

  let result = header + body;

  if (childSessions && childSessions.length > 0) {
    const childMarkdown = childSessions
      .map((child) => formatChildSessionAsMarkdown(child, 1))
      .join('\n\n---\n\n');
    result += '\n\n---\n\n' + childMarkdown;
  }

  return result;
}

export function downloadAsMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function saveAsMarkdownDesktop(content: string, filename: string): Promise<string | null> {
  const desktopPath = await saveDesktopMarkdownFile(filename, content);
  if (desktopPath) {
    return desktopPath;
  }

  if (!isVSCodeRuntime()) {
    return null;
  }

  try {
    const payload = await getRegisteredRuntimeAPIs()?.vscode?.saveMarkdown?.({ fileName: filename, content }) as { saved?: boolean; path?: string } | undefined;
    if (!payload) {
      return null;
    }
    if (payload.saved !== true) {
      return null;
    }

    const savedPath = typeof payload.path === 'string' ? payload.path.trim() : '';
    return savedPath.length > 0 ? savedPath : null;
  } catch {
    return null;
  }
}

export async function revealExportedMarkdown(path: string): Promise<boolean> {
  const runtimeFiles = getRegisteredRuntimeAPIs()?.files;
  if (runtimeFiles?.revealPath) {
    try {
      const result = await runtimeFiles.revealPath(path);
      return Boolean(result?.success);
    } catch {
      return false;
    }
  }

  if (await revealDesktopPath(path)) {
    return true;
  }

  return openDesktopPath(path);
}

export function getExportRevealLabelKey() {
  return getRevealLabelKey();
}

export function buildExportFilename(sessionTitle?: string | null): string {
  const base = sessionTitle?.trim() || 'session';
  const safe = base
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const normalizedBase = safe || 'session';
  const date = new Date().toISOString().split('T')[0];
  return `${normalizedBase}-${date}.md`;
}
