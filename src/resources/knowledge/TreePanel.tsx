import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderIcon from '@mui/icons-material/Folder';
import ArticleIcon from '@mui/icons-material/Article';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import {
  useCreateNode,
  useDeleteNode,
  useReorderNodes,
  useUpdateNode,
} from './hooks';
import type { NodeKind, NodeTreeItem } from './types';

// Левая панель базы знаний: рекурсивное дерево разделов/страниц с разворачиванием,
// созданием/переименованием/сменой иконки/удалением и нативным drag-and-drop
// (reorder среди сиблингов + перемещение под другого родителя). Все мутации идут
// через хуки knowledge; после успеха вызываем onTreeChanged() — страница перечитает дерево.

interface TreePanelProps {
  tree: NodeTreeItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  // Дёргается после любой успешной мутации дерева (create/update/delete/reorder).
  onTreeChanged: () => void;
}

// Сортировка детей по position на каждом уровне (бэкенд отдаёт уже сортированным,
// дублируем на клиенте для устойчивости после оптимистичных правок).
const sortByPosition = (items: NodeTreeItem[]): NodeTreeItem[] =>
  [...items].sort((a, b) => a.position - b.position);

// Все id поддерева узла (включая сам узел) — для превентивной блокировки drop
// под собственного потомка (бэкенд иначе вернёт KNOWLEDGE_NODE_CYCLE).
const collectSubtreeIds = (node: NodeTreeItem, acc: Set<string>): void => {
  acc.add(node.id);
  for (const child of node.children) collectSubtreeIds(child, acc);
};

// --- Форма создания/редактирования узла (в диалоге) ----------------------

interface NodeFormValues {
  title: string;
  kind: NodeKind;
  icon: string;
}

interface NodeDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  // При создании kind фиксирован (раздел/страница выбрана из меню); при edit — нередактируем.
  initial: NodeFormValues;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: NodeFormValues) => void;
}

