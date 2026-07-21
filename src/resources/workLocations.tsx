import { useCallback, useEffect, useState } from 'react';
import {
  List,
  Datagrid,
  TextField,
  NumberField,
  DateField,
  Edit,
  Create,
  SimpleForm,
  TextInput,
  NumberInput,
  SearchInput,
  Toolbar,
  SaveButton,
  DeleteWithConfirmButton,
  required,
  minValue,
  maxValue,
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRedirect,
} from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { LocationMapField } from '../components/LocationMapField';
import { checklistLocationErrorMessage, pluralizeChecklists } from '../utils/format';

const locationFilters = [<SearchInput key="q" source="q" alwaysOn />];

const LocationFields = () => (
  <>
    <TextInput source="name" label="Название" validate={required()} />
    {/* Карта — основной способ выбора точки; поля ниже синхронны с ней и работают как фолбэк. */}
    <LocationMapField />
    <NumberInput
      source="latitude"
      label="Широта"
      validate={[required(), minValue(-90), maxValue(90)]}
    />
    <NumberInput
      source="longitude"
      label="Долгота"
      validate={[required(), minValue(-180), maxValue(180)]}
    />
    <NumberInput
      source="radius_meters"
      label="Радиус, м"
      defaultValue={100}
      validate={[required(), minValue(10), maxValue(10000)]}
    />
    <TextInput
      source="address"
      label="Адрес"
      fullWidth
      helperText="Заполняется с карты, можно править вручную"
    />
  </>
);

// Текст в диалоге удаления точки (checklist_work_location): лениво подтягивает число
// привязанных чек-листов (backend.md, «Удаление точки»). MUI Dialog не монтирует content,
// пока сам диалог закрыт (keepMounted не задан) — поэтому запрос стартует только по клику
// на «Удалить», без лишней нагрузки на рендер строки списка/карточки.
const LocationDeleteWarning = () => {
  const record = useRecordContext<any>();
  const dataProvider = useDataProvider();
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!record?.id) return undefined;
    let active = true;
    dataProvider
      .getLocationTemplates(String(record.id))
      .then((items: any[]) => {
        if (active) setCount(items.length);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [record?.id, dataProvider]);

  if (count === null) {
    // Не удалось узнать точное число привязок (сетевая ошибка и т.п.) — не блокируем
    // удаление, но и не утверждаем «привязок нет»: обычное подтверждение без числа.
    return failed ? (
      <Typography>Это действие нельзя будет отменить.</Typography>
    ) : (
      <CircularProgress size={20} />
    );
  }
  if (count === 0) {
    return <Typography>Это действие нельзя будет отменить.</Typography>;
  }
  return (
    <Typography>
      К этой точке привязано {count} {pluralizeChecklists(count)}. После удаления точки они
      перестанут быть ограниченными по месту и начнут действовать на всех точках организации.
    </Typography>
  );
};

// Удаление точки: каскад на бэке снимает привязки чек-листов — шаблон, привязанный только
// к удаляемой точке, снова начнёт действовать на всех точках (backend.md, «Удаление точки»).
// variant="row" — строка списка (после удаления остаёмся на месте, react-admin сам
// инвалидирует кэш списка); variant="toolbar" — карточка точки (после удаления уводит в список).
const WorkLocationDeleteButton = ({ variant }: { variant: 'row' | 'toolbar' }) => {
  const notify = useNotify();
  return (
    <DeleteWithConfirmButton
      redirect={variant === 'toolbar' ? 'list' : false}
      confirmTitle="Удалить точку?"
      confirmContent={<LocationDeleteWarning />}
      mutationOptions={{
        onError: (error: unknown) => {
          notify(checklistLocationErrorMessage(error, 'Ошибка удаления'), { type: 'error' });
        },
      }}
    />
  );
};

const LocationEditToolbar = () => (
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <SaveButton />
    <WorkLocationDeleteButton variant="toolbar" />
  </Toolbar>
);

