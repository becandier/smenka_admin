import { useDataProvider } from 'react-admin';
import { Alert, Box, Card, CardContent, Grid, Skeleton, Typography } from '@mui/material';
import { formatMoneyMinor, planCodeLabel } from '../../utils/format';
import { useAsync } from '../../utils/useAsync';
import type { SubscriptionsSummary } from '../../subscription/SubscriptionContext';

// Сводка над списком (admin.md, «Сводка над списком»): плитки по статусу, разбивка по
// тарифам и MRR — «супер-админ первым делом видит, у кого горит», данные из
// GET /admin/subscriptions/summary (backend.md п.8), ничего не хардкодится.
export const SummaryTiles = () => {
  const dataProvider = useDataProvider();
  // useAsync — общий одноразовый загрузчик с гашением гонки (utils/useAsync), тот же, что
  // в LoginPage/platformSettings/orgShifts; здесь достаточно булева признака ошибки.
  const { data: summary, error } = useAsync<SubscriptionsSummary>(
    () => dataProvider.getSubscriptionsSummary(),
    [dataProvider],
  );

  if (error)
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Не удалось загрузить сводку
      </Alert>
    );
  if (!summary) return <Skeleton variant="rounded" height={100} sx={{ mb: 2 }} />;

  const tiles: { label: string; value: number }[] = [
    { label: 'В триале', value: summary.by_status.trialing },
    { label: 'Активные', value: summary.by_status.active },
    { label: 'Просрочены', value: summary.by_status.past_due },
    { label: 'Приостановлены', value: summary.by_status.suspended },
  ];

  return (
    <Box sx={{ mb: 2 }}>
      <Grid container spacing={2}>
        {tiles.map((t) => (
          <Grid item xs={6} sm={3} key={t.label}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {t.label}
                </Typography>
                <Typography variant="h5">{t.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
        <Grid item xs={12} sm={6}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                По тарифам
              </Typography>
              <Typography variant="body1">
                {Object.entries(summary.by_plan)
                  .map(([code, count]) => `${planCodeLabel(code)}: ${count}`)
                  .join(' · ') || '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                MRR (активные организации)
              </Typography>
              <Typography variant="h5">{formatMoneyMinor(summary.mrr_minor)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
