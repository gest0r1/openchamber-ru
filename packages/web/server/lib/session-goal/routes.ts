import { z } from 'zod';
import { deleteObjective, readObjective, writeObjective } from './objectives.js';
import type { ObjectiveContent } from './objectives.js';
import type { ExpressFactory, Request, Router } from '../shared/http-contracts.js';
import type { SessionGoalRuntime } from './runtime.js';

type GoalRequest = Request<ObjectiveContent | undefined, { sessionId: string }>;
type GoalApp = Pick<Router, 'put' | 'get' | 'delete'>;

const commandBody = z.object({ name: z.string() });

export function registerGoalCommandGuard(app: Pick<Router, 'post'>, express: ExpressFactory, beforeCommand: SessionGoalRuntime['beforeCommand']) {
  app.post<unknown, { sessionId: string }>('/api/session/:sessionId/command', express.json({ limit: '50mb' }), async (req, res, next) => {
    if (req.body !== undefined) delete req.headers['content-encoding'];
    const parsed = commandBody.safeParse(req.body);
    if (!parsed.success) return next();
    try {
      await beforeCommand(req.params.sessionId, parsed.data.name);
      next();
    } catch {
      res.status(503).json({ error: 'Could not pause the session goal for the pipeline command' });
    }
  });
}

const isObjectiveBody = (value: ObjectiveContent): value is { [key: string]: ObjectiveContent } =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isRouteError = (value: unknown): value is { statusCode?: unknown; message?: unknown } =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

export function registerSessionGoalRoutes(app: GoalApp) {
  app.put('/api/goals/objective/:sessionId', async (req: GoalRequest, res) => {
    try {
      const body = req.body || {};
      const content = isObjectiveBody(body) ? body.content : undefined;
      await writeObjective(req.params.sessionId, content);
      res.json({ ok: true });
    } catch (error) {
      const statusCode = Number(isRouteError(error) ? error.statusCode : undefined) || 500;
      if (statusCode >= 500) {
        console.error('Failed to write goal objective:', error);
      }
      res.status(statusCode).json({ error: (isRouteError(error) ? error.message : undefined) || 'Failed to write goal objective' });
    }
  });

  app.get('/api/goals/objective/:sessionId', async (req: GoalRequest, res) => {
    const content = await readObjective(req.params.sessionId);
    if (content === null) {
      res.status(404).json({ error: 'objective not found' });
      return;
    }
    res.json({ content });
  });

  app.delete('/api/goals/objective/:sessionId', async (req: GoalRequest, res) => {
    await deleteObjective(req.params.sessionId);
    res.json({ ok: true });
  });
}