// Секция «Чек-листы точки» на карточке точки — обратный срез к секции «Точки» на карточке
// шаблона (checklistTemplates.tsx): обе стороны пишут в одну и ту же связь (backend.md, §3/4).
const LocationChecklistsSection = () => {
  const record = useRecordContext<any>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const redirect = useRedirect();
  const { data: templates } = useGetList('checklist-templates', {
    pagination: { page: 1, perPage: 500 },
    sort: { field: 'created_at', order: 'ASC' },
  });
  // linkedIds — снимок с сервера (нужен для фильтра архивных шаблонов); selected — live-правки формы.
  const [linkedIds, setLinkedIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  const locationId = record?.id ? String(record.id) : null;

  const reload = useCallback(() => {
    if (!locationId) return;
    setLoadError(false);
    dataProvider
      .getLocationTemplates(locationId)
      .then((items: any[]) => {
        const ids = items.map((t) => String(t.id));
        setLinkedIds(ids);
        setSelected(ids);
      })
      .catch((e: any) => {
        setLinkedIds([]);
        setSelected([]);
        if (e?.body?.code === 'WORK_LOCATION_NOT_FOUND') {
          notify('Точка не найдена', { type: 'warning' });
          redirect('list', 'work-locations');
          return;
        }
        setLoadError(true);
      });
  }, [locationId, dataProvider, notify, redirect]);

  useEffect(() => reload(), [reload]);

  if (!record) return null;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!locationId) return;
    setBusy(true);
    try {
      const result = await dataProvider.setLocationTemplates(locationId, selected);
      // Сервер возвращает актуальный сохранённый набор — синхронизируем снимок им же,
      // без повторного GET (result.template_ids уже отражает то, что реально записалось).
      const ids: string[] = (result?.template_ids ?? selected).map((id: string) => String(id));
      setLinkedIds(ids);
      setSelected(ids);
      notify('Чек-листы точки сохранены', { type: 'success' });
    } catch (e: any) {
      notify(checklistLocationErrorMessage(e, 'Ошибка'), { type: 'error' });
      if (e?.body?.code === 'WORK_LOCATION_NOT_FOUND') redirect('list', 'work-locations');
    } finally {
      setBusy(false);
    }
  };

  // Архивные шаблоны показываем, только если уже привязаны (нельзя привязать новые архивные,
  // admin.md п.2). Фильтруем по linkedIds (снимок сервера), а не по live selected — иначе строка
  // пропадала бы из формы сразу при снятии галочки, до нажатия «Сохранить».
  const visible = (templates ?? []).filter(
    (t: any) => !t.is_archived || (linkedIds ?? []).includes(String(t.id)),
  );

  return (
    <Card sx={{ mx: 2, mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
          Чек-листы точки
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Отмеченные чек-листы действуют только на этой точке (плюс на других, если они выбраны там
          же). Чек-листы без привязок к точкам действуют везде и в этом списке не отражаются.
        </Typography>
        {loadError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            Не удалось загрузить чек-листы точки
          </Alert>
        )}
        {linkedIds === null ? (
          <CircularProgress size={20} />
        ) : visible.length === 0 ? (
          <Typography color="text.secondary">
            В организации нет ни одного шаблона чек-листа, который можно привязать к точке.
          </Typography>
        ) : (
          <Stack>
            {visible.map((t: any) => (
              <FormControlLabel
                key={t.id}
                control={
                  <Checkbox
                    checked={selected.includes(String(t.id))}
                    onChange={() => toggle(String(t.id))}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>{t.name}</span>
                    {t.is_archived && <Chip size="small" label="архив" />}
                  </Stack>
                }
              />
            ))}
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" disabled={busy} onClick={() => void save()}>
                Сохранить
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export const WorkLocationList = () => (
  <List filters={locationFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" label="Название" />
      <TextField source="address" label="Адрес" />
      <NumberField source="latitude" label="Широта" options={{ maximumFractionDigits: 6 }} />
      <NumberField source="longitude" label="Долгота" options={{ maximumFractionDigits: 6 }} />
      <NumberField source="radius_meters" label="Радиус, м" />
      <DateField source="created_at" label="Создана" showTime />
      <WorkLocationDeleteButton variant="row" />
    </Datagrid>
  </List>
);

export const WorkLocationEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <SimpleForm toolbar={<LocationEditToolbar />}>
      <LocationFields />
    </SimpleForm>
    <LocationChecklistsSection />
  </Edit>
);

export const WorkLocationCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <LocationFields />
    </SimpleForm>
  </Create>
);
