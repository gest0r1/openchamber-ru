import { isRecord, isString } from '../shared/object-guards.js';
import type { GeneratedTextResult } from '../small-model/index.js';
import { GOAL_OBJECTIVE_CHAR_LIMIT } from './objectives.js';

export const GOAL_REASON_CHAR_LIMIT = 200;

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);
const positiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

type GoalStatus = typeof GOAL_STATUSES[number];

const GOAL_STATUSES = ['active', 'paused', 'blocked', 'budgetLimited', 'complete'] as const;
const isGoalStatus = (value: unknown): value is GoalStatus => GOAL_STATUSES.some((status) => status === value);

export interface SessionGoal {
  id: string;
  objective: string;
  objectiveFile: boolean;
  status: GoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  tokensBaseline: number;
  tokensCommitted: number;
  turnsUsed: number;
  auditFailStreak: number;
  statusReason: string;
  evaluationProviderID: GeneratedTextResult['providerID'];
  evaluationModelID: GeneratedTextResult['modelID'];
  lastAccountedMessageID: string;
  createdAt: number;
  updatedAt: number;
}

export const parseGoalMetadata = (session: { metadata?: unknown } | undefined) => {
  const metadata = session?.metadata;
  if (!isRecord(metadata)) return null;
  const namespace = metadata.openchamber;
  if (!isRecord(namespace)) return null;
  const goal = namespace.goal;
  if (!isRecord(goal)) return null;
  const objective = isString(goal.objective) ? goal.objective.trim() : '';
  const objectiveFile = goal.objectiveFile === true;
  const id = isString(goal.id) ? goal.id : '';
  const status = isGoalStatus(goal.status) ? goal.status : '';
  if (!id || !status || (!objective && !objectiveFile)) return null;
  return {
    id,
    objective: objective.slice(0, GOAL_OBJECTIVE_CHAR_LIMIT),
    objectiveFile,
    status,
    tokenBudget: positiveNumber(goal.tokenBudget) ? Math.floor(goal.tokenBudget) : null,
    tokensUsed: positiveNumber(goal.tokensUsed) ? Math.floor(goal.tokensUsed) : 0,
    tokensBaseline: positiveNumber(goal.tokensBaseline) ? Math.floor(goal.tokensBaseline) : 0,
    tokensCommitted: positiveNumber(goal.tokensCommitted) ? Math.floor(goal.tokensCommitted) : 0,
    turnsUsed: positiveNumber(goal.turnsUsed) ? Math.floor(goal.turnsUsed) : 0,
    auditFailStreak: positiveNumber(goal.auditFailStreak) ? Math.floor(goal.auditFailStreak) : 0,
    statusReason: isString(goal.statusReason) ? goal.statusReason.slice(0, GOAL_REASON_CHAR_LIMIT) : '',
    evaluationProviderID: isString(goal.evaluationProviderID) ? goal.evaluationProviderID : '',
    evaluationModelID: isString(goal.evaluationModelID) ? goal.evaluationModelID : '',
    lastAccountedMessageID: isString(goal.lastAccountedMessageID) ? goal.lastAccountedMessageID : '',
    createdAt: isFiniteNumber(goal.createdAt) ? goal.createdAt : 0,
    updatedAt: isFiniteNumber(goal.updatedAt) ? goal.updatedAt : 0,
  };
};
