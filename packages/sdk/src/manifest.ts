import type { OpenChamberManifestApiVersion } from './api-version.ts';
import type { FileEditorContribution } from './file-editor.ts';
import { GUEST_STATUS_SOURCE_INTERVAL_DEFAULT, type StatusSectionSource } from './status-view.ts';
import type { PublicSessionEvents, SessionEventsContribution } from './session-events.ts';
import type { ServiceScheduleEntry } from './service-host.ts';
import type { WaitContribution } from './waits.ts';

export const PANEL_ID = /^[a-z][a-z0-9-]*$/;

export type PanelContribution = {
  id: string;
  name: string;
  icon: string;
  entry?: string;
  dock?: GuestSurfaceDock;
  size?: number;
  /**
   * The panel page is drawn for a phone: the mobile app shows it (with the
   * live screen it docks to, and the attach panel or dialog). Without it the
   * phone shows none of these. Hosts before this key ignore it.
   */
  mobile?: true;
};

export const GUEST_SURFACE_DOCKS = ['top', 'bottom', 'left', 'right'] as const;
export type GuestSurfaceDock = (typeof GUEST_SURFACE_DOCKS)[number];
export const GUEST_SURFACE_DOCK_DEFAULT: GuestSurfaceDock = 'top';
export const GUEST_SURFACE_DOCK_SIZE_DEFAULT = 40;
export const GUEST_SURFACE_DOCK_SIZE_MIN = 24;
export const GUEST_SURFACE_DOCK_SIZE_MAX = 480;

export type BackgroundContribution = {
  entry: string;
};

export type AttachMode = 'panel' | 'dialog';

export type AttachContributionObject = {
  mode: AttachMode;
  entry?: string;
};

export type AttachContribution = boolean | AttachMode | AttachContributionObject;

/**
 * A user-opened full-screen page, optionally with its own HTML and title.
 * `true` reuses `panel.entry` and shows on a phone when `panel.mobile` does;
 * the object form opts in with its own `mobile`.
 */
export type PageContribution = true | { entry: string; title?: string; mobile?: true };

export type StatusSectionContribution = true | {
  entry?: string;
  source?: StatusSectionSource;
  title?: string;
  height?: number;
  defaultExpanded?: boolean;
  requiresProject?: boolean;
};

export const GUEST_STATUS_SECTION_TITLE_MAX = 60;
export const GUEST_STATUS_SECTION_HEIGHT_MIN = 24;
/** Tallest frame height the host gives a status section; taller content scrolls inside the frame. */
export const GUEST_STATUS_SECTION_HEIGHT_MAX = 480;
/** Frame height before the manifest or the guest says otherwise. */
export const GUEST_STATUS_SECTION_HEIGHT_DEFAULT = 120;

export type GuestActionWhere = 'message' | 'session' | 'selection' | 'file' | 'diff';
export type GuestActionRole = 'user' | 'assistant';
export type GuestActionPayload = 'messages';

export const GUEST_ACTIONS_MAX = 8;
export const GUEST_ACTION_LABEL_MAX = 40;
export const GUEST_COMMANDS_MAX = 8;
export const GUEST_COMMAND_DESCRIPTION_MAX = 80;
export const GUEST_COMMAND_NAME = /^[a-z][a-z0-9-]{0,23}$/;

/**
 * A menu entry on a message, a session, text selected in a message, a file in
 * the Files view, or lines of a diff. By default it opens the guest with that
 * target as `ready.item`. `roles` narrows a message action to user or
 * assistant messages (default both); `payload: ["messages"]` on a session
 * action asks for the conversation and needs the `conversation` capability.
 */
export type GuestActionContribution = {
  id: string;
  label: string;
  icon?: string;
  where: GuestActionWhere;
  mode?: 'open' | 'background';
  roles?: GuestActionRole[];
  payload?: GuestActionPayload[];
  /** How a `selection` action shows on the selection bar. Default: `label`. `icon` keeps the label as its tooltip. */
  display?: 'label' | 'icon' | 'both';
};

export type GuestCommandContribution = {
  name: string;
  description?: string;
};

/** How many `contributes.providerLogos` entries a package may declare: room for an icon pack, with aliases as more entries. */
export const GUEST_PROVIDER_LOGOS_MAX = 256;
/** Bytes of one `contributes.providerLogos` file; a larger one fails the install. */
export const GUEST_PROVIDER_LOGO_BYTES_MAX = 1024 * 1024;

/** How many `contributes.tools` entries a package may declare. */
export const GUEST_TOOLS_MAX = 16;
export const GUEST_TOOL_MATCH_MAX = 128;
/**
 * A tool name as OpenCode reports it (`jira_search`), with `*` allowed once,
 * at the end, as a suffix wildcard (`jira_*`).
 */
export const GUEST_TOOL_MATCH = /^[A-Za-z0-9_.:-]+\*?$/;
export const GUEST_TOOL_NAME_MAX = 40;
export const GUEST_TOOL_TEMPLATE_MAX = 200;
export const GUEST_TOOL_TEMPLATE_VALUE_MAX = 200;
export const GUEST_TOOL_LANGUAGE_MAX = 32;
export const GUEST_TOOL_COLUMNS_MAX = 16;
export const GUEST_TOOL_COLUMN_MAX = 64;

/** How many `fields` a `card` may list. */
export const GUEST_TOOL_CARD_FIELDS_MAX = 8;
/** How many status texts a card's `status.tones` may map. */
export const GUEST_TOOL_CARD_TONES_MAX = 16;
/** Characters in one `status.tones` key, the status text it colours. */
export const GUEST_TOOL_CARD_TONE_KEY_MAX = 64;
/** Characters in the address a card's `link.url` renders to; a longer one shows no link. */
export const GUEST_TOOL_CARD_URL_MAX = 2048;