const NodeDialog = ({ open, mode, initial, saving, onClose, onSubmit }: NodeDialogProps) => {
  const [title, setTitle] = useState(initial.title);
  const [icon, setIcon] = useState(initial.icon);
  const [touched, setTouched] = useState(false);

  // Сброс полей при каждом открытии (initial меняется вместе с целевым узлом).
  const reset = useCallback(() => {
    setTitle(initial.title);
    setIcon(initial.icon);
    setTouched(false);
  }, [initial.title, initial.icon]);

  const titleError = touched && title.trim().length === 0;

  const handleSubmit = () => {
    setTouched(true);
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed.length > 255) return;
    onSubmit({ title: trimmed, kind: initial.kind, icon: icon.trim() });
  };

  const kindLabel = initial.kind === 'section' ? 'раздел' : 'страницу';
  const dialogTitle =
    mode === 'create'
      ? `Создать ${kindLabel}`
      : `Изменить ${initial.kind === 'section' ? 'раздел' : 'страницу'}`;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" TransitionProps={{ onEnter: reset }}>
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            error={titleError}
            helperText={titleError ? 'Укажите название (до 255 символов)' : ' '}
            inputProps={{ maxLength: 255 }}
            autoFocus
            fullWidth
          />
          <TextField
            label="Иконка (эмодзи)"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="📁"
            helperText="Необязательно: один эмодзи"
            inputProps={{ maxLength: 8 }}
            sx={{ width: 200 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {mode === 'create' ? 'Создать' : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- Диалог подтверждения удаления (каскад поддерева) --------------------

interface DeleteDialogProps {
  node: NodeTreeItem | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteDialog = ({ node, saving, onClose, onConfirm }: DeleteDialogProps) => (
  <Dialog open={node !== null} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Удалить {node?.kind === 'section' ? 'раздел' : 'страницу'}?</DialogTitle>
    <DialogContent>
      <Typography>
        «{node?.title}» и всё вложенное будут удалены безвозвратно (вместе с прикреплёнными
        файлами). Действие необратимо.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>
        Отмена
      </Button>
      <Button
        color="error"
        variant="contained"
        onClick={onConfirm}
        disabled={saving}
        startIcon={saving ? <CircularProgress size={16} /> : undefined}
      >
        Удалить
      </Button>
    </DialogActions>
  </Dialog>
);

// --- Drag-and-drop состояние ---------------------------------------------

// Индикатор места вставки при drag: до/после узла (reorder) либо «внутрь» (смена parent).
type DropZone = 'before' | 'after' | 'inside';

interface DragState {
  draggingId: string;
  // parent_id перетаскиваемого узла — для решения reorder vs move.
  draggingParentId: string | null;
}

interface DropTarget {
  nodeId: string;
  zone: DropZone;
}

// --- Рекурсивная строка узла ---------------------------------------------

interface NodeRowProps {
  node: NodeTreeItem;
  parentId: string | null;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  drag: DragState | null;
  dropTarget: DropTarget | null;
  // id поддерева перетаскиваемого узла (блокируем drop внутрь себя).
  draggingSubtree: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMenu: (e: React.MouseEvent<HTMLElement>, node: NodeTreeItem, parentId: string | null) => void;
  onDragStart: (node: NodeTreeItem, parentId: string | null) => void;
  onDragEnd: () => void;
  onDragOverNode: (e: React.DragEvent, node: NodeTreeItem) => void;
  onDropNode: (node: NodeTreeItem, parentId: string | null) => void;
}

const NodeRow = (props: NodeRowProps) => {
  const {
    node,
    parentId,
    depth,
    selectedId,
    expanded,
    drag,
    dropTarget,
    draggingSubtree,
    onSelect,
    onToggle,
    onMenu,
    onDragStart,
    onDragEnd,
    onDragOverNode,
    onDropNode,
  } = props;

  const isSection = node.kind === 'section';
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const isDragging = drag?.draggingId === node.id;
  // Нельзя бросать перетаскиваемый узел внутрь самого себя/потомков.
  const isInvalidTarget = draggingSubtree.has(node.id);
  const target = dropTarget?.nodeId === node.id ? dropTarget.zone : null;

  return (
    <>
      <Box
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(node, parentId);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          if (!drag || isInvalidTarget || isDragging) return;
          onDragOverNode(e, node);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!drag || isInvalidTarget || isDragging) return;
          onDropNode(node, parentId);
        }}
        onClick={() => onSelect(node.id)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          pl: depth * 2 + 0.5,
          pr: 0.5,
          py: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          borderTop: '2px solid',
          borderBottom: '2px solid',
          borderTopColor: target === 'before' ? 'primary.main' : 'transparent',
          borderBottomColor: target === 'after' ? 'primary.main' : 'transparent',
          bgcolor: isSelected
            ? 'action.selected'
            : target === 'inside'
              ? 'action.hover'
              : 'transparent',
          opacity: isDragging ? 0.4 : 1,
          outline: target === 'inside' ? '1px dashed' : 'none',
          outlineColor: 'primary.main',
          borderRadius: 1,
          '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
          '&:hover .node-actions': { opacity: 1 },
        }}
      >
        {/* Кнопка разворота — только у разделов с детьми; у прочих — отступ-заглушка. */}
        {isSection && hasChildren ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            sx={{ p: 0.25 }}
          >
            {isExpanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 28, flexShrink: 0 }} />
        )}

        {/* Иконка: эмодзи узла либо дефолт по kind. */}
        <Box
          sx={{
            width: 22,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {node.icon ? (
            <Typography component="span" sx={{ fontSize: 16, lineHeight: 1 }}>
              {node.icon}
            </Typography>
          ) : isSection ? (
            <FolderIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          ) : (
            <ArticleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          )}
        </Box>

        <ListItemText
          primary={node.title}
          primaryTypographyProps={{
            noWrap: true,
            variant: 'body2',
            fontWeight: isSection ? 600 : 400,
          }}
          sx={{ my: 0, minWidth: 0 }}
        />

        <IconButton
          className="node-actions"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e, node, parentId);
          }}
          sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      {isSection && isExpanded && hasChildren && (
        <Box>
          {sortByPosition(node.children).map((child) => (
            <NodeRow key={child.id} {...props} node={child} parentId={node.id} depth={depth + 1} />
          ))}
        </Box>
      )}
    </>
  );
};

// --- Контекст-меню узла ---------------------------------------------------

interface MenuState {
  anchor: HTMLElement;
  node: NodeTreeItem;
  parentId: string | null;
}

// --- Основной компонент ---------------------------------------------------

