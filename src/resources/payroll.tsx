import { useEffect, useState } from 'react';
import { Title, useDataProvider } from 'react-admin';
import {
  Alert,
  Box,
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
  Tooltip,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useCurrentOrg } from '../orgContext';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import { DateRangeFields } from '../components/DateRangeFields';
import { formatClockDuration, formatDate, formatMoneyMinor } from '../utils/format';
import { isDayRangeInvalid, localDayEndToUtcIso, localDayStartToUtcIso } from '../utils/dates';

interface PayrollItem {
  user_id: string;
  user_name: string;
  worked_seconds: number;
  shifts_count: number;
  gross_amount_minor: number;
  unpaid_seconds: number;
  unpaid_shifts_count: number;
  has_missing_rate: boolean;
}

interface PayrollReport {
  period: { date_from: string | null; date_to: string | null };
  currency: string;
  items: PayrollItem[];
  totals: { worked_seconds: number; shifts_count: number; gross_amount_minor: number };
}

// Подсказка к бейджу «нет ставки»: сколько не вошло в начисление.
const missingRateHint = (item: PayrollItem): string => {
  const hours = Math.round(item.unpaid_seconds / 3600);
  return `${item.unpaid_shifts_count} смен / ${hours}ч без действующей ставки не вошли в начисление`;
};

// Отчёт «сколько кому заплатить» за период. Только просмотр; доступ — org owner/admin
// (super_admin сюда не гейтится — не его рабочий инструмент, ТЗ payroll).
export const PayrollPage = () => {
  const { org } = useCurrentOrg();
  const role = useMyOrgRole();
  const dataProvider = useDataProvider();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = role === 'owner' || role === 'admin';
  const rangeInvalid = isDayRangeInvalid(dateFrom, dateTo);

  useEffect(() => {
    if (!org || !allowed) return;
    // Невалидный диапазон не отправляем; обе границы опциональны (пусто = весь период).
    if (rangeInvalid) {
      setReport(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    dataProvider
      .getPayroll({
        date_from: dateFrom === '' ? undefined : localDayStartToUtcIso(dateFrom),
        date_to: dateTo === '' ? undefined : localDayEndToUtcIso(dateTo),
      })
      .then((res: PayrollReport) => {
        if (active) setReport(res);
      })
      .catch((e: any) => {
        if (!active) return;
        setReport(null);
        const code = e?.body?.code;
        if (code === 'FORBIDDEN') {
          setError('Нет доступа к отчёту по зарплате');
        } else if (code === 'ORG_NOT_FOUND') {
          setError('Организация не найдена');
        } else {
          setError(e?.message ?? 'Ошибка загрузки отчёта');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org, allowed, dateFrom, dateTo, rangeInvalid, dataProvider]);

  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Зарплата" />
        <Typography color="text.secondary">Выберите организацию.</Typography>
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Зарплата" />
        <Typography color="text.secondary">Нет доступа к отчёту по зарплате.</Typography>
      </Box>
    );
  }

  const periodLabel = report
    ? report.period.date_from || report.period.date_to
      ? `${formatDate(report.period.date_from)} — ${formatDate(report.period.date_to)}`
      : 'за всё время'
    : null;

  return (
    <Box sx={{ p: 2 }}>
      <Title title={`Зарплата — ${org.name}`} />
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
        <Typography variant="h5">Зарплата</Typography>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap">
          <DateRangeFields
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChangeFrom={setDateFrom}
            onChangeTo={setDateTo}
            invalid={rangeInvalid}
          />
        </Stack>
      </Box>

      {report && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Chip size="small" label={`Валюта: ${report.currency}`} />
          {periodLabel && <Chip size="small" label={`Период: ${periodLabel}`} />}
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {report && !loading && (
        <Card>
          <CardContent>
            {report.items.length === 0 ? (
              <Typography color="text.secondary">
                За выбранный период нет завершённых смен.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Сотрудник</TableCell>
                    <TableCell align="right">Отработано</TableCell>
                    <TableCell align="right">Смен</TableCell>
                    <TableCell align="right">Начислено</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.items.map((item) => (
                    <TableRow key={item.user_id}>
                      <TableCell>{item.user_name}</TableCell>
                      <TableCell align="right">
                        {formatClockDuration(item.worked_seconds)}
                      </TableCell>
                      <TableCell align="right">{item.shifts_count}</TableCell>
                      <TableCell align="right">
                        {formatMoneyMinor(item.gross_amount_minor)}
                      </TableCell>
                      <TableCell>
                        {item.has_missing_rate && (
                          <Tooltip title={missingRateHint(item)}>
                            <Chip
                              size="small"
                              color="warning"
                              icon={<WarningAmberIcon />}
                              label="нет ставки"
                            />
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
                    <TableCell>Итого</TableCell>
                    <TableCell align="right">
                      {formatClockDuration(report.totals.worked_seconds)}
                    </TableCell>
                    <TableCell align="right">{report.totals.shifts_count}</TableCell>
                    <TableCell align="right">
                      {formatMoneyMinor(report.totals.gross_amount_minor)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
