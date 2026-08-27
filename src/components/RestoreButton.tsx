import { useState, type MouseEvent, type ReactNode } from 'react';
import { Button, CircularProgress } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';

// Единая кнопка «Восстановить» для мягко удалённых сущностей (unified_soft_delete: тесты,
// чек-листы, шаблоны штрафов, штрафы, начисления — admin.md, «Правило терминологии»).
// Без подтверждения (admin.md, «Тесты»: «Восстановление — без подтверждения») — то же решение
// применено единообразно ко всем ресурсам фичи. stopPropagation — часто используется в строке
// Datagrid с rowClick="edit"/"show", клик по кнопке не должен открывать запись.
// disabled/startIcon — опциональны, только чтобы кнопку можно было обернуть
// FeatureLockButton'ом (subscription/FeatureLock.tsx): тот подмешивает их через
// cloneElement, и без реального прокидывания в нативную кнопку дизейбл не сработал бы —
// клик всё равно долетел бы до onClick раньше перехвата на обёртке.
export const RestoreButton = ({
  onRestore,
  size = 'small',
  label = 'Восстановить',
  disabled = false,
  startIcon,
}: {
  onRestore: () => Promise<void>;
  size?: 'small' | 'medium' | 'large';
  label?: string;
  disabled?: boolean;
  startIcon?: ReactNode;
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
      startIcon={
        startIcon ?? (busy ? <CircularProgress size={14} /> : <RestoreIcon fontSize="small" />)
      }
      onClick={(e: MouseEvent) => void handleClick(e)}
      disabled={disabled || busy}
    >
      {label}
    </Button>
  );
};
