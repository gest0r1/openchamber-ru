// How the chat follows a live reply, and the rules that decide it.
//
// The viewport trails the growing tail with one glide (followGlide.ts) that
// each landed block (lib/streamTextCommit.ts) re-aims. Pure: no DOM, no React.

/**
 * Where a follow glide should go, or null to hold still: the true end (the
 * tail just above the composer, through the tail spacer) unless the viewport
 * is already there.
 */
export const resolveFollowGlideTarget = (end: number, scroll: number): number | null => (
    end - scroll <= 1 ? null : Math.max(0, end)
);

export const resolveFollowStop = (
    target: number,
    stop: { readonly limit: number; readonly bottom: number },
    visibleLength: number,
): { target: number; hold: boolean } => (
    target > stop.limit + 1 && stop.bottom - stop.limit > visibleLength
        ? { target: stop.limit, hold: true }
        : { target, hold: false }
);

export const resolvePageRevealTarget = (
    page: { readonly top: number; readonly bottom: number },
    scroll: number,
    visibleLength: number,
    topGap: number,
): number | null => {
    const fits = page.bottom - page.top <= visibleLength - topGap;
    const target = fits && page.bottom > scroll + visibleLength
        ? page.bottom - visibleLength
        : !fits || page.top < scroll + topGap ? page.top - topGap : null;
    if (target === null) return null;
    const clamped = Math.max(0, target);
    return Math.abs(clamped - scroll) <= 1 ? null : clamped;
};
