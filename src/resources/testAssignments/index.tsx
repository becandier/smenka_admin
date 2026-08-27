import { useMemo, useState } from 'react';
import {
  List,
  Datagrid,
  BooleanInput,
  FunctionField,
  SelectInput,
  useDataProvider,
  useGetList,
  useListContext,
  useNotify,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import { useIsReadOnly } from '../../subscription/SubscriptionContext';
import { formatMemberNameFlat } from '../../utils/memberName';
import {
  TEST_ASSIGNMENT_STATUS_CHOICES,
  TEST_ASSIGNMENT_STATUS_COLOR,
  isTestAssignmentNotFoundError,
  testAssignmentStatusLabel,
  testErrorMessage,
} from '../../utils/format';
import { AssignmentDetailDialog } from './AssignmentDetailDialog';
import { UnassignConfirmDialog, UnassignRowButton } from './UnassignDialog';
import {
  attemptsUsed,
  bestPercent,
  bulkUnassignConfirmParts,
  dueAt,
  lastAttemptAt,
  memberDisplayName,
  templateTitle,
} from './fields';

const NoAccess = () => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      Результаты тестов доступны владельцу и администратору организации.
    </Typography>
  </Box>
);

const useCanManage = (): boolean => {
  const role = useMyOrgRole();
  return role === 'owner' || role === 'admin';
};

// Кэшировать выбор фильтров подольше: список тестов/сотрудников организации меняется редко,
// а фильтры и диалог «Назначить» (AssignDialog.tsx) дёргают ровно те же списки на каждой
// смене экрана — без staleTime это был бы повторный сетевой запрос на каждый заход.
const REFERENCE_STALE_TIME = 5 * 60 * 1000;

// Селект-фильтр по тестам организации — тот же приём, что TemplateSelectFilter в
// checklistInstances.tsx (локальный, единственное место использования).
const TestTemplateSelectFilter = (props: { source: string; label: string; alwaysOn?: boolean }) => {
  const { data } = useGetList(
    'test-templates',
    { pagination: { page: 1, perPage: 200 }, sort: { field: 'created_at', order: 'DESC' } },
    { staleTime: REFERENCE_STALE_TIME },
  );
  const choices = useMemo(() => (data ?? []).map((t) => ({ id: t.id, name: t.title })), [data]);
  return <SelectInput {...props} choices={choices} />;
};

// Селект-фильтр по сотрудникам: значение — members.id (organization_members.id), как и
// member_id в query реестра результатов (backend.md, «GET .../test-assignments»). Отличается
// от MemberSelectFilter (components/), где значение — user_id.
const TestMemberSelectFilter = (props: { source: string; label: string; alwaysOn?: boolean }) => {
  const { data } = useGetList(
    'members',
    { pagination: { page: 1, perPage: 500 }, sort: { field: 'user_name', order: 'ASC' } },
    { staleTime: REFERENCE_STALE_TIME },
  );
  const choices = useMemo(
    () => (data ?? []).map((m) => ({ id: m.id, name: formatMemberNameFlat(m) })),
    [data],
  );
  return <SelectInput {...props} choices={choices} />;
};

const testAssignmentFilters = [
  <TestTemplateSelectFilter key="template_id" source="template_id" label="Тест" alwaysOn />,
  <TestMemberSelectFilter key="member_id" source="member_id" label="Сотрудник" />,
  <SelectInput
    key="status"
    source="status"
    label="Статус"
    choices={TEST_ASSIGNMENT_STATUS_CHOICES}
  />,
  // include_deleted (test_assignment_unassign/admin.md, «Показывать удалённые тесты»): по
  // умолчанию реестр не показывает назначения удалённых шаблонов, как и список «Тесты».
  <BooleanInput
    key="include_deleted"
    source="include_deleted"
    label="Показывать удалённые тесты"
    alwaysOn
  />,
];

const TestAssignmentsEmpty = () => {
  const { filterValues } = useListContext();
  const filtered = Object.keys(filterValues ?? {}).length > 0;
  return (
    <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
      <Typography variant="h6">
        {filtered ? 'Назначений по выбранным фильтрам нет' : 'Назначений нет'}
      </Typography>
    </Box>
  );
};

// Колонки — FunctionField (render получает record напрямую, доступ через useRecordContext
// не нужен), тот же приём, что thresholdField/RowActions в testTemplates/index.tsx.
// Читатели полей (templateTitle/memberDisplayName/bestPercent/dueAt/lastAttemptAt) —
// в ./fields.ts, переиспользуются AssignmentDetailDialog для тех же полей в деталях.
const statusChip = (r: RaRecord) => {
  const status = String(r.status ?? '');
  return (
    <Chip
      size="small"
      color={TEST_ASSIGNMENT_STATUS_COLOR[status] ?? 'default'}
      label={testAssignmentStatusLabel(status)}
    />
  );
};

