import {
  Alert,
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { formatClockDuration, formatMoneyMinor } from '../../utils/format';
import { buildMatrix, formatBucketShort, MAX_MATRIX_COLUMNS } from './buckets';
import type { Granularity, PayrollReport } from './types';

// Ячейка часов: основное значение — часы (чч:мм); деньги по корзине — во всплывающей подсказке.
// Подсветка warning — если в корзине есть смены без действующей ставки.
const HoursCell = ({
  worked_seconds,
  gross_amount_minor,
  missing,
}: {
  worked_seconds: number;
  gross_amount_minor: number;
  missing: boolean;
}) => (
  <Tooltip title={`Начислено: ${formatMoneyMinor(gross_amount_minor)}`}>
    <TableCell
      align="right"
      sx={missing ? { bgcolor: 'warning.light' } : undefined}
    >
      {formatClockDuration(worked_seconds)}
    </TableCell>
  </Tooltip>
);

// Ячейка итога с двумя строками: часы (основное) + деньги (мелким) — для колонки/строки итогов.
const TotalCell = ({
  worked_seconds,
  gross_amount_minor,
  bold,
}: {
  worked_seconds: number;
  gross_amount_minor: number;
  bold?: boolean;
}) => (
  <TableCell align="right">
    <Typography variant="body2" sx={{ fontWeight: bold ? 'bold' : 600 }}>
      {formatClockDuration(worked_seconds)}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {formatMoneyMinor(gross_amount_minor)}
    </Typography>
  </TableCell>
);

// Режим «Матрица»: сотрудники × корзины (часы в ячейках) с итогами по строкам/столбцам и
// гардом по ширине. Деньги — в подсказках ячеек и в итоговых строке/колонке.
export const PayrollMatrixView = ({
  report,
  granularity,
}: {
  report: PayrollReport;
  granularity: Granularity;
}) => {
  if (granularity === 'none') {
    return (
      <Alert severity="info">
        Выберите гранулярность «День», «Неделя» или «Месяц», чтобы построить матрицу.
      </Alert>
    );
  }

  const matrix = buildMatrix(report);

  if (matrix.columns.length > MAX_MATRIX_COLUMNS) {
    return (
      <Alert severity="warning">
        Слишком много столбцов ({matrix.columns.length}). Сузьте период или укрупните
        гранулярность (Неделя/Месяц) — иначе матрица нечитаема.
      </Alert>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Сотрудник</TableCell>
            {matrix.columns.map((bucketStart) => (
              <TableCell key={bucketStart} align="right">
                {formatBucketShort(bucketStart, granularity)}
              </TableCell>
            ))}
            <TableCell align="right">Итог</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {matrix.rows.map(({ item, byBucket }) => (
            <TableRow key={item.user_id}>
              <TableCell>{item.user_name}</TableCell>
              {matrix.columns.map((bucketStart) => {
                const bucket = byBucket.get(bucketStart);
                if (!bucket) {
                  return (
                    <TableCell key={bucketStart} align="right" sx={{ color: 'text.disabled' }}>
                      —
                    </TableCell>
                  );
                }
                return (
                  <HoursCell
                    key={bucketStart}
                    worked_seconds={bucket.worked_seconds}
                    gross_amount_minor={bucket.gross_amount_minor}
                    missing={bucket.has_missing_rate}
                  />
                );
              })}
              <TotalCell
                worked_seconds={item.worked_seconds}
                gross_amount_minor={item.gross_amount_minor}
              />
            </TableRow>
          ))}
          <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
            <TableCell>Итого</TableCell>
            {matrix.columns.map((bucketStart) => {
              const total = matrix.colTotals.get(bucketStart);
              return (
                <Tooltip
                  key={bucketStart}
                  title={`Начислено: ${formatMoneyMinor(total?.gross_amount_minor ?? 0)}`}
                >
                  <TableCell align="right">
                    {formatClockDuration(total?.worked_seconds ?? 0)}
                  </TableCell>
                </Tooltip>
              );
            })}
            <TotalCell
              worked_seconds={report.totals.worked_seconds}
              gross_amount_minor={report.totals.gross_amount_minor}
              bold
            />
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
};
