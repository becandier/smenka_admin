import { useEffect, useRef, useState } from 'react';
import { Title, useDataProvider, useNotify, usePermissions } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import DownloadIcon from '@mui/icons-material/Download';
import { QRCodeCanvas } from 'qrcode.react';
import { useCurrentOrg } from '../orgContext';
import { useMyOrgRole } from '../utils/useMyOrgRole';
import type { Permissions } from '../providers/authProvider';
import { WEB_APP_URL } from '../config';

// Уровень коррекции ошибок QR — «средний» (M, ~15% восстановления), по требованию ТЗ
// «средний или выше». Размер видимого QR — в диапазоне, читаемом камерой с экрана.
// Размер скачиваемого файла — существенно больше (не мелкий скрин элемента страницы),
// с белой quiet zone (marginSize=4 — требование спецификации QR), годится для печати.
const QR_ERROR_CORRECTION_LEVEL = 'M' as const;
const QR_DISPLAY_SIZE = 200;
const QR_DOWNLOAD_SIZE = 512;
const QR_MARGIN_MODULES = 4;

// HTTPS-ссылка приглашения (invite_links): открывает нативное приложение, если оно
// установлено (universal/app links), иначе — веб-версию по тому же пути `/invite/{code}`.
// Домен берётся из конфига (VITE_WEB_APP_URL), чтобы dev-сборка не выдавала прод-ссылку.
// Старый `smenka://invite/{code}` с экрана убран (для человека бесполезен, не кликается
// в мессенджерах) — приложение продолжает принимать такие ссылки для обратной совместимости.
const buildInviteLink = (code: string): string => `${WEB_APP_URL}/invite/${code}`;

