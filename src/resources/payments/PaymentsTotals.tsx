import { useListContext } from 'react-admin';
import { Card, CardContent, Stack, Typography } from '@mui/material';
import { formatMoneyMinor } from '../../utils/format';
import type { AdminPaymentsTotals } from '../../subscription/billingTypes';

// «Над таблицей — итог по текущему фильтру» (admin.md, «Реестр «Платежи»»): totals приходит
// в ТОМ ЖЕ ответе GET /admin/payments, что и строки таблицы (backend.md п.7) — dataProvider
// прокидывает его через meta getList-результата (см. providers/dataProvider.ts, ветка
// resource==='payments'), а react-admin пробрасывает meta насквозь в useListContext().
// Отдельного сетевого запроса не требуется, totals синхронен со страницей/фильтром датагрида
// автоматически — тот же query, тот же ответ.
export const PaymentsTotals = () => {
  const { meta, isPending } = useListContext();
  const totals = (meta as { totals?: AdminPaymentsTotals } | undefined)?.totals;

  if (isPending || !totals) return null;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          Успешные платежи по фильтру (без тестовых)
        </Typography>
        <Stack direction="row" spacing={3} alignItems="baseline" sx={{ mt: 0.5 }}>
          <Typography variant="h5">{formatMoneyMinor(totals.succeeded_amount_minor)}</Typography>
          <Typography color="text.secondary">{totals.count} шт.</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
};
