import { describe, expect, test } from 'bun:test';

import { dict as enDict } from './messages/en';
import { dict as ruDict } from './messages/ru';

const technicalTermAllowlist = new Set([
  'settings.gitlab.title', 'settings.gitlab.cli.label', 'settings.gitIdentities.editor.auth.ssh',
  'gitView.hydration.kind.lfs', 'gitView.mr.walkthroughScope', 'header.gitlab.connectedWithLogin',
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
  'settings.projects.shared.plansDirPlaceholder',
  'settings.agents.page.permissionsEditor.effectiveHint',
  'settings.openchamber.keyboardShortcuts.action.switch_session_tab.suffix',
  'settings.openchamber.keyboardShortcuts.action.switch_context_surface.suffix',
  'settings.providers.page.custom.field.providerID.placeholder',
  'settings.providers.page.custom.field.protocol.openaiChat',
  'settings.providers.page.custom.field.protocol.openaiResponses',
  'settings.providers.page.custom.field.protocol.anthropicMessages',
  'settings.providers.page.custom.field.baseURL.placeholder',
  'settings.providers.page.custom.field.apiKey.placeholder',
  'settings.providers.page.custom.models.idPlaceholder',
  'settings.providers.page.custom.models.namePlaceholder',
  'settings.providers.page.custom.headers.keyPlaceholder',
  'settings.voice.page.provider.openai',
  'mobile.connect.url.placeholder',
  'sessions.sidebar.header.projectSort.aToZ',
  'sessions.sidebar.header.projectSort.zToA',
  'terminalView.quickKeys.altLabel',
  'chat.workStatus.section.mcp',
  'chat.workStatus.breakdown.mcpCountSingle',
  'chat.workStatus.breakdown.mcpCountPlural',
  // Product names, protocol tokens, code-like placeholders, and locale-neutral value templates.
  'settings.openchamber.tools.browserProvider.option.builtin',
  'settings.providers.page.custom.models.variantsPlaceholder',
  'settings.integrations.thirdParty.opencodeClaude.name',
  'settings.integrations.extensionCatalog.excalidraw.name',
  'settings.mcp.page.advanced.codemode',
  'settings.mcp.page.advanced.protocolOption.revision20260728',
  'settings.mcp.page.advanced.oauth',
  'settings.mcp.page.advanced.oauthMetadataUrlPlaceholder',
  'usageStats.tokens.legendValue',
  'multirun.overview.card.diff',
]);

describe('Russian i18n coverage', () => {
  test('Russian dictionary stays in exact key parity with English', () => {
    expect(Object.keys(ruDict).sort()).toEqual(Object.keys(enDict).sort());
  });

  test('every non-technical English value is translated and placeholders are preserved', () => {
    const missingKeys: string[] = [];
    const englishFallbackKeys: string[] = [];
    const placeholderMismatches: string[] = [];
    const placeholderPattern = /\{([a-zA-Z0-9_]+)\}/g;

    for (const key of Object.keys(enDict)) {
      const englishValue = (enDict as Record<string, string>)[key];
      const russianValue = (ruDict as Record<string, string>)[key];

      if (russianValue === undefined || (englishValue.trim() !== '' && russianValue.trim() === '')) {
        missingKeys.push(key);
        continue;
      }

      if (!technicalTermAllowlist.has(key) && russianValue === englishValue) {
        englishFallbackKeys.push(`${key}\t${JSON.stringify(englishValue)}`);
      }

      const englishPlaceholders = [...englishValue.matchAll(placeholderPattern)].map((match) => match[1]).sort();
      const russianPlaceholders = [...russianValue.matchAll(placeholderPattern)].map((match) => match[1]).sort();
      if (englishPlaceholders.join('\0') !== russianPlaceholders.join('\0')) {
        placeholderMismatches.push(
          `${key}: expected {${englishPlaceholders.join('}, {')}}; got {${russianPlaceholders.join('}, {')}}`,
        );
      }
    }

    const failures: string[] = [];
    if (missingKeys.length > 0) failures.push(`Missing Russian values (${missingKeys.length}):\n${missingKeys.join('\n')}`);
    if (englishFallbackKeys.length > 0) failures.push(`English fallback remains (${englishFallbackKeys.length}):\n${englishFallbackKeys.join('\n')}`);
    if (placeholderMismatches.length > 0) failures.push(`Placeholder mismatches (${placeholderMismatches.length}):\n${placeholderMismatches.join('\n')}`);
    if (failures.length > 0) throw new Error(failures.join('\n\n'));
  });
});