// Блок «Инвайт-код» org-кабинета: HTTPS-ссылка-приглашение (главный элемент) + код (8-hex)
// + ротация. Просмотр и ротация — owner и admin; super_admin со сквозным доступом — по
// необходимости (admin.md §RBAC). Эндпоинты: GET /organizations/{org} (invite_code) + POST
// .../rotate-invite.
export const InviteCodePage = () => {
  const { org } = useCurrentOrg();
  const { permissions } = usePermissions<Permissions>();
  const role = useMyOrgRole();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const isSuper = permissions?.role === 'super_admin';
  const canManage = isSuper || role === 'owner' || role === 'admin';

  const [code, setCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  // Скрытый высокоразрешённый канвас (отдельный рендер, не CSS-масштаб видимого QR) —
  // источник для «Скачать QR». Value у обоих канвасов общий (inviteLink), поэтому после
  // ротации кода скачиваемый файл обновляется вместе с видимым QR и ссылкой сам собой.
  const downloadCanvasRef = useRef<HTMLCanvasElement>(null);

  const orgId = org?.id ?? null;

  // Текущий код берём из GET /organizations/{org} (уже доступен owner/admin), data.invite_code.
  useEffect(() => {
    if (!orgId || !canManage) return;
    let active = true;
    setCode(null);
    setLoadError(null);
    dataProvider
      .getOne('organizations', { id: orgId })
      .then((res: { data?: { invite_code?: string } }) => {
        if (!active) return;
        const value = res?.data?.invite_code;
        if (typeof value === 'string' && value) setCode(value);
        else setLoadError('Не удалось загрузить код');
      })
      .catch((e: any) => {
        if (!active) return;
        // По error.code (ERROR_FORMAT). 403 — если доступ к коду ужесточат (security_hardening),
        // покажем понятное сообщение вместо общего, симметрично обработке ротации.
        if (e?.body?.code === 'FORBIDDEN' || e?.status === 403) {
          setLoadError('Нет доступа к инвайт-коду организации');
        } else {
          setLoadError('Не удалось загрузить код');
        }
      });
    return () => {
      active = false;
    };
  }, [orgId, canManage, dataProvider]);

  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Инвайт-код" />
        <Typography color="text.secondary">Выберите организацию.</Typography>
      </Box>
    );
  }

  if (!canManage) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Инвайт-код" />
        <Typography color="text.secondary">
          Управление инвайт-кодом доступно владельцу и администратору организации.
        </Typography>
      </Box>
    );
  }

  const copy = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} скопирован`, { type: 'info' });
    } catch {
      notify('Не удалось скопировать — выделите и скопируйте вручную', { type: 'warning' });
    }
  };

  // Скачивание PNG: рисуем не видимый (200px) QR, а скрытый канвас QR_DOWNLOAD_SIZE —
  // чтобы файл был пригоден для печати/отправки в чат, а не мелким снимком элемента страницы.
  const handleDownloadQr = (): void => {
    const canvas = downloadCanvasRef.current;
    if (!canvas || !code) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `smenka-invite-${code}.png`;
    link.click();
  };

  const handleRotate = async (): Promise<void> => {
    setRotating(true);
    try {
      const data = await dataProvider.rotateInviteCode(org.id);
      const next = data?.invite_code;
      if (typeof next === 'string' && next) setCode(next);
      notify('Новый код сгенерирован. Старые код и ссылка больше не действуют.', {
        type: 'success',
      });
      setConfirmOpen(false);
    } catch (e: any) {
      // Ошибки — по error.code (ERROR_FORMAT); 403 — нет прав на ротацию.
      if (e?.body?.code === 'FORBIDDEN' || e?.status === 403) {
        notify('Недостаточно прав для смены кода', { type: 'error' });
      } else {
        notify(e?.message ?? 'Не удалось сгенерировать новый код', { type: 'error' });
      }
    } finally {
      setRotating(false);
    }
  };

  const inviteLink = code ? buildInviteLink(code) : '';

  return (
    <Box sx={{ p: 2, maxWidth: 560 }}>
      <Title title={`Инвайт-код — ${org.name}`} />
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Приглашение в организацию
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Отправьте сотруднику ссылку — она доведёт его до вступления в организацию.
          </Typography>

          {loadError && <Alert severity="error">{loadError}</Alert>}
          {!code && !loadError && <CircularProgress size={24} />}

          {code && (
            <>
              {/* Главный элемент экрана: HTTPS-ссылка-приглашение — то, что админ отправляет
                  сотруднику, — плюс QR той же ссылки рядом. Выделены фоном и идут первыми,
                  код — второстепенное поле ниже. */}
              <Box
                sx={{
                  position: 'relative',
                  p: 2,
                  mb: 2,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 2,
                }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Ссылка-приглашение
                  </Typography>
                  <TextField
                    value={inviteLink}
                    fullWidth
                    size="medium"
                    InputProps={{
                      readOnly: true,
                      sx: {
                        fontFamily: 'monospace',
                        fontSize: '0.95rem',
                        bgcolor: 'background.paper',
                      },
                      endAdornment: (
                        <Tooltip title="Скопировать ссылку">
                          <IconButton
                            aria-label="Скопировать ссылку"
                            edge="end"
                            onClick={() => void copy(inviteLink, 'Ссылка')}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ),
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1 }}
                  >
                    Откроется в приложении, если оно установлено, иначе — в браузере.
                  </Typography>
                </Box>

                <Stack alignItems="center" spacing={1} sx={{ flexShrink: 0, mx: 'auto' }}>
                  <Box
                    sx={{
                      p: 1,
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      lineHeight: 0,
                    }}
                  >
                    <QRCodeCanvas
                      value={inviteLink}
                      size={QR_DISPLAY_SIZE}
                      level={QR_ERROR_CORRECTION_LEVEL}
                      marginSize={QR_MARGIN_MODULES}
                      title="QR-код ссылки-приглашения"
                    />
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon fontSize="small" />}
                    onClick={handleDownloadQr}
                  >
                    Скачать QR
                  </Button>
                </Stack>

                {/* Скрытый канвас в разрешении для скачивания (не влияет на layout) —
                    отдельный рендер QR_DOWNLOAD_SIZE, а не CSS-масштаб видимого. */}
                <Box sx={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
                  <QRCodeCanvas
                    ref={downloadCanvasRef}
                    value={inviteLink}
                    size={QR_DOWNLOAD_SIZE}
                    level={QR_ERROR_CORRECTION_LEVEL}
                    marginSize={QR_MARGIN_MODULES}
                  />
                </Box>
              </Box>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Код (ввести вручную в приложении)
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontFamily: 'monospace', letterSpacing: 2, userSelect: 'all' }}
                  >
                    {code}
                  </Typography>
                </Box>
                <Tooltip title="Скопировать код">
                  <IconButton aria-label="Скопировать код" onClick={() => void copy(code, 'Код')}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Button
                variant="outlined"
                color="warning"
                startIcon={<AutorenewIcon />}
                onClick={() => setConfirmOpen(true)}
              >
                Сгенерировать новый
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => !rotating && setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Сгенерировать новый код?</DialogTitle>
        <DialogContent>
          <Typography>
            Текущие код и ссылка-приглашение перестанут работать. Сотрудники, которым вы уже
            отправили старую ссылку или код, не смогут вступить по ним — отправьте им новые.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={rotating}>
            Отмена
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => void handleRotate()}
            disabled={rotating}
          >
            {rotating ? 'Генерация…' : 'Сгенерировать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
