type TunnelOrigin = { tunnelService?: { getPublicUrl?: () => string | null | Promise<string | null> } | null };

export const createTelegramPublicOrigin = () => {
  let tunnelRuntime: TunnelOrigin | null = null;
  return {
    setTunnelRuntime: (runtime: TunnelOrigin) => { tunnelRuntime = runtime; },
    getPublicOrigin: async () => {
      try {
        return await tunnelRuntime?.tunnelService?.getPublicUrl?.() ?? '';
      } catch {
        return '';
      }
    },
  };
};