export const GUEST_TOOL_OUTPUTS = ['auto', 'text', 'json', 'markdown', 'code', 'table', 'card'] as const;

export type GuestToolOutput = (typeof GUEST_TOOL_OUTPUTS)[number];

/** The colours an extension may ask for by meaning; the host's theme picks the actual ones. */
export const GUEST_TONES = ['neutral', 'info', 'success', 'warning', 'error'] as const;

export type GuestTone = (typeof GUEST_TONES)[number];

/** What a `title` or `subtitle` template reads from. */
export const GUEST_TOOL_TEMPLATE_ROOTS = ['input', 'output', 'metadata'] as const;

/**
 * The placeholders of a tool template over the given roots: `{output}` or
 * `{output.fields.status.name}`, the root in group 1 and the dotted path
 * (with its leading dot) in group 2. A new global pattern on every call, so
 * no caller inherits another's `lastIndex`.
 */
export const guestToolPlaceholderPattern = (roots: readonly string[]): RegExp => (
  new RegExp(`\\{(${roots.join('|')})((?:\\.[A-Za-z0-9_-]+)*)\\}`, 'g')
);

/**
 * A card link also reads `{settings.<id>}`, so a card template is checked over
 * these. Written out, not spread from the roots above: a bundler keeps a
 * spread in every guest bundle, used or not.
 */
export const GUEST_TOOL_CARD_TEMPLATE_ROOTS = ['input', 'output', 'metadata', 'settings'] as const;

/** The `contributes.integration.settings` ids the card links of these tools read, each once. */
export const guestToolLinkSettingIds = (tools: readonly GuestToolContribution[] | undefined): string[] => {
  const ids = new Set<string>();
  for (const tool of tools ?? []) {
    for (const match of (tool.card?.link?.url ?? '').matchAll(guestToolPlaceholderPattern(['settings']))) {
      if (match[2]) ids.add(match[2].slice(1));
    }
  }
  return [...ids];
};

/**
 * The body of `output: "card"`, drawn by the host from the tool's JSON output.
 * `label`, `title`, `status.value`, each `fields[].value` and `link.url` are
 * templates that read `{output.path}` only; `fields[].label` and `link.label`
 * are plain text. A part whose placeholders all miss is hidden. When the
 * output is an array, or has an `items` array, each item is a row drawn from
 * the same templates with `output` bound to that item.
 *
 * `status.tones` maps a rendered status text, matched exactly, to a tone;
 * anything else is neutral. `link.url` is either one placeholder holding a
 * whole address (`{output.url}`) or an `https://` address built around
 * placeholders, whose values are percent-encoded; there it may also read
 * `{settings.<id>}`, a non-secret `contributes.integration.settings` field.
 * The link shows only for an `https` address without credentials.
 */
export type GuestToolCard = {
  label?: string;
  title?: string;
  status?: { value: string; tones?: Record<string, GuestTone> };
  fields?: { label: string; value: string }[];
  link?: { label: string; url: string };
};

/**
 * How a tool call looks in the chat, declared without code. `match` is the
 * full tool name OpenCode reports, or a prefix ending in `*`. `title` and
 * `subtitle` are templates with `{input.path}`, `{output.path}`, and
 * `{metadata.path}` placeholders; a missing path renders as an empty string.
 * `language` only means something for `output: "code"`, `columns` only
 * for `output: "table"` (rows are the output array or `output.items`), and
 * `card` only for `output: "card"`.
 */
export type GuestToolContribution = {
  match: string;
  name?: string;
  icon?: string;
  title?: string;
  subtitle?: string;
  output?: GuestToolOutput;
  language?: string;
  columns?: string[];
  card?: GuestToolCard;
};

export type IntegrationSettingField = {
  id: string;
  label: string;
  /** A key or a password: the card masks it, no frame receives it, and the service reads it through `createServiceHost(...).readSettings()`. */
  secret?: true;
};

export type IntegrationOAuthAccount = {
  path: string;
  name: string;
};

export type IntegrationOAuth = {
  authorizeUrl: string;
  tokenUrl: string;
  apiOrigin: string;
  scopes?: string[];
  account?: IntegrationOAuthAccount;
};

export type IntegrationTokenScheme = 'raw' | 'bearer' | 'basic';

export type IntegrationToken = {
  apiOrigin: string;
  account?: IntegrationOAuthAccount;
  scheme?: IntegrationTokenScheme;
  usernameLabel?: string;
};

export type IntegrationHostProvider = 'linear';

export type IntegrationHost = {
  provider: IntegrationHostProvider;
};

export type IntegrationAuth = 'oauth' | 'token' | 'host';

export type GuestAuthorization = 'bearer' | 'basic' | 'header';

export type ResolvedGuestApi = {
  apiOrigin: string;
  account?: IntegrationOAuthAccount;
  authorization: GuestAuthorization;
};

export const HOST_LINEAR_API_ORIGIN = 'https://api.linear.app';

export type IntegrationContribution = {
  name: string;
  description: string;
  oauth?: IntegrationOAuth;
  token?: IntegrationToken;
  host?: IntegrationHost;
  settings?: IntegrationSettingField[];
};

export type PublicIntegrationToken = {
  scheme: IntegrationTokenScheme;
  usernameLabel?: string;
};

export type PublicIntegration = {
  name: string;
  description: string;
  auth: IntegrationAuth;
  token?: PublicIntegrationToken;
  apiOrigin?: string;
  settings?: IntegrationSettingField[];
};

