import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { focusChatInput } from './composer/editor/dom';

export type ChatColumnSession = {
  sessionId: string | null;
  directory: string | null;
};

export const ChatColumnSessionContext = React.createContext<ChatColumnSession | null>(null);

export const useChatColumnSession = (): ChatColumnSession | null => React.useContext(ChatColumnSessionContext);

export const useChatSessionSelection = (): ChatColumnSession => {
  const column = useChatColumnSession();
  const liveSessionId = useSessionUIStore((state) => (column ? null : state.currentSessionId));
  const liveDirectory = useSessionUIStore((state) => (column ? null : state.currentSessionDirectory));
  return React.useMemo(
    () => column ?? { sessionId: liveSessionId, directory: liveDirectory },
    [column, liveDirectory, liveSessionId],
  );
};

/**
 * The store directory of a transcript nested in a column that renders from
 * another store: a `/btw` fork sits in its parent's column and reads its
 * records from the fork's directory. Everything else in that transcript still
 * acts on the column's session, so this stays apart from the column context.
 */
export const ChatTranscriptDirectoryContext = React.createContext<string | null>(null);

/** The directory of the store the transcript around this component renders from. */
export const useChatTranscriptDirectory = (): string | null => {
  const nested = React.useContext(ChatTranscriptDirectoryContext);
  const { directory } = useChatSessionSelection();
  return nested ?? directory;
};

/**
 * What a column does on behalf of the chat inside it. The app's main chat
 * acts on the global selection and the global panels; a pinned column (a chat
 * opened in the side panel) keeps its own session, navigates inside itself,
 * and leaves the main chat's selection and panels alone.
 */
export type ChatColumnActions = {
  pinned: boolean;
  openSession: (sessionId: string, directory: string | null) => void;
  openTimelineDialog: () => void;
  focusInput: () => void;
};

const MAIN_COLUMN_ACTIONS: ChatColumnActions = {
  pinned: false,
  openSession: (sessionId, directory) => useSessionUIStore.getState().setCurrentSession(sessionId, directory),
  openTimelineDialog: () => useUIStore.getState().setTimelineDialogOpen(true),
  focusInput: focusChatInput,
};

export const ChatColumnActionsContext = React.createContext<ChatColumnActions>(MAIN_COLUMN_ACTIONS);

export const useChatColumnActions = (): ChatColumnActions => React.useContext(ChatColumnActionsContext);

type ChatColumnExpandedInput = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

const PINNED_COLUMN_EXPANDED_INPUT: ChatColumnExpandedInput = {
  expanded: false,
  setExpanded: () => {},
};

export const useChatColumnExpandedInput = (): ChatColumnExpandedInput => {
  const { pinned } = useChatColumnActions();
  const globalExpanded = useUIStore((state) => (pinned ? false : state.isExpandedInput));
  const setGlobalExpanded = useUIStore((state) => state.setExpandedInput);
  return React.useMemo(
    () => (pinned ? PINNED_COLUMN_EXPANDED_INPUT : { expanded: globalExpanded, setExpanded: setGlobalExpanded }),
    [pinned, globalExpanded, setGlobalExpanded],
  );
};
