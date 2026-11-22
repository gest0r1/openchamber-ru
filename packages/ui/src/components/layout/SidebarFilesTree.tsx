import React from 'react';

import { toast } from '@/components/ui';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { GuestIcon } from '@/components/layout/GuestRailIcon';
import { useGuestActions } from '@/hooks/useGuestSurfaces';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useDraftSpaceTarget } from '@/lib/spaces/useDraftSpaceTarget';
import { panelContentDirectory } from '@/lib/spaces/space-creation-requests';
import { SpacePreparing } from '@/components/session/spaces/SpacePreparing';
import { guestActionsWhere, type GuestActionEntry } from '@/lib/guests/actions';
import { runGuestAction } from '@/lib/guests/run-action';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGitStatus, useGitStore } from '@/stores/useGitStore';
import { useFileTreeUpload } from '@/components/views/files/useFileTreeUpload';
import { useFileContentSearch } from '@/components/views/files/useFileContentSearch';
import { useDirectoryShowHidden } from '@/lib/directoryShowHidden';
import { useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { cn } from '@/lib/utils';
import { isBrowserClientRuntime } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';
import { type FileTreeRow } from './fileTreeRows';
import { FileTreeCrudDialog } from './sidebarFilesTree/FileTreeCrudDialog';
import { FileTreeDropIndicator } from './sidebarFilesTree/FileTreeDropIndicator';
import { FileTreeErrorRow } from './sidebarFilesTree/FileTreeErrorRow';
import { FileTreeFallbackList } from './sidebarFilesTree/FileTreeFallbackList';
import { FileTreeMoveDialog } from './sidebarFilesTree/FileTreeMoveDialog';
import { FileTreeSearchField, type FileTreeSearchMode } from './sidebarFilesTree/FileTreeSearchField';
import { FileTreeToolbar } from './sidebarFilesTree/FileTreeToolbar';
import { MemoizedFileRow } from './sidebarFilesTree/FileRow';
import type { FileNode } from './sidebarFilesTree/fileNode';
import { getDropTargetLabel, normalizePath } from './sidebarFilesTree/treePaths';
import { useFileNameSearch } from './sidebarFilesTree/useFileNameSearch';
import { useFileTreeDialogs } from './sidebarFilesTree/useFileTreeDialogs';
import { useFileTreeDragDrop } from './sidebarFilesTree/useFileTreeDragDrop';
import { useFileTreeGitMarks } from './sidebarFilesTree/useFileTreeGitMarks';
import { useFileTreeListing } from './sidebarFilesTree/useFileTreeListing';
import { useFileTreeOpening } from './sidebarFilesTree/useFileTreeOpening';
import { useFileTreeToggle } from './sidebarFilesTree/useFileTreeToggle';
import { useVirtualFileTree } from './sidebarFilesTree/useVirtualFileTree';

type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  relativePath?: string;
};

// A row is one meta line plus its padding (FileRow's block size); rows are
// measured once mounted, and every file and folder row then estimates at the
// measured height.
const FILE_TREE_ROW_ESTIMATE_PX = 28;

const hasExternalFiles = (dataTransfer: DataTransfer): boolean => (
  Array.from(dataTransfer.types).includes('Files')
);

/** The tree row drag in progress, when this drag event belongs to it. */
const getMoveDragSource = (dataTransfer: DataTransfer): FileTreeEntry | null => (
  Array.from(dataTransfer.types).includes(INTERNAL_FILE_PATH_TYPE) ? getFileTreeDragSource() : null
);

/**
 * The drag data is readable only on drop: check that it is the row the tree
 * recorded, so a source left behind by a drag that never ended moves nothing.
 */
const isDropOfMoveSource = (dataTransfer: DataTransfer, root: string, source: FileTreeEntry): boolean => (
  dataTransfer.getData(INTERNAL_FILE_PATH_TYPE) === getRelativePath(root, source.path)
);