export const resolveIntegrationAuth = (
  integration: Pick<IntegrationContribution, 'oauth' | 'token' | 'host'>,
): IntegrationAuth | null => {
  const kinds = [Boolean(integration.oauth), Boolean(integration.token), Boolean(integration.host)]
    .filter(Boolean).length;
  if (kinds !== 1) {
    return null;
  }
  if (integration.host) return 'host';
  return integration.oauth ? 'oauth' : 'token';
};

const resolveTokenAuthorization = (scheme: IntegrationTokenScheme | undefined): GuestAuthorization => {
  if (scheme === 'bearer' || scheme === 'basic') {
    return scheme;
  }
  return 'header';
};

export const resolveIntegrationApi = (
  integration: IntegrationContribution,
): ResolvedGuestApi | null => {
  if (integration.oauth) {
    return {
      apiOrigin: integration.oauth.apiOrigin,
      account: integration.oauth.account,
      authorization: 'bearer',
    };
  }
  if (integration.token) {
    return {
      apiOrigin: integration.token.apiOrigin,
      account: integration.token.account,
      authorization: resolveTokenAuthorization(integration.token.scheme),
    };
  }
  if (integration.host?.provider === 'linear') {
    return {
      apiOrigin: HOST_LINEAR_API_ORIGIN,
      authorization: 'bearer',
    };
  }
  return null;
};

export type SocketPlatform = 'linux' | 'darwin' | 'win32';

export type SocketBinding = {
  id: string;
  candidatesByPlatform: Partial<Record<SocketPlatform, string[]>>;
};

export type ServicePermissions = {
  sockets?: SocketBinding[];
  exec?: string[];
};

export type PublicServicePermissions = {
  sockets?: string[];
  exec?: string[];
};

export type PublicSocketBinding = {
  id: string;
  candidates: string[];
  resolved: string | null;
  override: string | null;
};

/**
 * Host roles a service can stand in for. `browser` answers the agent's
 * `browser.*` actions in place of the in-app browser view. `source-control`
 * makes the extension a Git host next to GitHub, GitLab and Gitea, described
 * by `contributes.sourceControl`. `notifications` makes it a delivery channel
 * for the user's notifications next to the desktop and the phone, described
 * by `contributes.notifications`. `tracker` makes it a work item tracker next
 * to Linear, described by `contributes.tracker`; an extension is a Git host
 * or a tracker, never both. `quota` makes it a usage provider next to the
 * built-in ones on the Usage page, described by `contributes.quota`. The
 * contracts are in `service-providers.ts`. `opencode` lets the service read
 * from the OpenCode the host uses, requiring its own capability approval. A
 * service that provides a role needs no panel or background entry: the host
 * starts it on the first call.
 */
export const GUEST_SERVICE_PROVIDES = ['browser', 'source-control', 'notifications', 'tracker', 'quota', 'opencode'] as const;
export type GuestServiceProvides = (typeof GUEST_SERVICE_PROVIDES)[number];

export const SOURCE_CONTROL_GUEST_ID_MAX = 28;
export const sourceControlProviderIdOf = (guestId: string): string => `ext-${guestId}`;

export const NOTIFICATIONS_GUEST_ID_MAX = 28;
export const notificationProviderIdOf = (guestId: string): string => `ext-${guestId}`;

export type NotificationsContribution = {
  label: string;
  instances: { kind: 'fixed'; origin: string } | { kind: 'user'; label: string; placeholder?: string };
  token: {
    header: 'authorization' | 'private-token';
    scheme: 'bearer' | 'token' | 'basic' | 'none';
    username?: boolean;
    scopes?: string[];
    createPath?: string;
  };
};

export type PublicNotifications = {
  label: string;
  instances: { kind: 'fixed'; origin: string } | { kind: 'user'; label: string; placeholder?: string };
  token: { scheme: 'bearer' | 'token' | 'basic' | 'none'; username: boolean; scopes: string[]; createPath?: string };
};

export const toPublicNotifications = (contribution: NotificationsContribution): PublicNotifications => {
  const token: PublicNotifications['token'] = {
    scheme: contribution.token.scheme,
    username: contribution.token.username === true,
    scopes: [...(contribution.token.scopes ?? [])],
  };
  if (contribution.token.createPath) token.createPath = contribution.token.createPath;
  return { label: contribution.label, instances: { ...contribution.instances }, token };
};

/** The usage provider is named `ext-<panel.id>` the same way; quota provider ids share the 32-character limit. */
export const QUOTA_GUEST_ID_MAX = 28;
/** The provider id OpenChamber gives the usage provider an extension provides. */
export const quotaProviderIdOf = (guestId: string): string => `ext-${guestId}`;
/** OpenCode providers one extension may read the credentials of (`contributes.quota.providers`). */
export const QUOTA_PROVIDERS_MAX = 16;
/**
 * An OpenCode provider id as its credential store keys it (`openrouter`,
 * `zai-coding-plan`, `google.oauth`): lowercase letters and digits, then
 * `.`, `_` and `-`. Checked by shape alone: a credential can arrive after
 * install, and one OpenCode does not hold is the "not configured" state the
 * Usage page already draws.
 */
export const OPENCODE_PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const isOpenCodeProviderId = (value: string): boolean => OPENCODE_PROVIDER_ID.test(value);

/**
 * `contributes.quota`: the usage provider an extension with
 * `service.provides: ["quota"]` adds next to the built-in ones, declared in
 * the manifest so OpenChamber can list it, draw its card and ask for approval
 * without starting the service. The provider id is not declared: OpenChamber
 * names it `ext-<panel.id>`. The service reads usage itself; what it receives
 * from OpenChamber is the credential OpenCode holds for each provider listed
 * here, on every read, and nothing else of the credential store.
 */
