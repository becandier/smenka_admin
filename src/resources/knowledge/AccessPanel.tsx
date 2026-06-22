import { useEffect, useMemo, useState } from 'react';
import { useGetList } from 'react-admin';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  useInheritedAccess,
  useNodeAccess,
  useSaveNodeAccess,
  knowledgeErrorCode,
} from './hooks';
import type {
  AccessEffect,
  AccessRule,
  AccessState,
  AccessSubjectType,
  Breadcrumb,
} from './types';

// Панель доступов (ACL) узла базы знаний (admin.md, раздел ACL).
// Грузим СОБСТВЕННЫЕ правила узла (A1), редактируем тумблер all_members + список
// allow/deny правил (роль/сотрудник), сохраняем bulk-заменой (A2). owner/admin/
// super_admin не ограничиваются этими правилами — ACL влияет только на employee в мобилке.

// Локальная строка-черновик правила. _key — стабильный ключ для React (id с бэка
// либо сгенерированный на клиенте для новых строк; в тело A2 не отправляется).
interface RuleDraft {
  _key: string;
  subject_type: AccessSubjectType;
  role_id: string | null;
  member_user_id: string | null;
  effect: AccessEffect;
}

const newKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `draft-${Math.random().toString(36).slice(2)}`;

const toDraft = (rule: AccessRule): RuleDraft => ({
  _key: rule.id ?? newKey(),
  subject_type: rule.subject_type,
  role_id: rule.role_id ?? null,
  member_user_id: rule.member_user_id ?? null,
  effect: rule.effect,
});

// Черновик → правило для отправки (A2): без id, только релевантное subject-поле.
const toRule = (d: RuleDraft): AccessRule =>
  d.subject_type === 'role'
    ? { subject_type: 'role', role_id: d.role_id, effect: d.effect }
    : { subject_type: 'member', member_user_id: d.member_user_id, effect: d.effect };

// Идентификатор субъекта строки — для контроля дублей в наборе.
const subjectKey = (d: RuleDraft): string | null =>
  d.subject_type === 'role' ? d.role_id : d.member_user_id;

interface AccessPanelProps {
  nodeId: string | null;
  // Путь предков узла (breadcrumbs без самого узла), порядок — от корня. Нужен для
  // показа унаследованных правил read-only бейджем (admin.md §3).
  ancestors: Breadcrumb[];
}

