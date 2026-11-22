import type {
  AttachContribution,
  FileEditorContribution,
  GuestActionContribution,
  GuestBlockContribution,
  GuestCapability,
  GuestCommandContribution,
  GuestLinkAction,
  GuestSurfaceDock,
  GuestToolContribution,
  PublicService,
  PublicGuestCapabilities,
  PublicIntegration,
  PublicNotifications,
  PublicQuota,
  PublicTracker,
  PublicSessionEvents,
  PublicSourceControl,
  PublicWait,
} from '@openchamber/sdk';

export type GuestSource = 'bundled' | 'path' | 'zip' | 'git';

export type InstalledGuest = {
  id: string;
  storageId?: string;
  name: string;
  icon: string;
  entry?: string;
  entryDock?: GuestSurfaceDock;
  entrySize?: number;
  /** `panel.mobile`: the phone may show `entry` (panel, its live-screen dock, attach). */
  entryMobile?: true;
  /** Sandboxed HTML loaded on demand for actions and commands, without a rail surface. */
  backgroundEntry?: string;
  version?: string;
  revision?: number;
  attach?: AttachContribution;
  attachEntry?: string;
  pageEntry?: string;
  pageTitle?: string;
  /** The phone may show the page; the server already resolved `page: true` against `panel.mobile`. */
  pageMobile?: true;
  /** HTML of the extension's Work Status section (`contributes.statusSection`); may exist without `entry`. */
  statusEntry?: string;
  statusSource?: { path: string; interval: number };
  statusTitle?: string;
  statusHeight?: number;
  statusDefaultExpanded?: boolean;
  statusRequiresProject?: boolean;
  integration?: PublicIntegration;
  filesystem?: string[];
  origins?: string[];
  service?: PublicService;
  sourceControl?: PublicSourceControl;
  sessionEvents?: PublicSessionEvents;
  /** The waits agents may start on the service (`contributes.waits`), named on the approval dialog. */
  waits?: Array<Pick<PublicWait, 'id' | 'title'>>;
  /** The notification channel from `contributes.notifications`, when the service provides `notifications`. */
  notifications?: PublicNotifications;
  tracker?: PublicTracker;
  /** The usage provider from `contributes.quota`, when the service provides `quota`: the OpenCode providers whose credentials it receives. */
  quota?: PublicQuota;
  /** The service acts on sessions by itself; `content` lets it read the agent's answers. */
  sessionControl?: { content: boolean };
  /** The service adds to what agents read. */
  instructions?: true;
  /** The service puts marks on sidebar rows (`contributes.marks`). */
  marks?: true;
  /** The package ships skills for every agent. */
  skills?: true;
  /** The package ships an OpenCode plugin, listed in the managed OpenCode config while the extension is on. */
  opencodePlugin?: true;
  /** `contributes.providerLogos`: OpenCode provider id to a package image, drawn in place of a logo the app ships. */
  providerLogos?: Record<string, string>;
  /** The section the extension adds to the composer's `@` menu. */
  mentions?: { label: string };
  /** Identifiers and links in chat messages a click hands to the extension (`contributes.links`, compiled by the server). */
  links?: PublicGuestLinks;
  /** What the running service says is missing; shown on its card. */
  needsConfiguration?: string;
  /** Declared `contributes.blocks`; agents write them only for an active guest. */
  blocks?: GuestBlockContribution[];
  /** Declared `contributes.actions`; the UI shows them only for an active guest. */
  actions?: GuestActionContribution[];
  commands?: GuestCommandContribution[];
  tools?: GuestToolContribution[];
  /** The integration setting values this guest's card links read as `{settings.<id>}`. Only the catalog carries them. */
  toolLinkSettings?: Record<string, string>;
  /** Declared `contributes.fileEditors`; the Files view opens matching files in them only for an active guest. */
  fileEditors?: FileEditorContribution[];
  capabilities: PublicGuestCapabilities;
  enterpriseBlocked?: GuestCapability[];
  source?: GuestSource;
  path?: string | null;
  enabled?: boolean;
  folders?: string[];
  origin?: GuestGitOrigin;
  update?: GuestUpdate;
};

export type UnreadableGuest = { id: string | null; name: string | null; builtIn: boolean };

/**
 * How extensions' OpenCode plugins reach the OpenCode this server works with:
 * `file` through the managed config a managed OpenCode watches, `restart` merged
 * into `OPENCODE_CONFIG_CONTENT` for the next start (the user's environment sets
 * `OPENCODE_CONFIG`), `none` for an external OpenCode on this machine, `remote`
 * for one on another machine. `inGlobalConfig` names the extensions whose
 * plugin folder the user's global OpenCode config at `globalConfigPath` lists;
 * the path is null while no installed package ships a plugin, since the
 * server reads that config only then.
 */
export type OpenCodePluginDeliveryState = 'file' | 'restart' | 'none' | 'remote';

export type OpenCodePlugins = {
  delivery: OpenCodePluginDeliveryState;
  globalConfigPath: string | null;
  inGlobalConfig: string[];
};

/** `contributes.links` as the catalog serves it: literal keys and compiled link patterns. */
export type PublicGuestLinks = {
  action: GuestLinkAction;
  keys: string[];
  urls: {
    origin: string;
    /** Anchored; the identifier a query template carries is checked against it. */
    identifierPattern: string;
    patterns: Array<{ path: string; query?: { name: string } }>;
    /** A template the host fills from an identifier alone, or null. */
    itemTemplate: string | null;
  } | null;
};

export type GuestCatalog = { guests: InstalledGuest[]; unreadable: UnreadableGuest[]; opencodePlugins: OpenCodePlugins | null };

export type GuestGitOrigin = { url: string; ref?: string };

export type GuestUpdate = { version: string };
