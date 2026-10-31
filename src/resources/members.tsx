import { useCallback, useState } from 'react';
import {
  List,
  Datagrid,
  TextField,
  Edit,
  Create,
  FunctionField,
  SimpleForm,
  SelectInput,
  TextInput,
  ReferenceInput,
  SearchInput,
  DeleteButton,
  TopToolbar,
  FilterButton,
  CreateButton,
  maxLength,
  required,
  email,
  useRecordContext,
  useRedirect,
  useGetList,
  useNotify,
  useRefresh,
  RadioButtonGroupInput,
  type RaRecord,
} from 'react-admin';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, FormHelperText, Link as MuiLink, Typography } from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import LockResetIcon from '@mui/icons-material/LockReset';
import { MEMBER_ROLE_CHOICES, formatRateBadge } from '../utils/format';
import {
  validateLoginFormat,
  validatePasswordFormat,
  generateClientPassword,
} from '../utils/credentials';
import { useOrgAccess } from '../utils/useOrgAccess';
import { useIsReadOnly } from '../subscription/SubscriptionContext';
import { TariffAwareToolbar } from '../subscription/TariffAwareToolbar';
import { MemberRatesSection } from './memberRates';
import { MemberPenaltiesSection } from './penalties';
import { MemberNameCell } from '../components/MemberNameCell';
import { NoAccess } from '../components/NoAccess';
import { OrganizationTimeText } from '../components/TimeText';
import { ResetPasswordDialog, useIssuedCredentials } from './memberCredentials';

// Управление сотрудниками (кнопка «Добавить», смена пароля, правка логина, удаление) —
// право «Сотрудники · управление» (access_profiles/admin.md §2): полный администратор или
// профиль с members:manage. Финальная проверка — на бэке (403), здесь только прячем.
const useCanManageMembers = (): boolean => useOrgAccess().can('members', 'manage');

// «Доступ в кабинет» (access_profiles/admin.md §2).
const ACCESS_MODE_CHOICES = [
  { id: 'none', name: 'Нет (сотрудник)' },
  { id: 'full', name: 'Полный (администратор)' },
  { id: 'profile', name: 'По профилю' },
];

const profileName = (r: RaRecord | undefined): string | null => {
  const name = r?.access_profile?.name;
  return typeof name === 'string' && name !== '' ? name : null;
};

// Колонка списка: «Администратор» / имя профиля / «—».
const accessField = (r: RaRecord) => {
  if (r.role === 'admin') return 'Администратор';
  return profileName(r) ?? '—';
};

// Текст текущего значения — для read-only контрола обладателя профиля.
const accessText = (r: RaRecord | undefined): string => {
  if (r?.role === 'admin') return 'Полный (администратор)';
  const name = profileName(r);
  return name ? `По профилю: ${name}` : 'Нет (сотрудник)';
};

// «По профилю» без выбранного профиля — ошибка формы (селекта может не быть вовсе, если
// профилей ещё нет, поэтому ошибка — на самом переключателе).
const validateAccessMode = (values: Record<string, any>, errors: Record<string, string>) => {
  if (values.access_mode === 'profile' && !values.access_profile_id) {
    errors.access_mode = 'Выберите профиль доступа';
  }
};

const ProfileSelect = () => {
  const { data, isPending } = useGetList('access-profiles', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'name', order: 'ASC' },
  });
  if (!isPending && (data ?? []).length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Сначала создайте профиль доступа —{' '}
        <MuiLink component={RouterLink} to="/access-profiles/create">
          создать профиль
        </MuiLink>
      </Typography>
    );
  }
  return (
    <ReferenceInput
      source="access_profile_id"
      reference="access-profiles"
      sort={{ field: 'name', order: 'ASC' }}
      perPage={1000}
    >
      <SelectInput
        label="Профиль доступа"
        optionText="name"
        validate={required('Выберите профиль доступа')}
      />
    </ReferenceInput>
  );
};

