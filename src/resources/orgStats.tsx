import { useEffect, useState } from 'react';
import { Title, useDataProvider } from 'react-admin';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCurrentOrg } from '../orgContext';
import { formatDuration } from '../utils/format';

interface EmployeeStat {
  user_id: string;
  user_name: string;
  user_email: string;
  shift_count: number;
  total_worked_seconds: number;
  average_shift_seconds: number;
}
interface OrgStats {
  period: string;
  total_worked_seconds: number;
  shift_count: number;
  average_shift_seconds: number;
  per_employee: EmployeeStat[];
}

const periodChoices = [
  { id: 'day', name: 'День' },
  { id: 'week', name: 'Неделя' },
  { id: 'month', name: 'Месяц' },
];

const toHours = (seconds: number): number => Math.round((seconds / 3600) * 10) / 10;

export const OrgStatsPage = () => {
  const { org } = useCurrentOrg();
  const dataProvider = useDataProvider();
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let active = true;
    setStats(null);
    setError(null);
    dataProvider
      .getOrgStats(period)
      .then((res: OrgStats) => active && setStats(res))
      .catch((e: any) => active && setError(e?.message ?? 'Ошибка загрузки статистики'));
    return () => {
      active = false;
    };
  }, [org, period, dataProvider]);

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

  return (
    <Box sx={{ p: 2 }}>
      <Title title={`Статистика — ${org.name}`} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Статистика организации</Typography>
        <Select size="small" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {periodChoices.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {error && <Typography color="error">{error}</Typography>}
      {!stats && !error && <CircularProgress />}

      {stats && (
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
                <Typography color="text.secondary">Нет данных за период</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value} ч`, 'Отработано']} />
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
