import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createOwnerApprovalService } from './service.js';

const origin = 'https://approval.example.test';
const host = 'approval.example.test';
const checkpoint = 'a'.repeat(32);
const endpoint = `/api/approval/${checkpoint}`;
const hash = (bytes) => createHash('sha256').update(bytes).digest();

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const key = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const challenge = Buffer.alloc(32, 7).toString('base64url');
  const credential = { id: 'fixture', public_key: Buffer.from(isoCBOR.encode(key)).toString('base64url'), counter: 0 };
  const broker = vi.fn(async ({ action, request_id, challenge: suppliedChallenge }) => {
    if (request_id !== checkpoint) throw new Error('wrong request');
    if (action === 'challenge') return { challenge, credentials: [credential.id] };
    if (action === 'credential' && suppliedChallenge === challenge) return credential;
    if (action === 'finish') return { decision: 'approved' };
    throw new Error('unknown broker operation');
  });
  const app = createOwnerApprovalService({ origin, broker });
  const signResponse = (clientOrigin, flags) => {
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: clientOrigin }));
    const data = Buffer.concat([hash(host), Buffer.from([flags, 0, 0, 0, 1])]);
    const signature = sign('sha256', Buffer.concat([data, hash(clientData)]), privateKey);
    return {
      id: credential.id, rawId: credential.id, type: 'public-key',
      response: { clientDataJSON: clientData.toString('base64url'), authenticatorData: data.toString('base64url'), signature: signature.toString('base64url') },
      clientExtensionResults: {},
    };
  };
  return { app, challenge, broker, signResponse };
}

const post = (app, path, browserOrigin = origin) => request(app).post(endpoint + path).set('Host', host).set('Origin', browserOrigin);

describe('independent passkey verification', () => {
  it('publishes a stable verifier identity only while the broker responds', async () => {
    const broker = vi.fn().mockResolvedValue({ ready: true });
    const app = createOwnerApprovalService({ origin, broker });
    const first = await request(app).get('/healthz').set('Host', host).expect(204);
    const second = await request(app).get('/healthz').set('Host', host).expect(204);
    expect(second.headers['x-openchamber-verifier-id']).toBe(first.headers['x-openchamber-verifier-id']);
    expect(first.headers['x-openchamber-verifier-id']).toMatch(/^[a-f0-9-]{36}$/);
    broker.mockRejectedValue(new Error('broker unavailable'));
    await request(app).get('/healthz').set('Host', host).expect(503);
  });

  it('uses required UV and sends the verified counter to the broker', async () => {
    const { app, challenge, broker, signResponse } = fixture();
    const options = await post(app, '/challenge').send({ decision: 'approve' }).expect(200);
    expect(options.body).toMatchObject({ challenge, rpId: host, userVerification: 'required' });
    await post(app, '/verify').send({ challenge, assertion: signResponse(origin, 0x05) }).expect(200);
    expect(broker).toHaveBeenLastCalledWith({ action: 'finish', request_id: checkpoint, credential_id: 'fixture', challenge, previous_counter: 0, new_counter: 1 });
  });

  it.each([
    ['https://untrusted.example.test', 0x05],
    [origin, 0x01],
  ])('rejects an invalid signed origin (%s) or flags (%s) before finalization', async (signedOrigin, flags) => {
    const { app, challenge, broker, signResponse } = fixture();
    await post(app, '/verify').send({ challenge, assertion: signResponse(signedOrigin, flags) }).expect(403);
    expect(broker.mock.calls.map(([call]) => call.action)).toEqual(['credential']);
  });

  it('blocks cross-origin posts before touching the broker', async () => {
    const { app, broker } = fixture();
    await post(app, '/challenge', 'https://untrusted.example.test').send({ decision: 'approve' }).expect(403);
    expect(broker).not.toHaveBeenCalled();
  });
});
