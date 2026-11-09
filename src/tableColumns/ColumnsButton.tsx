import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Popover,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockIcon from '@mui/icons-material/Lock';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

// Кнопка «Столбцы» с выпадающим списком (table_column_settings/admin.md, «Экраны и действия»;
// поведение — макет mockup.html, вкладка «А»). Не знает ни о Datagrid, ни о хранилище:
// получает столбцы в текущем порядке и сообщает о действиях пользователя.

export interface ColumnsMenuItem {
  id: string;
  label: string;
}

export interface ColumnsButtonProps {
  // Настраиваемые столбцы в текущем порядке; первый — ключевой (закреплён).
  columns: readonly ColumnsMenuItem[];
  hidden: readonly string[];
  // Вид отличается от стандартного: точка на кнопке и активная «Сбросить».
  changed: boolean;
  onToggle: (id: string) => void;
  // Переставить столбец на позицию toIndex (индекс в columns, не меньше 1).
  onMove: (id: string, toIndex: number) => void;
  onReset: () => void;
}

// Порог в пикселях, после которого нажатие на ручку считается перетаскиванием.
const DRAG_THRESHOLD = 4;

export const ColumnsButton = ({
  columns,
  hidden,
  changed,
  onToggle,
  onMove,
  onReset,
}: ColumnsButtonProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const grips = useRef(new Map<string, HTMLButtonElement>());
  // Ручка, на которой нужно удержать фокус после перестановки (строка перемещается в DOM).
  const focusId = useRef<string | null>(null);
  // Актуальные порядок и обработчик для слушателей window во время перетаскивания.
  const latest = useRef({ ids: columns.map((c) => c.id), onMove });
  const stopDrag = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    latest.current = { ids: columns.map((c) => c.id), onMove };
    const id = focusId.current;
    if (id === null) return;
    focusId.current = null;
    const grip = grips.current.get(id);
    if (grip !== undefined && document.activeElement !== grip) grip.focus({ preventScroll: true });
  });

  useEffect(() => () => stopDrag.current?.(), []);

  const hiddenSet = new Set(hidden);

  const moveTo = (id: string, toIndex: number) => {
    const ids = latest.current.ids;
    const from = ids.indexOf(id);
    if (from <= 0 || toIndex < 1 || toIndex >= ids.length || toIndex === from) return;
    // Порядок обновляем сразу: следующее событие указателя может прийти раньше рендера.
    const next = ids.filter((x) => x !== id);
    next.splice(toIndex, 0, id);
    latest.current = { ...latest.current, ids: next };
    focusId.current = id;
    latest.current.onMove(id, toIndex);
  };

  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const from = latest.current.ids.indexOf(id);
    moveTo(id, event.key === 'ArrowUp' ? from - 1 : from + 1);
  };

  const onGripPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button > 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const startY = event.clientY;
    let live = false;
    const body = document.body.style;
    const prevCursor = body.cursor;
    const prevSelect = body.userSelect;

    const onPointerMove = (ev: PointerEvent) => {
      if (!live) {
        if (Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
        live = true;
        setDragId(id);
        body.cursor = 'grabbing';
        body.userSelect = 'none';
      }
      const list = listRef.current;
      if (list === null) return;
      // Позиции строк берём по местам в DOM: высота строк одинакова, поэтому место не зависит
      // от того, какой столбец в нём сейчас нарисован.
      const slots = Array.from(list.children).map((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const current = latest.current.ids.indexOf(id);
      let target = -1;
      slots.forEach((mid, i) => {
        if (i < current && ev.clientY < mid && target < 0) target = i;
        if (i > current && ev.clientY > mid) target = i;
      });
      if (target >= 1) moveTo(id, target);
    };

    const finish = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      stopDrag.current = null;
      if (!live) return;
      body.cursor = prevCursor;
      body.userSelect = prevSelect;
      setDragId(null);
    };

    stopDrag.current?.();
    stopDrag.current = finish;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const open = anchor !== null;

  return (
    <>
      <Badge
        variant="dot"
        color="warning"
        overlap="rectangular"
        invisible={!changed}
        sx={{ '& .MuiBadge-badge': { top: 6, right: 6, pointerEvents: 'none' } }}
      >
        <Button
          size="small"
          startIcon={<ViewColumnIcon />}
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={changed ? 'Вид таблицы изменён' : undefined}
        >
          Столбцы
        </Button>
      </Badge>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Столбцы таблицы',
            sx: { minWidth: 260, maxWidth: 360, maxHeight: '70vh', mt: 0.5 },
          },
        }}
      >
        <Box component="ul" ref={listRef} sx={{ listStyle: 'none', m: 0, p: 1 }}>
          {columns.map((column, index) => {
            const locked = index === 0;
            const off = hiddenSet.has(column.id);
            return (
              <Box
                component="li"
                key={column.id}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  height: 36,
                  pl: 0.25,
                  pr: 0.5,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  ...(dragId === column.id && {
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.25)}`,
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
                  }),
                })}
              >
                {locked ? (
                  <Box sx={{ width: 30, flex: 'none' }} />
                ) : (
                  <IconButton
                    size="small"
                    ref={(el: HTMLButtonElement | null) => {
                      if (el === null) grips.current.delete(column.id);
                      else grips.current.set(column.id, el);
                    }}
                    aria-label={`Переместить столбец «${column.label}». Стрелки вверх и вниз меняют порядок`}
                    onPointerDown={(e) => onGripPointerDown(e, column.id)}
                    onKeyDown={(e) => onGripKeyDown(e, column.id)}
                    sx={{
                      cursor: dragId === null ? 'grab' : 'grabbing',
                      touchAction: 'none',
                      color: 'text.disabled',
                      '&:hover': { color: 'text.secondary' },
                      '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
                    }}
                  >
                    <DragIndicatorIcon fontSize="small" />
                  </IconButton>
                )}
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ flex: 1, minWidth: 0, color: off ? 'text.disabled' : 'text.primary' }}
                >
                  {column.label}
                </Typography>
                {locked ? (
                  <Tooltip title="Этот столбец показывается всегда">
                    <Box
                      component="span"
                      role="img"
                      aria-label="Этот столбец показывается всегда"
                      sx={{
                        width: 40,
                        display: 'grid',
                        placeItems: 'center',
                        color: 'text.disabled',
                      }}
                    >
                      <LockIcon sx={{ fontSize: 16 }} />
                    </Box>
                  </Tooltip>
                ) : (
                  <Switch
                    size="small"
                    checked={!off}
                    onChange={() => onToggle(column.id)}
                    inputProps={{ 'aria-label': `Показывать столбец «${column.label}»` }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
          <Button size="small" startIcon={<RestartAltIcon />} disabled={!changed} onClick={onReset}>
            Сбросить
          </Button>
        </Box>
      </Popover>
    </>
  );
};
