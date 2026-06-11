import { useMemo } from 'react';
import { SelectInput, useGetList } from 'react-admin';

// Фильтр-select по участникам организации: значения — user_id, подписи — имена.
// Общий для ленты смен («Сотрудник») и аудита («Инициатор»).
export const MemberSelectFilter = (props: {
  source: string;
  label: string;
  alwaysOn?: boolean;
}) => {
  const { data } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const choices = useMemo(
    () => (data ?? []).map((m) => ({ id: m.user_id, name: m.user_name })),
    [data],
  );
  return <SelectInput {...props} choices={choices} />;
};
