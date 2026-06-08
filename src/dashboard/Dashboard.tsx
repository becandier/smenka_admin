import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Grid, Box, CircularProgress } from '@mui/material';
import { Title } from 'react-admin';
import { API_BASE_URL, getAccessToken } from '../config';

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
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/stats`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}`, Accept: 'application/json' },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.error) setError(json.error.message ?? 'Ошибка');
        else setStats(json.data);
      })
      .catch(() => setError('Не удалось загрузить статистику'));
  }, []);

  return (
    <Box sx={{ p: 2 }}>
      <Title title="Smenka — обзор" />
      <Typography variant="h5" sx={{ mb: 2 }}>
        Обзор платформы
      </Typography>

      {error && <Typography color="error">{error}</Typography>}
      {!stats && !error && <CircularProgress />}

      {stats && (
        <Grid container spacing={2}>
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
      )}
    </Box>
  );
};
