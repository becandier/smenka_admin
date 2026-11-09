import { useState } from 'react';
import {
  List,
  TextField,
  NumberField,
  FunctionField,
  Edit,
  Create,
  SimpleForm,
  TextInput,
  TopToolbar,
  CreateButton,
  DeleteWithConfirmButton,
  useDataProvider,
  type RaRecord,
} from 'react-admin';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import { adjustmentErrorMessage } from '../utils/format';
import { useSectionReadOnly } from '../utils/useOrgAccess';
import { NoAccess } from '../components/NoAccess';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';
import {
  CATEGORY_NAME_MAX,
  deleteCategoryConfirmText,
  validateCategoryName,
  type AdjustmentCategory,
} from './adjustmentCategoryUtils';
import { ViewModeAlert } from '../components/ViewModeAlert';
import { ColumnsDatagrid, TableColumns, TableColumnsButton } from '../tableColumns/TableColumns';

// Справочник «Категории начислений» (payroll_breakdown). Права — раздел «Зарплата»
// (access_profiles): просмотр списка — payroll:view, запись — payroll:manage; маршруты
// режет RequireAccess (App.tsx), super_admin сквозным доступом не ведёт (access.can()).
// Запись гейтится и read-only подпиской (backend.md: та же проверка, что у начислений).

const nameValidators = [validateCategoryName];

const CategoryListActions = () => {
  const isReadOnly = useSectionReadOnly('payroll');
  return (
    <TopToolbar>
      {!isReadOnly && <CreateButton label="Добавить категорию" />}
      <TableColumnsButton />
    </TopToolbar>
  );
};

// «Удалить» (ADR-003): под капотом soft-delete, начисления сохраняют категорию.
const CategoryRowActions = ({ record }: { record: RaRecord }) => {
  const isReadOnly = useSectionReadOnly('payroll');
  if (isReadOnly) return null;
  return (
    <DeleteWithConfirmButton
      record={record}
      confirmTitle={`Удалить категорию «${String(record.name ?? '')}»?`}
      confirmContent={deleteCategoryConfirmText(record.adjustments_count)}
    />
  );
};

const CategoriesEmpty = () => {
  const isReadOnly = useSectionReadOnly('payroll');
  return (
    <Box sx={{ textAlign: 'center', m: 6, color: 'text.secondary' }}>
      <Typography variant="h6" gutterBottom>
        Категорий пока нет
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Категории помогают разделить начисления в зарплатном отчёте: премии, компенсации, удержания.
      </Typography>
      {!isReadOnly && <CreateButton label="Добавить категорию" variant="contained" />}
    </Box>
  );
};

// Столбцы списка (table_column_settings): key — идентификатор столбца, без key — служебный.
const categoryFields = [
  <TextField key="name" source="name" label="Название" />,
  <NumberField
    key="adjustments_count"
    source="adjustments_count"
    label="Начислений"
    emptyText="0"
  />,
  <FunctionField
    label=""
    render={(r: RaRecord) => <CategoryRowActions record={r} />}
    sortable={false}
  />,
];

export const AdjustmentCategoryList = () => {
  return (
    <TableColumns tableId="adjustment-categories" fields={categoryFields}>
      <List
        sort={{ field: 'name', order: 'ASC' }}
        exporter={false}
        actions={<CategoryListActions />}
        empty={<CategoriesEmpty />}
        perPage={100}
      >
        <ColumnsDatagrid rowClick="edit" bulkActionButtons={false} />
      </List>
    </TableColumns>
  );
};

export const AdjustmentCategoryCreate = () => {
  const isReadOnly = useSectionReadOnly('payroll');
  if (isReadOnly) {
    return <NoAccess text="Организация в режиме только для чтения — создание недоступно." />;
  }
  return (
    <Create redirect="list">
      <SimpleForm>
        <TextInput
          source="name"
          label="Название"
          validate={nameValidators}
          inputProps={{ maxLength: CATEGORY_NAME_MAX }}
          fullWidth
        />
      </SimpleForm>
    </Create>
  );
};

export const AdjustmentCategoryEdit = () => {
  return (
    <Edit mutationMode="pessimistic" redirect="list">
      <ViewModeAlert section="payroll" />
      <SimpleForm toolbar={<TariffAwareToolbar section="payroll" />}>
        <TextInput
          source="name"
          label="Название"
          validate={nameValidators}
          inputProps={{ maxLength: CATEGORY_NAME_MAX }}
          helperText="Новое название сразу отразится во всех начислениях и отчётах"
          fullWidth
        />
      </SimpleForm>
    </Edit>
  );
};

// Быстрое создание категории из формы начисления — чтобы владелец не бросал начисление
// ради справочника (admin.md, «Начисления»). onCreated получает созданную категорию.
export const AdjustmentCategoryQuickCreateDialog = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (category: AdjustmentCategory) => void;
}) => {
  const dataProvider = useDataProvider();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    const validation = validateCategoryName(name);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      const { data } = await dataProvider.create<AdjustmentCategory>('adjustment-categories', {
        data: { name: name.trim() },
      });
      onCreated(data);
    } catch (e: any) {
      const fieldError = e?.body?.errors?.name;
      setError(
        typeof fieldError === 'string'
          ? fieldError
          : adjustmentErrorMessage(e, 'Не удалось создать категорию'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Новая категория</DialogTitle>
      <DialogContent>
        <MuiTextField
          autoFocus
          fullWidth
          label="Название"
          sx={{ mt: 1 }}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          error={Boolean(error)}
          helperText={error}
          inputProps={{ maxLength: CATEGORY_NAME_MAX }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving}>
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
};
