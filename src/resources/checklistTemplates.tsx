import { useCallback, useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  List,
  Datagrid,
  TextField,
  BooleanField,
  NumberField,
  DateField,
  SelectField,
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  SearchInput,
  Title,
  required,
  useGetOne,
  useGetList,
  useDataProvider,
  useNotify,
} from 'react-admin';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import {
  checklistLocationErrorMessage,
  PHOTO_REQUIREMENT_CHOICES,
  PHOTO_REQUIREMENT_SHORT,
  PHOTO_SOURCE_CHOICES,
} from '../utils/format';

const typeChoices = [
  { id: 'shift_start', name: 'Начало смены' },
  { id: 'shift_end', name: 'Конец смены' },
];

const typeFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="type" source="type" label="Тип" choices={typeChoices} />,
];

export const ChecklistTemplateList = () => (
  <List filters={typeFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit">
      <TextField source="name" label="Название" />
      <SelectField source="type" label="Тип" choices={typeChoices} />
      <BooleanField source="is_required" label="Обязательный" />
      <NumberField source="items_count" label="Пунктов" />
      <BooleanField source="is_archived" label="Архив" />
      <DateField source="created_at" label="Создан" showTime />
    </Datagrid>
  </List>
);

export const ChecklistTemplateCreate = () => (
  <Create redirect="edit">
    <SimpleForm>
      <TextInput source="name" label="Название" validate={required()} />
      <SelectInput source="type" label="Тип" choices={typeChoices} validate={required()} />
      <BooleanInput source="is_required" label="Обязательный" defaultValue={false} />
    </SimpleForm>
  </Create>
);

// ---- Кастомный экран редактирования шаблона (пункты + назначения) ----

const TemplateMetaForm = ({ template, onSaved }: { template: any; onSaved: () => void }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [name, setName] = useState<string>(template.name ?? '');
  const [type, setType] = useState<string>(template.type ?? 'shift_start');
  const [isRequired, setIsRequired] = useState<boolean>(Boolean(template.is_required));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await dataProvider.update('checklist-templates', {
        id: template.id,
        data: { name, type, is_required: isRequired },
        previousData: template,
      });
      notify('Шаблон сохранён', { type: 'success' });
      onSaved();
    } catch (e: any) {
      notify(e?.message ?? 'Ошибка сохранения', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          Шаблон
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <MuiTextField label="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={type} onChange={(e) => setType(e.target.value)} size="small">
            {typeChoices.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
          <FormControlLabel
            control={
              <Switch checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            }
            label="Обязательный"
          />
          <Box>
            <Button variant="contained" onClick={save} disabled={saving || !name.trim()}>
              Сохранить
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

// Поля настройки фото в форме пункта (add/edit). photo_source показывается и редактируется
// только при photo_requirement !== 'none' (при none бэк нормализует source к camera).
const PhotoFields = ({
  requirement,
  source,
  onRequirement,
  onSource,
  disabled,
}: {
  requirement: string;
  source: string;
  onRequirement: (value: string) => void;
  onSource: (value: string) => void;
  disabled?: boolean;
}) => (
  <Stack spacing={0.5}>
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Select
        size="small"
        value={requirement}
        disabled={disabled}
        onChange={(e) => onRequirement(e.target.value)}
        sx={{ minWidth: 150 }}
      >
        {PHOTO_REQUIREMENT_CHOICES.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            Фото: {c.name}
          </MenuItem>
        ))}
      </Select>
      {requirement !== 'none' && (
        <Select
          size="small"
          value={source}
          disabled={disabled}
          onChange={(e) => onSource(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          {PHOTO_SOURCE_CHOICES.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </Select>
      )}
    </Stack>
    {requirement === 'required' && (
      <Typography variant="caption" color="text.secondary">
        Нужно ≥1 фото, иначе пункт не завершён (мягко, смену не блокирует)
      </Typography>
    )}
  </Stack>
);

// Компактный индикатор требования к фото в превью пункта (для requirement !== 'none').
const PhotoRequirementChip = ({ requirement }: { requirement: string }) => {
  if (requirement === 'none') return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={requirement === 'required' ? 'warning' : 'default'}
      icon={<PhotoCameraOutlinedIcon />}
      label={`Фото: ${PHOTO_REQUIREMENT_SHORT[requirement] ?? requirement}`}
    />
  );
};

const ItemsEditor = ({
  templateId,
  items,
  onChanged,
}: {
  templateId: string;
  items: any[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [newText, setNewText] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [newPhotoReq, setNewPhotoReq] = useState('none');
  const [newPhotoSource, setNewPhotoSource] = useState('camera');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editRequired, setEditRequired] = useState(false);
  const [editPhotoReq, setEditPhotoReq] = useState('none');
  const [editPhotoSource, setEditPhotoSource] = useState('camera');
  const [busy, setBusy] = useState(false);

  const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      notify(ok, { type: 'success' });
      onChanged();
    } catch (e: any) {
      notify(e?.message ?? 'Ошибка', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const body: {
        text: string;
        is_required: boolean;
        photo_requirement: string;
        photo_source?: string;
      } = { text: newText.trim(), is_required: newRequired, photo_requirement: newPhotoReq };
      // source отправляем только при requirement !== none (иначе бэк его игнорирует).
      if (newPhotoReq !== 'none') body.photo_source = newPhotoSource;
      await dataProvider.addTemplateItem(templateId, body);
      setNewText('');
      setNewRequired(false);
      setNewPhotoReq('none');
      setNewPhotoSource('camera');
    }, 'Пункт добавлен');

  const saveEdit = (itemId: string) =>
    run(async () => {
      const body: Record<string, unknown> = {
        text: editText.trim(),
        is_required: editRequired,
        photo_requirement: editPhotoReq,
      };
      if (editPhotoReq !== 'none') body.photo_source = editPhotoSource;
      await dataProvider.updateTemplateItem(templateId, itemId, body);
      setEditingId(null);
    }, 'Пункт обновлён');

  const remove = (itemId: string) =>
    run(() => dataProvider.deleteTemplateItem(templateId, itemId), 'Пункт удалён');

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sorted.length) return;
    const ids = sorted.map((it) => it.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => dataProvider.reorderTemplateItems(templateId, ids), 'Порядок обновлён');
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Пункты
        </Typography>
        <Table size="small">
          <TableBody>
            {sorted.map((it, index) => (
              <TableRow key={it.id}>
                <TableCell sx={{ width: 80 }}>
                  <IconButton
                    size="small"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={busy || index === sorted.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </TableCell>
                <TableCell>
                  {editingId === it.id ? (
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <MuiTextField
                        size="small"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        sx={{ minWidth: 280 }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={editRequired}
                            onChange={(e) => setEditRequired(e.target.checked)}
                          />
                        }
                        label="Обяз."
                      />
                      <PhotoFields
                        requirement={editPhotoReq}
                        source={editPhotoSource}
                        onRequirement={setEditPhotoReq}
                        onSource={setEditPhotoSource}
                        disabled={busy}
                      />
                    </Stack>
                  ) : (
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography>{it.text}</Typography>
                      {it.is_required && <Chip size="small" color="warning" label="Обязательный" />}
                      <PhotoRequirementChip requirement={it.photo_requirement ?? 'none'} />
                    </Stack>
                  )}
                </TableCell>
                <TableCell sx={{ width: 140, textAlign: 'right' }}>
                  {editingId === it.id ? (
                    <>
                      <Button size="small" disabled={busy} onClick={() => saveEdit(it.id)}>
                        Сохранить
                      </Button>
                      <Button size="small" onClick={() => setEditingId(null)}>
                        Отмена
                      </Button>
                    </>
                  ) : (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingId(it.id);
                          setEditText(it.text ?? '');
                          setEditRequired(Boolean(it.is_required));
                          setEditPhotoReq(it.photo_requirement ?? 'none');
                          setEditPhotoSource(it.photo_source ?? 'camera');
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" disabled={busy} onClick={() => remove(it.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 2 }}
        >
          <MuiTextField
            size="small"
            label="Новый пункт"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            sx={{ minWidth: 280 }}
          />
          <FormControlLabel
            control={
              <Checkbox checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
            }
            label="Обяз."
          />
          <PhotoFields
            requirement={newPhotoReq}
            source={newPhotoSource}
            onRequirement={setNewPhotoReq}
            onSource={setNewPhotoSource}
            disabled={busy}
          />
          <Button startIcon={<AddIcon />} disabled={busy || !newText.trim()} onClick={add}>
            Добавить
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

const RolesAssignment = ({
  templateId,
  roleIds,
  onChanged,
}: {
  templateId: string;
  roleIds: string[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: roles } = useGetList('roles', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const [selected, setSelected] = useState<string[]>(roleIds);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(roleIds), [roleIds]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setBusy(true);
    try {
      await dataProvider.setTemplateRoles(templateId, selected);
      notify('Назначения ролей сохранены', { type: 'success' });
      onChanged();
    } catch (e: any) {
      notify(e?.message ?? 'Ошибка', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Назначение ролям
        </Typography>
        {(roles ?? []).length === 0 ? (
          <Typography color="text.secondary">Нет кастомных ролей в организации</Typography>
        ) : (
          <Stack>
            {(roles ?? []).map((r) => (
              <FormControlLabel
                key={r.id}
                control={
                  <Checkbox checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                }
                label={r.name}
              />
            ))}
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" disabled={busy} onClick={save}>
                Сохранить роли
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

// Секция «Точки» — по образцу RolesAssignment. Точки сужают ролевое назначение (см. STATUS.md,
// «Ключевые решения аналитика», п.1), поэтому в карточке идут сразу за секцией ролей.
const LocationsAssignment = ({
  templateId,
  locationIds,
  onChanged,
}: {
  templateId: string;
  locationIds: string[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: locations } = useGetList('work-locations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const [selected, setSelected] = useState<string[]>(locationIds);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(locationIds), [locationIds]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setBusy(true);
    try {
      await dataProvider.setTemplateLocations(templateId, selected);
      notify('Точки сохранены', { type: 'success' });
      onChanged();
    } catch (e: any) {
      notify(checklistLocationErrorMessage(e, 'Ошибка'), { type: 'error' });
      // Шаблон исчез (удалён параллельно) — обновить карточку, а не оставлять устаревшие данные.
      if (e?.body?.code === 'TEMPLATE_NOT_FOUND') onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
          Точки
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Ничего не выбрано — чек-лист действует на всех точках. Выберите точки, чтобы ограничить
          его только ими.
        </Typography>
        {(locations ?? []).length === 0 ? (
          <Typography color="text.secondary">
            В организации нет ни одной рабочей точки.{' '}
            <Link component={RouterLink} to="/work-locations">
              Перейти к разделу точек
            </Link>
          </Typography>
        ) : (
          <Stack>
            {(locations ?? []).map((l) => (
              <FormControlLabel
                key={l.id}
                control={
                  <Checkbox checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
                }
                label={l.name}
              />
            ))}
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" disabled={busy} onClick={save}>
                Сохранить точки
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

const PersonalOverrides = ({
  templateId,
  personalAdd,
  personalRemove,
  onChanged,
}: {
  templateId: string;
  personalAdd: any[];
  personalRemove: any[];
  onChanged: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: members } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const [busy, setBusy] = useState(false);

  const addIds = new Set(personalAdd.map((m) => m.user_id));
  const removeIds = new Set(personalRemove.map((m) => m.user_id));
  const current = (userId: string): string =>
    addIds.has(userId) ? 'add' : removeIds.has(userId) ? 'remove' : 'none';

  const change = async (userId: string, value: string) => {
    setBusy(true);
    try {
      if (value === 'none') await dataProvider.deleteTemplatePersonal(templateId, userId);
      else await dataProvider.setTemplatePersonal(templateId, userId, value);
      notify('Переопределение сохранено', { type: 'success' });
      onChanged();
    } catch (e: any) {
      notify(e?.message ?? 'Ошибка', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Личные переопределения
        </Typography>
        <Table size="small">
          <TableBody>
            {(members ?? []).map((m) => (
              <TableRow key={m.user_id}>
                <TableCell>{m.user_name}</TableCell>
                <TableCell sx={{ width: 220 }}>
                  <Select
                    size="small"
                    fullWidth
                    disabled={busy}
                    value={current(m.user_id)}
                    onChange={(e) => change(m.user_id, e.target.value)}
                  >
                    <MenuItem value="none">— по роли —</MenuItem>
                    <MenuItem value="add">Добавить</MenuItem>
                    <MenuItem value="remove">Исключить</MenuItem>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export const ChecklistTemplateEdit = () => {
  const { id } = useParams();
  const dataProvider = useDataProvider();
  const { data: template, isLoading, refetch } = useGetOne('checklist-templates', { id: id ?? '' });
  const [assignments, setAssignments] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadAssignments = useCallback(() => {
    if (!id) return;
    dataProvider
      .getTemplateAssignments(id)
      .then((res: any) => setAssignments(res))
      .catch(() =>
        setAssignments({ role_ids: [], personal_add: [], personal_remove: [], location_ids: [] }),
      );
  }, [id, dataProvider]);

  useEffect(() => {
    reloadAssignments();
  }, [reloadAssignments, reloadKey]);

  const onChanged = () => {
    setReloadKey((k) => k + 1);
    void refetch();
  };

  if (isLoading || !template) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Чек-лист" />
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 800 }}>
      <Title title={`Чек-лист — ${template.name}`} />
      <TemplateMetaForm template={template} onSaved={onChanged} />
      <ItemsEditor templateId={template.id} items={template.items ?? []} onChanged={onChanged} />
      <RolesAssignment
        templateId={template.id}
        roleIds={assignments?.role_ids ?? []}
        onChanged={onChanged}
      />
      <LocationsAssignment
        templateId={template.id}
        locationIds={assignments?.location_ids ?? []}
        onChanged={onChanged}
      />
      <PersonalOverrides
        templateId={template.id}
        personalAdd={assignments?.personal_add ?? []}
        personalRemove={assignments?.personal_remove ?? []}
        onChanged={onChanged}
      />
    </Box>
  );
};
