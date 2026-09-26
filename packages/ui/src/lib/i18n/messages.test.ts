import { describe, expect, test } from 'bun:test';

import { dict as enDict } from './messages/en';
import { dict as esDict } from './messages/es';
import { dict as deDict } from './messages/de';
import { dict as frDict } from './messages/fr';
import { dict as jaDict } from './messages/ja';
import { dict as koDict } from './messages/ko';
import { dict as plDict } from './messages/pl';
import { dict as ptBrDict } from './messages/pt-BR';
import { dict as ukDict } from './messages/uk';
import { dict as zhCnDict } from './messages/zh-CN';
import { dict as zhTwDict } from './messages/zh-TW';
import { dict as trDict } from './messages/tr';
import { dict as ruDict } from './messages/ru';
import { extensionsSettingsI18n } from './messages/extensions.settings.i18n';
import { guestIntegrationsI18n } from './messages/guest-integrations.i18n';
import { pluginPanelI18n } from './messages/plugin-panel.i18n';
import { routingI18n } from './messages/routing.i18n';
import { linearIntegrationI18n } from './messages/linear-integration.i18n';
import { linearIssuePickerI18n } from './messages/linear-issue-picker.i18n';
import { linearPanelI18n } from './messages/linear-panel.i18n';

const localeDictionaries = {
  en: enDict,
  de: deDict,
  fr: frDict,
  es: esDict,
  ja: jaDict,
  'pt-BR': ptBrDict,
  uk: ukDict,
  ko: koDict,
  pl: plDict,
  'zh-CN': zhCnDict,
  'zh-TW': zhTwDict,
  tr: trDict,
} as const;