export type QuotaContribution = {
  /**
   * OpenCode provider ids whose stored credentials the service receives
   * (`openrouter`, `deepinfra`). May be empty: a provider OpenCode has no
   * credential for keeps its own key in the extension's settings and receives
   * nothing. The approval dialog lists them; a changed list asks again.
   */
  providers: string[];
};

/** What the extension catalog and the approval dialog show of the usage provider. */
export type PublicQuota = {
  providers: string[];
};

export const toPublicQuota = (contribution: QuotaContribution): PublicQuota => ({ providers: [...contribution.providers] });

/** The tracker is named `ext-<panel.id>` the same way, within the same 32 characters. */
export const TRACKER_GUEST_ID_MAX = 28;
export const trackerProviderIdOf = (guestId: string): string => `ext-${guestId}`;

export const TRACKER_URL_TEMPLATES_MAX = 8;
export const TRACKER_URL_TEMPLATE_MAX = 256;
export const TRACKER_URL_TOKENS = ['{id}', '{segment}', '{segments+}'] as const;
const TRACKER_URL_TEMPLATE_LITERAL = /^[A-Za-z0-9._~-]+$/;
const TRACKER_URL_TOKEN_SET: ReadonlySet<string> = new Set(TRACKER_URL_TOKENS);
const TRACKER_QUERY_TEMPLATE = /^([A-Za-z0-9_.-]{1,64})=\{id\}$/;

export const isTrackerUrlTemplate = (value: string): boolean => {
  if (!value.startsWith('/') || value.length > TRACKER_URL_TEMPLATE_MAX) return false;
  const queryAt = value.indexOf('?');
  const pathPart = queryAt === -1 ? value : value.slice(0, queryAt);
  const queryPart = queryAt === -1 ? null : value.slice(queryAt + 1);
  const segments = pathPart === '/' ? [] : pathPart.slice(1).split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) return false;
  if (segments.some((segment) => !TRACKER_URL_TOKEN_SET.has(segment) && !TRACKER_URL_TEMPLATE_LITERAL.test(segment))) return false;
  const count = (token: string) => segments.filter((segment) => segment === token).length;
  if (count('{segments+}') > 1) return false;
  if (queryPart === null) return count('{id}') === 1;
  return TRACKER_QUERY_TEMPLATE.test(queryPart) && count('{id}') === 0;
};

export const TRACKER_BASE_STATE_FILTERS = ['open', 'all'] as const;
export const TRACKER_STATE_FILTERS_MAX = 16;

export const TRACKER_IDENTIFIER_KINDS = ['key-number', 'number', 'short-code'] as const;
export type TrackerIdentifierKind = (typeof TRACKER_IDENTIFIER_KINDS)[number];

export type TrackerTokenAuth = {
  header: 'authorization' | 'private-token';
  scheme: 'bearer' | 'token' | 'basic' | 'none';
  username?: boolean;
  scopes?: string[];
  createPath?: string;
};

export type TrackerOAuth = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes?: string[];
};

export type TrackerCapabilities = {
  multipleAccounts: boolean;
  stateUpdate: boolean;
  children: boolean;
  labels: boolean;
  priority: boolean;
  filters: { people: boolean; priority: boolean };
  projectMapping: boolean;
  sessionComments: boolean;
};

export type TrackerContribution = {
  wire: 1;
  label: string;
  instances: { kind: 'fixed'; origin: string } | { kind: 'user'; label: string; placeholder?: string };
  auth: { token?: TrackerTokenAuth; oauth?: TrackerOAuth };
  capabilities: TrackerCapabilities;
  stateFilters: string[];
  identifier: TrackerIdentifierKind;
  urls: { item: string[] };
};

export type PublicTracker = {
  label: string;
  instances: { kind: 'fixed'; origin: string } | { kind: 'user'; label: string; placeholder?: string };
  authMethods: Array<'oauth' | 'token'>;
  token?: { scheme: 'bearer' | 'token' | 'basic' | 'none'; username: boolean; scopes: string[]; createPath?: string };
  oauth?: { scopes: string[] };
};

export const toPublicTracker = (contribution: TrackerContribution): PublicTracker => {
  const view: PublicTracker = {
    label: contribution.label,
    instances: { ...contribution.instances },
    authMethods: [
      ...(contribution.auth.oauth ? ['oauth' as const] : []),
      ...(contribution.auth.token ? ['token' as const] : []),
    ],
  };
  if (contribution.auth.token) {
    view.token = {
      scheme: contribution.auth.token.scheme,
      username: contribution.auth.token.username === true,
      scopes: [...(contribution.auth.token.scopes ?? [])],
    };
    if (contribution.auth.token.createPath) view.token.createPath = contribution.auth.token.createPath;
  }
  if (contribution.auth.oauth) view.oauth = { scopes: [...(contribution.auth.oauth.scopes ?? [])] };
  return view;
};

export const SOURCE_CONTROL_DEFAULT_INSTANCES_MAX = 4;
export const SOURCE_CONTROL_URL_TEMPLATES_MAX = 8;
export const SOURCE_CONTROL_URL_TEMPLATE_MAX = 256;
export const SOURCE_CONTROL_URL_TOKENS = ['{owner}', '{namespace+}', '{repo}', '{number}'] as const;

export type SourceControlMergeMethod = 'merge' | 'squash' | 'rebase' | 'submit';

export type SourceControlCapabilities = {
  projects: boolean;
  issues: boolean;
  changeRequests: boolean;
  draftChangeRequests: boolean;
  /**
   * The host turns an open change request into a draft (an extension an older
   * service serves leaves it off). Absent means no.
   */
  draftConversion?: boolean;
  merge: false | { methods: SourceControlMergeMethod[] };
  ci: boolean;
  comments: boolean;
  commentEdit: boolean;
  reviews: boolean;
  state: boolean;
  labels: boolean;
  reviewers: boolean;
  changeRequestPatch: boolean;
  liveSummaries: boolean;
  reviewModel?: 'verdict' | 'votes';
  revisions?: boolean;
};

