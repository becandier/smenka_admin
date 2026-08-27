import { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type {
  AdminSubscriptionRow,
  SubscriptionEvent,
} from '../../subscription/SubscriptionContext';
import {
  formatDateTime,
  formatMoneyMinor,
  planCodeLabel,
  subscriptionEventTypeLabel,
  subscriptionStatusLabel,
  tariffErrorMessage,
} from '../../utils/format';

const PAGE_SIZE = 50;

// «Было → стало» для одной записи журнала: и тариф, и статус меняются независимо —
// показываем оба перехода, только если поле реально присутствует в записи.
const transitionCell = (event: SubscriptionEvent): string => {
  const parts: string[] = [];
  if (event.from_plan_code || event.to_plan_code) {
    parts.push(`${planCodeLabel(event.from_plan_code)} → ${planCodeLabel(event.to_plan_code)}`);
  }
  if (event.from_status || event.to_status) {
    parts.push(
      `${subscriptionStatusLabel(event.from_status)} → ${subscriptionStatusLabel(event.to_status)}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
};

// «История» — журнал изменений подписки, только чтение, неизменяемый (admin.md, «Действия
// на строке», п.3): «то, чем закрываются споры «когда и за что платили»». GET
// .../subscription/events (backend.md п.7), новые сверху.
export const HistoryDialog = ({
  row,
  onClose,
}: {
  row: AdminSubscriptionRow;
  onClose: () => void;
}) => {
  const dataProvider = useDataProvider();
  const [events, setEvents] = useState<SubscriptionEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setEvents(null);
    setError(null);
    dataProvider
      .getSubscriptionEvents(row.organization_id, { limit: PAGE_SIZE, offset })
      .then((res: { items: SubscriptionEvent[]; total: number }) => {
        if (!active) return;
        setEvents(res.items);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(tariffErrorMessage(e, 'Не удалось загрузить историю'));
      });
    return () => {
      active = false;
    };
  }, [dataProvider, row.organization_id, offset]);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>История подписки — {row.organization_name}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {!events && !error && <CircularProgress size={24} />}
        {events && events.length === 0 && (
          <Typography color="text.secondary">Событий пока нет.</Typography>
        )}
        {events && events.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>Событие</TableCell>
                  <TableCell>Было → стало</TableCell>
                  <TableCell align="right">Месяцев</TableCell>
                  <TableCell align="right">Сумма</TableCell>
                  <TableCell>Заметка</TableCell>
                  <TableCell>Кто провёл</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDateTime(e.created_at)}</TableCell>
                    <TableCell>{subscriptionEventTypeLabel(e.type)}</TableCell>
                    <TableCell>{transitionCell(e)}</TableCell>
                    <TableCell align="right">{e.months ?? '—'}</TableCell>
                    <TableCell align="right">
                      {e.amount_minor === null ? '—' : formatMoneyMinor(e.amount_minor)}
                    </TableCell>
                    <TableCell>{e.note ?? '—'}</TableCell>
                    <TableCell>{e.actor ? e.actor.name : 'Система'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Назад
        </Button>
        <Button
          disabled={offset + PAGE_SIZE >= total}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Далее
        </Button>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};
