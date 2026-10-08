import { Fragment, useMemo, useState } from 'react';
import { useGetList } from 'react-admin';
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { formatClockDuration, formatMoneyMinor, formatSignedMoneyMinor } from '../../utils/format';
import { MemberNameCell } from '../../components/MemberNameCell';
import { formatBucketLabel } from './buckets';
import type { Granularity, PayrollItem, PayrollReport } from './types';
import type { TimeContext } from '../../utils/time';
import { categoryLabel } from '../adjustmentCategoryUtils';
import {
  adjustmentSplit,
  adjustmentsListHref,
  buildBreakdownLines,
  categoryAmounts,
  deductionDisplayMinor,
  grossTooltip,
} from './breakdown';

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

// Ячейка «К выплате» (net = начислено − штрафы + ручные начисления). Отрицательное
// показываем как есть, акцентом, не обрезая до нуля (ТЗ fines/manual_time_entry).
const NetCell = ({ amount_minor }: { amount_minor: number }) => (
  <TableCell align="right" sx={amount_minor < 0 ? { color: 'error.main' } : undefined}>
    {formatMoneyMinor(amount_minor)}
  </TableCell>
);

// Ячейка «Начислено» (payroll_breakdown): подсказка «за время X · переработка Y», если
// переработка ≠ 0 (и в основной таблице, и в дневной разбивке).
const GrossCell = ({ row }: { row: Parameters<typeof grossTooltip>[0] }) => {
  const hint = grossTooltip(row, formatMoneyMinor);
  const cell = <TableCell align="right">{formatMoneyMinor(row.gross_amount_minor)}</TableCell>;
  return hint ? <Tooltip title={hint}>{cell}</Tooltip> : cell;
};

// «Доплаты» — без знака; «Удержания» — со знаком минус, красным, если ≠ 0 (admin.md).
// Нулевые значения показываем «0 ₽», колонки не скрываем — таблица не прыгает.
const AccrualCell = ({ amount_minor }: { amount_minor: number }) => (
  <TableCell align="right">{formatMoneyMinor(amount_minor)}</TableCell>
);

const DeductionCell = ({ amount_minor }: { amount_minor: number }) => (
  <TableCell align="right" sx={amount_minor !== 0 ? { color: 'error.main' } : undefined}>
    {formatMoneyMinor(deductionDisplayMinor(amount_minor))}
  </TableCell>
);

// «По графику» (work_schedules R8): плановые часы + плановые деньги мелким шрифтом снизу.
const PlannedCell = ({
  planned_seconds,
  planned_amount_minor,
}: {
  planned_seconds: number;
  planned_amount_minor: number;
}) => (
  <TableCell align="right">
    <Typography variant="body2">{formatClockDuration(planned_seconds)}</Typography>
    <Typography variant="caption" color="text.secondary" display="block">
      {formatMoneyMinor(planned_amount_minor)}
    </Typography>
  </TableCell>
);

// «Разница» (delta = начислено − план): минус — недозаработал (красным), плюс — зелёным.
const DeltaCell = ({ amount_minor }: { amount_minor: number }) => (
  <TableCell
    align="right"
    sx={{ color: amount_minor < 0 ? 'error.main' : amount_minor > 0 ? 'success.main' : undefined }}
  >
    {amount_minor > 0 ? '+' : ''}
    {formatMoneyMinor(amount_minor)}
  </TableCell>
);

// «Опоздания»: количество и суммарная длительность; «—», если опозданий не было.
const LateCell = ({ count, seconds }: { count: number; seconds: number }) =>
  count > 0 ? (
    <TableCell align="right">{`${count} · ${formatClockDuration(seconds)}`}</TableCell>
  ) : (
    <TableCell align="right">—</TableCell>
  );

