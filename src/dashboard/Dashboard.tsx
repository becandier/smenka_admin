import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Title, useDataProvider, usePermissions } from 'react-admin';
import { Card, CardContent, Typography, Grid, Box, CircularProgress } from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Permissions } from '../providers/authProvider';

interface PlatformStats {
  users_total: number;
  users_verified: number;
  organizations_total: number;
  organizations_active: number;
  shifts_active: number;
  shifts_today: number;
  shifts_week: number;
}

const CARDS: { key: keyof PlatformStats; label: string }[] = [
  { key: 'users_total', label: 'Пользователей' },
  { key: 'users_verified', label: 'Верифицировано' },
  { key: 'organizations_total', label: 'Организаций' },
  { key: 'organizations_active', label: 'Активных орг' },
  { key: 'shifts_active', label: 'Смен сейчас' },
  { key: 'shifts_today', label: 'Смен сегодня' },
  { key: 'shifts_week', label: 'Смен за неделю' },
];

export const Dashboard = () => {
  const { permissions, isLoading: permsLoading } = usePermissions<Permissions>();
  const dataProvider = useDataProvider();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSuper = permissions?.role === 'super_admin';

  useEffect(() => {
    if (!isSuper) return;
    let active = true;
    dataProvider
      .getPlatformStats()
      .then((res: PlatformStats) => active && setStats(res))
      .catch((e: any) => active && setError(e?.message ?? 'Не удалось загрузить статистику'));
    return () => {
      active = false;
    };
  }, [isSuper, dataProvider]);

  // Не-super_admin: если есть управляемая орг — в кабинет; иначе явный экран «нет доступа».
  if (!permsLoading && permissions && !isSuper) {
    const manageable = (permissions.organizations ?? []).filter(
      (o) => o.my_role === 'owner' || o.my_role === 'admin',
    );
    if (manageable.length > 0) {
      return <Navigate to="/members" replace />;
    }
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Smenka" />
        <Typography variant="h6" sx={{ mb: 1 }}>
          Нет организаций для управления
        </Typography>
        <Typography color="text.secondary">
          У вашей учётной записи нет организаций с ролью владельца или администратора. Веб-кабинет
          доступен владельцам и администраторам организаций.
        </Typography>
      </Box>
    );
  }

  const chartData = stats
    ? [
        { name: 'Сейчас', value: stats.shifts_active },
        { name: 'Сегодня', value: stats.shifts_today },
        { name: 'За неделю', value: stats.shifts_week },
      ]
    : [];

  return (
    <Box sx={{ p: 2 }}>
      <Title title="Smenka — обзор" />
      <Typography variant="h5" sx={{ mb: 2 }}>
        Обзор платформы
      </Typography>

      {error && <Typography color="error">{error}</Typography>}
      {!stats && !error && <CircularProgress />}

      {stats && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {CARDS.map((card) => (
              <Grid item xs={6} sm={4} md={3} key={card.key}>
                <Card>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      {card.label}
                    </Typography>
                    <Typography variant="h4">{stats[card.key]}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Смены
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#4A90D9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
};
