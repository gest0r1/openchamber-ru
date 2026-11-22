/* oxlint-disable react/only-export-components */
import React from 'react';
import type { ProjectRef } from '@/lib/projectContextApi';

export type MobileAppActions = {
  /**
   * Open the Changes surface as a modal and (optionally) navigate it to a specific diff.
   * Scope `turn` looks for the file in Last turn first, and in Changes when Last turn has nothing for it.
   */
  openChanges: (options?: { diffPath?: string | null; staged?: boolean; scope?: 'turn' }) => void;
  /** Open the Files surface as a modal. */
  openFiles: () => void;
  openSourceBoard: () => void;
  /** Open a saved plan full screen, as a tap on it in Project knowledge does. */
  openPlan: (plan: { id: string; title: string; projectRef: ProjectRef }) => void;
};

const DedicatedMobileAppContext = React.createContext<MobileAppActions | null>(null);

export const DedicatedMobileAppProvider: React.FC<{
  actions: MobileAppActions;
  children: React.ReactNode;
}> = ({ actions, children }) => (
  <DedicatedMobileAppContext.Provider value={actions}>{children}</DedicatedMobileAppContext.Provider>
);

export const useMobileAppActions = (): MobileAppActions | null => React.useContext(DedicatedMobileAppContext);
