import express from 'express';
import { mintOutsideFileGrant } from '../fs/routes.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { fitRenderPageImages, renderPageImageSources } from '../openchamber-control/render-page.js';
import { generatedImagePaths } from '../openchamber-control/generate-image.js';
import { capturedScreenshotPaths } from '../openchamber-control/screenshots.js';
import { isRecord, isString } from '../shared/guards.js';
import { inspectLocalImage } from './inspect-image.js';
import type { PageImageInspection } from '../openchamber-control/render-page.js';
import type { DirectoryValidation } from '../projects/contracts.js';
import type { Application } from '../shared/http-contracts.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';
import type { LocalImageInspection, LocalImageInspectionOptions } from './inspect-image.js';

type OutsideFileGrantOptions = NonNullable<Parameters<typeof mintOutsideFileGrant>[1]>;

export interface MarkdownImageGrantDependencies {
  fsPromises: LocalImageInspectionOptions['fsPromises'] & NonNullable<OutsideFileGrantOptions['fsPromises']>;
  path: NonNullable<OutsideFileGrantOptions['path']>;
  crypto: NonNullable<OutsideFileGrantOptions['crypto']>;
  validateDirectoryPath: (directory: string) => Promise<DirectoryValidation>;
  buildOpenCodeUrl: (route: string, prefix: string) => string;
  getOpenCodeAuthHeaders: () => Record<string, string>;
}

type MessageLookup = Pick<MarkdownImageGrantDependencies, 'buildOpenCodeUrl' | 'getOpenCodeAuthHeaders'> & {
  sessionId: string;
  messageId: string;
  directory: string;
};

const isJsonRecord = (value: JsonValue | undefined): value is JsonObject => isRecord(value);
const hasErrorMessage = (value: unknown): value is { message?: unknown } => value != null;

const normalizeReferenceLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const unescapeMarkdownDestination = (value: string) => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, '$1');

const isEscapedAt = (value: string, index: number) => {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
};

const findClosingBracket = (value: string, start: number) => {
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (value[cursor] === ']' && !isEscapedAt(value, cursor)) return cursor;
  }
  return -1;
};

const findInlineImageEnd = (value: string, start: number) => {
  let cursor = start;
  while (/\s/.test(value[cursor] || '')) cursor += 1;
  if (value[cursor] === ')') return cursor;

  const opener = value[cursor];
  const closer = opener === '"' ? '"' : opener === "'" ? "'" : opener === '(' ? ')' : '';
  if (!closer) return -1;
  cursor += 1;
  for (; cursor < value.length; cursor += 1) {
    if (value[cursor] !== closer || isEscapedAt(value, cursor)) continue;
    cursor += 1;
    while (/\s/.test(value[cursor] || '')) cursor += 1;
    return value[cursor] === ')' ? cursor : -1;
  }
  return -1;
};

const parseInlineDestination = (value: string, start: number) => {
  let cursor = start;
  while (/\s/.test(value[cursor] || '')) cursor += 1;
  if (value[cursor] === '<') {
    const end = value.indexOf('>', cursor + 1);
    if (end < 0) return null;
    const imageEnd = findInlineImageEnd(value, end + 1);
    return imageEnd < 0
      ? null
      : { source: unescapeMarkdownDestination(value.slice(cursor + 1, end)), end: imageEnd };
  }

  let source = '';
  let depth = 0;
  for (; cursor < value.length; cursor += 1) {
    const char = value.charAt(cursor);
    if (char === '\\' && cursor + 1 < value.length) {
      source += char + value.charAt(cursor + 1);
      cursor += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
      source += char;
      continue;
    }
    if (char === ')') {
      if (depth === 0) return { source: unescapeMarkdownDestination(source), end: cursor };
      depth -= 1;
      source += char;
      continue;
    }
    if (/\s/.test(char) && depth === 0) {
      const imageEnd = findInlineImageEnd(value, cursor);
      return imageEnd < 0 ? null : { source: unescapeMarkdownDestination(source), end: imageEnd };
    }
    source += char;
  }
  return null;
};

const parseDefinitionDestination = (value: string) => {
  const trimmed = value.trimStart();
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>', 1);
    return end < 0 ? '' : unescapeMarkdownDestination(trimmed.slice(1, end));
  }
  const match = /^(?:\\.|\S)+/.exec(trimmed);
  return match ? unescapeMarkdownDestination(match[0]) : '';
};

const messageContent = (message: JsonObject): JsonValue[] => {
  if (Array.isArray(message.content)) return message.content;
  if (isString(message.text)) return [{ type: 'text', text: message.text }];
  return [];
};

