import { useMemo, useState } from 'react';
import {
  List,
  Datagrid,
  SelectInput,
  useGetList,
  useListContext,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import { formatMemberNameFlat } from '../../utils/memberName';
import {
  formatDateTime,
  TEST_ASSIGNMENT_STATUS_CHOICES,
  TEST_ASSIGNMENT_STATUS_COLOR,
  testAssignmentStatusLabel,
} from '../../utils/format';
import { AssignmentDetailDialog } from './AssignmentDetailDialog';

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

// Селект-фильтр по тестам организации — тот же приём, что TemplateSelectFilter в
// checklistInstances.tsx (локальный, единственное место использования).
const TestTemplateSelectFilter = (props: { source: string; label: string; alwaysOn?: boolean }) => {
  const { data } = useGetList('test-templates', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'created_at', order: 'DESC' },
  });
  const choices = useMemo(() => (data ?? []).map((t) => ({ id: t.id, name: t.title })), [data]);
  return <SelectInput {...props} choices={choices} />;
};

// Селект-фильтр по сотрудникам: значение — members.id (organization_members.id), как и
// member_id в query реестра результатов (backend.md, «GET .../test-assignments»). Отличается
// от MemberSelectFilter (components/), где значение — user_id.
const TestMemberSelectFilter = (props: { source: string; label: string; alwaysOn?: boolean }) => {
  const { data } = useGetList('members', {
    pagination: { page: 1, perPage: 500 },
    sort: { field: 'user_name', order: 'ASC' },
  });
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

// Колонки — компоненты-поля (не FunctionField), т.к. нужен доступ к record через
// useRecordContext внутри Datagrid (стандартный react-admin приём). label в JSX читает
// только сам Datagrid (для заголовка колонки) — компонент его не использует; props всё
// равно принимается и явно void'ится (тот же приём, что AudienceCell в workSchedules.tsx),
// иначе типизация Datagrid не примет проп label, а no-unused-vars — параметр.
interface FieldProps {
  label?: string;
}

const TemplateTitleField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  const template = record?.template as { title?: string } | undefined;
  return <Typography variant="body2">{template?.title ?? '—'}</Typography>;
};

const MemberNameField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  const member = record?.member as { display_name?: string } | undefined;
  return <Typography variant="body2">{member?.display_name ?? '—'}</Typography>;
};

const StatusField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  const status = String(record?.status ?? '');
  return (
    <Chip
      size="small"
      color={TEST_ASSIGNMENT_STATUS_COLOR[status] ?? 'default'}
      label={testAssignmentStatusLabel(status)}
    />
  );
};

const BestPercentField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  const value = record?.best_percent;
  return <Typography variant="body2">{typeof value === 'number' ? `${value}%` : '—'}</Typography>;
};

const AttemptsField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  return (
    <Typography variant="body2">
      {record?.attempts_used ?? 0} / {record?.max_attempts ?? '—'}
    </Typography>
  );
};

const DueAtField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  return (
    <Typography variant="body2">
      {record?.due_at ? formatDateTime(String(record.due_at)) : '—'}
    </Typography>
  );
};

const LastAttemptField = (props: FieldProps) => {
  void props;
  const record = useRecordContext();
  return (
    <Typography variant="body2">
      {record?.last_attempt_at ? formatDateTime(String(record.last_attempt_at)) : '—'}
    </Typography>
  );
};

const DetailsButtonField = ({
  onSelect,
}: FieldProps & { onSelect: (record: RaRecord) => void }) => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Button size="small" onClick={() => onSelect(record)}>
      Детали
    </Button>
  );
};

const TestAssignmentDatagrid = ({ onSelect }: { onSelect: (record: RaRecord) => void }) => {
  const { isPending, data } = useListContext();
  if (!isPending && (data ?? []).length === 0) return <TestAssignmentsEmpty />;
  return (
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TemplateTitleField label="Тест" />
      <MemberNameField label="Сотрудник" />
      <StatusField label="Статус" />
      <BestPercentField label="Лучший %" />
      <AttemptsField label="Попыток" />
      <DueAtField label="Дедлайн" />
      <LastAttemptField label="Последняя сдача" />
      <DetailsButtonField label="" onSelect={onSelect} />
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
