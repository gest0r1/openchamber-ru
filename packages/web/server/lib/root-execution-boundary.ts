type PtyLaunch = {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

type RootExecutionOptions = {
  uid?: number;
  platform?: NodeJS.Platform;
  mode?: string;
  target?: string;
};

export function separatePtyLaunch({ executable, args, env }: PtyLaunch, options: RootExecutionOptions = {}): PtyLaunch {
  const uid = options.uid ?? process.getuid?.() ?? -1;
  const platform = options.platform ?? process.platform;
  const mode = options.mode ?? process.env.OPENCHAMBER_ROOT_MODE;
  if (uid !== 0) return { executable, args, env };
  if (platform !== 'linux' || mode !== 'separated') {
    throw new Error('ROOT_PTY_EXECUTION_FORBIDDEN: root OpenChamber requires Linux isolated mode');
  }
  const target = options.target ?? process.env.OPENCHAMBER_EXECUTION_USER;
  if (target !== 'opencode') throw new Error('ROOT_PTY_EXECUTION_FORBIDDEN: execution user must be opencode');
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (/^(TERM|COLORTERM|COLORFGBG|LANG|LC_[A-Z_]+|GIT_TERMINAL_PROMPT|NO_COLOR|CLICOLOR)$/.test(key)) {
      clean[key] = value;
    }
  }
  clean.HOME = '/home/opencode';
  clean.USER = clean.LOGNAME = 'opencode';
  clean.PATH = '/home/opencode/.local/bin:/home/opencode/.opencode/bin:/home/opencode/.bun/bin:/usr/local/bin:/usr/bin:/bin';
  clean.XDG_CONFIG_HOME = '/home/opencode/.config';
  clean.XDG_DATA_HOME = '/home/opencode/.local/share';
  clean.XDG_STATE_HOME = '/home/opencode/.local/state';
  clean.OPENCHAMBER_EMBEDDED_TERMINAL = '1';
  return {
    executable: '/usr/bin/setpriv',
    args: ['--reuid=opencode', '--regid=opencode', '--init-groups', '--', executable, ...args],
    env: clean,
  };
}

export function assertRootExecutionDisabled(kind: string, options: Pick<RootExecutionOptions, 'uid'> = {}) {
  const uid = options.uid ?? process.getuid?.() ?? -1;
  if (uid === 0) throw new Error(`ROOT_COMMAND_EXECUTION_FORBIDDEN: ${kind}`);
}