const collectMarkdownLinesOutsideCode = (message: JsonObject) => {
  const lines = [];
  for (const part of messageContent(message)) {
    if (!isJsonRecord(part) || part.type !== 'text' || !isString(part.text)) continue;
    let fence: { char: string; size: number } | null = null;
    for (const line of part.text.split('\n')) {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker !== undefined) {
        if (!fence) {
          fence = { char: marker.charAt(0), size: marker.length };
        } else if (marker.charAt(0) === fence.char && marker.length >= fence.size) {
          fence = null;
        }
        continue;
      }
      if (fence) continue;
      lines.push(line.replace(/`+[^`]*`+/g, ''));
    }
  }
  return lines;
};

const markdownImageSources = (message: JsonObject) => {
  const sources = new Set<string>();
  const markdownLines = collectMarkdownLinesOutsideCode(message);
  const definitions = new Map<string, string>();
  for (const line of markdownLines) {
    const match = /^\s{0,3}\[([^\]]+)]\s*:\s*(.*)$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const source = parseDefinitionDestination(match[2]);
    if (source) definitions.set(normalizeReferenceLabel(match[1]), source);
  }

  for (const line of markdownLines) {
    for (let cursor = 0; cursor < line.length; cursor += 1) {
      if (line[cursor] !== '!' || line[cursor + 1] !== '[' || isEscapedAt(line, cursor)) continue;
      const altEnd = findClosingBracket(line, cursor + 2);
      if (altEnd < 0) continue;
      const alt = line.slice(cursor + 2, altEnd);
      const next = line[altEnd + 1];
      if (next === '(') {
        const parsed = parseInlineDestination(line, altEnd + 2);
        if (parsed?.source) sources.add(parsed.source);
        cursor = parsed?.end ?? altEnd;
        continue;
      }
      let label = alt;
      if (next === '[') {
        const labelEnd = findClosingBracket(line, altEnd + 2);
        if (labelEnd < 0) continue;
        label = line.slice(altEnd + 2, labelEnd) || alt;
        cursor = labelEnd;
      } else {
        cursor = altEnd;
      }
      const source = definitions.get(normalizeReferenceLabel(label));
      if (source) sources.add(source);
    }
  }
  return sources;
};

/**
 * The HTML of a call a harness spilled into `action` as JSON text. The plugin
 * revives such a call and draws its page (`singleActionSchema` in
 * `../agent-tool/runtime.js`), and OpenCode stores the input as the model sent
 * it, so the page is read back the same way: the spilled object's own
 * `parameters` over its siblings, and a `parameters` that is not an object
 * ignored. The call's own fields win, so this is read last.
 */
const spilledPageHtml = (input) => {
  if (!isString(input?.action) || !input.action.trim().startsWith('{')) return undefined;
  let revived;
  try {
    revived = JSON.parse(input.action);
  } catch {
    return undefined;
  }
  if (!isRecord(revived)) return undefined;
  return isRecord(revived.parameters) && Object.hasOwn(revived.parameters, 'html')
    ? revived.parameters.html
    : revived.html;
};

/**
 * The message's openchamber_render pages, by tool call id. The page's HTML is
 * the call's input, which OpenCode stores with the message, so it authorizes
 * its paths the way assistant text does. The input is either the page itself
 * or, for a call made through the action form, its `parameters`.
 */
const renderPages = (message) => {
  const pages = new Map();
  for (const part of messageContent(message)) {
    if (part?.type !== 'tool' || part.name !== 'openchamber_render') continue;
    const input = part.state?.input;
    const html = [input?.parameters?.html, input?.html, spilledPageHtml(input)].find(isString);
    // A stored tool item's `id` is its call id: the chat's `callID` is this
    // field (projectToolPart in packages/ui/src/lib/opencode/projection.ts).
    if (isString(html)) pages.set(part.id, html);
  }
  return pages;
};

const renderPageSources = (message: JsonObject) => {
  const sources = new Set<string>();
  for (const html of renderPages(message).values()) {
    for (const source of renderPageImageSources(html)) sources.add(source);
  }
  return sources;
};

const decodeComparablePath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const comparablePath = (value: string) => {
  let text = value;
  if (/^file:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return '';
    }
  }
  text = decodeComparablePath(text).replace(/\\/g, '/');
  return /^\/[A-Za-z]:\//.test(text) ? text.slice(1) : text;
};

// The tools whose stored result names image files the chat draws in their row,
// with the reader of those names. `browser.capture` runs behind Code Mode, so
// its result is usually an `execute` call's.
const TOOL_RESULT_IMAGE_PATHS = new Map([
  ['openchamber_image', generatedImagePaths],
  ['openchamber_web', capturedScreenshotPaths],
  ['execute', capturedScreenshotPaths],
]);

/**
 * The files the message's openchamber_image calls saved and its page
 * screenshots, named by the result each call stored, as `comparablePath`
 * spells them. The chat draws them in the call's row.
 */
const toolResultImageSources = (message) => {
  const sources = new Set();
  for (const part of messageContent(message)) {
    const readPaths = part?.type === 'tool' ? TOOL_RESULT_IMAGE_PATHS.get(part.name) : undefined;
    if (!readPaths || part.state?.status !== 'completed') continue;
    for (const item of Array.isArray(part.state.content) ? part.state.content : []) {
      if (item?.type !== 'text' || !isString(item.text)) continue;
      for (const source of readPaths(item.text)) sources.add(comparablePath(source));
    }
  }
  return sources;
};

const fetchMessage = async ({ sessionId, messageId, directory, buildOpenCodeUrl, getOpenCodeAuthHeaders }: MessageLookup) => {
  const url = new URL(buildOpenCodeUrl(
    `/api/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}`,
    '',
  ));
  url.searchParams.set('directory', directory);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-opencode-directory': encodeURIComponent(directory),
      ...getOpenCodeAuthHeaders(),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OpenCode returned ${response.status}`);
  const body: JsonValue = await response.json().catch(() => null);
  const message = unwrapOpenCodeResponse(body);
  return isJsonRecord(message) && isString(message.id) ? message : null;
};

