import React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { ButtonTooltip, ToolbarTooltipButton } from '@/components/ui/action-toolbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  FILL_VIEWPORT,
  VIEWPORT_PRESETS,
  clampViewportSize,
  presetViewport,
  rotateViewport,
  viewportSize,
  type BrowserViewport,
} from '@/lib/browser/viewport';

export type BrowserColorScheme = 'system' | 'light' | 'dark';

const RESPONSIVE = 'responsive';

const SCHEMES: ReadonlyArray<{ value: BrowserColorScheme; icon: IconName }> = [
  { value: 'system', icon: 'contrast-2' },
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
];

export const BrowserDeviceBar: React.FC<{
  viewport: BrowserViewport;
  onViewportChange: (viewport: BrowserViewport) => void;
  colorScheme: BrowserColorScheme;
  onColorSchemeChange: (scheme: BrowserColorScheme) => void;
  scale: number;
  panelSize: { width: number; height: number };
}> = ({ viewport, onViewportChange, colorScheme, onColorSchemeChange, scale, panelSize }) => {
  const { t } = useI18n();
  const size = viewportSize(viewport);
  const presetId = viewport.kind === 'preset' ? viewport.id : RESPONSIVE;
  const presetLabel = (id: string) => (
    id === RESPONSIVE ? t('contextPanel.browser.device.responsive') : VIEWPORT_PRESETS.find((preset) => preset.id === id)?.label ?? id
  );
  const shownPanelSize = { width: Math.round(panelSize.width), height: Math.round(panelSize.height) };

  const commitSize = (side: 'width' | 'height', raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const current = size ?? shownPanelSize;
    onViewportChange({
      kind: 'custom',
      width: clampViewportSize(side === 'width' ? parsed : current.width),
      height: clampViewportSize(side === 'height' ? parsed : current.height),
    });
  };

  const sizeInputClass = cn(
    'w-11 min-w-0 bg-transparent text-center typography-meta tabular-nums text-foreground outline-none',
    'placeholder:text-muted-foreground',
  );

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-[var(--surface-background)] px-2 py-1">
      {/* This bar's tooltips open above it: below sits the page. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <select
              value={presetId}
              onChange={(event) => {
                const next = presetViewport(event.target.value);
                onViewportChange(next ?? FILL_VIEWPORT);
              }}
              aria-label={t('contextPanel.browser.device.preset')}
              className={cn(
                'oc-raised oc-field h-6 shrink-0 rounded-full bg-[var(--surface-elevated)] px-2',
                'typography-micro text-foreground outline-none',
              )}
            >
              <option value="">{t('contextPanel.browser.device.responsive')}</option>
              {VIEWPORT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </span>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>{t('contextPanel.browser.device.preset')}</TooltipContent>
      </Tooltip>

      <div className="oc-raised oc-field flex h-7 shrink-0 items-center rounded-md bg-[var(--surface-elevated)] px-1">
        <input
          value={size ? String(size.width) : ''}
          onChange={(event) => commitSize('width', event.target.value)}
          placeholder={shownPanelSize.width > 0 ? String(shownPanelSize.width) : ''}
          inputMode="numeric"
          aria-label={t('contextPanel.browser.device.width')}
          className={sizeInputClass}
        />
        <span className="typography-meta text-muted-foreground" aria-hidden="true">×</span>
        <input
          value={size ? String(size.height) : ''}
          onChange={(event) => commitSize('height', event.target.value)}
          placeholder={shownPanelSize.height > 0 ? String(shownPanelSize.height) : ''}
          inputMode="numeric"
          aria-label={t('contextPanel.browser.device.height')}
          className={sizeInputClass}
        />
      </div>
      <ToolbarTooltipButton
        icon="anticlockwise-2"
        label={t('contextPanel.browser.device.rotate')}
        onClick={() => onViewportChange(rotateViewport(viewport))}
        disabled={!size}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          {/* The span keeps the tooltip on a disabled button, which takes no pointer events. */}
          <span className="inline-flex shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-6 shrink-0 rounded-full px-0 text-muted-foreground hover:text-foreground"
              onClick={() => onViewportChange(rotateViewport(viewport))}
              disabled={!size}
              aria-label={t('contextPanel.browser.device.rotate')}
            >
              <Icon name="refresh" className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>{t('contextPanel.browser.device.rotate')}</TooltipContent>
      </Tooltip>

      {/* Only worth saying when the page is not shown at its real size. */}
      {size && scale < 1 ? (
        <span className="shrink-0 typography-micro tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
      ) : null}

      <div className="ms-auto flex shrink-0 items-center gap-1">
        {(['system', 'light', 'dark'] as const).map((scheme) => (
          <Tooltip key={scheme}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={colorScheme === scheme ? 'secondary' : 'ghost'}
                size="xs"
                className={cn(
                  'shrink-0 rounded-full px-2.5 typography-micro',
                  colorScheme === scheme ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onColorSchemeChange(scheme)}
                aria-pressed={colorScheme === scheme}
              >
                {t(scheme === 'system'
                  ? 'contextPanel.browser.device.schemeSystem'
                  : scheme === 'light'
                    ? 'contextPanel.browser.device.schemeLight'
                    : 'contextPanel.browser.device.schemeDark')}
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>
              {t(scheme === 'system'
                ? 'contextTooltips.terminalBrowser.device.schemeSystem'
                : scheme === 'light'
                  ? 'contextTooltips.terminalBrowser.device.schemeLight'
                  : 'contextTooltips.terminalBrowser.device.schemeDark')}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};
