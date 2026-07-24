import { useMemo, useState } from 'react';
import {
  List,
  Datagrid,
  FunctionField,
  SelectInput,
  useGetList,
  useListContext,
  type RaRecord,
} from 'react-admin';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import { formatMemberNameFlat } from '../../utils/memberName';
import {
  TEST_ASSIGNMENT_STATUS_CHOICES,
  TEST_ASSIGNMENT_STATUS_COLOR,
  testAssignmentStatusLabel,
} from '../../utils/format';
import { AssignmentDetailDialog } from './AssignmentDetailDialog';
import {
  attemptsUsed,
  bestPercent,
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

const TestAssignmentDatagrid = ({ onSelect }: { onSelect: (record: RaRecord) => void }) => {
  const { isPending, data } = useListContext();
  if (!isPending && (data ?? []).length === 0) return <TestAssignmentsEmpty />;
  return (
    <Datagrid bulkActionButtons={false} rowClick={false}>
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
          <Button size="small" onClick={() => onSelect(r)}>
            Детали
          </Button>
        )}
      />
    </Datagrid>
  );
};

const TestAssignmentListInner = () => {
  const [selected, setSelected] = useState<RaRecord | null>(null);
  return (
    <>
      <List
        filters={testAssignmentFilters}
        sort={{ field: 'created_at', order: 'DESC' }}
        exporter={false}
        empty={false}
      >
        <TestAssignmentDatagrid onSelect={setSelected} />
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
