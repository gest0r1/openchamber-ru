
const NESTED_SCROLLABLE_SELECTOR = '[data-scrollable]';

export const isFollowReleaseKey = (
    event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    if (event.key === ' ') return event.shiftKey;
    return event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home';
};

const nestedScrollable = (root: HTMLElement, target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const nested = target.closest(NESTED_SCROLLABLE_SELECTOR);
    return nested instanceof HTMLElement && nested !== root ? nested : null;
};

export const nestedScrollableConsumesWheelUp = (root: HTMLElement, target: EventTarget | null): boolean => {
    const nested = nestedScrollable(root, target);
    return nested !== null && nested.scrollTop > 0;
};

const FRAME_SCROLL_EVENT = 'openchamber:frame-scroll';

export type FrameScrollDirection = 'up' | 'down';

export function dispatchFrameScroll(frame: HTMLElement, direction: FrameScrollDirection): void {
    frame.dispatchEvent(new CustomEvent<FrameScrollDirection>(FRAME_SCROLL_EVENT, { bubbles: true, detail: direction }));
}

export function onFrameScroll(container: HTMLElement, listener: (direction: FrameScrollDirection) => void): () => void {
    const handle = (event: Event) => {
        if (event instanceof CustomEvent && (event.detail === 'up' || event.detail === 'down')) listener(event.detail);
    };
    container.addEventListener(FRAME_SCROLL_EVENT, handle);
    return () => container.removeEventListener(FRAME_SCROLL_EVENT, handle);
}

// The reader opened a row (a tool, an agent task, a reasoning block, folded
// work, a long user message). The row raises this event from its element as it opens, so the
// timeline holding it lets go of the end before the row grows: the content
// opens below the header the reader clicked, instead of the end pulling the
// header up and out of view.
const ROW_EXPAND_EVENT = 'openchamber:row-expand';

export function dispatchRowExpand(row: HTMLElement | null): void {
    row?.dispatchEvent(new CustomEvent(ROW_EXPAND_EVENT, { bubbles: true }));
}

export function onRowExpand(container: HTMLElement, listener: () => void): () => void {
    container.addEventListener(ROW_EXPAND_EVENT, listener);
    return () => container.removeEventListener(ROW_EXPAND_EVENT, listener);
}

const NAVIGATION_RELEASE_EVENT = 'openchamber:navigation-release';

export function dispatchNavigationRelease(scroller: HTMLElement): void {
    scroller.dispatchEvent(new CustomEvent(NAVIGATION_RELEASE_EVENT));
}

export function onNavigationRelease(scroller: HTMLElement, listener: () => void): () => void {
    scroller.addEventListener(NAVIGATION_RELEASE_EVENT, listener);
    return () => scroller.removeEventListener(NAVIGATION_RELEASE_EVENT, listener);
}

const PAGE_WAITING_EVENT = 'openchamber:page-waiting';

export function dispatchPageWaiting(block: HTMLElement | null): void {
    block?.dispatchEvent(new CustomEvent(PAGE_WAITING_EVENT, { bubbles: true }));
}

export function findWaitingPage(container: ParentNode, pageId: string | null): HTMLElement | null {
    for (const block of container.querySelectorAll<HTMLElement>('[data-waiting-page]')) {
        if (pageId === null || block.dataset.waitingPage === pageId) return block;
    }
    return null;
}

export function onPageWaiting(container: HTMLElement, listener: (block: HTMLElement, pageId: string) => void): () => void {
    const handle = (event: Event) => {
        const block = event.target;
        const pageId = block instanceof HTMLElement ? block.dataset.waitingPage : undefined;
        if (block instanceof HTMLElement && pageId) listener(block, pageId);
    };
    container.addEventListener(PAGE_WAITING_EVENT, handle);
    return () => container.removeEventListener(PAGE_WAITING_EVENT, handle);
}

// The reader pressed Next on a waiting form's Tabs. The Tabs raise this from
// their element once the next tab has drawn, so the timeline can bring its
// start into view: the reader was at the end of the tab they left.
const TAB_STEP_EVENT = 'openchamber:tab-step';

export function dispatchTabStep(tabs: HTMLElement | null): void {
    tabs?.dispatchEvent(new CustomEvent(TAB_STEP_EVENT, { bubbles: true }));
}

/** Listens for Tabs stepping to their next tab inside `container`. */
export function onTabStep(container: HTMLElement, listener: (tabs: HTMLElement) => void): () => void {
    const handle = (event: Event) => {
        if (event.target instanceof HTMLElement) listener(event.target);
    };
    container.addEventListener(TAB_STEP_EVENT, handle);
    return () => container.removeEventListener(TAB_STEP_EVENT, handle);
}

// Middle-button press starts the platform's autoscroll pan (Windows/Linux
// Chromium); the pan then scrolls without wheel events, so the press itself is
// the gesture. Inside a nested scroller the pan belongs to that scroller.
export const isMiddleButtonPan = (root: HTMLElement, event: Pick<MouseEvent, 'button' | 'target'>): boolean =>
    event.button === 1 && nestedScrollable(root, event.target) === null;
