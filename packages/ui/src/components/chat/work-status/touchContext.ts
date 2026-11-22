import React from 'react';

export const WorkStatusTouchContext = React.createContext(false);

/**
 * An extension's controls (header buttons and selects, actions in host-drawn
 * rows) keep the desktop's `xs` button, grown to the phone's 36px touch floor,
 * with room for a word its wider padding would otherwise cut.
 */
export const TOUCH_CONTROL_CLASS = 'h-9 max-w-[8rem] px-3';