export const TreePanel = ({
  tree,
  loading,
  selectedId,
  onSelect,
  onTreeChanged,
}: TreePanelProps) => {
  const { create, saving: creating } = useCreateNode();
  const { update, saving: updating } = useUpdateNode();
  const { remove, saving: deleting } = useDeleteNode();
  const { reorder, saving: reordering } = useReorderNodes();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Состояние диалогов: создание (с родителем и kind) / редактирование (узел).
  const [createTarget, setCreateTarget] = useState<{ parentId: string | null; kind: NodeKind } | null>(
    null,
  );
  const [editTarget, setEditTarget] = useState<NodeTreeItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NodeTreeItem | null>(null);

  // Drag-and-drop.
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const sortedTree = useMemo(() => sortByPosition(tree), [tree]);

  // Индекс id → parent_id и сами узлы — для reorder и резолва сиблингов.
  const { parentById, nodeById } = useMemo(() => {
    const parents = new Map<string, string | null>();
    const nodes = new Map<string, NodeTreeItem>();
    const walk = (items: NodeTreeItem[], parentId: string | null) => {
      for (const item of items) {
        parents.set(item.id, parentId);
        nodes.set(item.id, item);
        walk(item.children, item.id);
      }
    };
    walk(tree, null);
    return { parentById: parents, nodeById: nodes };
  }, [tree]);

  // Поддерево перетаскиваемого узла (для блокировки невалидных drop). useRef, чтобы
  // не пересчитывать в каждом NodeRow.
  const draggingSubtree = useMemo(() => {
    const set = new Set<string>();
    if (drag) {
      const node = nodeById.get(drag.draggingId);
      if (node) collectSubtreeIds(node, set);
    }
    return set;
  }, [drag, nodeById]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>, node: NodeTreeItem, parentId: string | null) => {
      setMenu({ anchor: e.currentTarget, node, parentId });
    },
    [],
  );
  const closeMenu = useCallback(() => setMenu(null), []);

  // --- Создание --------------------------------------------------------
  const handleCreateSubmit = async (values: NodeFormValues) => {
    if (!createTarget) return;
    try {
      const created = await create({
        parent_id: createTarget.parentId,
        kind: values.kind,
        title: values.title,
        icon: values.icon === '' ? null : values.icon,
      });
      // Раскрываем родителя, чтобы новый узел был виден.
      if (createTarget.parentId) {
        setExpanded((prev) => new Set(prev).add(createTarget.parentId as string));
      }
      setCreateTarget(null);
      onTreeChanged();
      onSelect(created.id);
    } catch {
      // notify уже показан хуком; диалог оставляем открытым для повторной попытки.
    }
  };

  // --- Редактирование (title/icon) -------------------------------------
  const handleEditSubmit = async (values: NodeFormValues) => {
    if (!editTarget) return;
    try {
      await update(editTarget.id, {
        title: values.title,
        icon: values.icon === '' ? null : values.icon,
      });
      setEditTarget(null);
      onTreeChanged();
    } catch {
      // notify показан хуком.
    }
  };

  // --- Удаление --------------------------------------------------------
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
      onTreeChanged();
    } catch {
      // notify показан хуком.
    }
  };

  // --- DnD: вычисление зоны drop по позиции курсора --------------------
  const onDragOverNode = useCallback(
    (e: React.DragEvent, node: NodeTreeItem) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      const ratio = offset / rect.height;
      let zone: DropZone;
      if (node.kind === 'section') {
        // У раздела средняя треть = «внутрь» (смена parent), края = reorder.
        if (ratio < 0.25) zone = 'before';
        else if (ratio > 0.75) zone = 'after';
        else zone = 'inside';
      } else {
        // Страница не контейнер: только before/after (reorder).
        zone = ratio < 0.5 ? 'before' : 'after';
      }
      setDropTarget((prev) =>
        prev && prev.nodeId === node.id && prev.zone === zone ? prev : { nodeId: node.id, zone },
      );
    },
    [],
  );

  // --- DnD: применение drop --------------------------------------------
  const applyReorder = useCallback(
    async (targetParentId: string | null, draggingId: string, anchorId: string, after: boolean) => {
      // Сиблинги целевого parent без перетаскиваемого узла, затем вставка рядом с anchor.
      const siblings =
        targetParentId === null
          ? sortByPosition(tree)
          : sortByPosition(nodeById.get(targetParentId)?.children ?? []);
      const ids = siblings.map((s) => s.id).filter((id) => id !== draggingId);
      const anchorIndex = ids.indexOf(anchorId);
      const insertAt = anchorIndex < 0 ? ids.length : after ? anchorIndex + 1 : anchorIndex;
      ids.splice(insertAt, 0, draggingId);
      try {
        await reorder({ parent_id: targetParentId, ordered_ids: ids });
        onTreeChanged();
      } catch {
        // notify показан хуком.
      }
    },
    [tree, nodeById, reorder, onTreeChanged],
  );

  const onDropNode = useCallback(
    async (node: NodeTreeItem, parentId: string | null) => {
      const current = drag;
      const zone = dropTarget?.nodeId === node.id ? dropTarget.zone : null;
      setDrag(null);
      setDropTarget(null);
      if (!current || !zone) return;
      const draggingId = current.draggingId;
      if (draggingId === node.id) return;

      if (zone === 'inside') {
        // Перемещение под раздел node (смена parent). Бэкенд проверит цикл.
        if (parentById.get(draggingId) === node.id) return; // уже там
        try {
          await update(draggingId, { parent_id: node.id });
          setExpanded((prev) => new Set(prev).add(node.id));
          onTreeChanged();
        } catch {
          // notify (в т.ч. KNOWLEDGE_NODE_CYCLE) показан хуком.
        }
        return;
      }

      // before/after — reorder среди сиблингов целевого узла либо смена parent,
      // если перетаскиваемый узел из другого родителя.
      const after = zone === 'after';
      if (current.draggingParentId === parentId) {
        await applyReorder(parentId, draggingId, node.id, after);
      } else {
        // Узел меняет родителя на parentId соседа: сперва move, затем reorder
        // не нужен — бэкенд кладёт в конец, но для точной позиции делаем reorder
        // после смены parent.
        try {
          await update(draggingId, { parent_id: parentId });
          await applyReorder(parentId, draggingId, node.id, after);
        } catch {
          // notify показан хуком.
        }
      }
    },
    [drag, dropTarget, parentById, update, applyReorder, onTreeChanged],
  );

  const onDragStart = useCallback((node: NodeTreeItem, parentId: string | null) => {
    setDrag({ draggingId: node.id, draggingParentId: parentId });
  }, []);
  const onDragEnd = useCallback(() => {
    setDrag(null);
    setDropTarget(null);
  }, []);

  // Drop на корневую зону (низ панели) — перенос в корень в конец.
  const rootDropRef = useRef<HTMLDivElement>(null);
  const onRootDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const current = drag;
      setDrag(null);
      setDropTarget(null);
      if (!current) return;
      if (parentById.get(current.draggingId) === null) return; // уже в корне
      try {
        await update(current.draggingId, { parent_id: null });
        onTreeChanged();
      } catch {
        // notify показан хуком.
      }
    },
    [drag, parentById, update, onTreeChanged],
  );

  const busy = creating || updating || deleting || reordering;

  // Начальные значения формы создания (kind берётся из createTarget).
  const createInitial: NodeFormValues = {
    title: '',
    kind: createTarget?.kind ?? 'section',
    icon: '',
  };
  const editInitial: NodeFormValues = {
    title: editTarget?.title ?? '',
    kind: editTarget?.kind ?? 'section',
    icon: editTarget?.icon ?? '',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {/* Шапка панели: заголовок + создание в корне. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 1,
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          База знаний
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Создать раздел в корне">
            <span>
              <IconButton
                size="small"
                disabled={busy}
                onClick={() => setCreateTarget({ parentId: null, kind: 'section' })}
              >
                <CreateNewFolderOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Создать страницу в корне">
            <span>
              <IconButton
                size="small"
                disabled={busy}
                onClick={() => setCreateTarget({ parentId: null, kind: 'page' })}
              >
                <NoteAddOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {/* Тело дерева. */}
      <Box
        ref={rootDropRef}
        onDragOver={(e) => {
          if (drag) e.preventDefault();
        }}
        onDrop={onRootDrop}
        sx={{ flex: 1, overflowY: 'auto', px: 0.5, pb: 4 }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : sortedTree.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Создайте первый раздел или страницу
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="center">
              <Button
                size="small"
                variant="outlined"
                startIcon={<CreateNewFolderOutlinedIcon />}
                onClick={() => setCreateTarget({ parentId: null, kind: 'section' })}
              >
                Раздел
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<NoteAddOutlinedIcon />}
                onClick={() => setCreateTarget({ parentId: null, kind: 'page' })}
              >
                Страница
              </Button>
            </Stack>
          </Box>
        ) : (
          sortedTree.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              parentId={null}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              drag={drag}
              dropTarget={dropTarget}
              draggingSubtree={draggingSubtree}
              onSelect={onSelect}
              onToggle={toggle}
              onMenu={openMenu}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverNode={onDragOverNode}
              onDropNode={onDropNode}
            />
          ))
        )}
      </Box>

      {/* Контекст-меню узла. */}
      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menu) setCreateTarget({ parentId: menu.node.id, kind: 'section' });
            closeMenu();
          }}
        >
          <ListItemIcon>
            <CreateNewFolderOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Добавить раздел</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setCreateTarget({ parentId: menu.node.id, kind: 'page' });
            closeMenu();
          }}
        >
          <ListItemIcon>
            <NoteAddOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Добавить страницу</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setEditTarget(menu.node);
            closeMenu();
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Переименовать / иконка</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setDeleteTarget(menu.node);
            closeMenu();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Удалить</ListItemText>
        </MenuItem>
      </Menu>

      {/* Диалог создания. */}
      <NodeDialog
        open={createTarget !== null}
        mode="create"
        initial={createInitial}
        saving={creating}
        onClose={() => setCreateTarget(null)}
        onSubmit={handleCreateSubmit}
      />

      {/* Диалог редактирования. */}
      <NodeDialog
        open={editTarget !== null}
        mode="edit"
        initial={editInitial}
        saving={updating}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEditSubmit}
      />

      {/* Подтверждение удаления. */}
      <DeleteDialog
        node={deleteTarget}
        saving={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
};
