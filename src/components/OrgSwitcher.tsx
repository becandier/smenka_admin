import { useEffect, useMemo } from 'react';
import { usePermissions, useRedirect, useRefresh } from 'react-admin';
import { Box, Button, Chip, MenuItem, Select } from '@mui/material';
import { useCurrentOrg } from '../orgContext';
import type { CurrentOrg } from '../config';
import type { Permissions } from '../providers/authProvider';

const WHITE = '#fff';

// Переключатель организации в app-баре.
//  - owner/admin: выпадающий список своих орг (owner|admin), авто-выбор единственной.
//  - super_admin: показывает открытый кабинет (открывается из раздела «Организации») с кнопкой «Закрыть».
export const OrgSwitcher = () => {
  const { permissions } = usePermissions<Permissions>();
  const { org, selectOrg } = useCurrentOrg();
  const redirect = useRedirect();
  const refresh = useRefresh();

  const role = permissions?.role;
  const myOrgs = useMemo(
    () =>
      (permissions?.organizations ?? []).filter(
        (o) => o.my_role === 'owner' || o.my_role === 'admin',
      ),
    [permissions],
  );

  // Авто-выбор единственной организации для owner/admin.
  useEffect(() => {
    if (role && role !== 'super_admin' && !org && myOrgs.length === 1) {
      selectOrg({ id: myOrgs[0].id, name: myOrgs[0].name });
    }
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
          sx={{ color: WHITE, borderColor: 'rgba(255,255,255,0.7)' }}
        />
        <Button size="small" sx={{ color: WHITE }} onClick={() => open(null)}>
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
          color: WHITE,
          '.MuiSvgIcon-root': { color: WHITE },
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
