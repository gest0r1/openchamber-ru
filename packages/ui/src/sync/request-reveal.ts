import React from "react"


let pendingRequestID: string | null = null
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of listeners) listener()
}

export const revealRequest = (requestID: string): void => {
  pendingRequestID = requestID
  notify()
}

export const subscribeRequestReveal = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * A page or secret card that waits for an answer sits in the transcript, so
 * "Open session" on its toast has to move the reader to it: reopened at a
 * remembered position, they would land screens above it. The session's
 * timeline serves this on entry, or right away when the session is open. The
 * call's id on the wire does not name the block in the chat, so the request
 * names the session.
 */
let pendingPageSessionID: string | null = null

export const revealWaitingPage = (sessionID: string): void => {
  pendingPageSessionID = sessionID
  notify()
}

export const isWaitingPageRevealPending = (sessionID: string | null): boolean => (
  sessionID !== null && pendingPageSessionID === sessionID
)

export const takeWaitingPageReveal = (sessionID: string | null): boolean => {
  if (!isWaitingPageRevealPending(sessionID)) return false
  pendingPageSessionID = null
  return true
}

/** Entering a session drops a request that names another one. */
export const releaseWaitingPageRevealOutside = (sessionID: string | null): void => {
  if (pendingPageSessionID !== sessionID) pendingPageSessionID = null
}

const getPendingRequestID = () => pendingRequestID

export const useRequestReveal = (requestIDs: readonly string[], onReveal: (requestID: string) => void): void => {
  const pending = React.useSyncExternalStore(subscribeRequestReveal, getPendingRequestID, getPendingRequestID)
  const held = pending !== null && requestIDs.includes(pending)
  React.useEffect(() => {
    if (!held || pending === null) return
    pendingRequestID = null
    notify()
    onReveal(pending)
  }, [held, pending, onReveal])
}