export const registerMarkdownImageGrantRoutes = (app: Application, dependencies: MarkdownImageGrantDependencies) => {
  const {
    fsPromises,
    path,
    crypto,
    validateDirectoryPath,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
  } = dependencies;

  app.post(
    '/api/openchamber/sessions/:sessionId/markdown-image-grants',
    express.json({ limit: '256kb' }),
    async (req, res) => {
      const body = isRecord(req.body) ? req.body : undefined;
      const sessionId = asNonEmptyString(req.params.sessionId);
      const messageId = asNonEmptyString(body?.messageId);
      const sources = Array.isArray(body?.sources)
        ? [...new Set(body.sources.map(asNonEmptyString).filter((source) => source !== null))]
        : [];
      const callId = asNonEmptyString(body?.callId);
      if (!sessionId || !messageId || sources.length === 0) {
        return res.status(400).json({ error: 'sessionId, messageId, and sources are required' });
      }
      const validatedDirectory = await validateDirectoryPath(asNonEmptyString(body?.directory) ?? '');
      if (!validatedDirectory.ok) {
        return res.status(400).json({ error: validatedDirectory.error || 'Invalid directory' });
      }

      try {
        const message = await fetchMessage({
          sessionId,
          messageId,
          directory: validatedDirectory.directory,
          buildOpenCodeUrl,
          getOpenCodeAuthHeaders,
        });
        if (!message || message.id !== messageId || message.type !== 'assistant') {
          return res.status(404).json({ error: 'Assistant message not found' });
        }
        const inspect = (source: string) => inspectLocalImage({
          source,
          directory: validatedDirectory.directory,
          fsPromises,
          path,
        }).catch((): LocalImageInspection => ({ status: 'error' }));
        let check: (source: string) => LocalImageInspection | PageImageInspection | Promise<LocalImageInspection>;
        if (callId) {
          const html = renderPages(message).get(callId);
          if (html === undefined) return res.status(404).json({ error: 'Page not found' });
          const { images } = await fitRenderPageImages(html, inspect);
          const checked = new Map(images.map((image) => [image.source, image]));
          check = (source) => checked.get(source) ?? { status: 'error' };
        } else {
          const referenced = new Set([...markdownImageSources(message), ...renderPageSources(message)]);
          const generated = toolResultImageSources(message);
          check = (source) => (referenced.has(source) || generated.has(comparablePath(source)) ? inspect(source) : { status: 'error' });
        }
        const results = [];
        for (const source of sources) {
          try {
            const inspected = await check(source);
            if (inspected.status !== 'ready') {
              results.push({ source, status: inspected.status });
              continue;
            }
            const grant = inspected.outsideWorkspace
              ? await mintOutsideFileGrant(inspected.path, {
                scopes: ['raw'],
                fsPromises,
                path,
                crypto,
              })
              : null;
            results.push({
              source,
              status: 'ready',
              path: inspected.path,
              outsideFileGrant: grant?.outsideFileGrant,
              expiresAt: grant?.expiresAt,
            });
          } catch {
            results.push({ source, status: 'error' });
          }
        }
        return res.json({ results });
      } catch (error) {
        console.warn('[MarkdownImageGrants] failed to prepare images:', (hasErrorMessage(error) && error.message) || error);
        return res.status(503).json({ error: 'Failed to prepare session images' });
      }
    },
  );
};