export type SourceControlContribution = {
  wire: 1;
  label: string;
  terminology: { changeRequest: 'pullRequest' | 'mergeRequest' | 'change'; ci: 'checks' | 'pipeline' };
  referencePrefix: { changeRequest: string; issue: string };
  repositoryPath: 'owner/name' | 'namespace/name';
  instances: {
    defaultInstances: string[];
    custom: boolean;
    allowLoopbackHttp: boolean;
    allowPort: boolean;
    placeholder: string;
  };
  capabilities: SourceControlCapabilities;
  /** The service owns sign-in. Settings shows `hint` when this instance has no login. At least login or token is required. */
  login?: { kind: 'service'; hint: string };
  /** How OpenChamber sends the token: which header, with which prefix. */
  token?: {
    header: 'authorization' | 'private-token';
    scheme: 'bearer' | 'token' | 'basic' | 'none';
    username?: boolean;
    scopes: string[];
    createPath?: string;
  };
  transport: {
    httpsUsername: { kind: 'login' } | { kind: 'fixed'; value: string };
    appendDotGitToHttpsClone: boolean;
  };
  limits: {
    commentMaxLength: number;
    reviewerId: 'numeric' | 'login';
    labelsMax: number;
    reviewersMax: number;
  };
  trackedItems: { batchLimit: number };
  presentation: {
    abbreviation: string;
    promptNoun: string;
    sharedNumberSpace: boolean;
    iconPath?: string;
    urls: { changeRequest: string[]; issue: string[]; resolve?: string };
    features: { authorCanReview: boolean; issueCloseReason: boolean; submitRequirements?: boolean; issueEdit?: boolean; changeRequestEdit?: boolean };
    changeRequestTemplates: string[];
  };
};

export type PublicSourceControl = {
  label: string;
  defaultInstances: string[];
  custom: boolean;
};

export const toPublicSourceControl = (contribution: SourceControlContribution): PublicSourceControl => ({
  label: contribution.label,
  defaultInstances: [...contribution.instances.defaultInstances],
  custom: contribution.instances.custom,
});

export type ServiceContribution = {
  entry: string;
  runtime: 'host';
  permissions?: ServicePermissions;
  provides?: GuestServiceProvides[];
  surface?: true;
  /** Start the service with OpenChamber and bring it back when it stops. */
  keepRunning?: true;
  /** Runs OpenChamber posts to the service on a clock, whether or not anything else started it. */
  schedule?: ServiceScheduleEntry[];
};

export type PublicService = {
  runtime: 'host';
  permissions?: PublicServicePermissions;
  socketBindings?: PublicSocketBinding[];
  provides?: GuestServiceProvides[];
  surface?: true;
  keepRunning?: true;
  schedule?: ServiceScheduleEntry[];
  granted: boolean;
};

export const serviceProvides = (
  service: Pick<ServiceContribution, 'provides'> | undefined,
  role: GuestServiceProvides,
): boolean => Boolean(service?.provides?.includes(role));

/**
 * What a guest may do beyond drawing its own panel. The user approves the
 * full list once, when the package is installed; a later package that asks
 * for more is re-approved. `prompt`, `sessions`, `files`, `model`, and
 * `shells` are declared under `contributes.capabilities`; `service`, `network`,
 * `filesystem` and `origins` follow from `contributes.service`,
 * `contributes.integration`, `contributes.filesystem` and `contributes.origins`. `model` is one-off text generation with the
 * user's Small Model (`host.generate`), outside any session. `transcript`
 * follows from `contributes.sessionEvents.content` or
 * `contributes.sessionControl.content`: the service receives what the agent
 * said or asked, not only that it did. `sessionControl` follows from
 * `contributes.sessionControl`: the service starts sessions and sends to them
 * with no window open. `sessionAnswers` follows from
 * `contributes.sessionControl.answers`: the service answers the agent's
 * permission requests and forms in any session, for the user.
 * `instructions` follows from `contributes.instructions`:
 * the service adds to what agents read. `skills` follows from
 * `contributes.skills`: the package's skills reach every agent.
 * `opencodePlugin` follows from `contributes.opencodePlugin`: the package's
 * plugin runs inside the user's OpenCode. `opencode` follows from the service
 * role of the same name: the service reads sessions, messages, projects and
 * live events from the OpenCode the host uses, and nothing else. `links`
 * follows from `contributes.links`: identifiers and links in chat messages
 * become the extension's, and a click hands the one clicked to it. `wake`
 * follows from `contributes.waits`: the service's text reaches an agent's
 * session when a wait it started fires. `marks` follows from
 * `contributes.marks`: the service puts icons on sidebar rows.
 */
export const GUEST_CAPABILITIES = ['prompt', 'sessions', 'files', 'model', 'shells', 'conversation', 'service', 'network', 'filesystem', 'origins', 'transcript', 'sessionControl', 'sessionAnswers', 'instructions', 'skills', 'opencodePlugin', 'opencode', 'links', 'wake', 'marks'] as const;

export type GuestCapability = (typeof GUEST_CAPABILITIES)[number];

export const DECLARED_GUEST_CAPABILITIES = ['prompt', 'sessions', 'files', 'model', 'shells', 'microphone'] as const;

export type DeclaredGuestCapability = (typeof DECLARED_GUEST_CAPABILITIES)[number];

export const GUEST_ORIGINS_MAX = 8;

