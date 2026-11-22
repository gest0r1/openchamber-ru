import React from 'react';
import { ProviderOAuthMethods } from '@/components/sections/providers/ProviderOAuthMethods';
import { getMcpOAuthMethods } from './mcpOAuthIntegration';
import { useMcpOAuthIntegration } from './useMcpOAuthIntegration';

interface McpOAuthSignInProps {
  serverName: string;
  directory: string | null;
  onConnected: () => void | Promise<void>;
  autoStart?: boolean;
  connectLabel?: string;
  /**
   * Off when the caller starts the sign-in from its own button (with
   * `autoStart`). A server with several sign-in methods keeps its start
   * buttons anyway: `autoStart` starts only a single method, so the user picks.
   */
  showStartButton?: boolean;
  /**
   * Told while a sign-in runs. Starting one from another machine writes the
   * server's redirect, and OpenCode reports the server `pending` while it
   * reconnects, so a caller that mounts this only for `needs_auth` must keep
   * it mounted until the sign-in ends: unmounting cancels the attempt.
   */
  onActiveChange?: (active: boolean) => void;
  /** Runs once when no sign-in can be offered, so the caller can say so. */
  onUnavailable?: () => void;
}

export const McpOAuthSignIn: React.FC<McpOAuthSignInProps> = ({
  serverName,
  directory,
  onConnected,
  autoStart,
  connectLabel,
  showStartButton,
  onActiveChange,
  onUnavailable,
}) => {
  const integration = useMcpOAuthIntegration(serverName, directory, true, onUnavailable);
  if (!integration) return null;
  const methods = getMcpOAuthMethods(integration);

  return (
    <ProviderOAuthMethods
      key={integration.id}
      integrationId={integration.id}
      methods={methods}
      directory={directory}
      onConnected={onConnected}
      autoStart={autoStart}
      connectLabel={connectLabel}
      showStartButton={(showStartButton ?? true) || methods.length > 1}
      onActiveChange={onActiveChange}
    />
  );
};
