import type { KeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from 'react';
import { Box, IconButton, Switch, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockIcon from '@mui/icons-material/Lock';
import type { ColumnsMenuItem } from './ColumnsButton';

// Строки выпадающего списка «Столбцы»: ручка, название, переключатель (или замок у ключевого
// столбца). Состояние перетаскивания и обработчики — в ColumnsButton.

export interface ColumnsListProps {
  // Первый — ключевой (закреплён).
  columns: readonly ColumnsMenuItem[];
  hidden: readonly string[];
  dragId: string | null;
  listRef?: Ref<HTMLUListElement>;
  gripRef: (id: string, el: HTMLButtonElement | null) => void;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
  onGripKeyDown: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void;
  onToggle: (id: string) => void;
}

// Ширина ручки (IconButton size="small"); то же место остаётся пустым, когда ручки нет.
const GRIP_WIDTH = 30;

export const ColumnsList = ({
  columns,
  hidden,
  dragId,
  listRef,
  gripRef,
  onGripPointerDown,
  onGripKeyDown,
  onToggle,
}: ColumnsListProps) => {
  const hiddenSet = new Set(hidden);
  // Переставлять есть что, только когда после ключевого столбца их хотя бы два: иначе ручки
  // нет вовсе — ни перетаскивания, ни стрелок, ни «активного» вида без действия.
  const reorderable = columns.length > 2;
  return (
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
            {locked || !reorderable ? (
              <Box sx={{ width: GRIP_WIDTH, flex: 'none' }} />
            ) : (
              <IconButton
                size="small"
                ref={(el: HTMLButtonElement | null) => gripRef(column.id, el)}
                aria-label={`Переместить столбец «${column.label}». Стрелки вверх и вниз меняют порядок`}
                onPointerDown={(e) => onGripPointerDown(e, column.id)}
                onKeyDown={(e) => onGripKeyDown(e, column.id)}
                sx={{
                  width: GRIP_WIDTH,
                  height: GRIP_WIDTH,
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
                  sx={{ width: 40, display: 'grid', placeItems: 'center', color: 'text.disabled' }}
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
  );
};
