import React from 'react';
import { createPortal } from 'react-dom';
import type { Message, Part, Session } from '@/lib/opencode/model';
import { getLastConversationRecord, isIncompleteAssistantTurn } from '@/lib/opencode/model';
import { keepCommandSubagentReports } from '@/lib/opencode/subagent-run';
import { dropReplyCommandRows } from '@/lib/opencode/reply-command';
import { isOpencodeNotFound, opencodeClient } from '@/lib/opencode/client';

import { ChatInput } from './ChatInput';
import { TelegramSessionButton } from './TelegramSessionButton';
import { CHAT_INPUT_EDITOR_SELECTOR } from './composer/editor/dom';
import {
    ChatColumnActionsContext,
    ChatColumnSessionContext,
    useChatColumnActions,
    type ChatColumnActions,
    type ChatColumnSession,
} from './chatColumnSession';
import { MobileCommentComposerContext, useMobileCommentComposerOwner } from './composer/comment/MobileCommentComposerContext';
import { DraftPresetChips } from './DraftPresetChips';
import { useInputStore } from '@/sync/input-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { Skeleton } from '@/components/ui/skeleton';
import { KeepAlive } from '@/components/ui/KeepAlive';
import ChatEmptyState from './ChatEmptyState';
import { useGlobalSyncStore } from '@/sync/global-sync-store';
import MessageList, { type MessageListHandle } from './MessageList';
import { createTimelineRevealGate, type TimelineRevealGate } from './timelineRevealGate';

// How long the previous timeline stays on screen while a session that is not
// in memory loads, before the skeleton takes over.
const SESSION_SWITCH_HOLD_MS = 400;
// End inset reserved for the status row that floats over the timeline's
// bottom edge (its tallest resting height plus the mb-2 gap).
const STATUS_OVERLAY_RESERVED_HEIGHT = 40;
// A freshly opened timeline is shown once its content height has held still
// for this many consecutive frames, or after the cap.
const TIMELINE_SETTLE_STABLE_FRAMES = 2;
const TIMELINE_SETTLE_CAP_MS = 300;
// Mirrors the oc-chat-hydration-reveal duration in index.css.
const TIMELINE_REVEAL_FADE_MS = 100;
// After a turn starts or ends, how long the transcript settles before an
// overgrown history is cut back: past the scroll hook's 2 s send glide and
// 1 s turn-end glide windows.
const HISTORY_TRIM_DELAY_MS = 3000;
import { hasActiveFormToolInCurrentTurn, recoverPendingFormWithRetry } from '@/sync/form-recovery';
import { useIsPageWaiting } from '@/sync/global-blocking-requests';
import { holdPendingSynthetic } from './lib/holdPendingSynthetic';
import { toast } from '@/components/ui';
import { StatusRowContainer } from './StatusRowContainer';
import {
    FLOATING_COMPOSER_DEFAULT_TAIL_INSET_PX,
    FLOATING_COMPOSER_GAP_PX,
    forgetComposerSlot,
    recordComposerSlotHeight,
} from '@/components/chat/composer/state/composerTailInset';
import {
    publishComposerInsets,
    registerComposerInsetReader,
    registerFloatingPanelClearanceReader,
    withdrawComposerInsets,
} from '@/components/chat/composer/state/composerInsetReaders';
import { SessionErrorNotice } from '@/components/chat/SessionErrorNotice';
import ScrollToBottomButton from './components/ScrollToBottomButton';
import { PromptNavigatorRail } from './components/PromptNavigatorRail';
import { useAuthSessionStore } from '@/lib/runtime-auth-expiry';
import { useScrollShadow } from '@/components/ui/useScrollShadow';
import { useChatTimelineScroll, type LinkedMessageState, type TimelineListHandle } from '@/hooks/useChatTimelineScroll';
import { useChatTimelineController } from './hooks/useChatTimelineController';
import { TimelineDialog } from './TimelineDialog';
import { useChatTurnNavigation } from './hooks/useChatTurnNavigation';
import { ChatQuoteHighlightContext, useChatQuoteHighlightStore } from './hooks/chatQuoteHighlightStore';
import { ChatQuoteHighlightLayer } from './message/ChatQuoteHighlightLayer';
import { TextSelectionMenu } from './message/TextSelectionMenu';
import { loadQuoteSource as loadQuoteSourceMessage, scrollToQuoteSource as scrollToQuoteSourceMessage } from './quoteNavigation';
import { useChatSurfaceMode } from './useChatSurfaceMode';
import { useMessageTTS } from '@/hooks/useMessageTTS';
import { useAutoReadAloud } from '@/hooks/useAutoReadAloud';
import { findLatestCompletedReply } from '@/lib/messages/latestReply';
import { useDeviceInfo } from '@/lib/device';
import { Button } from '@/components/ui/button';
import { StopIcon } from '@/components/icons/StopIcon';
import { abortCurrentOperation } from '@/sync/session-actions';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import { Icon } from "@/components/icon/Icon";
import { cn, formatDirectoryName } from '@/lib/utils';
import { useWaitingBlink } from '@/hooks/useDurationTicker';
import { useProjectsStore } from '@/stores/useProjectsStore';

// New sync system imports
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useStreamingStore } from '@/sync/streaming';
import {
    useChildStoreManager,
    useSessionMessageRecords,
    useSessionMessageLoadState,
    useSessionMessageLoader,
    useSyncDirectory,
    useSessionRenderable,
    useSessionStatus,
    useSessionStatusSnapshotReady,
    useScopedBlockingPermissions,
    useScopedBlockingForms,
    useParentSession,
    useSession,
    useSessionStartTimes,
} from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { isVSCodeRuntime } from '@/lib/desktop';
import { SEMANTIC_TYPOGRAPHY, VSCODE_TYPOGRAPHY, getScaledTypographyStyle } from '@/lib/typography';
import { eventMatchesShortcut, getEffectiveShortcutCombo } from '@/lib/shortcuts';
import { ChatSearchBar } from './search/ChatSearchBar';
import { WorkStatusPanel } from './work-status/WorkStatusPanel';
import { useWorkStatusVisibility } from './work-status/useWorkStatusVisibility';
import { useShownSessionSelection } from './useShownSessionSelection';
import { usePinnedSessionDirectory } from './usePinnedSessionDirectory';
import { useRightSlotStore } from '@/components/layout/rightSlot';
import { buildPromptPreviewsByTurnId } from './lib/promptPreviews';
import { resolveChatPromptReadOnly } from './chatPromptReadOnly';
import { PermissionDock } from './PermissionDock';
import { FormDock } from './FormDock';
import { ensureSpaceArchives, useSpaceArchiveOf } from '@/lib/spaces/space-archives';
import { useSpaceDirectoryStopped } from '@/lib/spaces/spaces-store';
import { SpaceChatPlaceholder } from '@/components/session/spaces/SpaceChatPlaceholder';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { isMobileSurfaceRuntime } from '@/lib/runtimeSurface';
import { createFirstVisibleSessionPerformanceTracker } from '@/sync/session-load-performance';
import { isChatDirectoryPath } from '@/lib/chatDirectories';

function HoistedUiPageSelection({ scrollNode, sessionId }: { scrollNode: HTMLElement; sessionId: string }) {
    const containerRef = React.useMemo(() => ({ current: scrollNode }), [scrollNode]);
    const surface = useChatSurfaceMode();
    const showTTS = useConfigStore((state) => state.showMessageTTSButtons);
    return <TextSelectionMenu containerRef={containerRef} readingKey={sessionId} uiRenderSelection
        canReadAloud={surface !== 'mini-chat' && showTTS} />;
}

const EMPTY_MESSAGES: Array<{ info: Message; parts: Part[] }> = [];
const IDLE_SESSION_STATUS = { type: 'idle' as const };
const CHAT_FORCE_SCROLL_BOTTOM_EVENT = 'openchamber:chat-force-scroll-bottom';
const DEFAULT_RETRY_MESSAGE = 'Quota limit reached. Retrying automatically.';
const DRAFT_EXIT_DURATION_MS = 120;
const COMPOSER_MOVE_DURATION_MS = 180;
const CHAT_SCROLL_STYLE = {
    // A chat column squeezed to 0px gives the rows no area, and the browser
    // drops the scroll position with the scrollable height.
    minWidth: 1,
    overflowAnchor: 'none',
    overscrollBehavior: 'contain',
    overscrollBehaviorY: 'contain',
} as const;
const CHAT_NAVIGATION_IGNORED_TARGET_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="combobox"]',
    '[role="dialog"]',
    '[role="listbox"]',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="textbox"]',
    '[data-radix-popper-content-wrapper]',
].join(',');
type SessionMessageRecord = { info: Message; parts: Part[] };

const isHTMLElement = (target: EventTarget | null): target is HTMLElement => {
    return target instanceof HTMLElement;
};

