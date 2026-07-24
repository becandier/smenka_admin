import { useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { RaRecord } from 'react-admin';
import { TEST_ASSIGNMENT_STATUS_COLOR, testAssignmentStatusLabel } from '../../utils/format';
import {
  attemptsUsed,
  bestPercent,
  dueAt,
  lastAttemptAt,
  memberDisplayName,
  templateTitle,
} from './fields';
import { AttemptReviewDialog } from './AttemptReviewDialog';

const InfoRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ minWidth: 160 }} color="text.secondary">
      {label}
    </Typography>
    <Typography>{children}</Typography>
  </Box>
);

interface AttemptRef {
  id: string;
  label: string;
}

// Контракт TestAssignmentOut (backend.md, «GET .../test-templates/{id}/assignments» и
// «GET .../test-assignments») не содержит id попыток — только денормализованные
// attempts_used/best_percent/last_attempt_at. Чтобы «Строка → детали попытки» (admin.md)
// всё же открывалась, когда данные доступны, читаем опциональные поля last_attempt_id/attempts
// на случай, если бэк их добавит (обратная совместимость: лишние поля в ответе безопасны).
// Открытый вопрос по этому расхождению — docs/tasks/employee_tests/STATUS.md, «Admin».
const extractAttemptRefs = (assignment: RaRecord): AttemptRef[] => {
  const raw = assignment as Record<string, unknown>;
  if (Array.isArray(raw.attempts)) {
    return (raw.attempts as Record<string, unknown>[])
      .filter((a): a is Record<string, unknown> & { id: string } => typeof a.id === 'string')
      .map((a, i) => {
        const number = typeof a.attempt_number === 'number' ? a.attempt_number : i + 1;
        const percent = typeof a.percent === 'number' ? ` — ${a.percent}%` : '';
        return { id: a.id, label: `Попытка ${number}${percent}` };
      });
  }
  if (typeof raw.last_attempt_id === 'string') {
    return [{ id: raw.last_attempt_id, label: 'Последняя попытка' }];
  }
  return [];
};

interface AssignmentDetailDialogProps {
  assignment: RaRecord;
  onClose: () => void;
}

// Деталь назначения (admin.md, «Раздел «Результаты тестов»»): сводка по строке реестра +
// список попыток (если данные доступны, см. extractAttemptRefs) с переходом к разметке
// верно/неверно (AttemptReviewDialog).
export const AssignmentDetailDialog = ({ assignment, onClose }: AssignmentDetailDialogProps) => {
  const attemptRefs = useMemo(() => extractAttemptRefs(assignment), [assignment]);
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);
  const status = String(assignment.status ?? '');

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Назначение: {templateTitle(assignment)}</DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ mb: 2 }}>
          <InfoRow label="Сотрудник">{memberDisplayName(assignment)}</InfoRow>
          <InfoRow label="Статус">
            <Chip
              size="small"
              color={TEST_ASSIGNMENT_STATUS_COLOR[status] ?? 'default'}
              label={testAssignmentStatusLabel(status)}
            />
          </InfoRow>
          <InfoRow label="Лучший результат">{bestPercent(assignment)}</InfoRow>
          <InfoRow label="Попыток">{attemptsUsed(assignment)}</InfoRow>
          <InfoRow label="Дедлайн">{dueAt(assignment)}</InfoRow>
          <InfoRow label="Последняя сдача">{lastAttemptAt(assignment)}</InfoRow>
        </Stack>

        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Попытки
        </Typography>
        {attemptRefs.length === 0 ? (
          <Alert severity="info">
            Реестр назначений пока не отдаёт id попыток (открытый вопрос к бэкенду — см. STATUS.md
            фичи employee_tests). Как только он появится, здесь будет список попыток с переходом к
            разметке верно/неверно.
          </Alert>
        ) : (
          <Stack spacing={1}>
            {attemptRefs.map((a) => (
              <Button
                key={a.id}
                variant="outlined"
                size="small"
                onClick={() => setOpenAttemptId(a.id)}
              >
                {a.label}
              </Button>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>

      {openAttemptId && (
        <AttemptReviewDialog attemptId={openAttemptId} onClose={() => setOpenAttemptId(null)} />
      )}
    </Dialog>
  );
};
