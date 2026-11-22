import React from 'react';
import { useI18n } from '@/lib/i18n';
import { opencodeClient } from '@/lib/opencode/client';
import type { Message } from '@/lib/opencode/model';
import { useSessionMessagesSelector, useSessionStatus } from '@/sync/sync-context';
import type { TurnSnapshotDiff } from './turnSnapshotDiff';

const EMPTY_DIFFS: TurnSnapshotDiff[] = [];

const selectTranscriptKey = (messages: Message[]): string => {
    const last = messages[messages.length - 1];
    if (!last) return '';
    const completed = last.role === 'assistant' ? last.time.completed ?? '' : '';
    return `${last.id}:${completed}`;
};

type LastTurnDiff = {
    diffs: TurnSnapshotDiff[];
    count: number | null;
    loaded: boolean;
    /** The list is the answer to the session's current state, not one kept from an earlier read. */
    settled: boolean;
    error: string | null;
    retry: () => void;
};

export function useLastTurnDiff(
    sessionId: string | null,
    directory: string | undefined,
    { enabled, live, from }: { enabled: boolean; live: boolean; from?: string },
): LastTurnDiff {
    const { t } = useI18n();
    const transcriptKey = useSessionMessagesSelector(enabled ? sessionId ?? '' : '', directory, selectTranscriptKey);
    const statusType = useSessionStatus(enabled ? sessionId ?? '' : '', directory)?.type;
    const running = statusType !== undefined && statusType !== 'idle';
    const [result, setResult] = React.useState<{ sessionId: string; readKey: string; diffs: TurnSnapshotDiff[] } | null>(null);
    // A failed read is not "this turn changed nothing": it keeps its own state
    // and a retry, and the last good list stays until a read replaces it.
    const [failure, setFailure] = React.useState<{ sessionId: string; message: string } | null>(null);
    const [attempt, nextAttempt] = React.useReducer((value: number) => value + 1, 0);
    const retry = React.useCallback(() => {
        setFailure(null);
        nextAttempt();
    }, []);
    const waiting = running && !live;
    const readKey = JSON.stringify([attempt, running, transcriptKey]);

    React.useEffect(() => {
        if (!enabled || !sessionId || waiting) return;
        let cancelled = false;
        void opencodeClient.getSessionTurnDiff(sessionId, { directory, from })
            .then((files) => {
                if (cancelled) return;
                setResult({
                    sessionId,
                    readKey,
                    diffs: files.map((entry) => ({
                        file: entry.file,
                        patch: entry.patch,
                        status: entry.status,
                        additions: entry.additions,
                        deletions: entry.deletions,
                    })),
                });
                setFailure(null);
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('[last-turn-diff] turn diff unavailable:', error instanceof Error ? error.message : error);
                setFailure({ sessionId, readKey, message: error instanceof Error && error.message ? error.message : t('diffView.state.failedToLoadDiff') });
            });
        return () => {
            cancelled = true;
        };
        // `readKey` is the trigger: a new step, a step finishing, or the turn
        // going idle changes the answer.
    }, [directory, enabled, readKey, sessionId, t, waiting]);

    const own = result && result.sessionId === sessionId && result.directory === directory && result.from === from ? result : null;
    const diffs = own?.diffs ?? EMPTY_DIFFS;
    const error = failure && failure.sessionId === sessionId && failure.readKey === readKey ? failure.message : null;
    return {
        diffs,
        count: own && !waiting ? diffs.length : null,
        loaded: own !== null,
        settled: own !== null && own.readKey === readKey,
        error,
        retry,
    };
}
