import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const execute = promisify(execFile);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
const infoSchema = z.object({ version: versionSchema });
const legacyHealthSchema = z.object({ version: versionSchema, healthy: z.boolean() });

/**
 * Oldest OpenCode OpenChamber runs against. 2.2.4 accepts a share such as
 * `"20%"` in `compaction.buffer`, the form Settings writes; an older OpenCode
 * rejects the whole config file holding it. (2.2.0 before it moved text
 * generation to `POST /api/experimental/generate/text`, 2.1.0 added
 * `archived` to `PATCH /api/session/{id}`, 2.0.20 `GET /api/credential`,
 * 2.0.15 `PATCH /api/session` metadata.)
 *
 * `engines.opencode` in packages/web/package.json repeats it, so the release
 * published to npm says what it needs before a server installs it.
 */
const MINIMUM_OPENCODE_VERSION = '2.2.4';

const releaseParts = (version: string) => (version.split(/[-+]/, 1)[0] ?? '').split('.').map(Number);

const compareRelease = (left: string, right: string) => {
  const a = releaseParts(left);
  const b = releaseParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? NaN) - (b[index] ?? NaN);
  }
  return 0;
};

/** Whether OpenCode `version` is older than `minimum`, by release numbers. */
export const isOpenCodeOlderThan = (version, minimum) => versionSchema.safeParse(version).success
  && compareRelease(version, minimum) < 0;

const isOlderThanMinimum = (version) => isOpenCodeOlderThan(version, MINIMUM_OPENCODE_VERSION);

const isOlderThanMinimum = (version: string) => isOpenCodeOlderThan(version, MINIMUM_OPENCODE_VERSION);

export const isSupportedOpenCodeVersion = (version: string) => versionSchema.safeParse(version).success
  && releaseParts(version)[0] === 2
  && !isOlderThanMinimum(version);

export const readOpenCodeInfo = async (response: Response) => {
  if (!response.ok) return null;
  const parsed = infoSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data : null;
};

export const readOpenCodeCliVersion = async (launch: OpenCodeCliLaunch, options: OpenCodeCliOptions = {}) => {
  const { stdout } = await execute(launch.binary, [...launch.args, '--version'], {
    ...options,
    env: { ...(options.env ?? process.env), ...launch.env },
    encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024, windowsHide: true,
  });
  const match = /^(?:opencode\s+v?)?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\s*$/.exec(stdout.trim());
  if (!match) throw new Error('Could not determine the installed OpenCode version.');
  return match[1] ?? '';
};

export class UnsupportedOpenCodeVersionError extends Error {
  version: string;

  constructor(version: string) {
    super(`OpenCode ${version} is installed. OpenChamber requires OpenCode ${MINIMUM_OPENCODE_VERSION} or newer.`);
    this.name = 'UnsupportedOpenCodeVersionError';
    this.version = version;
  }
}

export const requireOpenCodeV2 = async (launch: OpenCodeCliLaunch, options?: OpenCodeCliOptions) => {
  const version = await readOpenCodeCliVersion(launch, options);
  if (!isSupportedOpenCodeVersion(version)) throw new UnsupportedOpenCodeVersionError(version);
  return version;
};

export const readExternalOpenCodeVersion = async (baseUrl: string, headers: Record<string, string>, fetchImpl = fetch) => {
  const request = (pathname: string) => fetchImpl(new URL(pathname, baseUrl), {
    headers: { ...headers, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  const response = await request('/api/info').catch(() => null);
  if (response && (response.status === 401 || response.status === 403)) return null;
  const info = response ? await readOpenCodeInfo(response) : null;
  if (info) return info.version;
  const legacy = await request('/global/health');
  if (!legacy.ok) return null;
  const parsed = legacyHealthSchema.safeParse(await legacy.json().catch(() => null));
  return parsed.success && parsed.data.version.startsWith('1.') ? parsed.data.version : null;
};

export const describeOpenCodeCompatibility = (version: string | null, installation: OpenCodeCompatibility['installation'], canInstall: boolean, binary: string | null = null): OpenCodeCompatibility => ({
  state: version === null ? 'unavailable' : isSupportedOpenCodeVersion(version) ? 'compatible' : 'incompatible',
  version,
  installation,
  binary,
  minimumVersion: MINIMUM_OPENCODE_VERSION,
  canInstall: version !== null && isOlderThanMinimum(version) && installation === 'managed' && canInstall,
});