const shouldIgnoreChatNavigationTarget = (target: EventTarget | null): boolean => {
    if (!isHTMLElement(target)) {
        return false;
    }

    return Boolean(target.closest(CHAT_NAVIGATION_IGNORED_TARGET_SELECTOR));
};

const shouldIgnoreChatNavigationForFocus = (activeElement: Element | null, scrollContainer: HTMLElement | null): boolean => {
    if (typeof document === 'undefined') {
        return true;
    }

    if (!activeElement || activeElement === document.body || activeElement === document.documentElement) {
        return true;
    }

    if (shouldIgnoreChatNavigationTarget(activeElement)) {
        return true;
    }

    return !scrollContainer?.contains(activeElement);
};

const hasBlockingChatOverlay = (): boolean => {
    const {
        isAboutDialogOpen,
        isCommandPaletteOpen,
        isHelpDialogOpen,
        isProjectActionsDialogOpen,
        isImagePreviewOpen,
        runOverviewKey,
        isSessionSwitcherOpen,
        isSettingsDialogOpen,
    } = useUIStore.getState();

    return isAboutDialogOpen
        || isCommandPaletteOpen
        || isHelpDialogOpen
        || isProjectActionsDialogOpen
        || isImagePreviewOpen
        || runOverviewKey !== null
        || isSessionSwitcherOpen
        || isSettingsDialogOpen;
};

type HydratingToolSkeletonRow = {
    id: string;
    titleWidth: string;
    detailWidth: string;
};

type ChatViewportProps = {
    /** Loading, error, draft or empty content; undefined shows the transcript. */
    placeholder: React.ReactNode;
    currentSessionId: string;
    currentSessionKey: string;
    isDesktopExpandedInput: boolean;
    isMobile: boolean;
    /** The composer floats over the transcript and reserves its band via
        `--chat-composer-tail-inset` on the tail spacer (composerInsetReaders). */
    floatingComposer: boolean;
    /** Height the floating status row takes above the composer while the
        session works, px; 0 when there is no row. */
    statusRowClearance: number;
    directory?: string;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    messageListRef: React.RefObject<MessageListHandle | null>;
    registerList: (list: TimelineListHandle | null, sessionKey?: string) => void;
    captureOutgoingPosition: () => void;
    onIsAtEndChange: (isAtEnd: boolean) => void;
    onListMetricsChange: (metrics: { readonly headerSize: number; readonly footerSize: number }) => void;
    onTimelineDataChange: () => void;
    renderedMessages: SessionMessageRecord[];
    isLoadingOlder: boolean;
    sessionIsWorking: boolean;
    streamingMessageId: string | null;
    activeStreamingPhase: import('./message/types').StreamPhase | null;
    retryOverlay: {
        sessionId: string;
        message: string;
        confirmedAt?: number;
        fallbackTimestamp?: number;
    } | null;
    scrollToBottom: () => void;
    /** A drag on the overlay scrollbar's thumb takes the scroll from auto-follow. */
    onScrollbarDrag: () => void;
    endPinningReleased: boolean;
    /** The user waited for this session (held or fetched); reveal it with a fade. */
    revealWaited: boolean;
    revealGate: TimelineRevealGate;
    isProgrammaticFollowActive: boolean;
    showLoadOlderButton: boolean;
    onLoadOlder: () => void;
    turnIds: string[];
    activeTurnId: string | null;
    onSelectTurn: (turnId: string) => void;
    showPromptNavigator: boolean;
    canLoadEarlierPrompts: boolean;
    isLoadingOlderPrompts: boolean;
    onLoadEarlierPrompts: () => void;
};

// Sessions kept mounted per chat column, the open one included, so returning
// to a recent one reuses its timeline. Each retained timeline costs a few MB
// of DOM, and a phone's web view is killed under memory pressure, so the
// mobile surface keeps only the open session.
const retainedTimelines = () => (isMobileSurfaceRuntime() ? 1 : 4);

