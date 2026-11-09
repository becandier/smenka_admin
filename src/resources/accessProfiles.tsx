import { useEffect, useMemo } from 'react';
import {
  Create,
  CreateButton,
  DeleteButton,
  Edit,
  FunctionField,
  List,
  NumberField,
  SimpleForm,
  TextField,
  TextInput,
  TopToolbar,
  maxLength,
  required,
  useGetList,
  useInput,
  useRecordContext,
  type RaRecord,
} from 'react-admin';
import { useFormContext } from 'react-hook-form';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormHelperText,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  LEVEL_LABELS,
  groupLabel,
  sectionLabel,
  type AccessLevel,
  type SectionPermissions,
} from '../access';
import type { AccessCatalogSection } from '../providers/dataProvider';
import { OrganizationTimeText } from '../components/TimeText';
import { useIsReadOnly } from '../subscription/SubscriptionContext';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';
import { ColumnsDatagrid, TableColumns, TableColumnsButton } from '../tableColumns/TableColumns';

// Ресурс «Профили доступа» (access_profiles/admin.md, §1): именованные наборы прав по
// разделам кабинета. Ведут только полные администраторы (owner/admin/super_admin) —
// маршруты обёрнуты RequireAccess в App.tsx, на бэке мутации — ensure_admin_or_owner.

const CATALOG_STALE_TIME = 10 * 60 * 1000;

// Каталог разделов (GET /access-permissions) — один раз на сессию, кэш react-query.
const useAccessCatalog = () => {
  const { data, isPending, error, refetch } = useGetList<AccessCatalogSection>(
    'access-permissions',
    { pagination: { page: 1, perPage: 1000 } },
    { staleTime: CATALOG_STALE_TIME },
  );
  return { sections: data ?? [], isPending, error, refetch };
};

const toPermissions = (value: unknown): SectionPermissions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: SectionPermissions = {};
  for (const [section, level] of Object.entries(value as Record<string, unknown>)) {
    if (level === 'view' || level === 'manage') result[section] = level;
  }
  return result;
};

// --- Сводка прав в списке ------------------------------------------------

const SUMMARY_LIMIT = 4;

const permissionsSummary = (value: unknown): string => {
  const entries = Object.entries(toPermissions(value)).map(
    ([section, level]) => `${sectionLabel(section)} · ${LEVEL_LABELS[level]}`,
  );
  if (entries.length === 0) return '—';
  if (entries.length > SUMMARY_LIMIT) {
    return `${entries.slice(0, SUMMARY_LIMIT - 1).join(', ')} +${entries.length - (SUMMARY_LIMIT - 1)}`;
  }
  return entries.join(', ');
};

// --- Удаление с подтверждением -------------------------------------------

const deleteConfirmText = (record: RaRecord | undefined): string => {
  const name = typeof record?.name === 'string' ? record.name : '';
  const count = typeof record?.members_count === 'number' ? record.members_count : 0;
  return `Удалить профиль «${name}»? ${count} сотрудник(ов) потеряют доступ в кабинет. Это нельзя отменить из интерфейса.`;
};

// record — явный (строка списка) или из контекста (тулбар формы Edit).
const ProfileDeleteButton = (props: { record?: RaRecord }) => {
  const record = useRecordContext(props);
  return (
    <DeleteButton
      record={record}
      mutationMode="pessimistic"
      confirmTitle="Удалить профиль доступа"
      confirmContent={deleteConfirmText(record)}
      redirect="list"
    />
  );
};

// --- List ------------------------------------------------------------------

const ProfileListActions = () => {
  const isReadOnly = useIsReadOnly();
  return (
    <TopToolbar>
      {!isReadOnly && <CreateButton />}
      <TableColumnsButton />
    </TopToolbar>
  );
};

const ProfilesEmpty = () => {
  const isReadOnly = useIsReadOnly();
  return (
    <Box sx={{ p: 4, textAlign: 'center', width: '100%' }}>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Профилей доступа пока нет
      </Typography>
      {!isReadOnly && <CreateButton variant="contained" label="Создать профиль" />}
    </Box>
  );
};

