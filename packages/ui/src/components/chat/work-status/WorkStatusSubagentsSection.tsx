import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { isVSCodeRuntime } from '@/lib/desktop';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { openSubagentsPanel } from '@/components/chat/subagents/panel';
import { WorkStatusCollapsibleSection } from './WorkStatusPrimitives';
import { SubagentStatusRow } from './SubagentStatusRow';
import { useReportWorkStatusPresence } from './presenceContext';
import { useOpenChildSession } from './useOpenChildSession';
import { useSubagentRows } from './useSubagentRows';

type Props = {
  sessionId: string | null;
  directory: string | null;
};

const SECTION_ID = 'subagents';

export const WorkStatusSubagentsSection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const rows = useSubagentRows(sessionId, directory);
  const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);
  const isMobile = useUIStore((state) => state.isMobile);
  const panelAvailable = !isMobile && !isVSCodeRuntime();

  const hadChildren = React.useRef(rows.length > 0);
  React.useEffect(() => {
    const present = rows.length > 0;
    if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
    hadChildren.current = present;
  }, [rows.length, setSectionExpanded]);

  const openChildSession = useOpenChildSession(directory);

  useReportWorkStatusPresence('subagents', rows.length > 0);

  if (rows.length === 0) return null;

  const busyChildren = rows.filter((row) => row.busy).length;

  return (
    <WorkStatusCollapsibleSection
      id={SECTION_ID}
      title={t('chat.workStatus.section.subagents')}
      icon="ai-agent"
      defaultExpanded
      summary={busyChildren > 0 ? `${busyChildren}/${rows.length}` : rows.length}
      action={panelAvailable && directory ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0 text-muted-foreground"
                onClick={() => openSubagentsPanel(directory)}
                aria-label={t('chat.workStatus.subagent.openPanel')}
              >
                <Icon name="external-link" className="size-[13px]" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t('chat.workStatus.subagent.openPanel')}</TooltipContent>
        </Tooltip>
      ) : undefined}
    >
      <ScrollableOverlay outerClassName="max-h-[21rem]" disableHorizontal>
        {rows.map((row) => {
          const label = row.child.title?.trim() || t('chat.workStatus.subagent.untitled');
          return (
            <WorkStatusRow
              key={child.id}
              onClick={directory ? () => openChildSession(child.id, label) : undefined}
              ariaLabel={[t('chat.workStatus.action.openSubagent', { name: label }), statusLabel].filter(Boolean).join('. ')}
              // The smaller status glyph sits centred in the panel's 13px icon
              // slot, so it lines up under the section icon and the label
              // starts where every other row's does.
              leading={(
                <span className="flex size-[13px] shrink-0 items-center justify-center">
                  <Icon name={icon} className="size-3" style={iconColor ? { color: iconColor } : undefined} />
                </span>
              )}
              label={label}
              tooltip={modelName || undefined}
              value={(
                <>
                  {blocked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.needsPermission')}</WorkStatusValue>
                  ) : asked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.askedQuestion')}</WorkStatusValue>
                  ) : busy ? <SubagentDuration sessionId={child.id} /> : null}
                  {childCost > 0 ? <WorkStatusValue tone="muted">{formatCost(childCost)}</WorkStatusValue> : null}
                </>
              )}
            />
          );
        })}
      </ScrollableOverlay>
    </WorkStatusCollapsibleSection>
  );
};