// Действия строки: «Детали» (как раньше) + «Снять» (test_assignment_unassign/admin.md) —
// снятие безвозвратно удаляет назначение и результаты сотрудника по нему, подтверждение и
// формулировки — в UnassignDialog.tsx (общие с блоком «уже назначены» AssignDialog.tsx).
const RowActions = ({
  record,
  onSelect,
  onUnassigned,
}: {
  record: RaRecord;
  onSelect: (record: RaRecord) => void;
  onUnassigned: () => void;
}) => {
  const isReadOnly = useIsReadOnly();
  return (
    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
      <Button size="small" onClick={() => onSelect(record)}>
        Детали
      </Button>
      {/* Read-only (backend.md «Read-only режим»): снятие назначения — не из исключений,
          «Детали» (просмотр) выше остаётся доступен всегда. */}
      {!isReadOnly && (
        <UnassignRowButton
          record={record}
          templateTitle={templateTitle(record)}
          onDone={onUnassigned}
        />
      )}
    </Stack>
  );
};

// Bulk-действие «Снять назначения» (admin.md, «Массовое снятие»): стандартный
// BulkDeleteButton не подходит по тексту/подтверждению — свой, тем же путём, что и строковое
// «Снять» (dataProvider.deleteMany('test-assignments', ...) → N последовательных DELETE,
// см. providers/dataProvider.ts). Сводка в диалоге считается по уже загруженным строкам
// текущей страницы (data из useListContext) — отдельного запроса не нужно.
const TestAssignmentBulkActions = () => {
  const { selectedIds, data, onUnselectItems } = useListContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const withResults = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return (data ?? []).filter((r) => selectedSet.has(r.id) && Number(r.attempts_used ?? 0) > 0)
      .length;
  }, [data, selectedIds]);

  const parts = bulkUnassignConfirmParts(selectedIds.length, withResults);

  const handleConfirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await dataProvider.deleteMany('test-assignments', { ids: selectedIds });
      setConfirming(false);
      notify(`Снято назначений: ${selectedIds.length}`, { type: 'success' });
      onUnselectItems();
      refresh();
    } catch (err) {
      notify(testErrorMessage(err, 'Не удалось снять назначения'), { type: 'error' });
      if (isTestAssignmentNotFoundError(err)) {
        setConfirming(false);
        onUnselectItems();
        refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <>
      <Button
        size="small"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={() => setConfirming(true)}
      >
        Снять назначения
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

const TestAssignmentDatagrid = ({
  onSelect,
  onUnassigned,
}: {
  onSelect: (record: RaRecord) => void;
  onUnassigned: () => void;
}) => {
  const { isPending, data } = useListContext();
  const isReadOnly = useIsReadOnly();
  if (!isPending && (data ?? []).length === 0) return <TestAssignmentsEmpty />;
  return (
    <Datagrid
      bulkActionButtons={isReadOnly ? false : <TestAssignmentBulkActions />}
      rowClick={false}
    >
      <FunctionField label="Тест" render={templateTitle} />
      <FunctionField label="Сотрудник" render={memberDisplayName} />
      <FunctionField label="Статус" render={statusChip} />
      <FunctionField label="Лучший %" render={bestPercent} />
      <FunctionField label="Попыток" render={attemptsUsed} />
      <FunctionField label="Дедлайн" render={dueAt} />
      <FunctionField label="Последняя сдача" render={lastAttemptAt} />
      <FunctionField
        label=""
        render={(r: RaRecord) => (
          <RowActions record={r} onSelect={onSelect} onUnassigned={onUnassigned} />
        )}
      />
    </Datagrid>
  );
};

const TestAssignmentListInner = () => {
  const [selected, setSelected] = useState<RaRecord | null>(null);
  const refresh = useRefresh();
  return (
    <>
      <List
        filters={testAssignmentFilters}
        sort={{ field: 'created_at', order: 'DESC' }}
        exporter={false}
        empty={false}
      >
        <TestAssignmentDatagrid onSelect={setSelected} onUnassigned={refresh} />
      </List>
      {selected && (
        <AssignmentDetailDialog assignment={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
};

// «Результаты тестов» (admin.md): реестр назначений всей организации + переход к деталям
// попытки. Доступ — owner/admin, как и конструктор тестов (не платформенная фича).
export const TestAssignmentList = () => {
  if (!useCanManage()) return <NoAccess />;
  return <TestAssignmentListInner />;
};
