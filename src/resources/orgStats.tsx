import { useEffect, useState } from 'react';
import { Title, useDataProvider, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCurrentOrg } from '../orgContext';
import { DateRangeFields } from '../components/DateRangeFields';
import { formatDateTime, formatDuration } from '../utils/format';
import {
  INVALID_RANGE_MESSAGE,
  isDayRangeInvalid,
  localDayEndToUtcIso,
  localDayStartToUtcIso,
} from '../utils/dates';
import type { OrgStatsQuery } from '../providers/dataProvider';

interface EmployeeStat {
  user_id: string;
  user_name: string;
  user_email: string;
  shift_count: number;
  total_worked_seconds: number;
  average_shift_seconds: number;
}
interface OrgStats {
  period: string | null;
  total_worked_seconds: number;
  shift_count: number;
  average_shift_seconds: number;
  per_employee: EmployeeStat[];
  // Опциональны: старый бэк их не отдаёт — плашку окна рендерим только при наличии.
  range_from?: string | null;
  range_to?: string | null;
}

// Единый источник окна: пресет (period) ЛИБО произвольный диапазон (date_from/date_to).
type WindowMode = 'preset' | 'range';

const DEFAULT_PERIOD = 'week';

const periodChoices = [
  { id: 'day', name: 'День' },
  { id: 'week', name: 'Неделя' },
  { id: 'month', name: 'Месяц' },
];

const toHours = (seconds: number): number => Math.round((seconds / 3600) * 10) / 10;

export const OrgStatsPage = () => {
  const { org } = useCurrentOrg();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [mode, setMode] = useState<WindowMode>('preset');
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeInvalid = mode === 'range' && isDayRangeInvalid(dateFrom, dateTo);
  const rangeEmpty = mode === 'range' && dateFrom === '' && dateTo === '';

  useEffect(() => {
    if (!org) return;
    // Пустое окно (MISSING_STATS_RANGE) и невалидный диапазон (INVALID_DATE_RANGE)
    // гасим на клиенте: запрос не отправляем, ждём корректного ввода.
    if (rangeEmpty || rangeInvalid) {
      setStats(null);
      setError(null);
      setLoading(false);
      return;
    }
    // Отправляется ровно один источник окна — AMBIGUOUS_STATS_RANGE недостижим из UI.
    const query: OrgStatsQuery =
      mode === 'preset'
        ? { period }
        : {
            date_from: dateFrom === '' ? undefined : localDayStartToUtcIso(dateFrom),
            date_to: dateTo === '' ? undefined : localDayEndToUtcIso(dateTo),
          };
    let active = true;
    setLoading(true);
    setError(null);
    dataProvider
      .getOrgStats(query)
      .then((res: OrgStats) => {
        if (active) setStats(res);
      })
      .catch((e: any) => {
        if (!active) return;
        setStats(null);
        const code = e?.body?.code;
        if (code === 'MISSING_STATS_RANGE') {
          // Не должно достигать сервера; на всякий случай — сброс в дефолтный пресет.
          notify('Выберите период или диапазон', { type: 'warning' });
          setMode('preset');
          setPeriod(DEFAULT_PERIOD);
        } else if (code === 'AMBIGUOUS_STATS_RANGE') {
          notify('Выберите либо пресет, либо произвольный диапазон', { type: 'warning' });
        } else if (code === 'INVALID_DATE_RANGE') {
          setError(INVALID_RANGE_MESSAGE);
        } else {
          setError(e?.message ?? 'Ошибка загрузки статистики');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org, mode, period, dateFrom, dateTo, rangeEmpty, rangeInvalid, dataProvider, notify]);

  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Статистика" />
        <Typography color="text.secondary">Выберите организацию.</Typography>
      </Box>
    );
  }

  const cards = stats
    ? [
        { label: 'Смен за период', value: String(stats.shift_count) },
        { label: 'Отработано всего', value: formatDuration(stats.total_worked_seconds) },
        { label: 'Средняя смена', value: formatDuration(stats.average_shift_seconds) },
      ]
    : [];

  const chartData = (stats?.per_employee ?? []).map((e) => ({
    name: e.user_name,
    hours: toHours(e.total_worked_seconds),
  }));

  const hasRange = Boolean(stats && (stats.range_from || stats.range_to));

  return (
    <Box sx={{ p: 2 }}>
      <Title title={`Статистика — ${org.name}`} />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2,
        }}
      >
        <Typography variant="h5">Статистика организации</Typography>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, value: WindowMode | null) => value && setMode(value)}
          >
            <ToggleButton value="preset">Пресет</ToggleButton>
            <ToggleButton value="range">Диапазон</ToggleButton>
          </ToggleButtonGroup>
          {mode === 'preset' ? (
            <Select size="small" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periodChoices.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <DateRangeFields
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChangeFrom={setDateFrom}
              onChangeTo={setDateTo}
              invalid={rangeInvalid}
            />
          )}
        </Stack>
      </Box>

      {/* Плашка фактического окна из ответа: единый способ показать применённый
          диапазон и для пресета, и для кастома (при period=null UI не падает). */}
      {hasRange && stats && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Показано за период: {formatDateTime(stats.range_from)} — {formatDateTime(stats.range_to)}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {rangeEmpty && !loading && (
        <Typography color="text.secondary">Укажите хотя бы одну границу диапазона.</Typography>
      )}
      {loading && <CircularProgress />}

      {stats && !loading && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {cards.map((c) => (
              <Grid item xs={12} sm={4} key={c.label}>
                <Card>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      {c.label}
                    </Typography>
                    <Typography variant="h4">{c.value}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Отработано по сотрудникам, ч
              </Typography>
              {chartData.length === 0 ? (
                <Typography color="text.secondary">Нет смен в выбранном окне</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${String(value ?? '')} ч`, 'Отработано']} />
                    <Bar dataKey="hours" fill="#4A90D9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
};
