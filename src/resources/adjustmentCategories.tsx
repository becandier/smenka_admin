import { useState } from 'react';
import {
  List,
  Datagrid,
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
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { useIsReadOnly } from '../subscription/SubscriptionContext';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';
import {
  CATEGORY_NAME_MAX,
  deleteCategoryConfirmText,
  validateCategoryName,
  type AdjustmentCategory,
} from './adjustmentCategoryUtils';

// Справочник «Категории начислений» (payroll_breakdown). Права — как у «Начислений»:
// owner/admin своей организации; super_admin сквозным доступом не ведёт. Запись гейтится
// read-only так же, как создание начисления (backend.md: та же проверка подписки).

const useCanManage = (): boolean => {
  const role = useMyOrgRole();
  return role === 'owner' || role === 'admin';
};

const NoAccess = ({ text }: { text?: string }) => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      {text ?? 'Категории начислений доступны владельцу и администратору организации.'}
    </Typography>
  </Box>
);

const nameValidators = [validateCategoryName];

const CategoryListActions = () => {
  const isReadOnly = useIsReadOnly();
  if (isReadOnly) return <TopToolbar />;
  return (
    <TopToolbar>
      <CreateButton label="Добавить категорию" />
    </TopToolbar>
  );
};

// «Удалить» (ADR-003): под капотом soft-delete, начисления сохраняют категорию.
const CategoryRowActions = ({ record }: { record: RaRecord }) => {
  const isReadOnly = useIsReadOnly();
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
  const isReadOnly = useIsReadOnly();
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

export const AdjustmentCategoryList = () => {
  if (!useCanManage()) return <NoAccess />;
  return (
    <List
      sort={{ field: 'name', order: 'ASC' }}
      exporter={false}
      actions={<CategoryListActions />}
      empty={<CategoriesEmpty />}
      perPage={100}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" label="Название" />
        <NumberField source="adjustments_count" label="Начислений" emptyText="0" />
        <FunctionField
          label=""
          render={(r: RaRecord) => <CategoryRowActions record={r} />}
          sortable={false}
        />
      </Datagrid>
    </List>
  );
};

export const AdjustmentCategoryCreate = () => {
  const canManage = useCanManage();
  const isReadOnly = useIsReadOnly();
  if (!canManage) return <NoAccess />;
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
  if (!useCanManage()) return <NoAccess />;
  return (
    <Edit mutationMode="pessimistic" redirect="list">
      <SimpleForm toolbar={<TariffAwareToolbar />}>
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
