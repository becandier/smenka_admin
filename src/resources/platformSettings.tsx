import { useEffect, useState } from 'react';
import { Title, useDataProvider, useNotify, usePermissions } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { OauthProviderRow } from '../providers/dataProvider';
import type { Permissions } from '../providers/authProvider';
import { formatDateTime } from '../utils/format';
import { useAsync } from '../utils/useAsync';

// 5 валидных комбинаций (backend.md) — экран всегда показывает ровно эти строки,
// независимо от того, что уже сконфигурировано (несконфигурированные — заглушкой).
const COMBINATIONS: Array<{ provider: OauthProviderRow['provider']; client_type: OauthProviderRow['client_type'] }> = [
  { provider: 'google', client_type: 'web' },
  { provider: 'google', client_type: 'android' },
  { provider: 'google', client_type: 'ios' },
  { provider: 'apple', client_type: 'ios' },
  { provider: 'apple', client_type: 'web' },
];

const PROVIDER_LABELS: Record<OauthProviderRow['provider'], string> = {
  google: 'Google',
  apple: 'Apple',
};

const CLIENT_TYPE_LABELS: Record<OauthProviderRow['client_type'], string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
};

const rowKey = (provider: string, clientType: string): string => `${provider}/${clientType}`;

interface RowState extends OauthProviderRow {
  saving: boolean;
  error?: string;
}

const buildInitialRows = (loaded: OauthProviderRow[]): Record<string, RowState> => {
  const byKey = new Map(loaded.map((r) => [rowKey(r.provider, r.client_type), r]));
  const rows: Record<string, RowState> = {};
  for (const combo of COMBINATIONS) {
    const key = rowKey(combo.provider, combo.client_type);
    const existing = byKey.get(key);
    rows[key] = {
      provider: combo.provider,
      client_type: combo.client_type,
      client_id: existing?.client_id ?? '',
      enabled: existing?.enabled ?? false,
      updated_by: existing?.updated_by ?? null,
      updated_at: existing?.updated_at ?? null,
      saving: false,
    };
  }
  return rows;
};

// «Настройки платформы → Провайдеры входа» (oauth_login, только super_admin).
// Не generic-Resource: фиксированный набор из 5 строк с инлайн-редактированием
// (см. admin.md — паттерн «своя типизированная таблица», не список с пагинацией).
export const PlatformSettingsPage = () => {
  const { permissions } = usePermissions<Permissions>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const isSuper = permissions?.role === 'super_admin';

  // Загрузка один раз при монтировании (не-super_admin — короткий early-return-экран,
  // без обращения к платформенному эндпоинту).
  const { data: items, error: loadError } = useAsync<OauthProviderRow[]>(
    () => (isSuper ? dataProvider.getOauthProviders() : Promise.resolve([])),
    [isSuper, dataProvider],
  );
  const [rows, setRows] = useState<Record<string, RowState> | null>(null);
  useEffect(() => {
    if (items) setRows(buildInitialRows(items));
  }, [items]);

  if (!isSuper) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Настройки платформы" />
        <Typography color="text.secondary">Доступно только супер-администратору.</Typography>
      </Box>
    );
  }

  const updateRow = (key: string, patch: Partial<RowState>): void => {
    setRows((prev) => (prev ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  };

  const handleSave = async (key: string): Promise<void> => {
    if (!rows) return;
    const row = rows[key];
    updateRow(key, { saving: true, error: undefined });
    try {
      const updated = await dataProvider.updateOauthProvider(row.provider, row.client_type, {
        client_id: row.client_id ?? '',
        enabled: row.enabled,
      });
      updateRow(key, {
        saving: false,
        client_id: updated?.client_id ?? row.client_id,
        enabled: updated?.enabled ?? row.enabled,
        updated_by: updated?.updated_by ?? null,
        updated_at: updated?.updated_at ?? null,
      });
      notify('Сохранено', { type: 'success' });
    } catch (e: any) {
      const fieldError = e?.body?.errors?.client_id as string | undefined;
      updateRow(key, { saving: false, error: fieldError });
      if (!fieldError) {
        notify(e?.message ?? 'Не удалось сохранить', { type: 'error' });
      }
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 900 }}>
      <Title title="Настройки платформы" />
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Провайдеры входа
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Client ID/Services ID, которым доверяет бэк при входе через Google/Apple. Для{' '}
        <strong>iOS/Android</strong> значение должно совпадать с тем, что забилжено в мобильное
        приложение (Firebase-конфиг) — этот экран не пересобирает и не обновляет мобильный билд,
        только говорит бэку, каким токенам доверять.
      </Typography>

      {loadError && <Alert severity="error">Не удалось загрузить настройки провайдеров</Alert>}
      {!rows && !loadError && <CircularProgress size={24} />}

      {rows && (
        <Card>
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Провайдер</TableCell>
                  <TableCell>Платформа</TableCell>
                  <TableCell>Client ID</TableCell>
                  <TableCell align="center">Включён</TableCell>
                  <TableCell>Обновлено</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {COMBINATIONS.map((combo) => {
                  const key = rowKey(combo.provider, combo.client_type);
                  const row = rows[key];
                  return (
                    <TableRow key={key}>
                      <TableCell>{PROVIDER_LABELS[combo.provider]}</TableCell>
                      <TableCell>{CLIENT_TYPE_LABELS[combo.client_type]}</TableCell>
                      <TableCell sx={{ minWidth: 260 }}>
                        <TextField
                          size="small"
                          fullWidth
                          value={row.client_id ?? ''}
                          onChange={(e) => updateRow(key, { client_id: e.target.value, error: undefined })}
                          error={Boolean(row.error)}
                          helperText={
                            row.error ??
                            (combo.provider === 'google' && combo.client_type === 'android'
                              ? 'Web Client ID (не Android-клиент) — google_sign_in берёт его как serverClientId'
                              : undefined)
                          }
                          disabled={row.saving}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={row.enabled}
                          onChange={(e) => updateRow(key, { enabled: e.target.checked })}
                          disabled={row.saving}
                        />
                      </TableCell>
                      <TableCell>
                        {row.updated_at ? (
                          <Typography variant="body2" color="text.secondary">
                            {formatDateTime(row.updated_at)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            не настроен
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={row.saving}
                          onClick={() => void handleSave(key)}
                        >
                          {row.saving ? 'Сохранение…' : 'Сохранить'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