export const GUEST_FILESYSTEM_PATTERNS_MAX = 16;
export const GUEST_FILESYSTEM_PATTERN_MAX = 256;

export const isGuestFilesystemPattern = (value: string): boolean => {
  if (value.length === 0 || value.length > GUEST_FILESYSTEM_PATTERN_MAX) {
    return false;
  }
  if (value.includes('\0') || value.includes('\\')) {
    return false;
  }
  if (!value.startsWith('/') && !value.startsWith('~/')) {
    return false;
  }
  const segments = value.split('/').slice(1);
  return !segments.some((segment) => segment === '' || segment === '..');
};

/**
 * The service acts on sessions by itself (`service-host.ts`). `content: true`
 * also lets it read the agent's answers, which asks for `transcript`.
 * `answers: true` lets it answer the agent's permission requests and forms,
 * which asks for `sessionAnswers`.
 */
export type SessionControlContribution = {
  content?: true;
  answers?: true;
};

/** `contributes.mentions`: the extension's rows in the composer's `@` menu, answered by its service. */
export type MentionsContribution = {
  /** The section's name in the menu, 1 to `GUEST_MENTIONS_LABEL_MAX` characters. */
  label: string;
};

/** Characters of a mention section's label. */
export const GUEST_MENTIONS_LABEL_MAX = 40;

/** Identifier keys one extension may claim in chat text (`contributes.links.identifier.keys`). */
export const GUEST_LINK_KEYS_MAX = 8;
/** A literal identifier key: `PROJ` claims `PROJ-123`. Upper case, so prose and code words stay text. */
export const GUEST_LINK_KEY = /^[A-Z][A-Z0-9_]{0,31}$/;
/** What a click on a recognised identifier or link does. */
export const GUEST_LINK_ACTIONS = ['open', 'attach'] as const;
export type GuestLinkAction = (typeof GUEST_LINK_ACTIONS)[number];

/**
 * `contributes.links`: identifiers and links in chat messages the host
 * recognises for the extension. A click on one does the `action`: `open`
 * opens the extension with a `link` item (its rail panel, or its dialog when
 * `attach` is `"dialog"`), `attach` puts a chip on the composer. Patterns are
 * declared, never written as regular expressions: literal identifier keys,
 * and link templates in the tracker's grammar (`isTrackerUrlTemplate`) under
 * one fixed https origin. Grants `links`, approved for exactly these keys,
 * origin, templates and action.
 */
export type LinksContribution = {
  action: GuestLinkAction;
  /** `PROJ-123` in text, for each listed key. */
  identifier?: { keys: string[] };
  /**
   * Links to one item on `origin`. `identifier` is the shape of `{id}`; with
   * `action: "attach"`, at least one template uses no `{segment}` placeholder,
   * so the chip of a recognised identifier can name its link.
   */
  urls?: { origin: string; identifier: TrackerIdentifierKind; item: string[] };
};

/** A link template the host can fill from an identifier alone: no `{segment}` or `{segments+}`. */
export const isBuildableLinkTemplate = (template: string): boolean => (
  isTrackerUrlTemplate(template) && !template.includes('{segment}') && !template.includes('{segments+}')
);

/** The link a buildable template names for one identifier on `origin`. */
export const buildLinkUrl = (origin: string, template: string, identifier: string): string => (
  `${origin}${template.replace('{id}', encodeURIComponent(identifier))}`
);

/** A component name an agent writes in a UI block. */
export const GUEST_BLOCK_NAME = /^[A-Z][A-Za-z0-9]{1,31}$/;
/** An argument name of a block component. */
export const GUEST_BLOCK_ARG_NAME = /^[a-z][A-Za-z0-9]{0,31}$/;
/** How many `contributes.blocks` a package may declare; each signature is text every session pays for. */
export const GUEST_BLOCKS_MAX = 4;
/** Arguments of one block component. */
export const GUEST_BLOCK_ARGS_MAX = 8;
/** Characters of a block component's description, which agents read. */
export const GUEST_BLOCK_DESCRIPTION_MAX = 120;
/** Serialized characters of one call's arguments. */
export const GUEST_BLOCK_ARGS_TEXT_MAX = 16_000;
/** Height a block's frame takes before it says otherwise. */
export const GUEST_BLOCK_HEIGHT_DEFAULT = 120;
/** The chat's own components; an extension's block cannot take these names. */
export const GUEST_BLOCK_RESERVED_NAMES: readonly string[] = [
  'Stack', 'Row', 'Card', 'Tabs', 'Tab', 'Text', 'Badge', 'Callout', 'KeyValue', 'Table', 'Steps', 'BarChart', 'LineChart',
  'Series', 'Stat', 'Progress', 'Choice', 'Input', 'DateInput', 'Slider', 'Details', 'Button',
];

/** Most a block's frame may ask for. */
export const GUEST_BLOCK_HEIGHT_MAX = 960;

/** A component agents may write in a UI block, drawn by the extension's own sandboxed frame. */
export type GuestBlockContribution = {
  name: string;
  description: string;
  args: string[];
  /** `.html` inside the package. */
  entry: string;
  /** Height in px until the frame says otherwise. */
  height?: number;
  /** Its frame answers the agent with `answerBlock`, so agents ask with it and a page adds no Send button. */
  answers?: boolean;
};

