import { Fragment, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { formatClockDuration, formatMoneyMinor } from '../../utils/format';
import { formatBucketLabel } from './buckets';
import type { Granularity, PayrollItem, PayrollReport } from './types';

// Подсказка к бейджу «нет ставки»: сколько не вошло в начисление (как в базовом payroll).
const missingRateHint = (item: PayrollItem): string => {
  const hours = Math.round(item.unpaid_seconds / 3600);
  return `${item.unpaid_shifts_count} смен / ${hours}ч без действующей ставки не вошли в начисление`;
};

const MissingRateBadge = ({ title }: { title: string }) => (
  <Tooltip title={title}>
    <Chip size="small" color="warning" icon={<WarningAmberIcon />} label="нет ставки" />
  </Tooltip>
);

// Ячейка «Штраф»: сумма штрафов + подсказка с количеством (если штрафы есть).
const PenaltyCell = ({ amount_minor, count }: { amount_minor: number; count: number }) =>
  count > 0 ? (
    <Tooltip title={`${count} шт.`}>
      <TableCell align="right">{formatMoneyMinor(amount_minor)}</TableCell>
    </Tooltip>
  ) : (
    <TableCell align="right">{formatMoneyMinor(amount_minor)}</TableCell>
  );

// Ячейка «К выплате» (net = начислено − штрафы). Отрицательное (штрафы > начислений)
// показываем как есть, акцентом, не обрезая до нуля (ТЗ fines).
const NetCell = ({ amount_minor }: { amount_minor: number }) => (
  <TableCell align="right" sx={amount_minor < 0 ? { color: 'error.main' } : undefined}>
    {formatMoneyMinor(amount_minor)}
  </TableCell>
);

// Вложенная таблица дневной детализации (breakdown[]) одного сотрудника.
const BreakdownTable = ({ item, granularity }: { item: PayrollItem; granularity: Granularity }) => (
  <Box sx={{ pl: 4, py: 1 }}>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Период</TableCell>
          <TableCell align="right">Отработано</TableCell>
          <TableCell align="right">Смен</TableCell>
          <TableCell align="right">Начислено</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {(item.breakdown ?? []).map((bucket) => (
          <TableRow
            key={bucket.bucket_start}
            sx={bucket.has_missing_rate ? { bgcolor: 'warning.light', opacity: 0.95 } : undefined}
          >
            <TableCell>{formatBucketLabel(bucket.bucket_start, granularity)}</TableCell>
            <TableCell align="right">{formatClockDuration(bucket.worked_seconds)}</TableCell>
            <TableCell align="right">{bucket.shifts_count}</TableCell>
            <TableCell align="right">{formatMoneyMinor(bucket.gross_amount_minor)}</TableCell>
            <TableCell>
              {bucket.has_missing_rate && (
                <Tooltip title="В этот день есть смены без действующей ставки">
                  <WarningAmberIcon color="warning" fontSize="small" />
                </Tooltip>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Box>
);

// Режим «Список»: мастер-строки по сотрудникам + раскрытие в дневную детализацию.
export const PayrollListView = ({
  report,
  granularity,
}: {
  report: PayrollReport;
  granularity: Granularity;
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const detailed = granularity !== 'none';

  const toggle = (userId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {detailed && <TableCell sx={{ width: 48 }} />}
          <TableCell>Сотрудник</TableCell>
          <TableCell align="right">Отработано</TableCell>
          <TableCell align="right">Смен</TableCell>
          <TableCell align="right">Начислено</TableCell>
          <TableCell align="right">Штраф</TableCell>
          <TableCell align="right">К выплате</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {report.items.map((item) => {
          const hasBreakdown = detailed && (item.breakdown?.length ?? 0) > 0;
          const isOpen = expanded.has(item.user_id);
          return (
            <Fragment key={item.user_id}>
              <TableRow>
                {detailed && (
                  <TableCell>
                    {hasBreakdown && (
                      <IconButton size="small" onClick={() => toggle(item.user_id)}>
                        {isOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                      </IconButton>
                    )}
                  </TableCell>
                )}
                <TableCell>{item.user_name}</TableCell>
                <TableCell align="right">{formatClockDuration(item.worked_seconds)}</TableCell>
                <TableCell align="right">{item.shifts_count}</TableCell>
                <TableCell align="right">{formatMoneyMinor(item.gross_amount_minor)}</TableCell>
                <PenaltyCell
                  amount_minor={item.penalty_amount_minor}
                  count={item.penalties_count}
                />
                <NetCell amount_minor={item.net_amount_minor} />
                <TableCell>
                  {item.has_missing_rate && <MissingRateBadge title={missingRateHint(item)} />}
                </TableCell>
              </TableRow>
              {hasBreakdown && isOpen && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ py: 0, borderBottom: 0 }}>
                    <BreakdownTable item={item} granularity={granularity} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
          {detailed && <TableCell />}
          <TableCell>Итого</TableCell>
          <TableCell align="right">{formatClockDuration(report.totals.worked_seconds)}</TableCell>
          <TableCell align="right">{report.totals.shifts_count}</TableCell>
          <TableCell align="right">{formatMoneyMinor(report.totals.gross_amount_minor)}</TableCell>
          <PenaltyCell
            amount_minor={report.totals.penalty_amount_minor}
            count={report.totals.penalties_count}
          />
          <NetCell amount_minor={report.totals.net_amount_minor} />
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
};

// Заглушка для пустого отчёта (вынесена, чтобы переиспользовать и в матрице).
export const PayrollEmpty = () => (
  <Typography color="text.secondary">За выбранный период нет завершённых смен.</Typography>
);