const ChatViewport = React.memo(({
    placeholder,
    currentSessionId,
    currentSessionKey,
    isDesktopExpandedInput,
    isMobile,
    floatingComposer,
    statusRowClearance,
    directory,
    scrollRef,
    messageListRef,
    registerList,
    captureOutgoingPosition,
    onIsAtEndChange,
    onListMetricsChange,
    onTimelineDataChange,
    renderedMessages,
    isLoadingOlder,
    sessionIsWorking,
    streamingMessageId,
    activeStreamingPhase,
    retryOverlay,
    scrollToBottom,
    onScrollbarDrag,
    endPinningReleased,
    revealWaited,
    revealGate,
    isProgrammaticFollowActive,
    showLoadOlderButton,
    onLoadOlder,
    turnIds,
    activeTurnId,
    onSelectTurn,
    showPromptNavigator,
    canLoadEarlierPrompts,
    isLoadingOlderPrompts,
    onLoadEarlierPrompts,
}: ChatViewportProps) => {
    const { t } = useI18n();
    const session = React.useMemo<ChatColumnSession>(() => ({
        sessionId: currentSessionId,
        directory: directory ?? null,
    }), [currentSessionId, directory]);
    const registerSessionList = React.useCallback((list: TimelineListHandle | null) => {
        registerList(list, currentSessionKey);
    }, [currentSessionKey, registerList]);
    const showingTranscript = placeholder === undefined;
    const promptPreviewsByTurnIdRef = React.useRef<Map<string, Part[]>>(new Map());
    const promptPreviewsByTurnId = React.useMemo(() => {
        const next = buildPromptPreviewsByTurnId(renderedMessages);
        const prev = promptPreviewsByTurnIdRef.current;
        if (prev.size === next.size) {
            let unchanged = true;
            for (const [id, parts] of next) {
                if (prev.get(id) !== parts) {
                    unchanged = false;
                    break;
                }
            }
            if (unchanged) {
                return prev;
            }
        }
        promptPreviewsByTurnIdRef.current = next;
        return next;
    }, [renderedMessages]);
    // Only real (non-synthetic) prompts become rail entries; selection still
    // targets the same turn anchors as the timeline.
    const promptTurnIds = React.useMemo(
        () => turnIds.filter((id) => promptPreviewsByTurnId.has(id)),
        [promptPreviewsByTurnId, turnIds],
    );
    // If the viewport sits in a filtered-out (synthetic) turn, treat the
    // nearest preceding real prompt as active so the rail doesn't jump.
    const railActiveTurnId = React.useMemo(() => {
        if (!activeTurnId || promptPreviewsByTurnId.has(activeTurnId)) {
            return activeTurnId;
        }
        const activeIndex = turnIds.indexOf(activeTurnId);
        for (let index = activeIndex - 1; index >= 0; index -= 1) {
            const turnId = turnIds[index];
            if (promptPreviewsByTurnId.has(turnId)) {
                return turnId;
            }
        }
        return null;
    }, [activeTurnId, promptPreviewsByTurnId, turnIds]);
    const focusScrollContainer = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
        if (event.defaultPrevented || shouldIgnoreChatNavigationTarget(event.target)) {
            return;
        }

        if (typeof window !== 'undefined' && window.getSelection()?.type === 'Range') {
            return;
        }

        scrollRef.current?.focus({ preventScroll: true });
    }, [scrollRef]);

    // Everything that used to sit beside the list inside the scroll container
    // now renders as the list's header/footer, so it keeps scrolling with the
    // rows exactly as before.
    //
    // The header is a fixed-height slot that is always there, button or not.
    // A header that came and went with history coverage changed the height
    // above the rows, and a reader on the end saw the whole transcript jump
    // by it (after a revert, mid-send). Only the button inside it toggles.
    const listHeader = React.useMemo(() => (
        <div className="flex h-12 items-center justify-between px-3 pt-3 pb-1">
            {showLoadOlderButton ? (
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onLoadOlder}
                    disabled={isLoadingOlder}
                >
                    {isLoadingOlder && (
                        <Icon name="loader-4" className="size-4 animate-spin" />
                    )}
                    {t('chat.history.loadOlder')}
                </Button>
            ) : <span />}
            <TelegramSessionButton sessionId={currentSessionId} directory={directory} />
        </div>
    ), [currentSessionId, directory, isLoadingOlder, onLoadOlder, showLoadOlderButton, t]);

    const listFooter = React.useMemo(() => (
        <>
            {/* Permissions and forms dock above the composer (`PermissionDock`, `FormDock`). */}
            <SessionErrorNotice sessionId={currentSessionId} directory={directory} />

            {/* Tail spacer. With a floating composer it reserves the band the
                composer covers, plus any panel docked above it (queue, BTW),
                so the end of the transcript stays readable above them; the
                extra gap is the breathing room between the last row and the
                top edge of whatever floats. Both heights come from CSS
                variables written straight by observers (the composer's onto
                this element itself, see composerInsetReaders), so a growing
                composer or panel resizes the footer without a list re-render;
                the list's own footer observer then extends the content.
                While the session works, the composer gets no growth
                allowance: the status row and the live end fade sit in the
                gap, so a composer grown into it (a background command, a
                queued message) left the last line under the row. */}
            <div
                ref={registerComposerInsetReader}
                className="relative flex-shrink-0"
                style={{
                    height: floatingComposer
                        ? `calc(${sessionIsWorking
                            ? `max(var(--chat-composer-tail-inset, ${FLOATING_COMPOSER_DEFAULT_TAIL_INSET_PX}px), var(--chat-composer-inset, 0px) + ${FLOATING_COMPOSER_GAP_PX}px)`
                            : `var(--chat-composer-tail-inset, ${FLOATING_COMPOSER_DEFAULT_TAIL_INSET_PX}px)`} + var(--chat-floating-panel-clearance, 0px))`
                        : (isMobile ? '40px' : '10vh'),
                }}
            >
                {/* The recap of the latest answer lies at the top of this band,
                    right under the answer's footer: it takes no room, so its
                    arrival and leaving move nothing. Rows of the list paint
                    only inside their own box (`contain: paint`), so it lives
                    here rather than in the answer's row. It goes once a new
                    prompt makes the session busy, and while the composer grows
                    into the band or a panel docks over it (design-system.css). */}
                {floatingComposer && currentSessionId ? (
                    <div className="oc-recap-hint pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-300 ease-out">
                        <div className="chat-message-column">
                            <SessionRecapNote sessionId={currentSessionId} directory={directory} isMobile={isMobile} />
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    ), [currentSessionId, directory, floatingComposer, isMobile, sessionIsWorking]);

    const endFadeStyle: React.CSSProperties & Record<'--chat-status-row-clearance', string> = {
        '--chat-status-row-clearance': `${statusRowClearance}px`,
    };

    // Opening a session paints the timeline as one finished picture: the root
    // stays invisible only until the viewport is in place (the scroll hook's
    // hold) and the list's measured heights settle, then everything appears
    // together. Markdown does not hold it: its first paint already has the
    // final geometry and highlighting only recolours code. A session the user
    // waited for fades in once as a whole.
    const timelineRootRef = React.useRef<HTMLDivElement | null>(null);
    const endPinningReleasedRef = React.useRef(endPinningReleased);
    endPinningReleasedRef.current = endPinningReleased;
    // Read through a ref: the effect runs once per gate (per opened session).
    // `revealWaited` flips for the session still on screen the moment another
    // one is selected — before the deferred swap mounts it — and re-running
    // the effect then would hide the outgoing timeline for the frames until
    // the new one arrives.
    const revealWaitedRef = React.useRef(revealWaited);
    revealWaitedRef.current = revealWaited;
    React.useLayoutEffect(() => {
        const root = timelineRootRef.current;
        if (!root || !showingTranscript) return;
        root.setAttribute('data-timeline-reveal', 'pending');
        let finished = false;
        let timer: number | null = null;
        let frame: number | null = null;
        let fadeTimer: number | null = null;
        // Revealed once the geometry has settled: after the last hold the
        // list still lays rows out from its own measurements over a few
        // frames, so the timeline stays hidden — pinned to the end on every
        // frame — until the content height has held still for two frames,
        // then shows already sitting on the end. The settle is bounded so a
        // list that keeps growing (images, late tool output) still appears.
        const reveal = (fade: boolean) => {
            if (finished) return;
            finished = true;
            if (timer !== null) window.clearTimeout(timer);
            const startedAt = performance.now();
            let lastHeight = -1;
            let stableFrames = 0;
            const settle = () => {
                frame = null;
                const node = scrollRef.current;
                let height = -1;
                if (node) {
                    height = node.scrollHeight;
                    if (!endPinningReleasedRef.current) {
                        const end = height - node.clientHeight;
                        if (end - node.scrollTop > 1) node.scrollTop = end;
                    }
                }
                stableFrames = height === lastHeight ? stableFrames + 1 : 0;
                lastHeight = height;
                if (stableFrames < TIMELINE_SETTLE_STABLE_FRAMES && performance.now() - startedAt < TIMELINE_SETTLE_CAP_MS) {
                    frame = window.requestAnimationFrame(settle);
                    return;
                }
                if (!fade) {
                    root.removeAttribute('data-timeline-reveal');
                    return;
                }
                root.setAttribute('data-timeline-reveal', 'fading');
                // The fade is a filled opacity animation, and a filled
                // animation keeps the root a stacking context for as long
                // as the attribute stays. That would trap the overlay
                // scrollbar (z-30) under the composer slot (z-10): the thumb
                // paints over the composer band but cannot be grabbed there.
                // Drop the attribute once the fade has run (or immediately
                // under reduced motion, where the animation never fires).
                const clearFade = (event?: AnimationEvent) => {
                    // Child entrance animations bubble here too.
                    if (event && event.target !== root) return;
                    if (fadeTimer !== null) window.clearTimeout(fadeTimer);
                    fadeTimer = null;
                    root.removeEventListener('animationend', clearFade);
                    root.removeAttribute('data-timeline-reveal');
                };
                root.addEventListener('animationend', clearFade);
                fadeTimer = window.setTimeout(clearFade, TIMELINE_REVEAL_FADE_MS * 2);
            };
            frame = window.requestAnimationFrame(settle);
        };
        // Holds are taken in layout effects, including those of rows the list
        // mounts in a nested synchronous pass; a microtask runs after all of
        // them and still before the browser paints this commit.
        queueMicrotask(() => {
            if (finished) return;
            revealGate.close();
            if (revealGate.holds === 0) {
                reveal(revealWaitedRef.current);
                return;
            }
            revealGate.onEmpty = () => reveal(true);
            timer = window.setTimeout(() => reveal(true), revealGate.capMs);
        });
        return () => {
            finished = true;
            if (timer !== null) window.clearTimeout(timer);
            if (frame !== null) window.cancelAnimationFrame(frame);
            if (fadeTimer !== null) window.clearTimeout(fadeTimer);
            revealGate.onEmpty = null;
        };
    }, [revealGate, scrollRef, showingTranscript]);

    const scrollContainerProps = React.useMemo(() => ({
        className: 'absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target',
        style: CHAT_SCROLL_STYLE,
        tabIndex: 0,
        onClick: focusScrollContainer,
        'data-scrollbar': 'chat',
        'data-scroll-shadow': 'true',
        'data-orientation': 'vertical',
    }), [focusScrollContainer]);

    return (
        <>
            {placeholder}
            <div
                className={cn(
                    'relative min-h-0',
                    isDesktopExpandedInput
                        ? 'absolute inset-0 opacity-0 pointer-events-none'
                        : 'flex-1',
                )}
                ref={timelineRootRef}
                style={showingTranscript ? undefined : { display: 'none' }}
                aria-hidden={isDesktopExpandedInput}
            >
                <div className="absolute inset-0">
                    {/* Retained by session ID: the session key also holds the
                        directory, which settles after the session opens, and
                        a key change left a hidden second copy of the open
                        session. The list still remounts on a key change. */}
                    <KeepAlive
                        key={getRuntimeKey()}
                        cacheKey={showingTranscript ? currentSessionId : null}
                        capacity={retainedTimelines()}
                        onBeforeHide={captureOutgoingPosition}
                    >
                        <ChatColumnSessionContext.Provider value={session}>
                            <MessageList
                                key={currentSessionKey}
                                ref={messageListRef}
                                sessionKey={currentSessionId}
                                messages={renderedMessages}
                                sessionIsWorking={sessionIsWorking}
                                activeStreamingMessageId={streamingMessageId}
                                activeStreamingPhase={activeStreamingPhase}
                                retryOverlay={retryOverlay}
                                isLoadingOlder={isLoadingOlder}
                                scrollToBottom={scrollToBottom}
                                endPinningReleased={endPinningReleased}
                                directory={directory}
                                registerList={registerSessionList}
                                // The footer already reserves the composer's band.
                                composerOverlayHeight={0}
                                onIsAtEndChange={onIsAtEndChange}
                                onListMetricsChange={onListMetricsChange}
                                onTimelineDataChange={onTimelineDataChange}
                                listHeader={listHeader}
                                listFooter={listFooter}
                                scrollContainerProps={scrollContainerProps}
                            />
                        </ChatColumnSessionContext.Provider>
                    </KeepAlive>
                    {/* The transcript's edge fades must follow the scroller. */}
                    <div aria-hidden="true" className="chat-scroll-fade chat-scroll-fade--top" />
                    <div
                        ref={registerComposerInsetReader}
                        aria-hidden="true"
                        className="chat-scroll-fade chat-scroll-fade--end"
                        style={endFadeStyle}
                    />
                    <OverlayScrollbar
                        containerRef={scrollRef}
                        disableHorizontal
                        suppressVisibility={isProgrammaticFollowActive}
                        userIntentOnly
                        observeMutations={false}
                        onThumbDragStart={onScrollbarDrag}
                    />
                    {/* From three turns: with one or two its mark read as a stray dash. */}
                    {showPromptNavigator && promptTurnIds.length >= 3 ? (
                        <PromptNavigatorRail
                            sessionId={currentSessionId}
                            directory={directory}
                            turnIds={promptTurnIds}
                            previewsByTurnId={promptPreviewsByTurnId}
                            activeTurnId={railActiveTurnId}
                            onSelectTurn={onSelectTurn}
                            canLoadEarlier={canLoadEarlierPrompts}
                            isLoadingOlder={isLoadingOlderPrompts}
                            onLoadEarlier={onLoadEarlierPrompts}
                        />
                    ) : null}
                </div>
            </div>
        </>
    );
}, (prev, next) => {
    return prev.currentSessionId === next.currentSessionId
        && prev.placeholder === next.placeholder
        && prev.currentSessionKey === next.currentSessionKey
        && prev.isDesktopExpandedInput === next.isDesktopExpandedInput
        && prev.isMobile === next.isMobile
        && prev.floatingComposer === next.floatingComposer
        && prev.statusRowClearance === next.statusRowClearance
        && prev.directory === next.directory
        && prev.scrollRef === next.scrollRef
        && prev.messageListRef === next.messageListRef
        && prev.renderedMessages === next.renderedMessages
        && prev.isLoadingOlder === next.isLoadingOlder
        && prev.sessionIsWorking === next.sessionIsWorking
        && prev.streamingMessageId === next.streamingMessageId
        && prev.activeStreamingPhase === next.activeStreamingPhase
        && prev.retryOverlay === next.retryOverlay
        && prev.scrollToBottom === next.scrollToBottom
        && prev.onScrollbarDrag === next.onScrollbarDrag
        && prev.onListMetricsChange === next.onListMetricsChange
        && prev.endPinningReleased === next.endPinningReleased
        && prev.revealWaited === next.revealWaited
        && prev.revealGate === next.revealGate
        && prev.isProgrammaticFollowActive === next.isProgrammaticFollowActive
        && prev.showLoadOlderButton === next.showLoadOlderButton
        && prev.onLoadOlder === next.onLoadOlder
        && prev.turnIds === next.turnIds
        && prev.activeTurnId === next.activeTurnId
        && prev.onSelectTurn === next.onSelectTurn
        && prev.showPromptNavigator === next.showPromptNavigator
        && prev.canLoadEarlierPrompts === next.canLoadEarlierPrompts
        && prev.isLoadingOlderPrompts === next.isLoadingOlderPrompts
        && prev.onLoadEarlierPrompts === next.onLoadEarlierPrompts;
});

