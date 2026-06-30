import { useEffect, useMemo, useRef } from 'react';
import { usePermissions, useGetIdentity, useRedirect, useRefresh } from 'react-admin';
import { Box, Button, Chip, MenuItem, Select } from '@mui/material';
import { useCurrentOrg } from '../orgContext';
import { getCurrentOrg, type CurrentOrg } from '../config';
import type { Permissions } from '../providers/authProvider';

// Текст/иконки на синем AppBar = primary.contrastText (см. theme.ts). Без хардкода белого.
const ON_BAR = 'primary.contrastText';

// Переключатель организации в app-баре.
//  - owner/admin: выпадающий список своих орг (owner|admin), авто-выбор единственной.
//  - super_admin: показывает открытый кабинет (открывается из раздела «Организации») с кнопкой «Закрыть».
export const OrgSwitcher = () => {
  const { permissions } = usePermissions<Permissions>();
  const { identity } = useGetIdentity();
  const { org, selectOrg } = useCurrentOrg();
  const redirect = useRedirect();
  const refresh = useRefresh();

  const role = permissions?.role;
  const userId = identity?.id ? String(identity.id) : null;
  const myOrgs = useMemo(
    () =>
      (permissions?.organizations ?? []).filter(
        (o) => o.my_role === 'owner' || o.my_role === 'admin',
      ),
    [permissions],
  );

  // (1) Роль-агностичный сброс «залипшей» org при смене аккаунта. OrgProvider живёт выше
  // <Admin> и не размонтируется при login/logout (SPA), поэтому React-состояние org
  // переживает смену пользователя, а logout очищает только localStorage (ORG_KEY). При
  // заходе другим пользователем выравниваем React-состояние по localStorage: чужая org из
  // прошлой сессии (localStorage уже пуст) сбрасывается, а собственный ранее открытый
  // кабинет super_admin — восстанавливается. Срабатывает только на фактическую смену userId.
  const prevUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || prevUserId.current === userId) return;
    prevUserId.current = userId;
    const stored = getCurrentOrg();
    if ((stored?.id ?? null) !== (org?.id ?? null)) selectOrg(stored);
  }, [userId, org, selectOrg]);

  // (2) Держим выбранную org консистентной с правами owner/admin: если выбранная org не
  // входит в мои организации — выбираем единственную доступную либо сбрасываем. super_admin
  // исключён намеренно: его «кабинет» открывается из раздела «Организации» и допускает любую
  // org (сквозной доступ), членства owner/admin у него может не быть.
  useEffect(() => {
    if (!role || role === 'super_admin') return;
    const orgInScope = org ? myOrgs.some((o) => o.id === org.id) : false;
    if (orgInScope) return;
    const next = myOrgs.length === 1 ? { id: myOrgs[0].id, name: myOrgs[0].name } : null;
    // Не дёргаем selectOrg(null), когда org и так пуста (нет доступных для авто-выбора).
    if (next || org) selectOrg(next);
  }, [role, org, myOrgs, selectOrg]);

  if (!permissions) return null;

  const open = (next: CurrentOrg | null) => {
    selectOrg(next);
    redirect(next ? '/members' : '/');
    refresh();
  };

  if (role === 'super_admin') {
    if (!org) return null;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
        <Chip
          variant="outlined"
          label={`Кабинет: ${org.name}`}
          sx={{ color: ON_BAR, borderColor: 'rgba(255,255,255,0.7)' }}
        />
        <Button size="small" sx={{ color: ON_BAR }} onClick={() => open(null)}>
          Закрыть
        </Button>
      </Box>
    );
  }

  if (myOrgs.length === 0) return null;

  return (
    <Box sx={{ minWidth: 220, mr: 2 }}>
      <Select
        size="small"
        value={org?.id ?? ''}
        displayEmpty
        fullWidth
        sx={{
          color: ON_BAR,
          '.MuiSvgIcon-root': { color: ON_BAR },
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
        }}
        onChange={(e) => {
          const sel = myOrgs.find((o) => o.id === e.target.value);
          if (sel) open({ id: sel.id, name: sel.name });
        }}
      >
        <MenuItem value="" disabled>
          Выберите организацию
        </MenuItem>
        {myOrgs.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.name}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};
