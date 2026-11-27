import { z } from 'zod';

const operation = z.string().min(1);
export const checkpoint = z.object({
  request_id: z.string().regex(/^[a-f0-9]{32}$/),
  session_id: z.string().min(1),
  run_id: z.string().min(1),
  project: z.string(),
  workspace: z.string().min(1),
  operation,
  pipeline_id: z.string().min(1),
  stage: z.string().min(1),
  generation: z.number().int().positive(),
  candidate_sha: z.string(),
  decision: z.enum(['pending', 'approved', 'rejected', 'superseded', 'expired']),
});

export const checkpointPage = z.object({ entries: z.array(checkpoint), before: z.number().int().nonnegative() });
export const approvalOrigin = z.string().refine((value) => {
  const url = URL.parse(value);
  return url?.protocol === 'https:' && url.origin === value && url.hostname.includes('.');
});
export const panelResponse = checkpointPage.extend({ origin: approvalOrigin });