ChatViewport.displayName = 'ChatViewport';

const HYDRATING_SKELETON_ITEMS: Array<{
    id: number;
    toolRows: HydratingToolSkeletonRow[];
    textWidths: [string, string, string];
}> = [
    {
        id: 1,
        toolRows: [
            { id: 'search', titleWidth: 'w-24', detailWidth: 'w-52' },
            { id: 'read', titleWidth: 'w-20', detailWidth: 'w-36' },
            { id: 'edit', titleWidth: 'w-24', detailWidth: 'w-64' },
        ],
        textWidths: ['w-24', 'w-[92%]', 'w-[78%]'],
    },
    {
        id: 2,
        toolRows: [
            { id: 'read', titleWidth: 'w-20', detailWidth: 'w-40' },
            { id: 'search', titleWidth: 'w-24', detailWidth: 'w-48' },
        ],
        textWidths: ['w-20', 'w-[88%]', 'w-[70%]'],
    },
    {
        id: 3,
        toolRows: [
            { id: 'shell', titleWidth: 'w-28', detailWidth: 'w-44' },
            { id: 'edit', titleWidth: 'w-24', detailWidth: 'w-56' },
        ],
        textWidths: ['w-24', 'w-[84%]', 'w-[64%]'],
    },
];

// Session messages loading. The wait can last minutes while OpenCode fails to
// start, so the rows blink on the shared 1 s tick instead of pulsing, and stand
// still while hidden behind the expanded composer.
const HydrationSkeleton: React.FC<{ waiting: boolean }> = ({ waiting }) => {
    const blink = useWaitingBlink(waiting);
    return (
        <div className={cn('space-y-4', blink)}>
            {HYDRATING_SKELETON_ITEMS.map((item) => (
                <div key={item.id} className="group w-full">
                    <div className="chat-message-column">
                        <div className="space-y-2.5 px-4 py-3">
                            <div className="space-y-1.5">
                                {item.toolRows.map((row) => (
                                    <div key={`${item.id}-${row.id}`} className="flex items-center gap-2">
                                        <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                                        <Skeleton className={cn('h-4 rounded-md', row.titleWidth)} />
                                        <Skeleton className={cn('h-4 rounded-md', row.detailWidth)} />
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-1.5 pt-1">
                                {item.textWidths.map((width, index) => (
                                    <Skeleton key={`${item.id}-text-${index}`} className={cn('h-4 rounded-md', width)} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// `onStop` is set while a subagent's turn runs: its session takes no
// prompts, but the user can still stop it from here.
const ReadOnlyPromptBanner: React.FC<{ text: string; onStop?: () => void; stopLabel?: string }> = ({ text, onStop, stopLabel }) => (
    <div className="w-full py-3" data-composer-transient="">
        <div className="chat-input-column">
            <div className="flex items-center gap-2 rounded-2xl border border-edge bg-[var(--surface-background)] px-4 py-3 typography-ui-label text-muted-foreground">
                <span className="min-w-0 flex-1 text-center">{text}</span>
                {onStop ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="-my-1.5 -me-2 shrink-0 text-[var(--status-error)] hover:text-[var(--status-error)]"
                                onClick={onStop}
                                aria-label={stopLabel}
                            >
                                <StopIcon className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>{stopLabel}</TooltipContent>
                    </Tooltip>
                ) : null}
            </div>
        </div>
    </div>
);

const getProjectDisplayLabel = (project: { label?: string; path: string }): string => {
    const label = project.label?.trim();
    return label || formatDirectoryName(project.path);
};

const renderDraftTitle = (title: string, projectLabel: string | null): React.ReactNode => {
    if (!projectLabel) return title;
    const projectIndex = title.indexOf(projectLabel);
    if (projectIndex === -1) return title;

    return (
        <>
            {title.slice(0, projectIndex)}
            <DraftProjectName label={projectLabel} />
            {title.slice(projectIndex + projectLabel.length)}
        </>
    );
};

const DraftWelcome: React.FC<{ exiting?: boolean }> = ({ exiting = false }) => {
    const draftTarget = useSessionUIStore((state) => state.newSessionDraft.target);
    const selectedProjectId = useSessionUIStore((state) => state.newSessionDraft.selectedProjectId ?? null);
    const projectLabel = useProjectsStore(React.useCallback((state) => {
        if (draftTarget === 'chat') return null;
        const projectId = selectedProjectId ?? state.activeProjectId;
        const project = (projectId
            ? state.projects.find((candidate) => candidate.id === projectId)
            : null) ?? state.projects[0] ?? null;
        return project ? getProjectDisplayLabel(project) : null;
    }, [draftTarget, selectedProjectId]));
    const draftHeading = useDraftHeading(projectLabel);

    return (
        <div className={cn(
            'oc-draft-center flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center transition-opacity duration-[120ms] ease-out motion-reduce:transition-none',
            exiting && 'pointer-events-none opacity-0',
        )}>
            <h1 className="text-balance text-3xl font-normal tracking-tight text-foreground">
                {renderDraftTitle(draftHeading, projectLabel)}
            </h1>
            <DraftPresetChips
                onSubmit={(starter) => useInputStore.getState().requestPresetSubmit(starter.submitText, starter.ref.type)}
                className="oc-draft-starters mt-8 max-w-md"
            />
        </div>
    );
};

type ChatContainerProps = {
    active?: boolean;
    autoOpenDraft?: boolean;
    readOnly?: boolean;
    pinnedSession?: { sessionId: string; directory: string | null };
    registerParentSessionBack?: (handler: (() => void) | null) => void;
};

const selectSessionLastIdleAt = (session: Session | undefined): number | null => session?.time.idle ?? null;

export const ChatContainer: React.FC<ChatContainerProps> = ({
    active = true,
    autoOpenDraft: autoOpenDraftProp = true,
    readOnly = false,
    pinnedSession,
    registerParentSessionBack,
}) => {
    const { t } = useI18n();
    const {
        pinned,
        autoOpenDraft,
        pinnedOrigin,
        setPinnedSelection,
        liveSessionId,
        materializedDraftSessionId,
        currentSessionId,
        currentSessionDirectory,
    } = useChatColumnSelection({ pinnedSession, autoOpenDraft: autoOpenDraftProp });

    const clearMaterializedDraftSession = useSessionUIStore((s) => s.clearMaterializedDraftSession);
    const newSessionDraft = useSessionUIStore((s) => s.newSessionDraft);

    const {
        sync,
        effectiveSessionDirectory,
        messageLoader,
        currentSessionKey,
        revealGate,
        chatColumnSession,
        ensureSessionRenderable,
        loadMoreMessages,
    } = useChatColumnScope({ pinned, currentSessionId, currentSessionDirectory });
    const mobileCommentComposer = useMobileCommentComposerOwner();

    const isExpandedInput = useUIStore((state) => (pinned ? false : state.isExpandedInput));
    const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);
    const promptNavigatorEnabled = useUIStore((state) => state.promptNavigatorEnabled);
    const allowPromptingSubagentSessions = useUIStore((state) => state.allowPromptingSubagentSessions);
    const chatFontSize = useUIStore((state) => state.chatFontSize);
    // The chat's own text size, on top of the interface size: the semantic
    // text variables are redefined for this column only (as FilesView does
    // for its preview), so the sidebar keeps the interface size.
    // SAFETY: CSS custom properties are valid inline styles; React's type lists only standard ones.
    const chatTypographyStyle = React.useMemo(() => getScaledTypographyStyle(
        chatFontSize,
        isVSCodeRuntime() ? VSCODE_TYPOGRAPHY : SEMANTIC_TYPOGRAPHY,
    ) as React.CSSProperties | undefined, [chatFontSize]);
    // The timeline dialog of the main chat is app state (a global shortcut
    // opens it); a pinned column keeps its own.
    const globalTimelineDialogOpen = useUIStore((s) => s.isTimelineDialogOpen);
    const setGlobalTimelineDialogOpen = useUIStore((s) => s.setTimelineDialogOpen);
    const [pinnedTimelineDialogOpen, setPinnedTimelineDialogOpen] = React.useState(false);
    const isTimelineDialogOpen = pinned ? pinnedTimelineDialogOpen : globalTimelineDialogOpen;
    const setTimelineDialogOpen = pinned ? setPinnedTimelineDialogOpen : setGlobalTimelineDialogOpen;
    const columnRootRef = React.useRef<HTMLDivElement | null>(null);
    const pinnedColumnActions = React.useMemo<ChatColumnActions | null>(() => (pinned ? {
        pinned: true,
        openSession: (sessionId, directory) => setPinnedSelection({ sessionId, directory }),
        openTimelineDialog: () => setPinnedTimelineDialogOpen(true),
        focusInput: () => columnRootRef.current?.querySelector<HTMLElement>(CHAT_INPUT_EDITOR_SELECTOR)?.focus(),
    } : null), [pinned]);
    const inheritedColumnActions = useChatColumnActions();
    const columnActions = pinnedColumnActions ?? inheritedColumnActions;

    // Streaming state
    const streamingMessageId = useStreamingStore(
        React.useCallback(
            (s) => (currentSessionId ? s.streamingMessageIds.get(currentSessionId) ?? null : null),
            [currentSessionId],
        ),
    );
    const activeStreamingPhase = useStreamingStore(
        React.useCallback(
            (s) => {
                if (!streamingMessageId) return null;
                return s.messageStreamStates.get(streamingMessageId)?.phase ?? null;
            },
            [streamingMessageId],
        ),
    );
    const hasRenderableSessionSnapshot = useSessionRenderable(currentSessionId ?? '', effectiveSessionDirectory);
    const isPageWaiting = useIsPageWaiting(currentSessionId);
    // Messages from sync system. Only the live tail overlays a suspended
    // message's newest parts, so a page held back in its record is lost to
    // whatever reads the record: an opened Activity builds its rows from it.
    // Nothing is suspended while a call waits for the user.
    const suspendedMessageId = isPageWaiting ? null : streamingMessageId;
    const sessionMessageRecords = useSessionMessageRecords(currentSessionId ?? '', effectiveSessionDirectory, {
        enabled: active,
        suspendPartUpdates: Boolean(suspendedMessageId),
        suspendPartUpdatesForMessageId: suspendedMessageId,
    });

    const {
        streamingMessageId,
        activeStreamingPhase,
        hasRenderableSessionSnapshot,
        sessionMessages,
        sessionMessageLoadState,
        historyMeta,
    } = useColumnMessages({ active, currentSessionId, currentSessionKey, effectiveSessionDirectory });
    const { sessionStatusForCurrent, sessionPermissions, sessionIsWorking } = useColumnSessionActivity({
        active,
        currentSessionId,
        effectiveSessionDirectory,
    );
    // The messages of a space's session live inside the space: while it is stopped, gone or out
    // of reach a load only waits for its timeout, so the chat holds it and says why instead.
    const spaceStopped = useSpaceDirectoryStopped(effectiveSessionDirectory);
    const [firstVisiblePerformance] = React.useState(createFirstVisibleSessionPerformanceTracker);

    React.useEffect(() => {
        if (!active || !currentSessionKey || !hasRenderableSessionSnapshot || sessionMessages.length === 0) return;
        return firstVisiblePerformance.schedule(currentSessionKey, sessionMessages.length);
    }, [active, currentSessionKey, firstVisiblePerformance, hasRenderableSessionSnapshot, sessionMessages.length]);

    // Session status from sync system
    const sessionStatusForCurrent = useSessionStatus(currentSessionId ?? '', effectiveSessionDirectory) ?? IDLE_SESSION_STATUS;
    const statusSnapshotReady = useSessionStatusSnapshotReady(effectiveSessionDirectory, currentSessionId ?? '');

    // Scoped blocking requests — only subscribe to permissions/forms for
    // the current session + descendant subagent sessions, not all sessions in
    // the directory.
    const sessionPermissions = useScopedBlockingPermissions(currentSessionId, effectiveSessionDirectory);
    const sessionForms = useScopedBlockingForms(currentSessionId, effectiveSessionDirectory);

    const hasUnreconciledFormTool = React.useMemo(
        () => !sessionForms.some((form) => form.sessionID === currentSessionId)
            && hasActiveFormToolInCurrentTurn(sessionMessages),
        [currentSessionId, sessionMessages, sessionForms],
    );

    React.useEffect(() => {
        if (!active || !currentSessionId || !effectiveSessionDirectory || !hasUnreconciledFormTool) return;
        let cancelled = false;

        void recoverPendingFormWithRetry(
            () => sync.recoverPendingQuestions(currentSessionId, effectiveSessionDirectory),
            { isCancelled: () => cancelled },
        );

        return () => {
            cancelled = true;
        };
    }, [active, currentSessionId, effectiveSessionDirectory, hasUnreconciledFormTool, sync]);

    const sessionIsWorking = React.useMemo(() => {
        if (!currentSessionId || sessionPermissions.length > 0 || sessionForms.length > 0) {
            return false;
        }

        const statusType = sessionStatusForCurrent.type ?? 'idle';
        if (statusType === 'busy' || statusType === 'retry') {
            return true;
        }

        // No status once the directory's snapshot has landed is idle, as in
        // `useSessionActivity`: a turn OpenCode was stopped under stays incomplete.
        if (sessionStatusForCurrent === IDLE_SESSION_STATUS && statusSnapshotReady) {
            return false;
        }

        // The last record can be a synthetic/skill/shell/switch message; the
        // turn is still running only per the last conversation message.
        return isIncompleteAssistantTurn(getLastConversationRecord(sessionMessages)?.info);
    }, [currentSessionId, sessionMessages, sessionPermissions.length, sessionForms.length, sessionStatusForCurrent, statusSnapshotReady]);

    const latestCompletedReply = React.useMemo(
        () => findLatestCompletedReply(sessionMessages),
        [sessionMessages],
    );
    const autoReadAloudEnabled = useConfigStore((state) => state.autoReadAloudEnabled);
    // Use the reply's own message id as the reading key so the message
    // button shows the auto-started reading as playing and can stop it.
    const { play: playAutoReadAloud } = useMessageTTS(latestCompletedReply?.messageId);
    // Permission prompts pause `sessionIsWorking` while the turn is still
    // running, so status also marks the session as active for the auto-read
    // baseline.
    const sessionIsActive = sessionIsWorking
        || sessionStatusForCurrent.type === 'busy'
        || sessionStatusForCurrent.type === 'retry';
    useAutoReadAloud({
        sessionKey: currentSessionKey ?? '',
        ready: hasRenderableSessionSnapshot && sessionMessageLoadState.status === 'ready',
        sessionIsActive,
        reply: latestCompletedReply,
        history: sessionMessages,
        olderCompletedReplyIds: sessionMessageLoadState.olderCompletedReplyIds,
        enabled: autoReadAloudEnabled && !pinned,
        play: playAutoReadAloud,
    });
    const lastIdleAt = useSessionSelector(currentSessionId, effectiveSessionDirectory, selectSessionLastIdleAt);
    useColumnAutoReadAloud({
        pinned,
        currentSessionKey,
        ready: hasRenderableSessionSnapshot && sessionMessageLoadState.status === 'ready',
        sessionIsWorking,
        sessionStatusType: sessionStatusForCurrent.type,
        sessionMessages,
        olderCompletedReplyIds: sessionMessageLoadState.olderCompletedReplyIds,
    });
    const retryOverlay = useRetryOverlay(currentSessionId, sessionStatusForCurrent, lastIdleAt);

    const { isMobile } = useDeviceInfo();
    const isVSCode = isVSCodeRuntime();
    const chatSurfaceMode = useChatSurfaceMode();
    const draftOpen = !pinned && Boolean(newSessionDraft?.open);
    const initError = useGlobalSyncStore((s) => s.error);
    const isDesktopExpandedInput = isExpandedInput;
    const useCompactDraftLayout = isMobile || isVSCode || chatSurfaceMode === 'mini-chat';
    const {
        attachColumnRoot,
        isManagedChatContext,
        workStatusDirectory,
        workStatusPanelMountable,
        showWorkStatusPanel,
        workStatusHost,
        workStatusOverlayMountable,
        showWorkStatusOverlay,
        workStatusReserved,
        workStatusRoomyBesidePanel,
    } = useWorkStatusPlacement({
        pinned,
        isMobile,
        isVSCode,
        chatSurfaceMode,
        draftOpen,
        newSessionDraft,
        effectiveSessionDirectory,
        columnRootRef,
    });
    const attachColumnRoot = React.useCallback((node: HTMLDivElement | null) => {
        columnRootRef.current = node;
        workStatusRowRef(node);
    }, [workStatusRowRef]);
    // Surfaces that never host the panel skip it entirely; the rest keep it
    // mounted so its visibility can animate rather than snap.
    // A pinned column leaves the panel, and the app-wide flags below, to the
    // main chat.
    const workStatusPanelMountable = !isMobile
        && !pinned
        && chatSurfaceMode !== 'mini-chat';
    const showWorkStatusPanel = workStatusPanelMountable && workStatusVisible;
    // The inline card renders in the right slot beside the chat, which owns
    // the one width animation for the card and the context panel together
    // (components/layout/rightSlot.ts).
    const workStatusHost = useRightSlotStore((state) => state.workStatusHost);

    // Offered over the chat when there is no room beside it. The panel is still
    // switched on; only the layout refuses it.
    const workStatusPanelEnabled = useUIStore((state) => state.workStatusPanelEnabled);
    const workStatusOverlayOpen = useUIStore((state) => state.workStatusOverlayOpen);
    const setWorkStatusPanelFits = useUIStore((state) => state.setWorkStatusPanelFits);
    // Mounted whenever it could be shown, not only while it is: an element
    // that appears and disappears with the condition has nothing to animate.
    const workStatusOverlayMountable = workStatusPanelMountable
        && workStatusPanelEnabled
        && !workStatusFits;
    // The slot keeps the card's column while the context panel covers it.
    const workStatusReserved = workStatusPanelMountable && workStatusPanelEnabled && workStatusRoomy;
    const showWorkStatusOverlay = workStatusOverlayMountable && workStatusOverlayOpen;

    React.useEffect(() => {
        if (pinned) return;
        setWorkStatusPanelFits(workStatusPanelMountable && workStatusFits);
        return () => setWorkStatusPanelFits(false);
    }, [pinned, setWorkStatusPanelFits, workStatusFits, workStatusPanelMountable]);

    // Published so the header can drop the readouts the panel already carries.
    // Cleared on unmount: a chat that goes away is not showing anything.
    const setWorkStatusPanelVisible = useUIStore((state) => state.setWorkStatusPanelVisible);
    React.useEffect(() => {
        if (pinned) return;
        setWorkStatusPanelVisible(showWorkStatusPanel);
        return () => setWorkStatusPanelVisible(false);
    }, [pinned, setWorkStatusPanelVisible, showWorkStatusPanel]);
    const messageListRef = React.useRef<MessageListHandle | null>(null);

    const hideReturnToParent = pinned && currentSessionId === pinnedOrigin?.sessionId;

    const openColumnSession = columnActions.openSession;
    const handleReturnToParentSession = React.useCallback(() => {
        if (!parentSession) return;
        const parentDirectory = (parentSession as Session & { directory?: string | null }).directory ?? null;
        openColumnSession(parentSession.id, parentDirectory);
    }, [openColumnSession, parentSession]);

    const returnToParentButton = parentSession && !hideReturnToParent ? (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleReturnToParentSession}
                    className="absolute inset-s-3 top-3 z-20 !font-normal bg-[var(--surface-background)]/95"
                    aria-label={t('chat.container.returnToParent.aria')}
                >
                    <Icon name="arrow-left" className="h-4 w-4" />
                    {t('chat.container.returnToParent.label')}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
                {parentSession.title?.trim()
                    ? t('chat.container.returnToParent.titleNamed', { title: parentSession.title })
                    : t('chat.container.returnToParent.title')}
            </TooltipContent>
        </Tooltip>
    ) : null;
    // A chat of a deleted isolated space is on the Archive page and read-only; the server refuses
    // to run it whatever the screen shows. Its directory is the archive's own, and the list of
    // archives is read once per runtime. A draft opened after such a chat still sits in the
    // archive's directory until it is sent, and is not read-only: it is a new chat.
    React.useEffect(() => {
        ensureSpaceArchives();
    }, []);
    const spaceArchive = useSpaceArchiveOf(currentSessionId ? effectiveSessionDirectory : null);
    const promptReadOnly = spaceArchive !== null || resolveChatPromptReadOnly(
        currentSession,
        allowPromptingSubagentSessions,
        readOnly,
    });
    useAutoOpenDraft({ autoOpenDraft, liveSessionId, draftOpen });

    const { composerOverlayHeight, onStatusOverlayNode } = useStatusOverlayHeight();
    const {
        scrollRef,
        scrollNode,
        registerList,
        captureOutgoingPosition,
        onIsAtEndChange,
        onListMetricsChange,
        onManualNavigation,
        restoreSnapshot,
        onTimelineDataChange,
        goToBottom,
        scrollToBottomOnSend,
        isPinned,
        isFollowingProgrammatically,
        showScrollButton,
        userOwnsScroll,
        nearContentStart,
        activeTurnChangeRef,
        loadHistoryUntilMessageRef,
        currentSessionKeyRef,
        checkLinkedMessage,
        handleLinkedMessageMissing,
    } = useColumnTimelineScroll({
        pinned,
        currentSessionId,
        currentSessionKey,
        effectiveSessionDirectory,
        composerOverlayHeight,
        messageListRef,
        sessionIsWorking,
        pinned,
        revealGate,
    });

    // ── in-conversation search ──────────────────────────────────────────────
    // Cmd+F belongs to whatever has focus: the editor keeps its own search,
    // the chat (its composer, or nothing focused after clicking its text)
    // opens this bar. With several chat columns on screen, an unfocused
    // Cmd+F goes to the column the pointer last pressed in. Search is opt-in;
    // while it is off the shortcut is left alone. VS Code has no OpenChamber
    // server and so no index to search.
    const chatRootRef = React.useRef<HTMLDivElement>(null);
    const lastPressedInsideRef = React.useRef(false);
    const [chatSearch, setChatSearch] = React.useState({ open: false, focusRequest: 0 });
    const [chatSearchSessionId, setChatSearchSessionId] = React.useState(currentSessionId);
    // The search belongs to the conversation it was opened in. Close it
    // synchronously on session switch: a passive effect would leave one
    // commit rendering the old hits under the new session id, and the bar
    // would re-issue message focus for the new session with the old hit's
    // id, ending in a "linked message not found" toast.
    if (chatSearchSessionId !== currentSessionId) {
        setChatSearchSessionId(currentSessionId);
        if (chatSearch.open) setChatSearch((current) => ({ ...current, open: false }));
    }
    const shortcutOverrides = useUIStore((state) => state.shortcutOverrides);
    const messageSearchEnabled = useUIStore((state) => state.messageSearchEnabled);
    React.useEffect(() => {
        if (!active || !currentSessionId || !messageSearchEnabled || isVSCodeRuntime()) return;
        const combo = getEffectiveShortcutCombo('find_in_file', shortcutOverrides);
        const onPointerDown = (event: PointerEvent) => {
            // SAFETY: a pointer event target inside the document is a Node.
            lastPressedInsideRef.current = Boolean(chatRootRef.current?.contains(event.target as Node));
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !eventMatchesShortcut(event, combo)) return;
            const root = chatRootRef.current;
            const focused = document.activeElement;
            const unfocused = !focused || focused === document.body;
            if (!root || (unfocused ? !lastPressedInsideRef.current : !root.contains(focused))) return;
            event.preventDefault();
            setChatSearch((current) => ({ open: true, focusRequest: current.focusRequest + 1 }));
        };
        document.addEventListener('pointerdown', onPointerDown, { capture: true });
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, { capture: true });
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [active, currentSessionId, messageSearchEnabled, shortcutOverrides]);
    const closeChatSearch = React.useCallback(() => {
        setChatSearch((current) => ({ ...current, open: false }));
    }, []);

    // A subagent report opens a turn of its own at the end of the chat only for
    // a `subagent: true` command; a call's report finishes that call's row
    // (see `ToolPart`), and a run started before the loaded history stays in
    // the session's subagent list, so the chat never shifts for either. A
    // command run from a code block of a reply shows in that block.
    const sessionStartTimes = useSessionStartTimes(effectiveSessionDirectory);
    const viewportMessages = React.useMemo(
        () => dropReplyCommandRows(keepCommandSubagentReports(sessionMessages, (childSessionID) => sessionStartTimes.get(childSessionID))),
        [sessionStartTimes, sessionMessages],
    );

    const timelineController = useChatTimelineController({
        sessionId: currentSessionId,
        sessionKey: currentSessionKey,
        messages: viewportMessages,
        historyMeta,
        sessionIsWorking,
        scrollRef,
        scrollNode,
        messageListRef,
        loadMoreMessages,
        goToBottom,
        onManualNavigation,
        isPinned,
        showScrollButton,
        nearContentStart,
        activeTurnChangeRef,
        loadHistoryUntilMessageRef,
    });
    const {
        chatQuoteHighlights,
        loadQuoteSource,
        scrollToQuoteSource,
        resolveUiPageMessageId,
        scrollToUiPageRow,
    } = useColumnQuoteNavigation({
        currentSessionKey,
        currentSessionKeyRef,
        messageListRef,
        onManualNavigation,
        controllerLoadHistoryUntilMessage,
        scrollToTimelineMessage: timelineController.scrollToMessage,
        checkLinkedMessage,
        handleLinkedMessageMissing,
    });
    const { navigation, handlePromptNavigatorSelect, canLoadEarlierPrompts, showPromptNavigator } = useColumnTurnNavigation({
        pinned,
        isMobile,
        chatSurfaceMode,
        isDesktopExpandedInput,
        currentSessionId,
        timelineController,
        scrollRef,
    });
    const { authSessionExpired, spaceStopped, isSessionHydrating, retrySessionLoad } = useColumnSessionLoad({
        active,
        currentSessionId,
        effectiveSessionDirectory,
        sync,
        ensureSessionRenderable,
        currentSessionKey,
        onManualNavigation,
        restoreSnapshot,
        hasRenderableSessionSnapshot,
        loadStatus: sessionMessageLoadState.status,
    });

    // A transcript someone works in keeps every turn it receives, and every
    // timeline pass walks all of them. When a turn starts or ends with the
    // reader at the end, the loader cuts what outgrew the cold-navigation
    // window back to it; the older turns load again on scroll, as in a freshly
    // opened session. Both edges count, since queued prompts and agent loops
    // start the next turn the moment one ends. The pause lets the send glide,
    // the turn's last block, its footer and the turn-end glide land first. A
    // reader away from the end holds the history, so another column showing
    // this session never cuts what they look at.
    // Prepending older turns must not re-arm the trim timer.
    const newestTurnId = timelineController.turnIds[timelineController.turnIds.length - 1] ?? null;
    const isPinnedRef = React.useRef(isPinned);
    isPinnedRef.current = isPinned;
    React.useEffect(() => {
        if (!active || !currentSessionId || !effectiveSessionDirectory) return;
        const timer = window.setTimeout(() => {
            if (!isPinnedRef.current) return;
            messageLoader.trimHistory({ directory: effectiveSessionDirectory, sessionID: currentSessionId });
        }, HISTORY_TRIM_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [active, currentSessionId, effectiveSessionDirectory, messageLoader, sessionIsWorking, newestTurnId]);
    React.useEffect(() => {
        if (isPinned || !currentSessionId || !effectiveSessionDirectory) return;
        return messageLoader.retainSessionHistory({ directory: effectiveSessionDirectory, sessionID: currentSessionId }, 'browsing');
    }, [currentSessionId, effectiveSessionDirectory, isPinned, messageLoader]);

    const handleHistoryScroll = timelineController.handleHistoryScroll;
    React.useEffect(() => {
        if (!scrollNode) return;
        const onScroll = () => handleHistoryScroll();
        scrollNode.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            scrollNode.removeEventListener('scroll', onScroll);
        };
    }, [handleHistoryScroll, scrollNode]);

    const resumeToLatestInstant = React.useCallback(() => {
        goToBottom('instant');
    }, [goToBottom]);

    // A window too short to scroll must stay manually pageable on every runtime.
    const showLoadOlderButton = timelineController.historySignals.canLoadEarlier && nearContentStart;
    const timelineLoadEarlier = timelineController.loadEarlier;
    const handleLoadOlderClick = React.useCallback(() => {
        // Loading older history is an explicit move INTO the past: release
        // live follow first, or the prepend's content growth would trigger an
        // end correction and throw the viewport to the bottom.
        onManualNavigation();
        void timelineLoadEarlier({ userInitiated: true });
    }, [onManualNavigation, timelineLoadEarlier]);

    React.useEffect(() => {
        activeTurnChangeRef.current = timelineController.handleActiveTurnChange;
    }, [timelineController.handleActiveTurnChange]);
    // Assigned during render: the entry restore runs in a layout effect of
    // this same commit, before passive effects could update the ref.
    const controllerLoadHistoryUntilMessage = timelineController.loadHistoryUntilMessage;
    loadHistoryUntilMessageRef.current = (messageId, maxBatches) => controllerLoadHistoryUntilMessage(messageId, { maxBatches });
    const chatQuoteHighlights = useChatQuoteHighlightStore();
    const loadQuoteSource = React.useCallback(async (messageId: string): Promise<boolean> => {
        return loadQuoteSourceMessage(messageId, {
            currentSessionKey,
            currentSessionKeyRef,
            onManualNavigation,
            loadHistoryUntilMessage: controllerLoadHistoryUntilMessage,
            checkLinkedMessage,
            onLinkedMessageMissing: handleLinkedMessageMissing,
        });
    }, [checkLinkedMessage, controllerLoadHistoryUntilMessage, currentSessionKey, handleLinkedMessageMissing, onManualNavigation]);
    const scrollToTimelineMessage = timelineController.scrollToMessage;
    const scrollToQuoteSource = React.useCallback(async (
        messageId: string,
        options?: { behavior?: ScrollBehavior },
    ): Promise<boolean> => {
        return scrollToQuoteSourceMessage(messageId, {
            currentSessionKey,
            currentSessionKeyRef,
            scrollToTimelineMessage,
            messageListRef,
            ...options,
        });
    }, [currentSessionKey, scrollToTimelineMessage]);
    const resolveUiPageMessageId = React.useCallback((messageId: string, partId: string) => (
        messageListRef.current?.resolveUiPageMessageId(messageId, partId) ?? messageId
    ), []);
    const scrollToUiPageRow = React.useCallback((messageId: string) => (
        messageListRef.current?.scrollToUiPageRow(messageId) ?? false
    ), []);

    const navigation = useChatTurnNavigation({
        sessionId: currentSessionId,
        turnIds: timelineController.turnIds,
        activeTurnId: timelineController.activeTurnId,
        scrollToTurn: timelineController.scrollToTurn,
        scrollToMessage: timelineController.scrollToMessage,
        resumeToBottom: timelineController.resumeToBottomInstant,
    });
    const scrollNodeRef = React.useMemo(() => ({ current: scrollNode }), [scrollNode]);
    useScrollShadow(scrollNodeRef, {
        observeMutations: false,
        hideTopShadow: isMobile && stickyUserHeader,
        hideBottomShadow: floatingComposer,
    });

    if (!currentSessionId && !draftOpen) {
        if (autoOpenDraft && !initError) {
            return <div className="flex h-full flex-col bg-background" />;
        }
        return (
            <div className="flex flex-col h-full bg-background">
                <ChatEmptyState />
            </div>
        );
    }

    const sessionPlaceholder = resolveSessionPlaceholder({
        t,
        draftOpen,
        draftPresentationExiting,
        useCompactDraftLayout,
        isDesktopExpandedInput,
        isSessionHydrating,
        messageCount: sessionMessages.length,
        sessionIsWorking,
        spaceStopped,
        effectiveSessionDirectory,
        loadStatus: sessionMessageLoadState.status,
        authSessionExpired,
        retrySessionLoad,
    });

    const formsInChat = resolveFormsInChat({
        questionsInChat,
        pinned,
        transcriptShown: sessionPlaceholder === undefined && !isDesktopExpandedInput,
    });

    const sessionSurface = (
        <ChatViewport
            placeholder={sessionPlaceholder}
            currentSessionId={currentSessionId ?? ''}
            currentSessionKey={currentSessionKey ?? currentSessionId ?? ''}
            isDesktopExpandedInput={isDesktopExpandedInput}
            isMobile={isMobile}
            formsInChat={formsInChat}
            tableExpansion={!pinned}
            floatingComposer={floatingComposer}
            statusRowClearance={sessionIsWorking ? composerOverlayHeight : 0}
            directory={effectiveSessionDirectory}
            scrollRef={scrollRef}
            registerList={registerList}
            captureOutgoingPosition={captureOutgoingPosition}
            onIsAtEndChange={onIsAtEndChange}
            onListMetricsChange={onListMetricsChange}
            onTimelineDataChange={onTimelineDataChange}
            messageListRef={messageListRef}
            renderedMessages={timelineController.renderedMessages}
            isLoadingOlder={timelineController.isLoadingOlder}
            sessionIsWorking={sessionIsWorking}
            streamingMessageId={streamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
            retryOverlay={retryOverlay}
            scrollToBottom={resumeToLatestInstant}
            onScrollbarDrag={onManualNavigation}
            endPinningReleased={userOwnsScroll}
            revealGate={revealGate}
            isProgrammaticFollowActive={isFollowingProgrammatically}
            showLoadOlderButton={showLoadOlderButton}
            onLoadOlder={handleLoadOlderClick}
            turnIds={timelineController.turnIds}
            activeTurnId={timelineController.activeTurnId}
            onSelectTurn={handlePromptNavigatorSelect}
            showPromptNavigator={showPromptNavigator}
            canLoadEarlierPrompts={canLoadEarlierPrompts}
            isLoadingOlderPrompts={timelineController.isLoadingOlder}
            onLoadEarlierPrompts={handleLoadOlderClick}
        />
    );

	return (
		<div
			ref={attachColumnRoot}
			// App-wide handlers (double Escape to stop) find the pinned
			// column's session and whether it runs here.
			data-chat-column={pinned ? 'pinned' : 'main'}
			data-chat-session-id={pinned ? currentSessionId ?? undefined : undefined}
			data-chat-working={pinned && sessionIsWorking ? 'true' : undefined}
			className="flex h-full min-h-0 bg-background"
			style={chatTypographyStyle}
		>
		<ChatColumnSessionContext.Provider value={chatColumnSession}>
		<ChatColumnActionsContext.Provider value={columnActions}>
		{/* One mobile comment controller per column: selections in this column
		    comment into this column's composer, never a sibling's. */}
		<MobileCommentComposerContext.Provider value={mobileCommentComposer}>
		<ChatQuoteHighlightContext.Provider value={chatQuoteHighlights}>
		<ChatQuoteHighlightLayer
			store={chatQuoteHighlights}
			scrollNode={scrollNode}
			loadHistoryUntilMessage={loadQuoteSource}
			scrollToMessage={scrollToQuoteSource}
			resolveUiPageMessageId={resolveUiPageMessageId}
			scrollToUiPageRow={scrollToUiPageRow}
		/>
		{scrollNode && currentSessionId ? <HoistedUiPageSelection key={currentSessionKey ?? currentSessionId} scrollNode={scrollNode} sessionId={currentSessionId} /> : null}
		<div
			ref={chatRootRef}
			data-composer-bound
			// A live reply can outrun the follow glide; while it streams and the
			// view follows it (no scroll-to-bottom pill, no reader gesture), the
			// transcript fades out above the composer (index.css). Once the
			// reader leaves the end, the rows slide under its glass again.
			data-live-tail={sessionStatusForCurrent.type === 'busy' && isFollowingProgrammatically ? 'true' : undefined}
			className="relative flex min-w-0 flex-1 flex-col h-full bg-background"
		>
			{returnToParentButton}
			{sessionSurface}
			{chatSearch.open && currentSessionId && messageSearchEnabled ? (
				<div className="pointer-events-none absolute inset-e-3 top-2 z-20">
					<ChatSearchBar
						// Keyed by session so the old hits never meet a new
						// session id in one commit: the same instance would
						// re-issue message focus for the new session with the
						// old hit's id, ending in a "not found" toast.
						key={currentSessionId}
						sessionId={currentSessionId}
						scrollNode={scrollNode}
						focusRequest={chatSearch.focusRequest}
						onClose={closeChatSearch}
					/>
				</div>
			) : null}

            <div
                ref={attachComposerSlot}
                // The mobile pill morph pins a floating slot for its tween.
                data-composer-slot={floatingComposer ? 'floating' : 'flow'}
                className={cn(
                    'z-10 flex min-h-0',
                    floatingComposer
                        ? 'absolute inset-x-0 bottom-0'
                        : 'relative',
                    isDesktopExpandedInput
                        ? 'flex-1 min-h-0 bg-background'
                        : draftLayoutVisible && !useCompactDraftLayout
                            ? 'flex-1 items-center justify-center bg-background pb-[6vh]'
                        : !floatingComposer && 'bg-background'
                )}
            >
                <ChatQuoteHighlightLayer
                    store={chatQuoteHighlights}
                    scrollNode={scrollNode}
                    loadHistoryUntilMessage={loadQuoteSource}
                    scrollToMessage={scrollToQuoteSource}
                    resolveUiPageMessageId={resolveUiPageMessageId}
                    scrollToUiPageRow={scrollToUiPageRow}
                />
                {scrollNode && currentSessionId ? <HoistedUiPageSelection key={currentSessionKey ?? currentSessionId} scrollNode={scrollNode} sessionId={currentSessionId} /> : null}
                <div
                    ref={chatRootRef}
                    data-composer-bound
                    data-live-tail={sessionStatusForCurrent.type === 'busy' && isFollowingProgrammatically ? 'true' : undefined}
                    className="relative flex min-w-0 flex-1 flex-col h-full bg-background"
                >
                    <ReturnToParentButton
                        sessionId={currentSessionId}
                        directory={effectiveSessionDirectory}
                        hidden={hideReturnToParent}
                        openSession={columnActions.openSession}
                        registerParentSessionBack={registerParentSessionBack}
                    />
                    {!pinned && !draftOpen ? <LeadDigestRow key={currentSessionId ?? ''} sessionId={currentSessionId} directory={effectiveSessionDirectory} /> : null}
                    {sessionSurface}
                    {chatSearch.open && currentSessionId && messageSearchEnabled ? (
                        <div className="pointer-events-none absolute inset-e-3 top-2 z-20">
                            <ChatSearchBar
                                key={currentSessionId}
                                sessionId={currentSessionId}
                                scrollNode={scrollNode}
                                focusRequest={chatSearch.focusRequest}
                                onClose={closeChatSearch}
                            />
                        </div>
                    ) : null}

                    <FormDockModeContext.Provider value={resolveFormDockMode(formsInChat, showScrollButton)}>
                    <ComposerSlot
                        attachComposerSlot={attachComposerSlot}
                        floatingComposer={floatingComposer}
                        isDesktopExpandedInput={isDesktopExpandedInput}
                        draftLayoutVisible={draftLayoutVisible}
                        useCompactDraftLayout={useCompactDraftLayout}
                        draftPresentationExiting={draftPresentationExiting}
                        showRiders={!draftLayoutVisible && !isDesktopExpandedInput && sessionMessages.length > 0}
                        showScrollToBottom={timelineController.showScrollToBottom}
                        sessionIsWorking={sessionIsWorking}
                        onResumeToLatest={navigation.resumeToLatest}
                        userOwnsScroll={userOwnsScroll}
                        onStatusOverlayNode={onStatusOverlayNode}
                        promptReadOnly={promptReadOnly}
                        messageSelectionActive={messageSelectionActive}
                        currentSessionId={currentSessionId}
                        directory={effectiveSessionDirectory}
                        isMobile={isMobile}
                        permissionCount={sessionPermissions.length}
                        spaceArchiveName={spaceArchive?.name ?? null}
                        sessionStatusType={sessionStatusForCurrent.type}
                        active={active}
                        scrollToBottomOnSend={scrollToBottomOnSend}
                        resumeToLatestInstant={resumeToLatestInstant}
                    />
                    </FormDockModeContext.Provider>

                    {workStatusOverlayMountable ? (
                        <WorkStatusPanel
                            overlay
                            visible={showWorkStatusOverlay}
                            sessionId={currentSessionId ?? null}
                            directory={workStatusDirectory ?? null}
                            repositoryEnabled={!isManagedChatContext}
                        />
                    ) : null}

                    <TimelineDialog
                        open={isTimelineDialogOpen}
                        onOpenChange={setTimelineDialogOpen}
                        onScrollToMessage={timelineController.scrollToMessage}
                        onScrollByTurnOffset={navigation.scrollByTurnOffset}
                        onResumeToLatest={resumeToLatestInstant}
                        canLoadEarlier={timelineController.historySignals.canLoadEarlier}
                        isLoadingEarlier={timelineController.isLoadingOlder}
                        onLoadEarlier={handleLoadOlderClick}
                    />
                </div>
            </ChatColumnProviders>
            {workStatusPanelMountable && workStatusHost ? createPortal(
                <WorkStatusPanel
                    visible={showWorkStatusPanel}
                    reserved={workStatusReserved}
                    besidePanel={workStatusRoomyBesidePanel}
                    sessionId={currentSessionId ?? null}
                    directory={workStatusDirectory ?? null}
                    repositoryEnabled={!isManagedChatContext}
                />,
                workStatusHost,
            ) : null}
        </div>
    );
};
