import { connect } from 'node:net';
import { z } from 'zod';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const brokerEnvelope = z.object({ ok: z.json().optional(), error: z.string().optional() });
const maxBytes = 1024 * 1024;

export function callOwnerApprovalBroker(request: JsonObject, socketPath = '/run/my-opencode-approval/verify.sock'): Promise<JsonValue> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let response = '';
    let bytes = 0;
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => socket.destroy(new Error('Owner approval broker timed out')));
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        socket.destroy(new Error('Owner approval response exceeded the limit'));
        return;
      }
      response += chunk;
      const line = response.indexOf('\n');
      if (line < 0) return;
      try {
        const payload = brokerEnvelope.parse(JSON.parse(response.slice(0, line)));
        if (payload.error || payload.ok === undefined) throw new Error(payload.error ?? 'Invalid owner approval response');
        resolve(payload.ok);
      } catch (error) {
        reject(error);
      } finally {
        socket.destroy();
      }
    });
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('Owner approval broker closed the connection')));
  });
}
