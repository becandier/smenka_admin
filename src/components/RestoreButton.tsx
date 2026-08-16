import { useState, type MouseEvent } from 'react';
import { Button, CircularProgress } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';

// Единая кнопка «Восстановить» для мягко удалённых сущностей (unified_soft_delete: тесты,
// чек-листы, шаблоны штрафов, штрафы, начисления — admin.md, «Правило терминологии»).
// Без подтверждения (admin.md, «Тесты»: «Восстановление — без подтверждения») — то же решение
// применено единообразно ко всем ресурсам фичи. stopPropagation — часто используется в строке
// Datagrid с rowClick="edit"/"show", клик по кнопке не должен открывать запись.
export const RestoreButton = ({
  onRestore,
  size = 'small',
  label = 'Восстановить',
}: {
  onRestore: () => Promise<void>;
  size?: 'small' | 'medium' | 'large';
  label?: string;
}) => {
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation();
    setBusy(true);
    try {
      await onRestore();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      color="success"
      variant="outlined"
      startIcon={busy ? <CircularProgress size={14} /> : <RestoreIcon fontSize="small" />}
      onClick={(e: MouseEvent) => void handleClick(e)}
      disabled={busy}
    >
      {label}
    </Button>
  );
};
