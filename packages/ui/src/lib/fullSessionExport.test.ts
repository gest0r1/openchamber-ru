import { describe, expect, test } from 'bun:test';
import type { Message, Part, Session } from '@/lib/opencode/model';
import { collectFullSessionExport, formatFullSessionAsMarkdown } from './fullSessionExport';

const session = (id: string, parentID?: string): Session => ({
  id,
  ...(parentID ? { parentID } : {}),
  projectID: 'project',
  directory: `/repo/${id}`,
  title: id,
  agent: parentID ? 'build' : undefined,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
});

const records = (sessionID: string, withTool = false) => {
  const messageID = `${sessionID}-assistant`;
  const info: Message = {
    id: messageID,
    sessionID,
    role: 'assistant',
    agent: 'build',
    providerID: 'test',
    modelID: 'model',
    time: { created: 1, completed: 2 },
  };
  const parts: Part[] = [
    { id: `${messageID}-text`, sessionID, messageID, type: 'text', text: `reply-${sessionID}` },
  ];
  if (withTool) {
    parts.push({
      id: `${messageID}-tool`,
      sessionID,
      messageID,
      type: 'tool',
      callID: 'call-1',
      tool: 'shell',
      state: {
        status: 'error',
        input: { command: 'echo test' },
        output: 'partial output',
        error: 'exit 1',
        time: { start: 1, end: 2 },
      },
    });
  }
  return [{ info, parts }];
};

describe('full session export', () => {
  test('discovers descendants from parentID pages instead of a UI tree', async () => {
    const root = session('root');
    const child = session('child', 'root');
    const grandchild = session('grandchild', 'child');
    const calls: Array<{ parentID: string; cursor?: string }> = [];
    const client = {
      async listSessionsPage(options: { parentID: string; cursor?: string }) {
        calls.push({ parentID: options.parentID, cursor: options.cursor });
        if (options.parentID === 'root' && !options.cursor) {
          return { sessions: [child], cursor: { next: 'page-2' } };
        }
        if (options.parentID === 'root' && options.cursor === 'page-2') {
          return { sessions: [], cursor: {} };
        }
        if (options.parentID === 'child') return { sessions: [grandchild], cursor: {} };
        return { sessions: [], cursor: {} };
      },
    };

    const result = await collectFullSessionExport(root, records('root'), async (item) => records(item.id), client as never);

    expect(result.root.children.map((item) => item.session.id)).toEqual(['child']);
    expect(result.root.children[0]?.children.map((item) => item.session.id)).toEqual(['grandchild']);
    expect(calls.some((call) => call.parentID === 'root' && call.cursor === 'page-2')).toBe(true);
  });

  test('keeps healthy branches when one child history cannot be read', async () => {
    const root = session('root');
    const broken = session('broken', 'root');
    const healthy = session('healthy', 'root');
    const client = {
      async listSessionsPage(options: { parentID: string }) {
        if (options.parentID === 'root') return { sessions: [broken, healthy], cursor: {} };
        return { sessions: [], cursor: {} };
      },
    };

    const result = await collectFullSessionExport(root, records('root'), async (item) => {
      if (item.id === 'broken') throw new Error('history unavailable');
      return records(item.id);
    }, client as never);
    const markdown = formatFullSessionAsMarkdown(result);

    expect(result.incompleteCount).toBe(1);
    expect(markdown).toContain('Sub-agent: broken');
    expect(markdown).toContain('history unavailable');
    expect(markdown).toContain('reply-healthy');
  });

  test('includes tool input, partial result, and error', async () => {
    const root = session('root');
    const client = { async listSessionsPage() { return { sessions: [], cursor: {} }; } };
    const result = await collectFullSessionExport(root, records('root', true), async () => [], client as never);
    const markdown = formatFullSessionAsMarkdown(result);

    expect(markdown).toContain('Tool: `shell`');
    expect(markdown).toContain('"command": "echo test"');
    expect(markdown).toContain('partial output');
    expect(markdown).toContain('exit 1');
  });
});