const getExternalFiles = (dataTransfer: DataTransfer): File[] => {
  const items = Array.from(dataTransfer.items);
  if (items.length === 0) return Array.from(dataTransfer.files);

  return items.flatMap((item) => {
    if (item.kind !== 'file' || item.webkitGetAsEntry()?.isDirectory) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
};

const sortNodes = (items: FileNode[]) =>
  items.slice().sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

const normalizePath = (value: string): string => {
  if (!value) return '';

  const raw = value.replace(/\\/g, '/');
  const hadUncPrefix = raw.startsWith('//');

  let normalized = raw.replace(/\/+$/g, '');
  normalized = normalized.replace(/\/+/g, '/');
  if (hadUncPrefix && !normalized.startsWith('//')) {
    normalized = `/${normalized}`;
  }

  if (normalized === '') {
    return raw.startsWith('/') ? '/' : '';
  }

  return normalized;
};

const getRelativePath = (root: string, path: string): string => {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root).replace(/\/+$/, '');
  if (normalizedPath === normalizedRoot) {
    return '.';
  }
  if (!normalizedRoot || !normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath;
  }
  return normalizedPath.slice(normalizedRoot.length + 1);
};

const getDropTargetLabel = (root: string, target: string): string => {
  const relativePath = getRelativePath(root, target);
  if (relativePath !== '.') return relativePath;

  const normalizedRoot = normalizePath(root);
  return normalizedRoot.split('/').filter(Boolean).pop() ?? normalizedRoot;
};

const getParentPath = (value: string): string => {
  const normalized = normalizePath(value);
  const separatorIndex = normalized.lastIndexOf('/');
  if (separatorIndex < 0) return '';
  if (separatorIndex === 0) return '/';
  return normalized.slice(0, separatorIndex);
};

const isAbsolutePath = (value: string): boolean => {
  return value.startsWith('/') || value.startsWith('//') || /^[A-Za-z]:\//.test(value);
};

const DEFAULT_IGNORED_DIR_NAMES = new Set(['node_modules']);

const shouldIgnoreEntryName = (name: string): boolean => DEFAULT_IGNORED_DIR_NAMES.has(name);

const shouldIgnorePath = (path: string): boolean => {
  const normalized = normalizePath(path);
  return normalized === 'node_modules' || normalized.endsWith('/node_modules') || normalized.includes('/node_modules/');
};

// Module-level per-root cache for the file tree. After P1.1 the component
// stays mounted across right-sidebar tab switches, so the cache also stays
// warm during that flow. The cache also survives the close-and-reopen flow
// (the component remounts but the Map is module-scoped) — without this, every
// sidebar reopen would re-list every expanded directory.
//
// LRU by touchedAt; cap is generous because large repos can have hundreds
// of expanded directories and each FileNode is small (~80 bytes). Stale
// roots are evicted on the next touch.
type FileTreeCache = {
  childrenByDir: Record<string, FileNode[]>;
  loadErrorsByDir: Record<string, string>;
  loadedDirs: Set<string>;
  touchedAt: number;
};
const FILE_TREE_CACHE_MAX_ROOTS = 8;
const fileTreeCacheByRoot = new Map<string, FileTreeCache>();
const fileTreeCacheKey = (root: string): string => JSON.stringify([getRuntimeKey(), root]);

const touchCache = (root: string): FileTreeCache | null => {
  const key = fileTreeCacheKey(root);
  const entry = fileTreeCacheByRoot.get(key);
  if (!entry) return null;
  entry.touchedAt = Date.now();
  // Touch on read promotes the key to the end of the Map's iteration order,
  // so the oldest (front) entry is the next eviction candidate.
  fileTreeCacheByRoot.delete(key);
  fileTreeCacheByRoot.set(key, entry);
  return entry;
};

const getOrCreateCache = (root: string): FileTreeCache => {
  const key = fileTreeCacheKey(root);
  const existing = fileTreeCacheByRoot.get(key);
  if (existing) {
    existing.touchedAt = Date.now();
    return existing;
  }
  if (fileTreeCacheByRoot.size >= FILE_TREE_CACHE_MAX_ROOTS) {
    const oldest = fileTreeCacheByRoot.keys().next().value;
    if (oldest !== undefined) {
      fileTreeCacheByRoot.delete(oldest);
    }
  }
  const created: FileTreeCache = {
    childrenByDir: {},
    loadErrorsByDir: {},
    loadedDirs: new Set(),
    touchedAt: Date.now(),
  };
  fileTreeCacheByRoot.set(key, created);
  return created;
};

// --- FileRow with context menu (matching FilesView) ---

interface FileRowProps {
  node: FileNode;
  root: string;
  isExpanded: boolean;
  isActive: boolean;
  isBrowserClient: boolean;
  depth: number;
  /** Open in a context panel tab. */
  isOpen: boolean;
  status?: FileTreeGitStatus | null;
  badge?: { modified: number; added: number } | null;
  isDropTarget: boolean;
  /** The row being dragged to move it; it is dimmed. */
  isDragSource: boolean;
  canUpload: boolean;
  canMove: boolean;
  permissions: {
    canRename: boolean;
    canCreateFile: boolean;
    canCreateFolder: boolean;
    canDelete: boolean;
    canReveal: boolean;
  };
  downloadFile?: (path: string) => Promise<void>;
  /** A plain click opens a preview tab; `pin` (double-click) keeps it. */
  onSelect: (node: FileNode, options?: { pin?: boolean }) => void;
  onToggle: (path: string) => void;
  onRevealPath: (path: string) => void;
  onOpenDialog: (type: 'createFile' | 'createFolder' | 'rename' | 'delete', data: { path: string; name?: string; type?: 'file' | 'directory' }) => void;
  onSetDropTarget: (path: string | null) => void;
  onDropFiles: (directory: string, dataTransfer: DataTransfer) => void;
  onPickFiles: (directory: string) => void;
  onMoveDragChange: (source: FileTreeEntry | null) => void;
  onSetMoveDropTarget: (path: string | null) => void;
  onMoveDrop: (source: FileTreeEntry, targetDirectory: string) => void;
  guestActions: GuestActionEntry[];
}

const FileRow: React.FC<FileRowProps> = ({
  guestActions,
  node,
  root,
  isExpanded,
  isActive,
  isBrowserClient,
  depth,
  isOpen,
  status,
  badge,
  isDropTarget,
  isDragSource,
  canUpload,
  canMove,
  permissions,
  downloadFile,
  onSelect,
  onToggle,
  onRevealPath,
  onOpenDialog,
  onSetDropTarget,
  onDropFiles,
  onPickFiles,
  onMoveDragChange,
  onSetMoveDropTarget,
  onMoveDrop,
}) => {
  const { t } = useI18n();
  const isDir = node.type === 'directory';
  const uploadDirectory = isDir ? node.path : getParentPath(node.path);
  const { canRename, canCreateFile, canCreateFolder, canDelete, canReveal } = permissions;
  const canDownload = !isDir && Boolean(downloadFile);
  const canRevealPath = canReveal && !isBrowserClient;
  const canUploadHere = isDir && canUpload;
  const hasMenuActions = canRename || canCreateFile || canCreateFolder || canUploadHere || canDelete || canDownload || canRevealPath;

  // Menu open state is local to each row so opening a menu in one row
  // never re-renders its siblings. Previously this state lived on the
  // parent, which made every FileRow re-render whenever any menu toggled.
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  const [rightClickOpen, setRightClickOpen] = React.useState(false);

  const handleContextMenu = React.useCallback((event?: React.MouseEvent) => {
    if (!hasMenuActions) return;
    event?.preventDefault();
    setRightClickOpen(true);
  }, [hasMenuActions]);

  const handleInteraction = React.useCallback(() => {
    if (isDir) {
      onToggle(node.path);
    } else {
      onSelect(node);
    }
  }, [isDir, node, onSelect, onToggle]);

  const handleDoubleClick = React.useCallback(() => {
    if (!isDir) onSelect(node, { pin: true });
  }, [isDir, node, onSelect]);

  const handleMenuButtonClick = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setRightClickOpen(false);
    setContextMenuOpen(true);
  }, []);

  const fileActions = guestActionsWhere(guestActions, 'file');

  const renderMenuItems = ({
    Item,
    Separator,
  }: {
    Item: React.ElementType;
    Separator: React.ElementType;
  }) => (
    <>
      {canRename && (
        <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenDialog('rename', node); }}>
          <Icon name="edit" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.rename')}
        </Item>
      )}
      <Item onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        void copyTextToClipboard(node.path).then((result) => {
          if (result.ok) {
            toast.success(t('sidebarFilesTree.toast.pathCopied'));
            return;
          }
          toast.error(t('sidebarFilesTree.toast.copyFailed'));
        });
      }}>
        <Icon name="link" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.copyPath')}
      </Item>
      {!isDir && downloadFile && (
        <Item onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          void downloadFile(node.path).catch((error) => {
            console.error('Download failed:', error);
            toast.error(t('sidebarFilesTree.toast.operationFailed'));
          });
        }}>
          <Icon name="download" className="me-2 h-4 w-4" /> {t(isBrowserClient ? 'sidebarFilesTree.menu.download' : 'sidebarFilesTree.menu.save')}
        </Item>
      )}
      {canRevealPath && (
        <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRevealPath(node.path); }}>
          <Icon name="folder-received" className="me-2 h-4 w-4" /> {t(getRevealLabelKey())}
        </Item>
      )}
      {/* The OS opens it with whatever app owns the type: Word for a .docx, Typora for a .md. */}
      {!isDir && canRevealPath && isDesktopLocalOriginActive() && (
        <Item onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          void openDesktopPath(node.path).then((opened) => {
            if (!opened) toast.error(t('sidebarFilesTree.toast.operationFailed'));
          });
        }}>
          <Icon name="external-link" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.openInDefaultApp')}
        </Item>
      )}
      {fileActions.length > 0 && <Separator />}
      {fileActions.map((entry) => (
        <Item
          key={`${entry.guest.id}:${entry.action.id}`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            void runGuestAction(entry, { kind: 'file', action: entry.action.id, directory: root || null, path: node.path, isDirectory: isDir }, t);
          }}
        >
          <GuestIcon icon={entry.icon} iconSrc={entry.iconSrc} className="me-2 h-4 w-4" /> {entry.action.label}
        </Item>
      ))}
      {isDir && (canCreateFile || canCreateFolder || canUploadHere) && (
        <>
          <Separator />
          {canCreateFile && (
            <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenDialog('createFile', node); }}>
              <Icon name="file-add" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.newFile')}
            </Item>
          )}
          {canCreateFolder && (
            <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenDialog('createFolder', node); }}>
              <Icon name="folder-add" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.newFolder')}
            </Item>
          )}
          {canUploadHere && (
            <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onPickFiles(node.path); }}>
              <Icon name="upload-2" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.uploadFiles')}
            </Item>
          )}
        </>
      )}
      {canDelete && (
        <>
          <Separator />
          <Item
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenDialog('delete', node); }}
            className="text-destructive focus:text-destructive"
          >
            <Icon name="delete-bin" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.delete')}
          </Item>
        </>
      )}
    </>
  );

  // One drag serves both uses: dropped into the chat it attaches the file,
  // dropped on a folder in this tree it moves the entry there.
  const handleDragStart = React.useCallback((e: React.DragEvent) => {
    recordFileTreeDragStart(e);
    const path = getRelativePath(root, node.path);
    if (!path || path === '.') return;
    e.dataTransfer.setData(INTERNAL_FILE_PATH_TYPE, path);
    e.dataTransfer.effectAllowed = canMove ? 'copyMove' : 'copy';
    if (canMove) onMoveDragChange({ path: node.path, type: node.type });
  }, [canMove, node.path, node.type, onMoveDragChange, root]);

  const handleDragEnd = React.useCallback((e: React.DragEvent) => {
    if (canMove) onMoveDragChange(null);
    // A micro-drag suppressed the click this gesture was meant to be (#2368).
    if (shouldTreatFileTreeDragEndAsClick(e)) {
      handleInteraction();
    }
  }, [canMove, handleInteraction, onMoveDragChange]);

  const handleExternalDragOver = React.useCallback((event: React.DragEvent) => {
    if (!canUpload || !uploadDirectory || !hasExternalFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    onSetDropTarget(uploadDirectory);
  }, [canUpload, onSetDropTarget, uploadDirectory]);

  const handleExternalDragLeave = React.useCallback((event: React.DragEvent) => {
    if (!canUpload || !uploadDirectory || !hasExternalFiles(event.dataTransfer)) return;
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    event.stopPropagation();
    onSetDropTarget(null);
  }, [canUpload, onSetDropTarget, uploadDirectory]);

  const handleExternalDrop = React.useCallback((event: React.DragEvent) => {
    if (!canUpload || !uploadDirectory || !hasExternalFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    onDropFiles(uploadDirectory, event.dataTransfer);
  }, [canUpload, onDropFiles, uploadDirectory]);

  const getMoveTarget = React.useCallback((event: React.DragEvent, source: FileTreeEntry): string | null => {
    // A drop near where the drag began stays the click it was meant to be.
    if (isFileTreeDragWithinClickSlop(event)) return null;
    return getFileTreeMoveTarget(source, { path: node.path, type: node.type }, root);
  }, [node.path, node.type, root]);

  const handleRowDragOver = React.useCallback((event: React.DragEvent) => {
    const source = canMove ? getMoveDragSource(event.dataTransfer) : null;
    if (!source) {
      handleExternalDragOver(event);
      return;
    }
    // Rows answer move drags themselves, so the tree root never takes a drop
    // this row refused.
    event.stopPropagation();
    const target = getMoveTarget(event, source);
    onSetMoveDropTarget(target);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, [canMove, getMoveTarget, handleExternalDragOver, onSetMoveDropTarget]);

  const handleRowDrop = React.useCallback((event: React.DragEvent) => {
    const source = canMove ? getMoveDragSource(event.dataTransfer) : null;
    if (!source) {
      handleExternalDrop(event);
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    onSetMoveDropTarget(null);
    const target = getMoveTarget(event, source);
    if (target && isDropOfMoveSource(event.dataTransfer, root, source)) onMoveDrop(source, target);
  }, [canMove, getMoveTarget, handleExternalDrop, onMoveDrop, onSetMoveDropTarget, root]);

  return (
    <ContextMenu open={rightClickOpen} onOpenChange={setRightClickOpen}>
      <ContextMenuTrigger render={(
        <div
          className="group relative flex items-center typography-meta"
          style={{ blockSize: 'calc(max(1lh, 1rem) + 0.5rem)' }}
          onContextMenu={handleContextMenu}
          onDragEnter={handleRowDragOver}
          onDragOver={handleRowDragOver}
          onDragLeave={handleExternalDragLeave}
          onDrop={handleRowDrop}
        />
      )}>
      <FileTreeIndentGuides depth={depth} />
      <button
        type="button"
        onClick={handleInteraction}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={cn(
          'oc-file-tree-row flex w-full items-center gap-1.5 rounded-md py-1 text-start select-none',
          isDropTarget
            ? 'bg-interactive-selection text-interactive-selection-foreground ring-2 ring-inset ring-primary [--oc-file-tree-row-fill:var(--interactive-selection)] [--oc-file-tree-row-ring:var(--primary)]'
            : fileTreeRowStateClassName(isActive),
          isDragSource && 'opacity-50'
        )}
        style={{ paddingInlineStart: fileTreeRowPaddingLeft(depth) }}
      >
        {isDir ? (
          <FileTreeChevron expanded={isExpanded} />
        ) : (
          <FileTypeIcon filePath={node.path} extension={node.extension} className="ms-0.5 size-3.5" />
        )}
        <span className="oc-file-tree-row-name typography-meta" title={node.path}>
          {node.name}
        </span>
        <FileTreeRowEnd className="pe-2">
          {!isDir && <FileTreeFileMarkers isOpen={isOpen} status={status} />}
          {isDir && badge && <FileTreeFolderBadge badge={badge} />}
        </FileTreeRowEnd>
      </button>
      {hasMenuActions && (
        // Takes no width and fades in over the row's end lane, with its own fade over the name.
        // Only on touch screens: with a mouse the row's menu is its right click
        // (Shift+F10 from the keyboard).
        <div className={cn('oc-file-tree-row-end -ms-7 w-7 pe-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-fine:hidden', fileTreeRowMenuFillClassName(isActive || isDropTarget))}>
          <DropdownMenu
            open={contextMenuOpen}
            onOpenChange={setContextMenuOpen}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleMenuButtonClick}
                      aria-label={t('diffView.actions.moreActions')}
                    >
                      <Icon name="more-2-fill" className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>{t('diffView.actions.moreActions')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="bottom" onCloseAutoFocus={() => setContextMenuOpen(false)}>
              {renderMenuItems({ Item: DropdownMenuItem, Separator: DropdownMenuSeparator })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]">
        {renderMenuItems({ Item: ContextMenuItem, Separator: ContextMenuSeparator })}
      </ContextMenuContent>
    </ContextMenu>
  );
};

const areFileRowPropsEqual = (prev: FileRowProps, next: FileRowProps): boolean => (
  prev.node === next.node
  && prev.root === next.root
  && prev.isExpanded === next.isExpanded
  && prev.isActive === next.isActive
  && prev.isBrowserClient === next.isBrowserClient
  && prev.depth === next.depth
  && prev.isOpen === next.isOpen
  && prev.status === next.status
  && prev.badge === next.badge
  && prev.isDropTarget === next.isDropTarget
  && prev.isDragSource === next.isDragSource
  && prev.canUpload === next.canUpload
  && prev.canMove === next.canMove
  && prev.permissions === next.permissions
  && prev.downloadFile === next.downloadFile
  && prev.onSelect === next.onSelect
  && prev.onToggle === next.onToggle
  && prev.onRevealPath === next.onRevealPath
  && prev.onOpenDialog === next.onOpenDialog
  && prev.onSetDropTarget === next.onSetDropTarget
  && prev.onDropFiles === next.onDropFiles
  && prev.onPickFiles === next.onPickFiles
  && prev.onMoveDragChange === next.onMoveDragChange
  && prev.onSetMoveDropTarget === next.onSetMoveDropTarget
  && prev.onMoveDrop === next.onMoveDrop
  && prev.guestActions === next.guestActions
);

const MemoizedFileRow = React.memo(FileRow, areFileRowPropsEqual);

// --- Main component ---

export const SidebarFilesTree: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const runtimeKey = useGitStore((state) => state.runtimeKey);
  const panelDirectory = useEffectiveDirectory() ?? '';
  const draftSpace = useDraftSpaceTarget();
  const directory = panelContentDirectory(draftSpace, panelDirectory) ?? '';
  if (draftSpace?.kind === 'preparing') return <SpacePreparing />;
  return <SidebarFilesTreeContent key={JSON.stringify([runtimeKey, directory])} visible={visible} currentDirectory={directory} panelDirectory={panelDirectory} />;
};

const SidebarFilesTreeContent: React.FC<{ visible: boolean; currentDirectory: string; panelDirectory: string }> = ({ visible, currentDirectory, panelDirectory }) => {
  const { t } = useI18n();
  const { files, runtime } = useRuntimeAPIs();
  const guestActions = useGuestActions();
  const isBrowserClient = isBrowserClientRuntime(runtime.platform);
  const root = normalizePath(currentDirectory.trim());
  const panelRoot = normalizePath(panelDirectory.trim());
  const showHidden = useDirectoryShowHidden();
  const showGitignored = useFilesViewShowGitignored();
  const gitStatus = useGitStatus(visible ? currentDirectory : null);

  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const canSearchContents = Boolean(files.searchContents);
  const [searchMode, setSearchMode] = React.useState<FileTreeSearchMode>('names');
  const [regexSearch, setRegexSearch] = React.useState(false);
  const contentSearchActive = canSearchContents && searchMode === 'contents';
  const contentSearch = useFileContentSearch({
    searchContents: files.searchContents,
    directory: currentDirectory,
    query: debouncedSearchQuery,
    regex: regexSearch,
    includeHidden: showHidden,
    respectGitignore: !showGitignored,
    active: visible && contentSearchActive,
  });

  const EMPTY_PATHS: string[] = React.useMemo(() => [], []);
  const EMPTY_CONTEXT_TABS: Array<{ mode: string; targetPath: string | null }> = React.useMemo(() => [], []);
  const expandedPaths = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.expandedPaths ?? EMPTY_PATHS) : EMPTY_PATHS));
  const expandedPathSet = React.useMemo(() => new Set(expandedPaths), [expandedPaths]);
  const selectedPath = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.selectedPath ?? null) : null));
  const expandPath = useFilesViewTabsStore((state) => state.expandPath);
  const collapseAllExpandedPaths = useFilesViewTabsStore((state) => state.collapseAllExpandedPaths);
  const contextTabs = useUIStore((state) => (panelRoot ? (state.contextPanelByDirectory[panelRoot]?.tabs ?? EMPTY_CONTEXT_TABS) : EMPTY_CONTEXT_TABS));
  const openContextFilePaths = React.useMemo(() => new Set(
    contextTabs
      .map((tab) => (tab.mode === 'file' ? tab.targetPath : null))
      .filter((targetPath): targetPath is string => typeof targetPath === 'string' && targetPath.length > 0)
      .map((targetPath) => normalizePath(targetPath))
  ), [contextTabs]);

  const { childrenByDir, loadErrorsByDir, loadedDirsRef, loadDirectory, refreshRoot, refreshDirectory } = useFileTreeListing({
    root,
    visible,
    showHidden,
    showGitignored,
    expandedPaths,
  });
  const { searchResults, searching } = useFileNameSearch({
    visible,
    currentDirectory,
    contentSearchActive,
    query: debouncedSearchQuery,
    showHidden,
    showGitignored,
  });
  const { getFileStatus, getFolderBadge } = useFileTreeGitMarks(gitStatus, root);
  const { openedMatch, handleOpenFile, handleOpenMatch, handleMatchDragStart, handleMatchDragEnd } = useFileTreeOpening({ root, panelRoot });

  const treeListRef = React.useRef<HTMLUListElement | null>(null);
  const { slidingRowPaths, toggleDirectory } = useFileTreeToggle({ root, treeListRef, loadedDirsRef, loadDirectory });

  const {
    canUpload,
    uploadingDirectory,
    uploadFiles,
    pickFiles,
    uploadElements,
  } = useFileTreeUpload({ root, refreshDirectory });
  const isUploading = uploadingDirectory !== null;
  const {
    dropTarget,
    moveDragPath,
    moveDropTarget,
    pendingMove,
    setPendingMove,
    canMove,
    setDropTarget,
    setMoveDropTarget,
    handleDropFiles,
    handleMoveDragChange,
    handleMoveDrop,
    handleConfirmMove,
    handleRootDragOver,
    handleRootDragLeave,
    handleRootDrop,
  } = useFileTreeDragDrop({ root, panelRoot, canUpload, isUploading, uploadFiles, refreshDirectory, expandPath });
  const dropIndicatorTarget = uploadingDirectory ?? dropTarget;

  const {
    activeDialog,
    setActiveDialog,
    dialogData,
    dialogInputValue,
    setDialogInputValue,
    isDialogSubmitting,
    handleOpenDialog,
    handleDialogSubmit,
  } = useFileTreeDialogs({ root, panelRoot, selectedPath, refreshDirectory });

  const canCreateFile = Boolean(files.writeFile);
  const canCreateFolder = Boolean(files.createDirectory);
  const canRename = Boolean(files.rename);
  const canDelete = Boolean(files.delete);
  const canReveal = Boolean(files.revealPath);

  const fileRowPermissions = React.useMemo(
    () => ({ canRename, canCreateFile, canCreateFolder, canDelete, canReveal }),
    [canRename, canCreateFile, canCreateFolder, canDelete, canReveal]
  );

  const handleRevealPath = React.useCallback((targetPath: string) => {
    if (!files.revealPath) return;
    void files.revealPath(targetPath).catch(() => {
      toast.error(t('sidebarFilesTree.toast.revealFailed'));
    });
  }, [files, t]);

  const { treeRows, virtualRows, totalSize, measureRow, treeListOffset, setTreeScrollElement, attachTreeList, handleTreeFocus, handleTreeBlur } = useVirtualFileTree({
    root,
    childrenByDir,
    expandedPathSet,
    loadErrorsByDir,
    selectedPath,
    moveDragPath,
    slidingRowPaths,
    treeListRef,
  });

  const renderTreeRow = (row: FileTreeRow<FileNode>): React.ReactNode => {
    if (row.kind === 'error') {
      return (
        // As wide as the pane and held at its start, so a tree widened by a long
        // name keeps the message and its button on screen.
        <div
          className="sticky inset-s-0 flex w-[100cqw] items-center gap-2 py-1 pe-2 typography-meta text-muted-foreground"
          style={{ paddingInlineStart: fileTreeRowPaddingLeft(row.depth) }}
        >
          <FileTreeIndentGuides depth={row.depth} />
          <span className="min-w-0 flex-1 truncate text-[var(--status-error)]" title={row.message}>{row.message}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" className="h-6 gap-1" onClick={() => void refreshDirectory(row.directory)}>
                <Icon name="refresh" className="h-3.5 w-3.5" />
                {t('sidebarFilesTree.actions.refreshTitle')}
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>{t('contextTooltips.files.retryFolder')}</TooltipContent>
          </Tooltip>
        </div>
      );
    }
    const { node, depth, isExpanded } = row;
    const isDir = node.type === 'directory';
    return (
      <MemoizedFileRow
        node={node}
        root={root}
        isExpanded={isExpanded}
        isActive={selectedPath === node.path}
        isBrowserClient={isBrowserClient}
        depth={depth}
        isOpen={!isDir && openContextFilePaths.has(node.path)}
        status={!isDir ? getFileStatus(node.path) : undefined}
        badge={isDir ? getFolderBadge(node.path) : undefined}
        isDropTarget={isDir && (dropIndicatorTarget === node.path || moveDropTarget === node.path)}
        isDragSource={moveDragPath === node.path}
        canUpload={canUpload && !isUploading}
        canMove={canMove}
        permissions={fileRowPermissions}
        downloadFile={files.downloadFile}
        onSelect={handleOpenFile}
        onToggle={toggleDirectory}
        onRevealPath={handleRevealPath}
        onOpenDialog={handleOpenDialog}
        onSetDropTarget={setDropTarget}
        onDropFiles={handleDropFiles}
        onPickFiles={pickFiles}
        onMoveDragChange={handleMoveDragChange}
        onSetMoveDropTarget={setMoveDropTarget}
        onMoveDrop={handleMoveDrop}
        guestActions={guestActions}
      />
    );
  };

  const hasTree = Boolean(root && childrenByDir[root]);
  const rootLoadError = root ? loadErrorsByDir[root] : null;
  const isSearchActive = debouncedSearchQuery.trim().length > 0;
  const showsTree = !searching && !isSearchActive && searchResults.length === 0 && !rootLoadError && hasTree && Boolean(root);
  const dropTargetLabel = dropIndicatorTarget ? getDropTargetLabel(root, dropIndicatorTarget) : '';
  const moveDropTargetLabel = moveDropTarget ? getDropTargetLabel(root, moveDropTarget) : '';

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* One band: the search field leads, the tree's actions follow it. The
          band is as tall as the file editor's docked toolbar beside it, so the
          two read as one strip across the panel. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-edge-muted px-2">
        <div className="relative min-w-0 flex-1">
          {canSearchContents ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* The field sits in flow, so the span carries the placement the tooltip anchors to. */}
                  <span className="absolute inset-s-0.5 top-1/2 inline-flex -translate-y-1/2">
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="relative size-6 p-0 text-muted-foreground hover:text-foreground"
                        aria-label={t('sidebarFilesTree.search.mode.aria')}
                      >
                        {/* The field's usual magnifier: the button's hover fill and its
                            tooltip say it opens the search mode menu. */}
                        <Icon name={contentSearchActive ? 'file-search' : 'search'} className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>{t('sidebarFilesTree.search.mode.aria')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" side="bottom">
                <DropdownMenuRadioGroup
                  value={searchMode}
                  onValueChange={(value) => setSearchMode(value === 'contents' ? 'contents' : 'names')}
                >
                  <DropdownMenuRadioItem value="names" closeOnClick className="items-center">
                    <Icon name="search" className="size-3.5" />
                    {t('sidebarFilesTree.search.mode.names')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="contents" closeOnClick className="items-center">
                    <Icon name="file-search" className="size-3.5" />
                    {t('sidebarFilesTree.search.mode.contents')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Icon name="search" className="pointer-events-none absolute inset-s-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            ref={searchInputRef}
            inputSize="compact"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t(contentSearchActive ? 'sidebarFilesTree.search.contentsPlaceholder' : 'sidebarFilesTree.search.placeholder')}
            // The clear button's room is kept only while there is a query, so
            // the empty field's placeholder fits a narrow tree.
            className={cn('ps-7', contentSearchActive ? 'pe-14' : searchQuery.trim().length > 0 ? 'pe-7' : 'pe-2')}
          />
          {contentSearchActive ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="chip"
                  size="xs"
                  aria-pressed={regexSearch}
                  onClick={() => {
                    setRegexSearch((value) => !value);
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t('sidebarFilesTree.search.regexTitle')}
                  className="absolute inset-e-1 top-1/2 h-5 min-w-0 -translate-y-1/2 px-1 font-mono typography-micro"
                >
                  .*
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>{t(regexSearch ? 'contextTooltips.files.searchPlainText' : 'sidebarFilesTree.search.regexTitle')}</TooltipContent>
            </Tooltip>
          ) : null}
          {searchQuery.trim().length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('sidebarFilesTree.search.clearAria')}
                  className={cn('absolute top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground', contentSearchActive ? 'inset-e-8' : 'inset-e-2')}
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>{t('sidebarFilesTree.search.clearAria')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {/* New file, new folder and upload share one "+" menu; showing
            gitignored files, refresh and collapse all are rarer and live in
            "More actions", so the field keeps the width even in a narrow tree. */}
        <ActionToolbar
          className="shrink-0 gap-0.5"
          groups={[[
            (canCreateFile || canCreateFolder || canUpload) && {
              id: 'add',
              label: t('sidebarFilesTree.actions.addMenuTitle'),
              icon: isUploading ? 'loader-4' : 'add',
              iconClassName: isUploading ? 'animate-spin' : undefined,
              menu: (
                <>
                  {canCreateFile ? (
                    <DropdownMenuItem onClick={() => handleOpenDialog('createFile', { path: currentDirectory, type: 'directory' })}>
                      <Icon name="file-add" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.newFile')}
                    </DropdownMenuItem>
                  ) : null}
                  {canCreateFolder ? (
                    <DropdownMenuItem onClick={() => handleOpenDialog('createFolder', { path: currentDirectory, type: 'directory' })}>
                      <Icon name="folder-add" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.newFolder')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpload ? (
                    <DropdownMenuItem disabled={!root || isUploading} onClick={() => pickFiles(root)}>
                      <Icon name="upload-2" className="me-2 h-4 w-4" /> {t('sidebarFilesTree.menu.uploadFiles')}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ),
            },
          ]]}
          menuOnly={[
            {
              id: 'gitignored',
              label: t('filesView.tree.actions.showGitignored'),
              icon: 'file-forbid',
              pressed: showGitignored,
              onSelect: () => setFilesViewShowGitignored(!showGitignored),
            },
            {
              id: 'refresh',
              label: t('sidebarFilesTree.actions.refreshTitle'),
              icon: 'refresh',
              onSelect: () => void refreshRoot(),
            },
            {
              id: 'collapse-all',
              label: t('sidebarFilesTree.actions.collapseAllTitle'),
              icon: 'collapse-vertical',
              onSelect: () => {
                if (root) collapseAllExpandedPaths(root);
              },
            },
          ]}
        />
      </div>

      <div className="relative flex-1 min-h-0">
        <ScrollableOverlay
          ref={setTreeScrollElement}
          outerClassName="h-full min-h-0"
          className={cn('@container px-1.5 py-1.5 [overflow-anchor:none]', (dropIndicatorTarget === root || moveDropTarget === root) && 'bg-interactive-selection/10')}
          onDragEnter={handleRootDragOver}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
        <ul className="flex flex-col">
          {contentSearchActive && contentSearch.status !== 'idle' ? (
            <FileContentSearchResults
              state={contentSearch}
              activeMatchKey={openedMatch && openedMatch.path === selectedPath ? openedMatch.key : null}
              onOpen={handleOpenMatch}
              onDragStart={handleMatchDragStart}
              onDragEnd={handleMatchDragEnd}
            />
          ) : searching ? (
            <li className="flex items-center gap-1.5 px-2 py-1 typography-meta text-muted-foreground">
              <Icon name="loader-4" className="h-4 w-4 animate-spin" />
              {t('sidebarFilesTree.state.searching')}
            </li>
          ) : isSearchActive && searchResults.length === 0 ? (
            <li className="px-2 py-1 typography-meta text-muted-foreground">{t('mobile.files.search.empty')}</li>
          ) : searchResults.length > 0 ? (
            searchResults.map((node) => {
              const isActive = selectedPath === node.path;
              return (
                <li key={node.path} data-file-tree-path={node.path}>
                  <button
                    type="button"
                    onClick={() => handleOpenFile(node)}
                    onDoubleClick={() => handleOpenFile(node, { pin: true })}
                    draggable
                    onDragStart={(e) => {
                      recordFileTreeDragStart(e);
                      // Search results attach to the chat only; they never move.
                      setFileTreeDragSource(null);
                      const path = node.relativePath || getRelativePath(root ?? '', node.path);
                      if (!path || path === '.') return;
                      e.dataTransfer.setData(INTERNAL_FILE_PATH_TYPE, path);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={(e) => {
                      // A micro-drag suppressed the click this gesture was meant to be (#2368).
                      if (shouldTreatFileTreeDragEndAsClick(e)) {
                        void handleOpenFile(node);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-start transition-colors',
                      fileTreeRowStateClassName(isActive)
                    )}
                    title={node.path}
                  >
                    <FileTypeIcon filePath={node.path} extension={node.extension} className="size-3.5" />
                    <span
                      className="oc-ui-start-align min-w-0 flex-1 truncate typography-meta"
                      style={{ direction: 'rtl' }}
                    >
                      {/* Left-to-right marks keep a leading "." in place inside the rtl box. */}
                      {`\u200E${node.relativePath ?? node.path}\u200E`}
                    </span>
                  </button>
                </li>
              );
            })
          ) : rootLoadError ? (
            <li className="flex flex-col gap-2 px-2 py-1 typography-meta text-muted-foreground">
              <span>{rootLoadError}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="xs" className="w-fit gap-1.5" onClick={() => void refreshRoot()}>
                    <Icon name="refresh" className="h-3.5 w-3.5" />
                    {t('sidebarFilesTree.actions.refreshTitle')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>{t('contextTooltips.files.retryFileList')}</TooltipContent>
              </Tooltip>
            </li>
          ) : hasTree && root ? null : (
            <li className="px-2 py-1 typography-meta text-muted-foreground">{t('sidebarFilesTree.state.loading')}</li>
          )}
        </ul>
        {showsTree ? (
          <ul
            ref={attachTreeList}
            className="relative min-w-[max(100%,var(--oc-file-tree-width,0px))]"
            style={{ height: totalSize }}
            onFocus={handleTreeFocus}
            onBlur={handleTreeBlur}
          >
            {virtualRows.map((item) => {
              const row = treeRows[item.index];
              if (!row) return null;
              const path = row.kind === 'node' ? row.node.path : undefined;
              return (
                <li
                  key={item.key}
                  ref={measureRow}
                  data-index={item.index}
                  data-tree-row-path={path}
                  data-tree-disclosure-path={row.kind === 'node' ? path : `${row.directory}/`}
                  data-file-tree-path={row.kind === 'node' && row.node.type === 'file' ? path : undefined}
                  className={cn('absolute inset-x-0 top-0', row.kind === 'node' && 'min-w-max')}
                  style={{ transform: `translateY(${item.start - treeListOffset}px)` }}
                >
                  {renderTreeRow(row)}
                </li>
              );
            })}
          </ul>
        ) : null}
        </ScrollableOverlay>
        <FileTreeDropIndicator
          uploadTarget={dropIndicatorTarget}
          isUploading={isUploading}
          uploadTargetLabel={dropTargetLabel}
          moveTarget={moveDropTarget}
          moveTargetLabel={moveDropTargetLabel}
        />
      </div>

      {uploadElements}

      <FileTreeCrudDialog
        activeDialog={activeDialog}
        dialogData={dialogData}
        inputValue={dialogInputValue}
        isSubmitting={isDialogSubmitting}
        onInputChange={setDialogInputValue}
        onSubmit={() => void handleDialogSubmit()}
        onClose={() => setActiveDialog(null)}
      />

      <FileTreeMoveDialog
        root={root}
        pendingMove={pendingMove}
        onCancel={() => setPendingMove(null)}
        onConfirm={handleConfirmMove}
      />
    </section>
  );
};