export const AccessPanel = ({ nodeId, ancestors }: AccessPanelProps) => {
  const { access, loading, error, refetch } = useNodeAccess(nodeId);
  const { save, saving } = useSaveNodeAccess(nodeId);
  const { inherited, loading: inheritedLoading } = useInheritedAccess(ancestors);

  // Справочники для выпадашек субъектов — через dataProvider (useGetList), не fetch.
  const { data: roles, isLoading: rolesLoading } = useGetList('roles', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });
  const { data: members, isLoading: membersLoading } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });

  const roleChoices = useMemo(
    () => (roles ?? []).map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) })),
    [roles],
  );
  const memberChoices = useMemo(
    () =>
      (members ?? []).map((m) => ({
        id: String(m.user_id),
        name: String(m.user_name ?? m.user_email ?? m.user_id),
      })),
    [members],
  );

  // Человекочитаемое имя субъекта правила (для унаследованных бейджей). Если справочник
  // ещё не догрузился или субъект отсутствует — показываем сам идентификатор.
  const subjectLabel = (rule: AccessRule): string => {
    if (rule.subject_type === 'role') {
      const id = rule.role_id ?? '';
      const found = roleChoices.find((c) => c.id === id);
      return `Роль: ${found?.name ?? id}`;
    }
    const id = rule.member_user_id ?? '';
    const found = memberChoices.find((c) => c.id === id);
    return `Сотрудник: ${found?.name ?? id}`;
  };

  // Локальный редактируемый стейт (контролируемая форма) — синхронизируем с загрузкой A1.
  const [allMembers, setAllMembers] = useState(false);
  const [rules, setRules] = useState<RuleDraft[]>([]);

  useEffect(() => {
    if (access) {
      setAllMembers(access.all_members);
      setRules(access.rules.map(toDraft));
    } else {
      setAllMembers(false);
      setRules([]);
    }
  }, [access]);

  if (!nodeId) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">Выберите узел, чтобы настроить доступ.</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    const code = knowledgeErrorCode(error);
    const text =
      code === 'KNOWLEDGE_NODE_NOT_FOUND'
        ? 'Материал не найден'
        : 'Не удалось загрузить настройки доступа';
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error" gutterBottom>
          {text}
        </Typography>
        <Button size="small" onClick={refetch}>
          Повторить
        </Button>
      </Box>
    );
  }

  const updateRule = (key: string, patch: Partial<RuleDraft>) => {
    setRules((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  };

  const addRule = (effect: AccessEffect) => {
    setRules((prev) => [
      ...prev,
      { _key: newKey(), subject_type: 'role', role_id: null, member_user_id: null, effect },
    ]);
  };

  const removeRule = (key: string) => {
    setRules((prev) => prev.filter((r) => r._key !== key));
  };

  // Клиентская превалидация: каждый субъект выбран и не повторяется в наборе.
  const incomplete = rules.some((r) => !subjectKey(r));
  const subjectKeys = rules.map(subjectKey).filter((k): k is string => Boolean(k));
  const hasDuplicate = new Set(subjectKeys).size !== subjectKeys.length;
  const canSave = !incomplete && !hasDuplicate && !saving;

  const handleSave = async () => {
    const payload: AccessState = {
      all_members: allMembers,
      rules: rules.map(toRule),
    };
    try {
      await save(payload);
      refetch();
    } catch {
      // Уведомление по error.code показывает useSaveNodeAccess; стейт формы сохраняем.
    }
  };

  const refsLoading = rolesLoading || membersLoading;

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1">Доступ</Typography>
        <Tooltip
          title="Владелец, администратор и супер-админ всегда видят всю базу знаний — эти правила на них не действуют. ACL ограничивает доступ только для сотрудников (employee) в мобильном приложении."
          arrow
        >
          <InfoOutlinedIcon fontSize="small" color="action" />
        </Tooltip>
      </Stack>

      <FormControlLabel
        control={
          <Switch
            checked={allMembers}
            onChange={(e) => setAllMembers(e.target.checked)}
            disabled={saving}
          />
        }
        label="Видно всем сотрудникам организации"
      />
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Самый слабый положительный сигнал: персональный или ролевой запрет (deny) его перебивает.
      </Typography>

      {/* Унаследованные правила предков — read-only. Правят их на узле-источнике;
          здесь показываем для наглядности эффективного доступа (admin.md §3, п.50). */}
      {(inherited.rules.length > 0 || inherited.allMembersFrom) && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
            <LockOutlinedIcon fontSize="small" color="disabled" />
            <Typography variant="subtitle2" color="text.secondary">
              Унаследовано от разделов выше
            </Typography>
          </Stack>
          <Stack spacing={1}>
            {inherited.allMembersFrom && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Chip size="small" label="Видно всем" color="info" variant="outlined" />
                <Typography variant="body2" color="text.secondary">
                  унаследовано от раздела «{inherited.allMembersFrom.sourceTitle}»
                </Typography>
              </Stack>
            )}
            {inherited.rules.map((ir) => (
              <Stack
                key={`${ir.sourceId}:${ir.rule.id ?? subjectLabel(ir.rule)}`}
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ flexWrap: 'wrap' }}
              >
                <Chip
                  size="small"
                  label={ir.rule.effect === 'allow' ? 'allow' : 'deny'}
                  color={ir.rule.effect === 'allow' ? 'success' : 'error'}
                  variant="outlined"
                />
                <Typography variant="body2" color="text.secondary">
                  {subjectLabel(ir.rule)} — унаследовано от раздела «{ir.sourceTitle}»
                </Typography>
              </Stack>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Эти правила заданы на разделах выше и редактируются там. Ближний раздел перебивает
            дальний, персональное правило — ролевое, запрет (deny) — разрешение (allow).
          </Typography>
        </Box>
      )}
      {inheritedLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            Загрузка унаследованных правил…
          </Typography>
        </Stack>
      )}

      <Divider sx={{ mb: 2 }} />

      <Stack spacing={1.5}>
        {rules.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Правил нет. Добавьте разрешение или запрет для роли либо сотрудника.
          </Typography>
        )}

        {rules.map((rule) => {
          const duplicate =
            Boolean(subjectKey(rule)) &&
            subjectKeys.filter((k) => k === subjectKey(rule)).length > 1;
          return (
            <Stack
              key={rule._key}
              direction="row"
              spacing={1}
              alignItems="flex-start"
              sx={{ flexWrap: 'wrap' }}
            >
              <TextField
                select
                size="small"
                label="Эффект"
                value={rule.effect}
                onChange={(e) => updateRule(rule._key, { effect: e.target.value as AccessEffect })}
                sx={{ minWidth: 120 }}
                disabled={saving}
              >
                <MenuItem value="allow">Разрешить</MenuItem>
                <MenuItem value="deny">Запретить</MenuItem>
              </TextField>

              <TextField
                select
                size="small"
                label="Тип"
                value={rule.subject_type}
                onChange={(e) =>
                  updateRule(rule._key, {
                    subject_type: e.target.value as AccessSubjectType,
                    role_id: null,
                    member_user_id: null,
                  })
                }
                sx={{ minWidth: 130 }}
                disabled={saving}
              >
                <MenuItem value="role">Роль</MenuItem>
                <MenuItem value="member">Сотрудник</MenuItem>
              </TextField>

              {rule.subject_type === 'role' ? (
                <TextField
                  select
                  size="small"
                  label="Роль"
                  value={rule.role_id ?? ''}
                  onChange={(e) => updateRule(rule._key, { role_id: e.target.value || null })}
                  error={duplicate || (!rule.role_id && !refsLoading)}
                  helperText={duplicate ? 'Субъект уже добавлен' : undefined}
                  sx={{ minWidth: 200 }}
                  disabled={saving || refsLoading}
                >
                  {roleChoices.length === 0 && (
                    <MenuItem value="" disabled>
                      {refsLoading ? 'Загрузка…' : 'Ролей нет'}
                    </MenuItem>
                  )}
                  {roleChoices.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  select
                  size="small"
                  label="Сотрудник"
                  value={rule.member_user_id ?? ''}
                  onChange={(e) =>
                    updateRule(rule._key, { member_user_id: e.target.value || null })
                  }
                  error={duplicate || (!rule.member_user_id && !refsLoading)}
                  helperText={duplicate ? 'Субъект уже добавлен' : undefined}
                  sx={{ minWidth: 200 }}
                  disabled={saving || refsLoading}
                >
                  {memberChoices.length === 0 && (
                    <MenuItem value="" disabled>
                      {refsLoading ? 'Загрузка…' : 'Сотрудников нет'}
                    </MenuItem>
                  )}
                  {memberChoices.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Chip
                size="small"
                label={rule.effect === 'allow' ? 'allow' : 'deny'}
                color={rule.effect === 'allow' ? 'success' : 'error'}
                variant="outlined"
                sx={{ mt: 0.75 }}
              />

              <Tooltip title="Удалить правило" arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => removeRule(rule._key)}
                    disabled={saving}
                    aria-label="Удалить правило"
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => addRule('allow')}
          disabled={saving}
        >
          Разрешение
        </Button>
        <Button
          size="small"
          startIcon={<AddIcon />}
          color="error"
          onClick={() => addRule('deny')}
          disabled={saving}
        >
          Запрет
        </Button>
      </Stack>

      {hasDuplicate && (
        <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
          Один субъект — одно правило: уберите повторяющиеся роли или сотрудников.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      <Button variant="contained" onClick={handleSave} disabled={!canSave}>
        {saving ? 'Сохранение…' : 'Сохранить доступ'}
      </Button>
    </Box>
  );
};
