import type { ClientRequest } from 'node:http';
import type { Request } from '../shared/http-contracts.js';
import { isRecord, isString } from '../shared/object-guards.js';

const hasParsedBodyValue = <Body>(body: Body) => {
  if (body === undefined || body === null) return false;
  if (Buffer.isBuffer(body)) return body.length > 0;
  if (isString(body)) return body.length > 0;
  if (Array.isArray(body)) return body.length > 0;
  if (isRecord(body)) return Object.keys(body).length > 0;
  return true;
};

const getContentType = (proxyReq: ClientRequest, req: Request) => {
  const value = proxyReq.getHeader?.('content-type') ?? req.headers?.['content-type'] ?? '';
  if (Array.isArray(value)) return value[0] || '';
  return String(value || '');
};

const serializeUrlEncodedBody = <Body>(body: Body) => {
  if ((!isRecord(body) && !Array.isArray(body)) || Buffer.isBuffer(body)) {
    return String(body ?? '');
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== undefined && entry !== null) params.append(key, String(entry));
      }
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
};

const serializeParsedBody = (req: Request, proxyReq: ClientRequest) => {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  if (req.body === undefined || req.body === null) return null;
  const originalContentLength = Number.parseInt(req.headers?.['content-length'] || '0', 10) || 0;
  if (!hasParsedBodyValue(req.body) && originalContentLength <= 0) return null;

  const contentType = getContentType(proxyReq, req).toLowerCase();
  if (Buffer.isBuffer(req.body)) return req.body;
  if (contentType.includes('application/json')) return Buffer.from(JSON.stringify(req.body));
  if (contentType.includes('application/x-www-form-urlencoded')) return Buffer.from(serializeUrlEncodedBody(req.body));
  if (isString(req.body)) return Buffer.from(req.body);
  return null;
};

export const replayParsedBody = (proxyReq: ClientRequest, req: Request) => {
  const body = serializeParsedBody(req, proxyReq);
  if (!body) {
    if (proxyReq.getHeader('content-length') !== undefined) {
      proxyReq.removeHeader('transfer-encoding');
    }
    return;
  }
  proxyReq.removeHeader('transfer-encoding');
  proxyReq.setHeader('content-length', String(body.length));
  proxyReq.write(body);
};