// Вложенная таблица дневной детализации (breakdown[]) одного сотрудника.
const BreakdownTable = ({ item, granularity }: { item: PayrollItem; granularity: Granularity }) => (
  <Box sx={{ pl: 4, pb: 1 }}>
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
            <GrossCell row={bucket} />
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

// Блок «Из чего сложилось» (payroll_breakdown): доступен в раскрытии строки всегда,
// независимо от разбивки по дням. Ссылки — в реестр начислений (фильтр по сотруднику и
// периоду) и в карточку сотрудника, где ведутся его штрафы (отдельного реестра штрафов с
// фильтрами нет — фильтр периода там не применяется).
const CompositionBlock = ({
  item,
  memberId,
  period,
  timeContext,
}: {
  item: PayrollItem;
  memberId: string | undefined;
  period: PayrollReport['period'];
  timeContext: TimeContext;
}) => {
  const lines = buildBreakdownLines(item);
  return (
    <Box sx={{ pl: 4, py: 1.5, maxWidth: 560 }}>
      <Typography variant="subtitle2" gutterBottom>
        Из чего сложилось
      </Typography>
      <Table size="small">
        <TableBody>
          {lines.map((line) => {
            const emphasized = line.kind !== 'item';
            const negative = line.amount_minor < 0;
            return (
              <TableRow
                key={line.key}
                sx={{
                  '& td': emphasized
                    ? { fontWeight: 'bold', borderBottom: 0, py: 0.5 }
                    : { borderBottom: 0, py: 0.25 },
                }}
              >
                <TableCell sx={{ pl: line.kind === 'item' ? 2 : 0 }}>
                  {emphasized ? `= ${line.label}` : line.label}
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', width: 72 }}>
                  {line.count !== undefined ? `${line.count} шт.` : ''}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ width: 140, ...(negative ? { color: 'error.main' } : {}) }}
                >
                  {line.signed
                    ? formatSignedMoneyMinor(line.amount_minor)
                    : formatMoneyMinor(line.amount_minor)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {memberId && (
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Link to={adjustmentsListHref(memberId, period, timeContext)}>Открыть начисления</Link>
          <Link to={`/members/${encodeURIComponent(memberId)}`}>Открыть штрафы</Link>
        </Stack>
      )}
    </Box>
  );
};

// Сводка по категориям за весь отчёт (totals.adjustments_by_category) — под таблицей,
// только если начисления есть.
const CategorySummary = ({ report }: { report: PayrollReport }) => {
  const categories = categoryAmounts(report.totals);
  if (categories.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Начисления по категориям
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {categories.map((c) => (
          <Chip
            key={c.category_id ?? 'none'}
            size="small"
            variant="outlined"
            color={c.amount_minor < 0 ? 'error' : 'default'}
            label={`${categoryLabel(c.category_name)}: ${formatSignedMoneyMinor(
              c.amount_minor,
            )} · ${c.count} шт.`}
          />
        ))}
      </Stack>
    </Box>
  );
};

// Количество колонок основной таблицы (для colSpan раскрытия).
const COLUMN_COUNT = 14;

// Режим «Список»: мастер-строки по сотрудникам + раскрытие: «Из чего сложилось» и (при
// разбивке по дням/неделям/месяцам) таблица детализации под ним.
export const PayrollListView = ({
  report,
  granularity,
  timeContext,
}: {
  report: PayrollReport;
  granularity: Granularity;
  timeContext: TimeContext;
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const detailed = granularity !== 'none';
  // user_id→member_id: те же params, что PayrollFilters уже запрашивает на этой странице —
  // один и тот же react-query кэш-ключ, лишнего сетевого запроса не добавляет. payroll отдаёт
  // только user_id, а начисления фильтруются по member_id; без маппинга (сотрудник выбыл из
  // org) ссылки просто не показываем.
  const { data: members } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const memberIdByUser = useMemo(
    () => new Map((members ?? []).map((m) => [String(m.user_id), String(m.id)])),
    [members],
  );

  const toggle = (userId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const totalsAdjustments = adjustmentSplit(report.totals);

  return (
    <>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 48 }} />
            <TableCell>Сотрудник</TableCell>
            <TableCell align="right">Отработано</TableCell>
            <TableCell align="right">Переработка</TableCell>
            <TableCell align="right">По графику</TableCell>
            <TableCell align="right">Разница</TableCell>
            <TableCell align="right">Опоздания</TableCell>
            <TableCell align="right">Смен</TableCell>
            <TableCell align="right">Начислено</TableCell>
            <TableCell align="right">Штраф</TableCell>
            <TableCell align="right">Доплаты</TableCell>
            <TableCell align="right">Удержания</TableCell>
            <TableCell align="right">К выплате</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {report.items.map((item) => {
            const hasBreakdown = detailed && (item.breakdown?.length ?? 0) > 0;
            const isOpen = expanded.has(item.user_id);
            const adjustments = adjustmentSplit(item);
            return (
              <Fragment key={item.user_id}>
                <TableRow>
                  <TableCell>
                    <IconButton
                      size="small"
                      aria-label={isOpen ? 'Свернуть' : 'Из чего сложилось'}
                      onClick={() => toggle(item.user_id)}
                    >
                      {isOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                    </IconButton>
                  </TableCell>
                  <TableCell>
                    {/* «Зарплата» — денежный документ, приоритет обратный (admin.md, «Исключение»):
                        основное — настоящее user_name, подпись — display_name. */}
                    <MemberNameCell
                      reversed
                      user_name={item.user_name}
                      display_name={item.display_name}
                    />
                  </TableCell>
                  <TableCell align="right">{formatClockDuration(item.worked_seconds)}</TableCell>
                  <TableCell align="right">{formatClockDuration(item.overtime_seconds)}</TableCell>
                  <PlannedCell
                    planned_seconds={item.planned_seconds}
                    planned_amount_minor={item.planned_amount_minor}
                  />
                  <DeltaCell amount_minor={item.delta_amount_minor} />
                  <LateCell count={item.late_count} seconds={item.late_seconds_total} />
                  <TableCell align="right">{item.shifts_count}</TableCell>
                  <GrossCell row={item} />
                  <PenaltyCell
                    amount_minor={item.penalty_amount_minor}
                    count={item.penalties_count}
                  />
                  <AccrualCell amount_minor={adjustments.accrual} />
                  <DeductionCell amount_minor={adjustments.deduction} />
                  <NetCell amount_minor={item.net_amount_minor} />
                  <TableCell>
                    {item.has_missing_rate && <MissingRateBadge title={missingRateHint(item)} />}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={COLUMN_COUNT} sx={{ py: 0 }}>
                      <CompositionBlock
                        item={item}
                        memberId={memberIdByUser.get(item.user_id)}
                        period={report.period}
                        timeContext={timeContext}
                      />
                      {hasBreakdown && <BreakdownTable item={item} granularity={granularity} />}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
            <TableCell />
            <TableCell>Итого</TableCell>
            <TableCell align="right">{formatClockDuration(report.totals.worked_seconds)}</TableCell>
            <TableCell align="right">
              {formatClockDuration(report.totals.overtime_seconds ?? 0)}
            </TableCell>
            <PlannedCell
              planned_seconds={report.totals.planned_seconds ?? 0}
              planned_amount_minor={report.totals.planned_amount_minor ?? 0}
            />
            <DeltaCell amount_minor={report.totals.delta_amount_minor ?? 0} />
            <LateCell
              count={report.totals.late_count ?? 0}
              seconds={report.totals.late_seconds_total ?? 0}
            />
            <TableCell align="right">{report.totals.shifts_count}</TableCell>
            <GrossCell row={report.totals} />
            <PenaltyCell
              amount_minor={report.totals.penalty_amount_minor}
              count={report.totals.penalties_count}
            />
            <AccrualCell amount_minor={totalsAdjustments.accrual} />
            <DeductionCell amount_minor={totalsAdjustments.deduction} />
            <NetCell amount_minor={report.totals.net_amount_minor} />
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
      <CategorySummary report={report} />
    </>
  );
};

// Заглушка для пустого отчёта (вынесена, чтобы переиспользовать и в матрице).
export const PayrollEmpty = () => (
  <Typography color="text.secondary">За выбранный период нет завершённых смен.</Typography>
);
