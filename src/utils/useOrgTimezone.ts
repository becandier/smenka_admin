import { useGetOne } from 'react-admin';
import { useCurrentOrg } from '../orgContext';
import { DEFAULT_ORG_TIMEZONE } from './timezones';

// Часовой пояс текущей организации (work_schedules): организация всегда её имеет
// (NOT NULL, server_default Europe/Moscow) — фолбэк только на время загрузки/сетевой ошибки.
// Читается через GET /organizations/{org_id} (dataProvider.getOne('organizations', ...)) —
// тот же эндпоинт, что уже используют inviteCode.tsx и OrganizationCreate-соседи.
export const useOrgTimezone = (): string => {
  const { org } = useCurrentOrg();
  const { data } = useGetOne('organizations', { id: org?.id ?? '' }, { enabled: Boolean(org?.id) });
  return typeof data?.timezone === 'string' && data.timezone ? data.timezone : DEFAULT_ORG_TIMEZONE;
};
