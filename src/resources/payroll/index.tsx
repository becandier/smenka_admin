import { useEffect, useMemo, useState } from 'react';
import { Title, useDataProvider, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useCurrentOrg } from '../../orgContext';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import { saveBlob } from '../../utils/files';
import { formatDate } from '../../utils/format';
import { isDayRangeInvalid, localDayEndToUtcIso, localDayStartToUtcIso } from '../../utils/dates';
import { PayrollFilters } from './PayrollFilters';
import { PayrollListView, PayrollEmpty } from './PayrollListView';
import { PayrollMatrixView } from './PayrollMatrixView';
import type { Granularity, PayrollQuery, PayrollReport } from './types';

type ViewMode = 'list' | 'matrix';

const GRANULARITY_LABEL: Record<Granularity, string> = {
  none: 'без разбивки',
  day: 'по дням',
  week: 'по неделям',
  month: 'по месяцам',
};

type ApiError = { body?: { code?: string }; message?: string };

// error.code → русский текст (логика по коду, не по тексту — ERROR_FORMAT). Общий ORG_NOT_FOUND
// и текстовый fallback — здесь; экранные спец-кейсы (FORBIDDEN/VALIDATION) задаёт вызывающий.
const COMMON_ERRORS: Record<string, string> = { ORG_NOT_FOUND: 'Организация не найдена' };

const errorMessage = (
  error: ApiError,
  overrides: Record<string, string>,
  fallback: string,
): string => {
  const code = error?.body?.code;
  return (code && (overrides[code] ?? COMMON_ERRORS[code])) || error?.message || fallback;
};

// Отчёт «сколько кому заплатить» с детализацией по дням/неделям/месяцам, фильтрами и
// выгрузкой в Excel. Только просмотр; доступ — org owner/admin (super_admin не гейтится).
export const PayrollPage = () => {
  const { org } = useCurrentOrg();
  const role = useMyOrgRole();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [onlyMissingRate, setOnlyMissingRate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const allowed = role === 'owner' || role === 'admin';
  const rangeInvalid = isDayRangeInvalid(dateFrom, dateTo);
  // «Дни» нарезаются в таймзоне админа, чтобы совпадать с локальным восприятием суток.
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const query = useMemo<PayrollQuery>(
    () => ({
      date_from: dateFrom === '' ? undefined : localDayStartToUtcIso(dateFrom),
      date_to: dateTo === '' ? undefined : localDayEndToUtcIso(dateTo),
      granularity,
      tz,
      user_ids: userIds.length ? userIds : undefined,
      location_ids: locationIds.length ? locationIds : undefined,
      only_missing_rate: onlyMissingRate || undefined,
    }),
    [dateFrom, dateTo, granularity, tz, userIds, locationIds, onlyMissingRate],
  );

  useEffect(() => {
    if (!org || !allowed) return;
    // Невалидный диапазон не отправляем (обе границы опциональны: пусто = весь период).
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
      .getPayroll(query)
      .then((res: PayrollReport) => {
        if (active) setReport(res);
      })
      .catch((e: ApiError) => {
        if (!active) return;
        setReport(null);
        setError(
          errorMessage(e, { FORBIDDEN: 'Нет доступа к отчёту по зарплате' }, 'Ошибка загрузки отчёта'),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org, allowed, query, rangeInvalid, dataProvider]);

  const onExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await dataProvider.exportPayroll(query);
      const fallback = `payroll_${dateFrom || 'all'}_${dateTo || 'all'}.xlsx`;
      saveBlob(blob, filename ?? fallback);
    } catch (e) {
      notify(
        errorMessage(
          e as ApiError,
          { FORBIDDEN: 'Нет доступа к экспорту отчёта', VALIDATION_ERROR: 'Неверные параметры экспорта' },
          'Не удалось выгрузить отчёт',
        ),
        { type: 'error' },
      );
    } finally {
      setExporting(false);
    }
  };

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
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={viewMode}
            onChange={(_, value: ViewMode | null) => value && setViewMode(value)}
          >
            <ToggleButton value="list">Список</ToggleButton>
            <ToggleButton value="matrix">Матрица</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={exporting || !report || rangeInvalid}
            onClick={onExport}
          >
            Выгрузить в Excel
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mb: 2 }}>
        <PayrollFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChangeFrom={setDateFrom}
          onChangeTo={setDateTo}
          rangeInvalid={rangeInvalid}
          userIds={userIds}
          onUserIds={setUserIds}
          locationIds={locationIds}
          onLocationIds={setLocationIds}
          granularity={granularity}
          onGranularity={setGranularity}
          onlyMissingRate={onlyMissingRate}
          onOnlyMissingRate={setOnlyMissingRate}
        />
      </Box>

      {report && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`Валюта: ${report.currency}`} />
          {periodLabel && <Chip size="small" label={`Период: ${periodLabel}`} />}
          <Chip
            size="small"
            label={`Разбивка: ${GRANULARITY_LABEL[report.granularity ?? granularity]}`}
          />
          <Chip size="small" variant="outlined" label={`Таймзона: ${report.tz ?? tz}`} />
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent>
            <Skeleton variant="rounded" height={220} />
          </CardContent>
        </Card>
      )}

      {report && !loading && (
        <Card>
          <CardContent>
            {report.items.length === 0 ? (
              <PayrollEmpty />
            ) : viewMode === 'list' ? (
              <PayrollListView report={report} granularity={granularity} />
            ) : (
              <PayrollMatrixView report={report} granularity={granularity} />
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
