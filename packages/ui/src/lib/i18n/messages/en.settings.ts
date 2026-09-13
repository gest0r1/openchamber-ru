import { settingsDict as upstreamSettingsDict } from './en.settings.upstream';

export const settingsDict = {
  ...upstreamSettingsDict,
  'common.language.russian': 'Russian',
} as const;
