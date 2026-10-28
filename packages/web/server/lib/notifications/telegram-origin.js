/**
 * The Telegram notifier is created before the tunnel runtime. Keep its optional
 * deep-link origin lazy and independent of the lifetime of main().
 */
export const createTelegramPublicOrigin = () => {
  let tunnelRuntime = null;
  return {
    setTunnelRuntime: (runtime) => { tunnelRuntime = runtime; },
    getPublicOrigin: async () => {
      try {
        return await tunnelRuntime?.tunnelService?.getPublicUrl?.() ?? '';
      } catch {
        // An unavailable tunnel must not prevent Telegram delivery.
        return '';
      }
    },
  };
};