export const AccessProfileList = () => {
  const isReadOnly = useIsReadOnly();
  // Столбцы (table_column_settings): key — идентификатор столбца, без key — служебный.
  const fields = [
    <TextField key="name" source="name" label="Название" />,
    <TextField
      key="description"
      source="description"
      label="Описание"
      emptyText="—"
      sortable={false}
    />,
    <FunctionField
      key="permissions"
      label="Права"
      sortable={false}
      render={(r: RaRecord) => permissionsSummary(r.permissions)}
    />,
    <NumberField key="members_count" source="members_count" label="Сотрудников" emptyText="0" />,
    <FunctionField
      key="updated_at"
      label="Обновлён"
      sortBy="updated_at"
      render={(r: RaRecord) => <OrganizationTimeText value={r.updated_at} />}
    />,
    !isReadOnly && (
      <FunctionField
        label=""
        sortable={false}
        render={(r: RaRecord) => <ProfileDeleteButton record={r} />}
      />
    ),
  ];
  return (
    <TableColumns tableId="access-profiles" fields={fields}>
      <List
        sort={{ field: 'name', order: 'ASC' }}
        exporter={false}
        actions={<ProfileListActions />}
        empty={<ProfilesEmpty />}
        perPage={100}
      >
        <ColumnsDatagrid rowClick="edit" bulkActionButtons={false} />
      </List>
    </TableColumns>
  );
};

// --- Матрица прав ----------------------------------------------------------

type MatrixChoice = 'none' | AccessLevel;

// Только разделы и уровни из каталога: неизвестный админке раздел (или уровень, которого у
// раздела нет) ушёл бы в PATCH и получил 422, а в «минимум один раздел» не должен считаться.
const filterByCatalog = (value: unknown, sections: AccessCatalogSection[]): SectionPermissions => {
  const allowed = new Map(sections.map((sec) => [sec.code, sec.levels]));
  const result: SectionPermissions = {};
  for (const [code, level] of Object.entries(toPermissions(value))) {
    if (allowed.get(code)?.includes(level)) result[code] = level;
  }
  return result;
};

const sameKeys = (a: SectionPermissions, b: SectionPermissions): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([code, level]) => b[code] === level);

// Пока каталог не загружен (или упал) — форму не отправляем.
const validateCatalogLoading = (): string => 'Каталог разделов ещё не загружен';

const MatrixRow = ({
  section,
  value,
  onChange,
}: {
  section: AccessCatalogSection;
  value: MatrixChoice;
  onChange: (next: MatrixChoice) => void;
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      py: 0.5,
      flexWrap: 'wrap',
    }}
  >
    <Typography variant="body2">{sectionLabel(section.code)}</Typography>
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, next: MatrixChoice | null) => {
        if (next) onChange(next);
      }}
    >
      <ToggleButton value="none">Нет</ToggleButton>
      {section.levels.includes('view') && <ToggleButton value="view">Просмотр</ToggleButton>}
      {section.levels.includes('manage') && <ToggleButton value="manage">Управление</ToggleButton>}
    </ToggleButtonGroup>
  </Box>
);

