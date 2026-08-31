import { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  PAYMENT_STATUS_COLOR,
  billingErrorMessage,
  formatDate,
  formatMoneyMinor,
  paymentPurposeLabel,
  paymentStatusLabel,
} from '../../utils/format';
import type { PaymentRow } from '../../subscription/billingTypes';

const PAGE_SIZE = 20;

// «История платежей» (admin.md): дата, назначение, сумма, статус, чип «тест». Пагинация
// серверная (GET .../billing/payments, backend.md п.6) — та же схема Назад/Далее, что и
// HistoryDialog журнала подписки в реестре супер-админа.
export const PaymentHistoryTable = ({
  orgId,
  refreshToken,
}: {
  orgId: string;
  refreshToken: number;
}) => {
  const dataProvider = useDataProvider();
  const [items, setItems] = useState<PaymentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Смена организации/успешная оплата — начинаем с первой страницы заново.
  useEffect(() => {
    setOffset(0);
  }, [orgId, refreshToken]);

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(null);
    dataProvider
      .getBillingPayments(orgId, { limit: PAGE_SIZE, offset })
      .then((res: { items: PaymentRow[]; total: number }) => {
        if (!active) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(billingErrorMessage(e, 'Не удалось загрузить историю платежей'));
      });
    return () => {
      active = false;
    };
  }, [dataProvider, orgId, offset, refreshToken]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          История платежей
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {!items && !error && <CircularProgress size={24} />}
        {items && items.length === 0 && (
          <Typography color="text.secondary">Платежей пока нет.</Typography>
        )}
        {items && items.length > 0 && (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Дата</TableCell>
                    <TableCell>Назначение</TableCell>
                    <TableCell align="right">Сумма</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.created_at)}</TableCell>
                      <TableCell>{paymentPurposeLabel(p)}</TableCell>
                      <TableCell align="right">{formatMoneyMinor(p.amount_minor)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={PAYMENT_STATUS_COLOR[p.status] ?? 'default'}
                          label={paymentStatusLabel(p.status)}
                        />
                      </TableCell>
                      <TableCell>
                        {p.is_test && <Chip size="small" variant="outlined" label="тест" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} justifyContent="flex-end">
              <Button
                size="small"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Назад
              </Button>
              <Button
                size="small"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Далее
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
};
