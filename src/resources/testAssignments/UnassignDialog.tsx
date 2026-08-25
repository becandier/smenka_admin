import { useState, type MouseEvent } from 'react';
import { useDataProvider, useNotify, type RaRecord } from 'react-admin';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { isTestAssignmentNotFoundError, testErrorMessage } from '../../utils/format';
import { singleUnassignConfirmParts, type ConfirmParts } from './fields';

// Снятие назначения (test_assignment_unassign): общие для реестра «Результаты тестов»
// (testAssignments/index.tsx — строка и bulk) и диалога управления назначениями теста
// (testTemplates/AssignDialog.tsx, блок «уже назначены») — терминология и подтверждение
// должны совпадать буквально (admin.md, «Терминология строго по ADR-003»). Слова «архив»/
// «отозвать» в интерфейсе не используем — только «Снять назначение» / кнопка «Удалить».
// Тексты подтверждения (ConfirmParts/singleUnassignConfirmParts/bulkUnassignConfirmParts) —
// в ./fields.ts: react-refresh/only-export-components не даёт файлу с компонентами
// параллельно экспортировать обычные функции.

interface UnassignConfirmDialogProps extends ConfirmParts {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Деструктивное подтверждение — кнопка «Удалить» (ADR-003: в интерфейсе есть только
// «Удалить», текст вокруг называет последствия явно).
export const UnassignConfirmDialog = ({
  open,
  title,
  body,
  busy,
  onCancel,
  onConfirm,
}: UnassignConfirmDialogProps) => (
  <Dialog open={open} onClose={() => !busy && onCancel()} maxWidth="xs" fullWidth>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <DialogContentText>{body}</DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} disabled={busy}>
        Отмена
      </Button>
      <Button color="error" variant="contained" onClick={onConfirm} disabled={busy}>
        Удалить
      </Button>
    </DialogActions>
  </Dialog>
);

interface UnassignRowButtonProps {
  record: RaRecord;
  templateTitle: string;
  onDone: () => void;
  size?: 'small' | 'medium';
}

// Кнопка строки «Снять»: подтверждение → DELETE .../test-assignments/{id}
// (test_assignment_unassign/backend.md — снимает при любом attempts_used/статусе). onDone
// решает вызывающий: реестр обновляет весь список (refresh), AssignDialog — перезапрашивает
// список назначений внутри себя, без закрытия (admin.md, «После снятия/назначения»).
export const UnassignRowButton = ({
  record,
  templateTitle,
  onDone,
  size = 'small',
}: UnassignRowButtonProps) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await dataProvider.delete('test-assignments', { id: record.id, previousData: record });
      setConfirming(false);
      notify('Назначение снято', { type: 'success' });
      onDone();
    } catch (err) {
      notify(testErrorMessage(err, 'Не удалось снять назначение'), { type: 'error' });
      // Назначение уже снято кем-то ещё (или в другой вкладке) — строка устарела, освежаем
      // список тем же путём, что и при успехе (admin.md, «Ошибки»).
      if (isTestAssignmentNotFoundError(err)) {
        setConfirming(false);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  const parts = singleUnassignConfirmParts(templateTitle, record);

  return (
    <>
      <Button
        size={size}
        color="error"
        startIcon={busy ? <CircularProgress size={14} /> : <DeleteIcon fontSize="small" />}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        disabled={busy}
      >
        Снять
      </Button>
      <UnassignConfirmDialog
        open={confirming}
        title={parts.title}
        body={parts.body}
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void handleConfirm()}
      />
    </>
  );
};
