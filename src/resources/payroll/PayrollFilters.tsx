import { useMemo } from 'react';
import { useGetList } from 'react-admin';
import {
  Autocomplete,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { DateRangeFields } from '../../components/DateRangeFields';
import type { Granularity } from './types';

// Спец-значение фильтра по точке: смены без привязанной точки (backend: location_ids=none).
export const NO_LOCATION_ID = 'none';

interface Option {
  id: string;
  name: string;
}

const GRANULARITY_OPTIONS: { id: Granularity; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'none', label: 'Без разбивки' },
];

interface PayrollFiltersProps {
  dateFrom: string;
  dateTo: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  rangeInvalid: boolean;
  userIds: string[];
  onUserIds: (ids: string[]) => void;
  locationIds: string[];
  onLocationIds: (ids: string[]) => void;
  granularity: Granularity;
  onGranularity: (value: Granularity) => void;
  onlyMissingRate: boolean;
  onOnlyMissingRate: (value: boolean) => void;
  includePenalties: boolean;
  onIncludePenalties: (value: boolean) => void;
}

// Панель фильтров экрана «Зарплата»: период, сотрудники, точки, гранулярность, «только без ставки».
// Таймзона отдельным контролом не выводится — берётся из браузера (см. index.tsx).
export const PayrollFilters = ({
  dateFrom,
  dateTo,
  onChangeFrom,
  onChangeTo,
  rangeInvalid,
  userIds,
  onUserIds,
  locationIds,
  onLocationIds,
  granularity,
  onGranularity,
  onlyMissingRate,
  onOnlyMissingRate,
  includePenalties,
  onIncludePenalties,
}: PayrollFiltersProps) => {
  const { data: members } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const { data: locations } = useGetList('work-locations', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'name', order: 'ASC' },
  });

  const memberOptions = useMemo<Option[]>(
    () => (members ?? []).map((m) => ({ id: m.user_id, name: m.user_name })),
    [members],
  );
  const locationOptions = useMemo<Option[]>(
    () => [
      { id: NO_LOCATION_ID, name: 'Без точки' },
      ...(locations ?? []).map((l) => ({ id: l.id, name: l.name })),
    ],
    [locations],
  );

  const selectedMembers = memberOptions.filter((o) => userIds.includes(o.id));
  const selectedLocations = locationOptions.filter((o) => locationIds.includes(o.id));

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <DateRangeFields
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChangeFrom={onChangeFrom}
        onChangeTo={onChangeTo}
        invalid={rangeInvalid}
      />

      <Autocomplete
        multiple
        size="small"
        sx={{ minWidth: 240 }}
        options={memberOptions}
        value={selectedMembers}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        onChange={(_, value) => onUserIds(value.map((o) => o.id))}
        limitTags={2}
        renderInput={(params) => (
          <TextField {...params} label="Сотрудники" placeholder={userIds.length ? '' : 'Все'} />
        )}
      />

      <Autocomplete
        multiple
        size="small"
        sx={{ minWidth: 220 }}
        options={locationOptions}
        value={selectedLocations}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        onChange={(_, value) => onLocationIds(value.map((o) => o.id))}
        limitTags={2}
        renderInput={(params) => (
          <TextField {...params} label="Точки" placeholder={locationIds.length ? '' : 'Все'} />
        )}
      />

      <ToggleButtonGroup
        size="small"
        exclusive
        value={granularity}
        onChange={(_, value: Granularity | null) => value && onGranularity(value)}
      >
        {GRANULARITY_OPTIONS.map((g) => (
          <ToggleButton key={g.id} value={g.id}>
            {g.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={onlyMissingRate}
            onChange={(e) => onOnlyMissingRate(e.target.checked)}
          />
        }
        label="Только без ставки"
      />

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={includePenalties}
            onChange={(e) => onIncludePenalties(e.target.checked)}
          />
        }
        label="Учитывать штрафы"
      />
    </Stack>
  );
};