describe('i18n dictionaries', () => {
  test('all locales stay in key parity with english', () => {
    const englishKeys = Object.keys(enDict).sort();

    for (const dictionary of Object.values(localeDictionaries)) {
      expect(Object.keys(dictionary).sort()).toEqual(englishKeys);
    }
  });

  test('all locales expose language label keys', () => {
    for (const [, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary['common.language.german']).toBeTruthy();
      expect(dictionary['common.language.french']).toBeTruthy();
      expect(dictionary['common.language.japanese']).toBeTruthy();
    }
  });

  test('telemetry translations retain the numeric token placeholders', () => {
    for (const dictionary of Object.values(localeDictionaries)) {
      expect(dictionary['chat.workStatus.telemetry.tokens.inOut']).toContain('{input}');
      expect(dictionary['chat.workStatus.telemetry.tokens.inOut']).toContain('{output}');
      for (const parameter of ['input', 'output', 'reasoning']) {
        expect(dictionary['chat.workStatus.telemetry.tokensDescription']).toContain(`{${parameter}}`);
      }
    }
  });

  test('all telemetry rows have translated explanations and compact labels', () => {
    const metrics = ['responseSpeed', 'speed', 'llmDuration', 'toolDuration', 'ttft', 'steps', 'tokens', 'cacheHit', 'cost'] as const;
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      for (const metric of metrics) {
        const label = dictionary[`chat.workStatus.telemetry.${metric}`];
        const description = dictionary[`chat.workStatus.telemetry.${metric}Description`];
        expect(label.length <= 16).toBe(true);
        expect(description.length > 30).toBe(true);
        if (locale !== 'en') expect(description === enDict[`chat.workStatus.telemetry.${metric}Description`]).toBe(false);
      }
    }
  });
  test('Russian dictionary translates newly added 1.24.2.1 settings keys', () => {
    const newlyAdded = [
      'settings.themeImport.selectAll',
      'settings.themeImport.deselectAll',
      'settings.themeImport.complete',
      'settings.themeImport.catalogTitle',
      'settings.themeImport.catalogHint',
      'settings.themeImport.search',
      'settings.themeImport.catalogError',
      'settings.themeImport.empty',
      'settings.themeImport.back',
      'settings.themeImport.chooseFile',
      'settings.themeImport.importSelected',
      'settings.themeImport.installed',
      'settings.themeImport.partialError',
      'settings.themeImport.delete',
      'settings.themeImport.deleteError',
      'settings.themeImport.action',
      'settings.themeImport.busy',
      'settings.themeImport.hint',
      'settings.themeImport.success',
      'settings.themeImport.error.invalid',
      'settings.themeImport.error.include',
      'settings.themeImport.error.size',
      'settings.themeImport.error.background',
      'settings.themeImport.error.save',
      'settings.themeImport.error.connection',
      'settings.themeImport.error.unsupported',
      'settings.themeImport.error.conflict',
      'settings.projects.page.field.projectAgent',
    ] as const;
    for (const key of newlyAdded) {
      expect(ruDict[key]).toBeTruthy();
      expect(ruDict[key]).not.toBe(enDict[key]);
    }
  });

  test('every English key has a Russian translation or an explicit technical-term allowlist entry', () => {
    const technicalTermAllowlist = new Set([
      'settings.view.home.cards.mcp.title', 'settings.page.mcp.title', 'settings.page.git.title',
      'settings.snippets.page.field.namePlaceholder', 'settings.snippets.page.field.aliasesPlaceholder',
      'settings.openchamber.tunnel.badge.quick', 'settings.openchamber.tunnel.badge.remote', 'settings.openchamber.tunnel.badge.local',
      'settings.magicPrompts.sidebar.group.git', 'settings.magicPrompts.sidebar.group.github', 'settings.magicPrompts.sidebar.item.sessionFusion',
      'settings.remoteInstances.direct.field.urlPlaceholder', 'settings.remoteInstances.direct.import.placeholder',
      'settings.remoteInstances.page.field.localHostPlaceholder', 'settings.remoteInstances.page.field.remoteHostPlaceholder',
      'settings.agents.page.field.agentNamePlaceholder', 'settings.agents.page.field.topP', 'settings.commands.page.field.commandNamePlaceholder',
      'settings.gitIdentities.editor.field.sshKeyPathPlaceholder', 'settings.gitIdentities.editor.field.signingKeyPlaceholder',
      'settings.gitIdentities.editor.field.hostPlaceholder', 'settings.skills.sidebar.badge.claude', 'settings.skills.sidebar.badge.agents',
      'settings.skills.sidebar.badge.opencode', 'settings.skills.page.field.skillNamePlaceholder',
      'settings.skills.catalog.conflicts.source.opencode', 'settings.skills.catalog.conflicts.source.agents',
      'settings.skills.catalog.add.descriptionSuffix', 'settings.openchamber.passkeys.title', 'settings.openchamber.opencodeCli.title',
      'settings.openchamber.opencodeCli.field.binaryPathPlaceholder', 'settings.plugins.registry.badge.update.label',
      'settings.plugins.registry.banner.updateAvailable.description', 'settings.projects.page.section.worktree',
      'settings.remoteInstances.page.field.sshCommandPlaceholder', 'settings.remoteInstances.page.patternDialog.destinationPlaceholder',
      'settings.providers.page.auth.apiKeyPlaceholder', 'settings.mcp.page.server.namePlaceholder',
      'settings.mcp.page.connection.serverUrlPlaceholder', 'settings.mcp.page.advanced.oauthClientIdPlaceholder',
      'settings.mcp.page.advanced.oauthClientSecretPlaceholder', 'settings.mcp.page.advanced.oauthRedirectUriPlaceholder',
      'settings.mcp.page.env.keyPlaceholder', 'settings.github.page.accountSource.oauth', 'settings.github.page.accountSource.cli',
      'settings.notifications.page.template.defaults.error.message', 'settings.notifications.page.template.defaults.question.message',
      'settings.voice.page.provider.say', 'settings.openchamber.visual.option.fileEditorKeymap.vim', 'settings.openchamber.visual.field.bash',
      'settings.openchamber.visual.option.mermaidRendering.svg.label', 'settings.openchamber.visual.option.mermaidRendering.ascii.label',
      'settings.openchamber.visual.option.userMessageRendering.markdown.label', 'settings.openchamber.visual.option.messageTransport.ws.label',
      'settings.openchamber.visual.option.messageTransport.sse.label', 'settings.magicPrompts.page.group.sessionFusion.title',
      'settings.extensions.source.zip', 'settings.extensions.source.git', 'chat.chatInput.linked.guest.pr.number',
      'settings.integrations.github.title', 'settings.integrations.linear.title', 'settings.magicPrompts.sidebar.group.linear',
      'contextPanel.mode.linear',
      // Intentionally empty in both locales: Windows command suffix is not needed here.
      'onboarding.localSetup.windows.stepInstallWslSuffix',
      'mobile.menu.mcp',
      'layout.rightSidebar.git',
      'sessions.scheduledTasks.dialog.schedule.cron',
      'sessions.scheduledTasks.dialog.schedule.cronWithTimezone',
      'sessions.scheduledTasks.dialog.schedule.weekdayShort.unknown',
      'sessions.scheduledTasks.editor.scheduleType.cron',
      'sessions.scheduledTasks.editor.time.period.am',
      'sessions.scheduledTasks.editor.time.period.pm',
      'sessions.scheduledTasks.editor.cronExpression.placeholder',
      'multirun.launcher.groupName.placeholder',
      'multirun.launcher.setupCommands.commandPlaceholder',
      'sessions.sidebar.sessionDialogs.ok',
      'gitView.stash.confirmButton',
      'gitView.stashes.itemNumber',
      'gitView.sync.syncCounts',
      'gitView.pr.numberLabel',
      'planView.file.defaultName',
      'header.github.connectedWithLogin',
      'header.github.accountSource.oauth',
      'header.github.accountSource.cli',
      'terminalView.quickKeys.escape',
      'terminalView.quickKeys.tabAria',
      'terminalView.quickKeys.controlLabel',
      'terminalView.quickKeys.enterAria',
      'directoryExplorerDialog.shortcut.enter',
      'session.newWorktree.branchNamePlaceholder',
      'session.newWorktree.worktreeDirectoryPlaceholder',
      'session.newWorktree.issueNumber',
      'session.newWorktree.prNumber',
      'session.newWorktree.includeDiffBadge',
      'session.githubIntegration.selected.issueNumber',
      'session.githubIntegration.selected.prNumber',
      'chat.chatInput.linked.pr.number',
      'chat.modelControls.modality.pdf',
      'chat.modelControls.topP',
      'chat.modelControls.bash',
      'chat.modelControls.webFetch',
      'chat.modelControls.modeValue.none',
      'branchPickerDialog.badge.head',
      'desktopHostSwitcher.field.urlPlaceholder',
      'onboarding.remoteConnection.field.serverAddressPlaceholder',
      'directoryTree.field.newDirectoryPlaceholder',
      'quota.window.api',
      'settings.view.nav.group.general',
      'settings.view.nav.group.opencode',
    ]);

    const moduleDictionaries = [
      [extensionsSettingsI18n.en, extensionsSettingsI18n.ru],
      [guestIntegrationsI18n.en, guestIntegrationsI18n.ru],
      [pluginPanelI18n.en, pluginPanelI18n.ru],
      [routingI18n.en, routingI18n.ru],
      [linearIntegrationI18n.en, linearIntegrationI18n.ru],
      [linearIssuePickerI18n.en, linearIssuePickerI18n.ru],
      [linearPanelI18n.en, linearPanelI18n.ru],
    ] as const;

    for (const [english, russian] of moduleDictionaries) {
      for (const key of Object.keys(english)) {
        if (technicalTermAllowlist.has(key)) continue;
        const englishValue = (english as Record<string, string>)[key];
        const russianValue = (russian as Record<string, string>)[key];
        expect(russianValue).toBeTruthy();
        expect(russianValue).not.toBe(englishValue);
      }
    }

    const missingKeys: string[] = [];
    const englishFallbackKeys: string[] = [];
    const placeholderMismatches: string[] = [];
    const placeholderPattern = /\\{([a-zA-Z0-9_]+)\\}/g;

    for (const key of Object.keys(enDict)) {
      const englishValue = (enDict as Record<string, string>)[key];
      const russianValue = (ruDict as Record<string, string>)[key];

      if (russianValue === undefined || (englishValue.trim() !== '' && russianValue.trim() === '')) {
        missingKeys.push(key);
        continue;
      }

      if (!technicalTermAllowlist.has(key) && russianValue === englishValue) {
        englishFallbackKeys.push(key);
      }

      const englishPlaceholders = [...englishValue.matchAll(placeholderPattern)].map((match) => match[1]).sort();
      const russianPlaceholders = [...russianValue.matchAll(placeholderPattern)].map((match) => match[1]).sort();
      if (englishPlaceholders.join('\\0') !== russianPlaceholders.join('\\0')) {
        placeholderMismatches.push(
          `${key}: expected {${englishPlaceholders.join('}, {')}}; got {${russianPlaceholders.join('}, {')}}`,
        );
      }
    }

    const failures: string[] = [];
    if (missingKeys.length > 0) {
      failures.push(`Missing Russian values (${missingKeys.length}):\\n${missingKeys.join('\\n')}`);
    }
    if (englishFallbackKeys.length > 0) {
      failures.push(
        `English fallback remains (${englishFallbackKeys.length}):\\n${englishFallbackKeys.join('\\n')}`,
      );
    }
    if (placeholderMismatches.length > 0) {
      failures.push(
        `Placeholder mismatches (${placeholderMismatches.length}):\\n${placeholderMismatches.join('\\n')}`,
      );
    }

    expect(failures, failures.join('\\n\\n')).toEqual([]);
  });

});
