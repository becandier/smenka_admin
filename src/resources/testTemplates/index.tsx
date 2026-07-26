import { useState, type MouseEvent } from 'react';
import {
  List,
  Datagrid,
  TextField,
  NumberField,
  BooleanField,
  FunctionField,
  Create,
  Edit,
  SimpleForm,
  TopToolbar,
  CreateButton,
  NullableBooleanInput,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
  type RaRecord,
} from 'react-admin';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import InboxIcon from '@mui/icons-material/Inbox';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import { testErrorMessage } from '../../utils/format';
import { TestTemplateFields } from './TemplateForm';
import { getTestTemplateDefaultValues, validateTestTemplate } from './validation';
import { ImportTestTemplateDialog } from './ImportDialog';
import { AssignTestDialog } from './AssignDialog';

// Тесты — фича org owner/admin, не платформенная (admin.md, «Права доступа»): super_admin
// сюда не допускается даже сквозным доступом (в отличие от базы знаний/чек-листов).
const NoAccess = () => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      Управление тестами доступно владельцу и администратору организации.
    </Typography>
  </Box>
);

const useCanManage = (): boolean => {
  const role = useMyOrgRole();
  return role === 'owner' || role === 'admin';
};

// Баннер серверной ошибки создания/сохранения (TEST_TEMPLATE_INVALID/TEST_TEMPLATE_ARCHIVED
// и т.п.) — общий для Create и Edit форм, которые отличаются только текстом фолбэка.
const ServerErrorAlert = ({ error }: { error: string | null }) => {
  if (!error) return null;
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {error}
    </Alert>
  );
};

const testTemplateFilters = [
  <NullableBooleanInput
    key="archived"
    source="archived"
    label="Архив"
    alwaysOn
    nullLabel="Все"
    falseLabel="Активные"
    trueLabel="Архивные"
  />,
];

// Тулбар списка: «Импорт из JSON» рядом со стандартной кнопкой «Создать» (admin.md,
// «Кнопка «Импорт из JSON» (в тулбаре создания)»).
const TestTemplateListActions = () => {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <TopToolbar>
      <Button size="small" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
        Импорт из JSON
      </Button>
      <CreateButton label="Создать тест" />
      <ImportTestTemplateDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </TopToolbar>
  );
};

// Пустое состояние списка: react-admin при total===0 и без активных фильтров рендерит
// ТОЛЬКО `empty`, полностью скрывая actions-тулбар (см. ListView.js — shouldRenderEmptyPage
// заменяет renderList() целиком). Поэтому «Импорт из JSON» и «Создать тест» продублированы
// здесь — иначе именно на пустом списке (первый тест в организации) кнопки пропадают.
const TestTemplateEmpty = () => {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <Box sx={{ textAlign: 'center', mt: 8, mb: 4 }}>
      <InboxIcon sx={{ width: '6em', height: '6em', color: 'text.disabled' }} />
      <Typography variant="h6" color="text.secondary" sx={{ mt: 2, mb: 3 }}>
        Тестов пока нет
      </Typography>
      <Stack direction="row" spacing={2} justifyContent="center">
        <Button
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={() => setImportOpen(true)}
        >
          Импорт из JSON
        </Button>
        <CreateButton label="Создать тест" variant="contained" />
      </Stack>
      <ImportTestTemplateDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </Box>
  );
};

const thresholdField = (r: RaRecord): string => `${r.pass_threshold_percent}%`;