export type OpenChamberContributes = {
  panel: PanelContribution;
  background?: BackgroundContribution;
  attach?: AttachContribution;
  page?: PageContribution;
  statusSection?: StatusSectionContribution;
  capabilities?: DeclaredGuestCapability[];
  integration?: IntegrationContribution;
  service?: ServiceContribution;
  filesystem?: string[];
  origins?: string[];
  actions?: GuestActionContribution[];
  commands?: GuestCommandContribution[];
  tools?: GuestToolContribution[];
  /** OpenCode provider id to a package `.svg` or `.png`, drawn as that provider's logo, in place of one the app ships. */
  providerLogos?: Record<string, string>;
  /** Editors the Files view opens matching files in. */
  fileEditors?: FileEditorContribution[];
  sourceControl?: SourceControlContribution;
  sessionEvents?: SessionEventsContribution;
  /** Waits agents can start on the service (`waits.ts`). Needs `service`; grants `wake`. */
  waits?: WaitContribution[];
  /** The notification channel a `notifications` service provides; present exactly when it does. */
  notifications?: NotificationsContribution;
  tracker?: TrackerContribution;
  /** The usage provider a `quota` service provides; present exactly when it does. */
  quota?: QuotaContribution;
  /** The service acts on sessions by itself. Needs `service`. Grants `sessionControl`. */
  sessionControl?: SessionControlContribution;
  /** The service adds to what agents read. Needs `service`. Grants `instructions`. */
  instructions?: true;
  /** The service puts marks on sidebar rows (`marks.set`). Needs `service`. Grants `marks`. */
  marks?: true;
  /** A folder of `<name>/SKILL.md` skills inside the package. Grants `skills`. */
  skills?: string;
  /**
   * An OpenCode plugin folder inside the package: a directory with a
   * `package.json` whose entry OpenCode loads. Grants `opencodePlugin`.
   */
  opencodePlugin?: string;
  /** Rows in the composer's `@` menu. Needs `service`. */
  mentions?: MentionsContribution;
  /** Components agents write in UI blocks, each drawn by its own frame. */
  blocks?: GuestBlockContribution[];
  /** Identifiers and links in chat messages a click hands to the extension. Grants `links`. */
  links?: LinksContribution;
};

export const guestActionsNeedConversation = (
  actions: readonly GuestActionContribution[] | undefined,
): boolean => Boolean(actions?.some((action) => action.payload?.includes('messages')));

export type PublicGuestCapabilities = {
  requested: GuestCapability[];
  granted: GuestCapability[];
};

export const requestedGuestCapabilities = (
  contributes: Pick<OpenChamberContributes, 'capabilities' | 'integration' | 'service' | 'filesystem' | 'actions' | 'origins' | 'sessionEvents' | 'sessionControl' | 'instructions' | 'skills' | 'opencodePlugin' | 'links' | 'waits' | 'marks'>,
): GuestCapability[] => {
  const declared = new Set<GuestCapability>(contributes.capabilities ?? []);
  if (guestActionsNeedConversation(contributes.actions)) declared.add('conversation');
  if (contributes.service) declared.add('service');
  if (serviceProvides(contributes.service, 'opencode')) declared.add('opencode');
  if (contributes.integration) declared.add('network');
  if (contributes.filesystem && contributes.filesystem.length > 0) declared.add('filesystem');
  if (contributes.origins && contributes.origins.length > 0) declared.add('origins');
  if (contributes.sessionEvents?.content || contributes.sessionControl?.content) declared.add('transcript');
  if (contributes.sessionControl) declared.add('sessionControl');
  if (contributes.sessionControl?.answers) declared.add('sessionAnswers');
  if (contributes.instructions) declared.add('instructions');
  if (contributes.skills) declared.add('skills');
  if (contributes.opencodePlugin) declared.add('opencodePlugin');
  if (contributes.links) declared.add('links');
  if (contributes.waits && contributes.waits.length > 0) declared.add('wake');
  if (contributes.marks) declared.add('marks');
  return GUEST_CAPABILITIES.filter((capability) => declared.has(capability));
};

export const toPublicSessionEvents = (contribution: SessionEventsContribution): PublicSessionEvents => ({
  events: [...contribution.events],
  content: contribution.content === true,
});

export const hasGuestPage = (
  contributes: Pick<OpenChamberContributes, 'panel'>,
): boolean => Boolean(contributes.panel.entry);

export const isGuestApproved = (capabilities: PublicGuestCapabilities): boolean => (
  capabilities.requested.every((capability) => capabilities.granted.includes(capability))
);

export const hasGuestCapability = (
  capabilities: PublicGuestCapabilities,
  capability: GuestCapability,
): boolean => capabilities.granted.includes(capability);

const isAttachObject = (attach: AttachContribution | undefined): attach is AttachContributionObject => (
  attach !== undefined && attach !== true && attach !== false && attach !== 'panel' && attach !== 'dialog'
);

export const resolveAttachMode = (attach: AttachContribution | undefined): AttachMode | null => {
  if (attach === true || attach === 'panel') return 'panel';
  if (attach === 'dialog') return 'dialog';
  if (isAttachObject(attach)) return attach.mode;
  return null;
};

export const resolveAttachEntry = (
  contributes: Pick<OpenChamberContributes, 'attach'>,
): string | null => {
  const attach = contributes.attach;
  if (!isAttachObject(attach) || attach.mode !== 'dialog') return null;
  return attach.entry ?? null;
};

/**
 * The HTML the full-screen page loads: `panel.entry` for `true`, the object's
 * own `entry` otherwise, which needs no panel page.
 */
export const resolvePageEntry = (contributes: Pick<OpenChamberContributes, 'panel' | 'page'>): string | null => {
  if (!contributes.page) return null;
  return contributes.page === true ? contributes.panel.entry ?? null : contributes.page.entry;
};

/** Whether the full-screen page shows on a phone: `true` follows `panel.mobile`, the object form has its own. */
export const resolvePageMobile = (contributes: Pick<OpenChamberContributes, 'panel' | 'page'>): boolean => {
  if (!contributes.page) return false;
  return (contributes.page === true ? contributes.panel.mobile : contributes.page.mobile) === true;
};

