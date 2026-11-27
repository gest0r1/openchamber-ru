import { randomUUID } from 'node:crypto';
import express from 'express';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import { callOwnerApprovalBroker } from './transport.js';
import { enrollmentPage, enrollmentScript, page, pageScript } from './view.js';

const token = z.string().min(1).max(16384).regex(/^[A-Za-z0-9_-]+$/);
const checkpointId = z.string().regex(/^[a-f0-9]{32}$/);
const credentialSchema = z.object({ id: token, public_key: token, counter: z.number().int().nonnegative() });
const challengeSchema = z.object({ challenge: token, credentials: z.array(token) });
const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });
const assertionSchema = z.object({
  id: token,
  rawId: token,
  type: z.literal('public-key'),
  response: z.object({ authenticatorData: token, clientDataJSON: token, signature: token, userHandle: token.optional() }),
  clientExtensionResults: z.object({}).optional(),
});
const verificationSchema = z.object({ challenge: token, assertion: assertionSchema });
const enrollment = z.object({ token });
const enrollmentChallenge = z.object({ challenge: token, user_id: token });
const registration = enrollment.extend({ credential: z.object({
  id: token, rawId: token, type: z.literal('public-key'),
  response: z.object({ clientDataJSON: token, attestationObject: token }),
}) });

interface ApprovalOptions {
  origin: string;
  broker?: typeof callOwnerApprovalBroker;
}

export function createOwnerApprovalService({ origin, broker = callOwnerApprovalBroker }: ApprovalOptions) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || !url.hostname.includes('.')) {
    throw new Error('Owner approval requires a fixed HTTPS origin');
  }
  const rpID = url.hostname;
  const app = express();
  const verifierId = randomUUID();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    if (request.get('host') !== url.host || (request.method === 'POST' && request.get('origin') !== origin)) {
      response.sendStatus(403);
      return;
    }
    next();
  });
  app.get('/approval/:requestId', (request, response) => {
    if (!checkpointId.safeParse(request.params.requestId).success) return response.sendStatus(404);
    return response.type('html').send(page);
  });
  app.get('/approval.js', (_request, response) => response.type('js').send(pageScript));
  app.get('/enroll', (_request, response) => response.type('html').send(enrollmentPage));
  app.get('/enroll.js', (_request, response) => response.type('js').send(enrollmentScript));
  app.get('/healthz', async (_request, response) => {
    try {
      z.object({ ready: z.literal(true) }).parse(await broker({ action: 'health' }));
      return response.set('X-OpenChamber-Verifier-Id', verifierId).sendStatus(204);
    } catch {
      return response.sendStatus(503);
    }
  });
  app.get('/api/approval/:requestId', async (request, response) => {
    const id = checkpointId.safeParse(request.params.requestId);
    if (!id.success) return response.sendStatus(404);
    try {
      return response.json(await broker({ action: 'review', request_id: id.data }));
    } catch {
      return response.status(404).json({ error: 'The request is unavailable or is no longer pending.' });
    }
  });
  const json = express.json({ limit: '64kb' });
  app.post('/api/enroll/options', json, async (request, response) => {
    const body = enrollment.safeParse(request.body);
    if (!body.success) return response.sendStatus(400);
    try {
      const enrollment = enrollmentChallenge.parse(await broker({ action: 'enrollment', token: body.data.token }));
      return response.json(await generateRegistrationOptions({
        rpName: 'Pipeline approval', rpID, userName: 'owner', userID: Buffer.from(enrollment.user_id, 'base64url'),
        challenge: Buffer.from(enrollment.challenge, 'base64url'), attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }));
    } catch {
      return response.status(403).json({ error: 'The administrator enrollment link has expired or is invalid.' });
    }
  });
  app.post('/api/enroll/verify', json, async (request, response) => {
    const body = registration.safeParse(request.body);
    if (!body.success) return response.sendStatus(400);
    try {
      const { challenge } = enrollmentChallenge.parse(await broker({ action: 'enrollment', token: body.data.token }));
      const result = await verifyRegistrationResponse({
        response: { ...body.data.credential, clientExtensionResults: {} }, expectedChallenge: challenge,
        expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      });
      if (!result.verified) return response.sendStatus(403);
      const credential = result.registrationInfo.credential;
      await broker({ action: 'enroll', token: body.data.token, challenge, credential_id: credential.id,
        public_key: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter });
      return response.sendStatus(204);
    } catch {
      return response.status(403).json({ error: 'The passkey could not be registered.' });
    }
  });
  app.post('/api/approval/:requestId/challenge', json, async (request, response) => {
    const id = checkpointId.safeParse(request.params.requestId);
    const body = decisionSchema.safeParse(request.body);
    if (!id.success || !body.success) return response.sendStatus(400);
    try {
      const { challenge, credentials } = challengeSchema.parse(await broker({ action: 'challenge', request_id: id.data, decision: body.data.decision }));
      return response.json(await generateAuthenticationOptions({
        challenge: Buffer.from(challenge, 'base64url'), rpID, timeout: 120000, userVerification: 'required',
        allowCredentials: credentials.map((credential) => ({ id: credential })),
      }));
    } catch {
      return response.status(409).json({ error: 'The passkey challenge is unavailable.' });
    }
  });
  app.post('/api/approval/:requestId/verify', json, async (request, response) => {
    const id = checkpointId.safeParse(request.params.requestId);
    const body = verificationSchema.safeParse(request.body);
    if (!id.success || !body.success) return response.sendStatus(400);
    const { challenge, assertion } = body.data;
    const binding = { request_id: id.data, challenge, credential_id: assertion.id };
    try {
      const credential = credentialSchema.parse(await broker({ action: 'credential', ...binding }));
      const { userHandle, ...signature } = assertion.response;
      const authentication: AuthenticationResponseJSON = { ...assertion, response: signature, clientExtensionResults: assertion.clientExtensionResults ?? {} };
      if (userHandle) authentication.response.userHandle = userHandle;
      const result = await verifyAuthenticationResponse({
        response: authentication,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: credential.id, publicKey: Buffer.from(credential.public_key, 'base64url'), counter: credential.counter },
      });
      if (!result.verified) return response.sendStatus(403);
      const decision = await broker({
        action: 'finish', ...binding, previous_counter: credential.counter, new_counter: result.authenticationInfo.newCounter,
      });
      return response.json(decision);
    } catch {
      return response.status(403).json({ error: 'The passkey response could not be verified for this request.' });
    }
  });
  return app;
}