const PermissionsMatrixInput = () => {
  const { sections, isPending, error, refetch } = useAccessCatalog();
  const catalogReady = !isPending && !error;
  const validate = useMemo(
    () =>
      catalogReady
        ? (value: unknown): string | undefined =>
            Object.keys(filterByCatalog(value, sections)).length > 0
              ? undefined
              : 'Выберите хотя бы один раздел'
        : validateCatalogLoading,
    [catalogReady, sections],
  );
  const {
    field,
    fieldState: { error: fieldError, isTouched },
    formState: { isSubmitted },
  } = useInput({ source: 'permissions', defaultValue: {}, validate });
  const { setValue } = useFormContext();
  const current = filterByCatalog(field.value, sections);

  // Значение записи чистим по каталогу сразу после его загрузки — без пометки «изменено».
  const rawValue = field.value;
  useEffect(() => {
    if (!catalogReady) return;
    const raw = toPermissions(rawValue);
    const filtered = filterByCatalog(raw, sections);
    if (!sameKeys(raw, filtered)) setValue('permissions', filtered, { shouldDirty: false });
  }, [catalogReady, sections, rawValue, setValue]);

  // Группы в порядке первого появления в каталоге; строки — в порядке каталога.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, AccessCatalogSection[]>();
    for (const section of sections) {
      const list = byGroup.get(section.group);
      if (list) list.push(section);
      else {
        order.push(section.group);
        byGroup.set(section.group, [section]);
      }
    }
    return order.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
  }, [sections]);

  const setLevel = (code: string, next: MatrixChoice) => {
    const updated: SectionPermissions = { ...current };
    if (next === 'none') delete updated[code];
    else updated[code] = next;
    field.onChange(updated);
    field.onBlur();
  };

  const showError = Boolean(fieldError) && (isTouched || isSubmitted);

  return (
    <Box sx={{ width: '100%', maxWidth: 640, my: 1 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Матрица прав
      </Typography>
      {isPending ? (
        <Stack spacing={1}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={36} />
          ))}
        </Stack>
      ) : error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Повторить
            </Button>
          }
        >
          Не удалось загрузить список разделов.
        </Alert>
      ) : (
        groups.map(({ group, items }) => (
          <Box key={group} sx={{ mb: 1.5 }}>
            <Typography variant="overline" color="text.secondary">
              {groupLabel(group)}
            </Typography>
            {items.map((section) => (
              <MatrixRow
                key={section.code}
                section={section}
                value={current[section.code] ?? 'none'}
                onChange={(next) => setLevel(section.code, next)}
              />
            ))}
          </Box>
        ))
      )}
      {showError && catalogReady && <FormHelperText error>{fieldError?.message}</FormHelperText>}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Профиль не даёт права назначать администраторов, выдавать профили доступа и менять тариф.
        Эти действия доступны только владельцу и администраторам.
      </Typography>
    </Box>
  );
};

// --- Заготовки (только Create) --------------------------------------------

const PRESETS: { name: string; permissions: SectionPermissions }[] = [
  {
    name: 'Контролёр смен',
    permissions: {
      shifts: 'view',
      overtime: 'view',
      schedules: 'view',
      members: 'view',
      stats: 'view',
    },
  },
  {
    name: 'Бухгалтер',
    permissions: {
      payroll: 'manage',
      penalties: 'manage',
      shifts: 'view',
      members: 'view',
      audit: 'view',
    },
  },
  {
    name: 'Наставник',
    permissions: {
      checklist_templates: 'manage',
      checklist_instances: 'view',
      tests: 'manage',
      knowledge: 'manage',
      members: 'view',
    },
  },
];

// Только предзаполняют матрицу (и имя, если оно пустое) — дальше всё редактируется.
const PresetButtons = () => {
  const { setValue, getValues } = useFormContext();
  const apply = (preset: (typeof PRESETS)[number]) => {
    const opts = { shouldDirty: true, shouldValidate: true, shouldTouch: true };
    setValue('permissions', { ...preset.permissions }, opts);
    const name = getValues('name');
    if (typeof name !== 'string' || name.trim() === '') setValue('name', preset.name, opts);
  };
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Заготовки
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {PRESETS.map((preset) => (
          <Chip
            key={preset.name}
            label={preset.name}
            variant="outlined"
            clickable
            onClick={() => apply(preset)}
          />
        ))}
      </Stack>
    </Box>
  );
};

// --- Create / Edit ----------------------------------------------------------

const nameValidators = [required(), maxLength(100, 'Не более 100 символов')];
const descriptionValidators = [maxLength(500, 'Не более 500 символов')];

const ProfileFields = ({ withPresets }: { withPresets: boolean }) => (
  <>
    <TextInput
      source="name"
      label="Название"
      validate={nameValidators}
      inputProps={{ maxLength: 100 }}
      fullWidth
    />
    <TextInput
      source="description"
      label="Описание"
      validate={descriptionValidators}
      inputProps={{ maxLength: 500 }}
      multiline
      minRows={2}
      fullWidth
    />
    {withPresets && <PresetButtons />}
    <PermissionsMatrixInput />
  </>
);

export const AccessProfileCreate = () => (
  <Create redirect="list">
    <SimpleForm toolbar={<TariffAwareToolbar />}>
      <ProfileFields withPresets />
    </SimpleForm>
  </Create>
);

export const AccessProfileEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm
      toolbar={
        <TariffAwareToolbar>
          <ProfileDeleteButton />
        </TariffAwareToolbar>
      }
    >
      <ProfileFields withPresets={false} />
    </SimpleForm>
  </Edit>
);