export const resolveStatusSectionEntry = (
  contributes: Pick<OpenChamberContributes, 'panel' | 'statusSection'>,
): string | null => {
  const section = contributes.statusSection;
  if (!section) return null;
  return section === true ? contributes.panel.entry ?? null : section.entry ?? null;
};

export const resolveStatusSectionSource = (
  contributes: Pick<OpenChamberContributes, 'statusSection'>,
): Required<StatusSectionSource> | null => {
  const section = contributes.statusSection;
  if (!section || section === true || !section.source) return null;
  return { path: section.source.path, interval: section.source.interval ?? GUEST_STATUS_SOURCE_INTERVAL_DEFAULT };
};

export const clampStatusSectionHeight = (height: number): number => {
  if (!Number.isFinite(height)) return GUEST_STATUS_SECTION_HEIGHT_DEFAULT;
  return Math.min(GUEST_STATUS_SECTION_HEIGHT_MAX, Math.max(GUEST_STATUS_SECTION_HEIGHT_MIN, Math.round(height)));
};

export type OpenChamberEngines = {
  openchamber: string;
};

/**
 * The parsed manifest. A package writes `id`, `name` and `icon` beside
 * `contributes`; parsing moves them to `contributes.panel`, where older
 * packages keep them, so there is one shape past this point.
 */
export type OpenChamberManifest = {
  apiVersion: OpenChamberManifestApiVersion;
  engines?: OpenChamberEngines;
  contributes: OpenChamberContributes;
};

export type ParseManifestErrorCode =
  | 'not-object'
  | 'missing-openchamber'
  | 'unsupported-api-version'
  | 'invalid-engines'
  | 'invalid-version'
  | 'missing-panel'
  | 'invalid-panel'
  | 'invalid-panel-id'
  | 'invalid-panel-name'
  | 'invalid-panel-icon'
  | 'invalid-panel-entry'
  | 'invalid-background'
  | 'invalid-attach'
  | 'invalid-page'
  | 'invalid-status-section'
  | 'invalid-session-events'
  | 'invalid-session-control'
  | 'invalid-instructions'
  | 'invalid-marks'
  | 'invalid-skills'
  | 'invalid-opencode-plugin'
  | 'invalid-mentions'
  | 'invalid-blocks'
  | 'invalid-links'
  | 'invalid-waits'
  | 'invalid-capabilities'
  | 'invalid-integration'
  | 'invalid-service'
  | 'invalid-filesystem'
  | 'invalid-origins'
  | 'invalid-actions'
  | 'invalid-commands'
  | 'invalid-tools'
  | 'invalid-provider-logos'
  | 'invalid-file-editors';

export type ParseManifestFailure = {
  ok: false;
  code: ParseManifestErrorCode;
  message: string;
};

export type ParseManifestSuccess = {
  ok: true;
  manifest: OpenChamberManifest;
  version?: string;
};

export type ParseManifestResult = ParseManifestSuccess | ParseManifestFailure;

export const isSafeAssetPath = (value: string): boolean => {
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/') || value.includes('://')) {
    return false;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value);
};

export const isGuestPackageSvgIcon = (value: string): boolean => (
  isSafeAssetPath(value) && value.toLowerCase().endsWith('.svg')
);

/** A `contributes.providerLogos` file: the two image types the host serves from a package. */
export const isGuestProviderLogoPath = (value: string): boolean => (
  isSafeAssetPath(value) && /\.(?:svg|png)$/i.test(value)
);

export const toPublicIntegration = (integration: IntegrationContribution): PublicIntegration => {
  const auth = resolveIntegrationAuth(integration) ?? 'oauth';
  const next: PublicIntegration = {
    name: integration.name,
    description: integration.description,
    auth,
  };
  const api = resolveIntegrationApi(integration);
  if (api?.apiOrigin) {
    next.apiOrigin = api.apiOrigin;
  }
  if (auth === 'token' && integration.token) {
    next.token = { scheme: integration.token.scheme ?? 'raw' };
    if (integration.token.usernameLabel) {
      next.token.usernameLabel = integration.token.usernameLabel;
    }
  }
  if (integration.settings && integration.settings.length > 0) {
    next.settings = integration.settings.map((field) => ({
      id: field.id,
      label: field.label,
      ...(field.secret ? { secret: true as const } : {}),
    }));
  }
  return next;
};
export const toPublicService = (
  service: ServiceContribution | undefined,
  granted: boolean,
  socketBindings?: PublicSocketBinding[],
): PublicService | undefined => {
  if (!service) {
    return undefined;
  }
  const next: PublicService = {
    runtime: service.runtime,
    granted,
  };
  if (service.permissions) {
    const permissions: PublicServicePermissions = {};
    if (service.permissions.sockets && service.permissions.sockets.length > 0) {
      permissions.sockets = service.permissions.sockets.map((binding) => binding.id);
    }
    if (service.permissions.exec && service.permissions.exec.length > 0) {
      permissions.exec = [...service.permissions.exec];
    }
    if (permissions.sockets || permissions.exec) {
      next.permissions = permissions;
    }
  }
  if (socketBindings && socketBindings.length > 0) {
    next.socketBindings = socketBindings.map((binding) => ({
      id: binding.id,
      candidates: [...binding.candidates],
      resolved: binding.resolved,
      override: binding.override,
    }));
  }
  if (service.provides && service.provides.length > 0) {
    next.provides = [...service.provides];
  }
  if (service.surface) {
    next.surface = true;
  }
  if (service.keepRunning) {
    next.keepRunning = true;
  }
  if (service.schedule) {
    next.schedule = service.schedule.map((entry) => ({ ...entry }));
  }
  return next;
};