// Единый контрол «Доступ в кабинет»: выдавать доступ могут только полные администраторы;
// обладателю профиля (даже с members:manage) он показан зафиксированным/только для чтения.
const AccessModeInput = ({ mode }: { mode: 'create' | 'edit' }) => {
  const { isFull } = useOrgAccess();
  const record = useRecordContext();
  const accessMode = useWatch({ name: 'access_mode' });
  if (!isFull) {
    return (
      <Box sx={{ my: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Доступ в кабинет
        </Typography>
        <Typography variant="body2">
          {mode === 'create' ? 'Нет (сотрудник)' : accessText(record)}
        </Typography>
        {mode === 'create' && (
          <FormHelperText>Выдавать доступ в кабинет могут владелец и администраторы</FormHelperText>
        )}
      </Box>
    );
  }
  return (
    <>
      <RadioButtonGroupInput
        source="access_mode"
        label="Доступ в кабинет"
        choices={ACCESS_MODE_CHOICES}
        defaultValue="none"
      />
      {accessMode === 'profile' && <ProfileSelect />}
    </>
  );
};

const memberFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="role" source="role" label="Системная роль" choices={MEMBER_ROLE_CHOICES} />,
];

// Колонка текущей ставки из MemberResponse.current_rate (additive nullable):
// null/отсутствует (старый бэк) → акцентная плашка «Ставка не задана».
const rateField = (r: RaRecord) =>
  r.current_rate ? (
    formatRateBadge(r.current_rate)
  ) : (
    <Chip size="small" color="warning" variant="outlined" label="Ставка не задана" />
  );

// Колонка «Имя» — единое правило отображения (member_display_name/admin.md): display_name
// основной строкой, user_name подписью. sortBy сохраняет прежнюю сортировку по клику
// на заголовок (TextField source="user_name" была сортируемой).
const nameField = (r: RaRecord) => (
  <MemberNameCell user_name={r.user_name} display_name={r.display_name} />
);

// user_email контрактно остаётся типом str (backend.md, п.5) — пустая строка, а не null,
// при отсутствии почты. EmailField.emptyText реагирует только на null/undefined (см. её
// исходник), поэтому пустую строку обрабатываем сами, а не полагаемся на встроенный emptyText.
const emailField = (r: RaRecord) =>
  typeof r.user_email === 'string' && r.user_email !== '' ? (
    <MuiLink href={`mailto:${r.user_email}`} onClick={(e) => e.stopPropagation()} variant="body2">
      {r.user_email}
    </MuiLink>
  ) : (
    '—'
  );

// Тулбар списка: сохраняем стандартную кнопку фильтров (роль — не alwaysOn), «Добавить
// сотрудника» — только owner/admin (admin.md, «Появляется штатная кнопка»). Read-only
// (backend.md «Read-only режим») прячет создание сотрудника — не входит в исключения
// (только DELETE/выход сотрудника исключён, см. TariffAwareToolbar в MemberEdit ниже).
const MemberListActions = () => {
  const canManage = useCanManageMembers();
  const isReadOnly = useIsReadOnly();
  return (
    <TopToolbar>
      <FilterButton />
      {canManage && !isReadOnly && <CreateButton label="Добавить сотрудника" />}
    </TopToolbar>
  );
};

export const MemberList = () => {
  const { isFull, can } = useOrgAccess();
  // current_rate бэк заполняет полному администратору или при payroll:view.
  const showRate = isFull || can('payroll');
  return (
    <List
      filters={memberFilters}
      sort={{ field: 'joined_at', order: 'DESC' }}
      exporter={false}
      actions={<MemberListActions />}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <FunctionField label="Имя" render={nameField} sortBy="user_name" />
        <TextField source="user_login" label="Логин" emptyText="—" />
        <FunctionField label="Email" render={emailField} />
        <FunctionField label="Доступ в кабинет" render={accessField} sortBy="role" />
        <TextField source="custom_role.name" label="Кастомная роль" emptyText="—" />
        {showRate && <FunctionField label="Ставка" render={rateField} />}
        <FunctionField
          label="Присоединился"
          render={(record: RaRecord) => <OrganizationTimeText value={record.joined_at} />}
        />
      </Datagrid>
    </List>
  );
};

// Форма создания сотрудника (admin.md, «Создание сотрудника»): логин ИЛИ email обязателен;
// пароль опционален (пусто — сгенерирует сервер, см. GeneratePasswordButton — клиентское
// превью, не обязательное). Серверные LOGIN_TAKEN/EMAIL_TAKEN/VALIDATION_ERROR — через
// error.body.errors (dataProvider.create, resource members).
const validateMemberCreate = (values: Record<string, any>): Record<string, any> => {
  const errors: Record<string, string> = {};
  const login = typeof values.login === 'string' ? values.login.trim() : '';
  const emailValue = typeof values.email === 'string' ? values.email.trim() : '';
  if (login === '' && emailValue === '') {
    errors.login = 'Укажите логин или email';
  }
  const loginError = validateLoginFormat(login);
  if (loginError) errors.login = loginError;
  const passwordError = validatePasswordFormat(values.password);
  if (passwordError) errors.password = passwordError;
  validateAccessMode(values, errors);
  return errors;
};

// Кнопка рядом с полем пароля: подставляет клиентское превью (generateClientPassword) —
// админ может увидеть/поправить пароль до отправки. Пустое поле при сабмите всё равно
// приведёт к серверной генерации (dataProvider не шлёт пустую строку как password).
const GeneratePasswordButton = () => {
  const { setValue } = useFormContext();
  return (
    <Button
      size="small"
      startIcon={<AutorenewIcon />}
      onClick={() =>
        setValue('password', generateClientPassword(), {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        })
      }
    >
      Сгенерировать
    </Button>
  );
};

// Выбор системной роли при создании: обе роли (employee/admin) доступны и owner, и admin
// организации (admin_grants_admin_role/admin.md, «RBAC») — бэк снял прежнее ограничение
// update_member_role на назначение admin только владельцем. defaultValue="employee" ниже
// оставляет повышение осознанным выбором, а не случайным дефолтом.
const MemberCreateFields = () => {
  return (
    <>
      <TextInput source="name" label="Имя" validate={required()} fullWidth />
      <TextInput
        source="login"
        label="Логин"
        helperText="Сотрудник будет входить по этому логину — латиница, цифры, . _ -, 3–32 символа"
        inputProps={{ maxLength: 32 }}
      />
      <TextInput source="email" label="Email" type="email" validate={email()} fullWidth />
      <TextInput source="phone" label="Телефон" />
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <TextInput
          source="password"
          label="Пароль"
          helperText="Пусто — сервер сгенерирует пароль автоматически"
          fullWidth
        />
        <GeneratePasswordButton />
      </Box>
      <AccessModeInput mode="create" />
      <ReferenceInput source="role_id" reference="roles">
        <SelectInput label="Кастомная роль" optionText="name" emptyText="— нет —" />
      </ReferenceInput>
      <TextInput
        source="display_name"
        label="Имя в организации"
        helperText="Как сотрудник отображается в организации. Пусто — показываем «Имя»"
        inputProps={{ maxLength: 100 }}
        validate={maxLength(100, 'Не более 100 символов')}
        fullWidth
      />
    </>
  );
};

// Ответ dataProvider.create('members', ...) несёт временные _login/_password (см. комментарий
// там же) — читаем их в onSuccess и сразу открываем окно выдачи доступа (admin.md, п.3:
// «Показывается сразу после успешного создания»). redirect={false} + собственный onSuccess
// отключают штатные notify/redirect Create — на список уходим сами при закрытии диалога.
// Право «Сотрудники · управление» проверяет RequireAccess на маршруте (App.tsx).
export const MemberCreate = () => {
  const isReadOnly = useIsReadOnly();
  const redirect = useRedirect();
  const { dialog, show } = useIssuedCredentials(() => redirect('list', 'members'));

  // isReadOnly гейтит саму форму, не только CreateButton в MemberListActions — маршрут
  // /members/create остаётся доступен по прямой ссылке независимо от того, откуда открыт.
  if (isReadOnly) {
    return <NoAccess text="Организация в режиме только для чтения — добавление недоступно." />;
  }

  return (
    <>
      <Create
        redirect={false}
        mutationOptions={{
          onSuccess: (data: RaRecord) => {
            show('Сотрудник добавлен', data._login ?? null, data._password ?? null);
          },
        }}
      >
        <SimpleForm validate={validateMemberCreate}>
          <MemberCreateFields />
        </SimpleForm>
      </Create>
      {dialog}
    </>
  );
};

// «Имя в организации» (display_name): необязательное, до 100 символов. Подсказка
// подставляет настоящее имя сотрудника — динамическая, поэтому нужен доступ к record.
// Очистка поля (пустая строка) = сброс на настоящее имя — нормализацию в null делает
// dataProvider (update, ресурс members), сюда её дублировать не нужно.
const DisplayNameInput = ({ disabled }: { disabled?: boolean }) => {
  const record = useRecordContext();
  const realName = typeof record?.user_name === 'string' ? record.user_name : '';
  return (
    <TextInput
      source="display_name"
      label="Имя в организации"
      helperText={`Как этот сотрудник отображается в вашей организации. Пусто — показываем имя из профиля: ${realName}`}
      disabled={disabled}
      inputProps={{ maxLength: 100 }}
      validate={maxLength(100, 'Не более 100 символов')}
      fullWidth
    />
  );
};

// Логин: редактируемый, только если password_managed === true (учётка заведена этой
// организацией — admin.md, п.4); иначе — только для чтения (учётка пришла по инвайту,
// логином управляет сам сотрудник). source="login" — плоское поле из mapMember (алиас
// user_login), которое dataProvider.update сравнивает с previousData и шлёт PATCH при смене.
// Очистка уже заданного логина запрещена клиентской валидацией независимо от наличия email
// (решение аналитика, admin_created_accounts/STATUS.md): бэк трактует login: null в PATCH
// как «поле не передано» и молча не меняет его — без этой проверки форма отрапортовала бы
// успех при фактическом no-op. Логин — способ входа, снимать его незачем; если он уже задан,
// пустое значение — ошибка, а не «выключить логин».
const LoginInput = ({ disabled }: { disabled?: boolean }) => {
  const record = useRecordContext();
  const managed = record?.password_managed === true;
  const hadLogin = typeof record?.login === 'string' && record.login !== '';
  const validateLogin = useCallback(
    (value: unknown): string | undefined => {
      const formatError = validateLoginFormat(value);
      if (formatError) return formatError;
      const isEmpty = value === undefined || value === null || value === '';
      return isEmpty && hadLogin
        ? 'Логин нельзя очистить — это способ входа сотрудника. Задайте другой логин вместо удаления.'
        : undefined;
    },
    [hadLogin],
  );
  return (
    <TextInput
      source="login"
      label="Логин"
      disabled={!managed || disabled}
      helperText={managed ? 'Логин для входа сотрудника' : undefined}
      inputProps={{ maxLength: 32 }}
      validate={validateLogin}
      fullWidth
    />
  );
};

// Секция «Сменить пароль» (admin.md, п.4): кнопка видна только owner/admin и только для
// password_managed === true. Открывает ResetPasswordDialog → по успеху сразу показывает
// окно выдачи доступа (тот же компонент, что и после создания сотрудника).
const ResetPasswordSection = () => {
  const record = useRecordContext();
  const canManage = useCanManageMembers();
  const isReadOnly = useIsReadOnly();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { dialog, show } = useIssuedCredentials();

  const userId = record?.user_id ? String(record.user_id) : null;
  if (!record || !canManage || isReadOnly || record.password_managed !== true || !userId) {
    return null;
  }

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Button variant="outlined" startIcon={<LockResetIcon />} onClick={() => setDialogOpen(true)}>
        Сменить пароль
      </Button>
      <ResetPasswordDialog
        userId={userId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onIssued={(login, password) => {
          setDialogOpen(false);
          show('Пароль обновлён', login, password);
        }}
      />
      {dialog}
    </Box>
  );
};

// toolbar={<TariffAwareToolbar/>} прячет только Save при read-only; DeleteButton ниже —
// вне тулбара, намеренно НЕ гейтится: «выход/исключение сотрудника» — явное исключение
// из read-only (backend.md «Read-only режим», п.3), уход из организации не блокируем.
//
// Карточка открывается и при «Сотрудники · просмотр» (access_profiles): без права
// «управление» поля заблокированы, тулбар сохранения скрыт, DeleteButton прячет сам
// react-admin (authProvider.canAccess: delete → manage).
const validateMemberEdit = (values: Record<string, any>): Record<string, any> => {
  const errors: Record<string, string> = {};
  validateAccessMode(values, errors);
  return errors;
};

export const MemberEdit = () => {
  const canManage = useCanManageMembers();
  const notify = useNotify();
  const refresh = useRefresh();
  // Свой onError ради частичного успеха смены доступа (dataProvider, body.partial): роль уже
  // сменилась — показываем ошибку и перечитываем запись. Остальное — как по умолчанию у
  // pessimistic Edit: ошибки полей (body.errors) без уведомления, иначе текст ошибки.
  const onError = (error: unknown) => {
    const err = error as { message?: string; body?: { partial?: boolean; errors?: object } };
    if (err?.body?.partial) {
      notify(err.message ?? 'Ошибка сохранения', { type: 'error' });
      refresh();
      return;
    }
    if (err?.body?.errors && Object.keys(err.body.errors).length > 0) return;
    notify(err?.message || 'ra.notification.http_error', { type: 'error' });
  };
  return (
    <Edit mutationMode="pessimistic" redirect="list" mutationOptions={{ onError }}>
      <SimpleForm
        toolbar={canManage ? <TariffAwareToolbar /> : false}
        validate={validateMemberEdit}
      >
        <TextInput source="user_name" label="Имя" disabled />
        <TextInput source="user_email" label="Email" disabled />
        <LoginInput disabled={!canManage} />
        <DisplayNameInput disabled={!canManage} />
        <AccessModeInput mode="edit" />
        <ReferenceInput source="custom_role_id" reference="roles">
          <SelectInput
            label="Кастомная роль"
            optionText="name"
            emptyText="— нет —"
            disabled={!canManage}
          />
        </ReferenceInput>
        <DeleteButton label="Удалить из организации" mutationMode="pessimistic" />
      </SimpleForm>
      <ResetPasswordSection />
      <MemberRatesSection />
      <MemberPenaltiesSection />
    </Edit>
  );
};
