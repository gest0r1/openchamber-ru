
import { computeCacheHitRate, findLatestContextFill, type ContextFillMessage } from '@/stores/utils/tokenUtils';

type WorkStatusContextUsage =
  | {
    state: 'measured';
    totalTokens: number;
    limit: number;
    percent: number;
  }
  | { state: 'compacted'; limit: number };

export const DEFAULT_CONTEXT_LIMIT = 200_000;

export const computeContextUsage = (
  messages: readonly ContextFillMessage[],
  contextLimit: number,
): WorkStatusContextUsage | null => {
  const fill = findLatestContextFill(messages);
  if (!fill) return null;

  const limit = contextLimit > 0 ? contextLimit : DEFAULT_CONTEXT_LIMIT;
  if (fill.state === 'compacted') return { state: 'compacted', limit };

  return { state: 'measured', totalTokens: fill.totalTokens, limit, percent: (fill.totalTokens / limit) * 100 };
};

/**
 * Share of the prompt served from cache in the reply the context reading comes
 * from: what the provider is caching right now. Session totals span every
 * compaction, so they describe history rather than the current prompt. Null
 * without a reply that reported prompt tokens, including after a finished
 * compaction, whose record describes the summarizing request.
 */
export const computeLastReplyCacheHit = (messages: readonly ContextFillMessage[]): number | null => {
  const fill = findLatestContextFill(messages);
  if (fill?.state !== 'measured') return null;
  const hitRate = computeCacheHitRate(messages[fill.index]?.tokens);
  return hitRate.hasInput ? hitRate.percent : null;
};

type SessionTokenRecord = {
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
};

type SessionTokenTotals = {
  /**
   * Every prompt token, cached or not. OpenCode's `input` counts only the part
   * that missed the cache, a few hundred tokens in a session that read millions
   * from cache, which reads as if the session sent almost nothing.
   */
  prompt: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  /** Share of every prompt token in the session served from cache; null before any prompt. */
  cacheHitPercent: number | null;
};

/**
 * Whole-session token totals, for the context panel's overview.
 *
 * Read from the session record, which OpenCode adds every step's usage to.
 * Never a sum over messages: a long session holds only its tail, so a sum
 * falls as the chat grows. The cache hit rate over the summed counters is the
 * average weighted by prompt size. Null until there is something to report:
 * a persisted snapshot strips the counters until the live record arrives, and
 * a new session has only zeros.
 */
export const computeSessionTokenTotals = (session: SessionTokenRecord | null | undefined): SessionTokenTotals | null => {
  const tokens = session?.tokens;
  if (!tokens) return null;
  const cacheRead = tokens.cache?.read ?? 0;
  const cacheWrite = tokens.cache?.write ?? 0;
  const totals = {
    prompt: (tokens.input ?? 0) + cacheRead + cacheWrite,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    cacheRead,
    cacheWrite,
  };
  if (totals.prompt + totals.output + totals.reasoning <= 0) return null;
  const hitRate = computeCacheHitRate(tokens);
  return { ...totals, cacheHitPercent: hitRate.hasInput ? hitRate.percent : null };
};