// Действия строки: «Назначить» (открывает диалог, поднятый на уровень списка — см.
// TestTemplateListInner: один <AssignTestDialog>, а не по экземпляру на каждую строку)
// и «В архив»/«Из архива». Клик по строке уже ведёт на редактирование (rowClick="edit") —
// stopPropagation, чтобы клик по кнопке не открывал форму.
const RowActions = ({
  record,
  onAssign,
}: {
  record: RaRecord;
  onAssign: (record: RaRecord) => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [archiving, setArchiving] = useState(false);

  const toggleArchive = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation();
    setArchiving(true);
    try {
      await dataProvider.archiveTestTemplate(String(record.id), !record.is_archived);
      notify(record.is_archived ? 'Тест возвращён из архива' : 'Тест архивирован', {
        type: 'success',
      });
      refresh();
    } catch (err) {
      notify(testErrorMessage(err, 'Ошибка'), { type: 'error' });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
      <Button
        size="small"
        startIcon={<AssignmentIndIcon />}
        onClick={(e) => {
          e.stopPropagation();
          onAssign(record);
        }}
        disabled={Boolean(record.is_archived)}
      >
        Назначить
      </Button>
      <Button
        size="small"
        color={record.is_archived ? 'success' : 'warning'}
        startIcon={record.is_archived ? <UnarchiveIcon /> : <ArchiveIcon />}
        onClick={(e) => void toggleArchive(e)}
        disabled={archiving}
      >
        {record.is_archived ? 'Из архива' : 'В архив'}
      </Button>
    </Stack>
  );
};

const TestTemplateDatagrid = ({ onAssign }: { onAssign: (record: RaRecord) => void }) => (
  <Datagrid rowClick="edit" bulkActionButtons={false}>
    <TextField source="title" label="Название" />
    <NumberField source="question_count" label="Вопросов" sortable={false} />
    <NumberField source="total_points" label="Баллов" sortable={false} />
    <NumberField source="max_attempts" label="Попыток" sortable={false} />
    <FunctionField label="Порог" render={thresholdField} sortable={false} />
    <BooleanField source="is_archived" label="Архив" sortable={false} />
    <FunctionField
      label=""
      render={(r: RaRecord) => <RowActions record={r} onAssign={onAssign} />}
      sortable={false}
    />
  </Datagrid>
);

// Один экземпляр AssignTestDialog на весь список (не по одному на строку — иначе каждая
// видимая строка держала бы собственный useGetList('members', ...) диалога вхолостую).
const TestTemplateListInner = () => {
  const refresh = useRefresh();
  const [assignTarget, setAssignTarget] = useState<RaRecord | null>(null);

  return (
    <>
      <List
        filters={testTemplateFilters}
        sort={{ field: 'created_at', order: 'DESC' }}
        exporter={false}
        actions={<TestTemplateListActions />}
        empty={<TestTemplateEmpty />}
      >
        <TestTemplateDatagrid onAssign={setAssignTarget} />
      </List>
      {assignTarget && (
        <AssignTestDialog
          templateId={String(assignTarget.id)}
          templateTitle={String(assignTarget.title ?? '')}
          open
          onClose={() => setAssignTarget(null)}
          onDone={() => {
            setAssignTarget(null);
            refresh();
          }}
        />
      )}
    </>
  );
};

export const TestTemplateList = () => {
  if (!useCanManage()) return <NoAccess />;
  return <TestTemplateListInner />;
};

// Предупреждение в форме редактирования архивного шаблона: PATCH метаданных/вопросов
// вернёт TEST_TEMPLATE_ARCHIVED (backend.md) — предупреждаем до попытки сохранить.
const ArchivedNotice = () => {
  const record = useRecordContext();
  if (!record?.is_archived) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      Тест в архиве — редактирование недоступно, пока вы не вернёте его из архива (кнопка «Из
      архива» в списке тестов).
    </Alert>
  );
};

const TestTemplateCreateForm = () => {
  const [serverError, setServerError] = useState<string | null>(null);
  return (
    <Create
      redirect="edit"
      mutationOptions={{
        onError: (e: unknown) => setServerError(testErrorMessage(e, 'Не удалось создать тест')),
      }}
    >
      <SimpleForm validate={validateTestTemplate} defaultValues={getTestTemplateDefaultValues()}>
        <ServerErrorAlert error={serverError} />
        <TestTemplateFields />
      </SimpleForm>
    </Create>
  );
};

export const TestTemplateCreate = () => {
  if (!useCanManage()) return <NoAccess />;
  return <TestTemplateCreateForm />;
};

const TestTemplateEditForm = () => {
  const [serverError, setServerError] = useState<string | null>(null);
  return (
    <Edit
      mutationMode="pessimistic"
      redirect={false}
      mutationOptions={{
        onError: (e: unknown) => setServerError(testErrorMessage(e, 'Не удалось сохранить тест')),
      }}
    >
      <SimpleForm validate={validateTestTemplate}>
        <ArchivedNotice />
        <ServerErrorAlert error={serverError} />
        <TestTemplateFields />
      </SimpleForm>
    </Edit>
  );
};

export const TestTemplateEdit = () => {
  if (!useCanManage()) return <NoAccess />;
  return <TestTemplateEditForm />;
};
