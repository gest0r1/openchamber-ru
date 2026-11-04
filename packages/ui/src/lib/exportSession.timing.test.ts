import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@/lib/opencode/model';
import { formatSessionAsMarkdown } from './exportSession';

type SessionRecord = { info: Message; parts: Part[] };
type State = Extract<Part, { type: 'tool' }>['state'];

function call(sessionID: string, messageID: string, callID: string, tool: string, state: State): Part {
  return { id: `tool_${callID}`, sessionID, messageID, type: 'tool', callID, tool, state };
}

function answer(sessionID: string, messageID: string, parts: Part[]): SessionRecord {
  return {
    info: { id: messageID, sessionID, role: 'assistant', agent: 'build',
      providerID: 'openai', modelID: 'gpt', time: { created: 100 } },
    parts,
  };
}

function calls(markdown: string): Array<Record<string, unknown>> {
  return [...markdown.matchAll(/\*\*Tool call timing\*\*\n\n```json\n(\{[^\n]+\})\n```/g)]
    .map(match => JSON.parse(match[1]!) as Record<string, unknown>);
}

describe('per-call Markdown tool timing', () => {
  test('exports a real millisecond interval and next-call start gap across assistant messages', () => {
    const first = answer('parent', 'a1', [call('parent', 'a1', 'call1', 'shell', {
      status: 'completed', input: {}, output: '', time: { start: 1_000, end: 1_727_500 },
    })]);
    const second = answer('parent', 'a2', [call('parent', 'a2', 'call2', 'read', {
      status: 'completed', input: {}, output: 'ok', time: { start: 1_731_000, end: 1_731_025 },
    })]);
    const markdown = formatSessionAsMarkdown([first, second], 'Pipeline');
    const [a, b] = calls(markdown);
    expect(a).toMatchObject({ session_id: 'parent', call_id: 'call1', name: 'shell',
      status: 'completed', duration_ms: 1_726_500, duration_source: 'persisted_tool_state',
      next_tool_start_gap_ms: 1_730_000, overlaps_next: false });
    expect(a.started_at).toBe('1970-01-01T00:00:01.000Z');
    expect(a.completed_at).toBe('1970-01-01T00:28:47.500Z');
    expect(b.duration_ms).toBe(25);
    expect(b.next_tool_started_at).toBe('unavailable');
    expect(markdown).toMatch(/generated_at: .*Z; timezone: /);
    expect(markdown).toContain('timestamps: UTC ISO-8601');
  });

  test('does not invent a final duration for running, pending, error with missing timestamps or legacy', () => {
    const records = [
      answer('parent', 'a1', [call('parent', 'a1', 'error', 'shell', {
        status: 'error', input: {}, error: 'interrupted', time: { start: 10, end: 15 },
      }), call('parent', 'a1', 'active', 'shell', {
        status: 'running', input: {}, time: { start: 20 },
      }), call('parent', 'a1', 'pending', 'read', {
        status: 'pending', input: {}, raw: '',
      })]),
      answer('parent', 'a2', [call('parent', 'a2', 'legacy', 'shell', {
        status: 'completed', input: {}, output: '',
      } as unknown as State)]),
    ];
    const [error, active, pending, legacy] = calls(formatSessionAsMarkdown(records));
    expect(error).toMatchObject({ status: 'error', duration_ms: 5 });
    expect(active).toMatchObject({ status: 'running', completed_at: 'unavailable', duration_ms: 'unavailable' });
    expect(pending).toMatchObject({ status: 'pending', started_at: 'unavailable', duration_ms: 'unavailable' });
    expect(legacy).toMatchObject({ status: 'completed', started_at: 'unavailable', completed_at: 'unavailable', duration_ms: 'unavailable' });
  });

  test('labels overlaps of parallel calls and preserves part ordering', () => {
    const record = answer('same', 'a', [
      call('same', 'a', 'first', 'shell', { status: 'completed', input: {}, output: '', time: { start: 500, end: 2_000 } }),
      call('same', 'a', 'second', 'read', { status: 'completed', input: {}, output: '', time: { start: 700, end: 800 } }),
    ]);
    const [first, second] = calls(formatSessionAsMarkdown([record]));
    expect(first.call_id).toBe('first');
    expect(first.next_tool_start_gap_ms).toBe(200);
    expect(first.overlaps_next).toBe(true);
    expect(second.call_id).toBe('second');
  });

  test('separates child and grandchild timings from the main session, across prompts', () => {
    const parent = answer('parent', 'p1', [call('parent', 'p1', 'same-id', 'shell', {
      status: 'completed', input: {}, output: '', time: { start: 10, end: 20 },
    })]);
    const child = { title: 'Coder', agent: 'coder', records: [
      answer('child', 'c1', [call('child', 'c1', 'same-id', 'shell', {
        status: 'completed', input: {}, output: '', time: { start: 100, end: 120 },
      })]),
      answer('child', 'c2', [call('child', 'c2', 'other-id', 'read', {
        status: 'completed', input: {}, output: '', time: { start: 150, end: 155 },
      })]),
    ], children: [{ title: 'Nested', records: [
      answer('grandchild', 'g1', [call('grandchild', 'g1', 'same-id', 'shell', {
        status: 'completed', input: {}, output: '', time: { start: 110, end: 200 },
      })]),
    ], children: [] }] };
    const markdown = formatSessionAsMarkdown([parent], 'Main', [child]);
    const tools = calls(markdown);
    expect(tools.map(tool => tool.session_id)).toEqual(['parent', 'child', 'child', 'grandchild']);
    expect(tools[0]?.next_tool_started_at).toBe('unavailable');
    expect(tools[1]?.next_tool_start_gap_ms).toBe(50);
    expect(tools[2]?.next_tool_started_at).toBe('unavailable');
    expect(tools[3]?.next_tool_started_at).toBe('unavailable');
  });

  test('invalid negative / out-of-range timestamps do not become negative durations or invalid dates', () => {
    const records = [answer('s', 'a', [call('s', 'a', 'bad', 'shell', {
      status: 'completed', input: {}, output: '', time: { start: 1_000, end: 100 },
    }), call('s', 'a', 'future', 'shell', {
      status: 'completed', input: {}, output: '', time: { start: 1e20, end: 1e20 },
    })])];
    const [bad, future] = calls(formatSessionAsMarkdown(records));
    expect(bad.duration_ms).toBe('unavailable');
    expect(future.started_at).toBe('unavailable');
    expect(future.duration_ms).toBe('unavailable');
  });
});
