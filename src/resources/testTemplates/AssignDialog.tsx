import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataProvider, useGetList, useNotify, type RaRecord } from 'react-admin';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import { formatMemberNameFlat, type MemberNameSource } from '../../utils/memberName';
import {
  TEST_ASSIGNMENT_STATUS_COLOR,
  testAssignmentStatusLabel,
  testErrorMessage,
} from '../../utils/format';
import { localInputToUtcIso } from '../../utils/dates';
import { attemptsUsed, bestPercent, dueAt, memberDisplayName } from '../testAssignments/fields';
import { UnassignRowButton } from '../testAssignments/UnassignDialog';
import { useOrgTimezone } from '../../utils/useOrgTimezone';

interface MemberOption {
  id: string;
  label: string;
}

interface AssignDialogProps {
  templateId: string;
  templateTitle: string;
  templateDeleted?: boolean;
  open: boolean;
  onClose: () => void;
}

// Строка блока «уже назначены»: имя, статус-чип (как в реестре «Результаты тестов»), попытки,
// лучший %, дедлайн, кнопка «Снять» (admin.md, «Изменение 3»). Данные — из
// GET .../test-templates/{id}/assignments (TestAssignmentOut без template — title уже
// известен диалогу через templateTitle prop).
const AssignedRow = ({
  record,
  templateTitle,
  onUnassigned,
  timeZone,
}: {
  record: RaRecord;
  templateTitle: string;
  onUnassigned: () => void;
  timeZone: string;
}) => {
  const status = String(record.status ?? '');
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap>{memberDisplayName(record)}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {attemptsUsed(record)} попыток · лучший {bestPercent(record)} · дедлайн{' '}
          {dueAt(record, timeZone)}
        </Typography>
      </Box>
      <Chip
        size="small"
        color={TEST_ASSIGNMENT_STATUS_COLOR[status] ?? 'default'}
        label={testAssignmentStatusLabel(status)}
      />
      <UnassignRowButton record={record} templateTitle={templateTitle} onDone={onUnassigned} />
    </Stack>
  );
};

// Диалог «Назначения теста «{название}»» (admin.md, «Изменение 3»): управление назначениями
// этого теста — «уже назначены» (список + снятие) и «Назначить ещё» (прежняя форма). Остаётся
// открытым и после снятия, и после назначения — только перезапрашивает список назначений
// (без onDone/автозакрытия, в отличие от прежней версии диалога).
export const AssignTestDialog = ({
  templateId,
  templateTitle,
  templateDeleted = false,
  open,
  onClose,
}: AssignDialogProps) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const timeZone = useOrgTimezone();

  // --- Блок «уже назначены» ---
  const [assignments, setAssignments] = useState<RaRecord[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const loadAssignments = useCallback(async (): Promise<void> => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const res = await dataProvider.getTestTemplateAssignments(templateId);
      setAssignments((res?.items ?? []) as RaRecord[]);
    } catch (e) {
      setAssignmentsError(testErrorMessage(e, 'Не удалось загрузить назначения'));
    } finally {
      setAssignmentsLoading(false);
    }
  }, [dataProvider, templateId]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const assignedMemberIds = useMemo(
    () =>
      new Set(
        assignments.map((a) => String((a.member as { id?: string } | undefined)?.id ?? '')),
      ),
    [assignments],
  );

  // --- Блок «назначить ещё» (прежняя форма AssignTestDialog) ---
  // member_ids — id записи участия (members.id, он же organization_members.id): контракт
  // test_assignments.member_id — FK organization_members (backend.md), а MemberResponse.id —
  // именно «UUID записи об участии».
  const { data: members } = useGetList<MemberNameSource & { id: string }>(
    'members',
    { pagination: { page: 1, perPage: 500 }, sort: { field: 'user_name', order: 'ASC' } },
    { enabled: open, staleTime: 5 * 60 * 1000 },
  );

  // Уже назначенные сотрудники из выпадающего списка не убираются — повторное назначение
  // обновляет дедлайн, рабочий сценарий (admin.md) — только помечаются пометкой.
  const options = useMemo<MemberOption[]>(
    () =>
      (members ?? []).map((m) => {
        const label = formatMemberNameFlat(m);
        return {
          id: String(m.id),
          label: assignedMemberIds.has(String(m.id)) ? `${label} (уже назначен)` : label,
        };
      }),
    [members, assignedMemberIds],
  );

  const [selected, setSelected] = useState<MemberOption[]>([]);
  const [dueAtInput, setDueAtInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleClose = (): void => {
    if (saving) return;
    setSelected([]);
    setDueAtInput('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    if (selected.length === 0) {
      setError('Выберите хотя бы одного сотрудника');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await dataProvider.assignTestTemplate(templateId, {
        member_ids: selected.map((m) => m.id),
        due_at: dueAtInput ? (localInputToUtcIso(dueAtInput) ?? null) : null,
      });
      notify(`Назначено ${res?.created ?? 0}, обновлено ${res?.updated ?? 0}`, {
        type: 'success',
      });
      setSelected([]);
      setDueAtInput('');
      // Без закрытия диалога — перезапрашиваем «уже назначены» (admin.md, «После
      // снятия/назначения»).
      await loadAssignments();
    } catch (e) {
      setError(testErrorMessage(e, 'Не удалось назначить тест'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Назначения теста «{templateTitle}»</DialogTitle>
      <DialogContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Уже назначены
        </Typography>
        {assignmentsLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}
        {assignmentsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {assignmentsError}
          </Alert>
        )}
        {!assignmentsLoading && !assignmentsError && assignments.length === 0 && (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Пока никому не назначен
          </Typography>
        )}
        {!assignmentsLoading && !assignmentsError && assignments.length > 0 && (
          <Stack sx={{ mb: 3 }}>
            {assignments.map((a) => (
              <AssignedRow
                key={String(a.id)}
                record={a}
                templateTitle={templateTitle}
                timeZone={timeZone}
                onUnassigned={() => void loadAssignments()}
              />
            ))}
          </Stack>
        )}

        <Divider sx={{ mb: 2 }} />

        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Назначить ещё
        </Typography>
        {templateDeleted && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Тест удалён — новые назначения недоступны, пока тест не восстановлен.
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Выберите сотрудников, которым нужно пройти тест.
        </Typography>
        <Autocomplete
          multiple
          options={options}
          value={selected}
          onChange={(_, value) => setSelected(value)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          disabled={templateDeleted}
          renderInput={(params) => (
            <MuiTextField {...params} label="Сотрудники" placeholder="Выбрать" />
          )}
          sx={{ mb: 2 }}
        />
        <MuiTextField
          type="datetime-local"
          label="Дедлайн (опционально)"
          value={dueAtInput}
          onChange={(e) => setDueAtInput(e.target.value)}
          InputLabelProps={{ shrink: true }}
          disabled={templateDeleted}
          fullWidth
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Закрыть
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={saving || templateDeleted}
        >
          {saving ? 'Назначение…' : 'Назначить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
