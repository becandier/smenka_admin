import { useState, type ReactNode } from 'react';
import { useDataProvider, useNotify } from 'react-admin';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { validatePasswordFormat, formatCredentialsLine } from '../utils/credentials';

// Окно выдачи доступа (admin.md, п.3): показывается один раз сразу после успешного создания
// сотрудника или сброса пароля. Закрытие — единственный выход; логин/пароль живут только
// в state вызывающего компонента (MemberCreate/ResetPasswordSection) и стираются вместе
// с ним при закрытии — повторно открыть это окно нельзя.
export const IssuedCredentialsDialog = ({
  open,
  title,
  login,
  password,
  onClose,
}: {
  open: boolean;
  title: string;
  login: string | null;
  password: string | null;
  onClose: () => void;
}) => {
  const notify = useNotify();

  const copyBoth = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(formatCredentialsLine(login, password));
      notify('Логин и пароль скопированы', { type: 'info' });
    } catch {
      notify('Не удалось скопировать — выделите и скопируйте вручную', { type: 'warning' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Логин" value={login ?? '—'} InputProps={{ readOnly: true }} fullWidth />
          <TextField
            label="Пароль"
            value={password ?? '—'}
            InputProps={{ readOnly: true, sx: { fontFamily: 'monospace' } }}
            fullWidth
          />
          <Alert severity="warning">
            Пароль показывается один раз. Скопируйте и передайте сотруднику — позже его можно только
            сменить.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<ContentCopyIcon />} onClick={() => void copyBoth()}>
          Скопировать
        </Button>
        <Button variant="contained" onClick={onClose}>
          Закрыть
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Общее состояние окна выдачи доступа — переиспользуется MemberCreate (после создания
// сотрудника) и ResetPasswordSection (после сброса пароля): та же форма {title, login,
// password}, тот же JSX-блок, отличается только title и момент вызова show(). onClose —
// опциональный сайд-эффект после закрытия (MemberCreate уходит на список сотрудников).
// Хук рядом с диалогом — осознанно (единый модуль credentials, как useCurrentOrg рядом
// с OrgProvider в orgContext.tsx); HMR-предупреждение глушим тем же приёмом.
// eslint-disable-next-line react-refresh/only-export-components
export const useIssuedCredentials = (
  onClose?: () => void,
): {
  dialog: ReactNode;
  show: (title: string, login: string | null, password: string | null) => void;
} => {
  const [issued, setIssued] = useState<{
    title: string;
    login: string | null;
    password: string | null;
  } | null>(null);

  const show = (title: string, login: string | null, password: string | null): void =>
    setIssued({ title, login, password });

  const close = (): void => {
    setIssued(null);
    onClose?.();
  };

  const dialog = issued ? (
    <IssuedCredentialsDialog
      open
      title={issued.title}
      login={issued.login}
      password={issued.password}
      onClose={close}
    />
  ) : null;

  return { dialog, show };
};

type PasswordMode = 'generate' | 'manual';

// Диалог «Сменить пароль» (admin.md, п.4): владелец/админ выбирает «Сгенерировать» либо
// вводит пароль вручную → POST .../members/{user_id}/reset-password. Сброс отзывает все
// refresh-токены сотрудника (backend.md, «Кто может менять пароль», п.9) — предупреждение
// показывается до подтверждения. Успех сообщается наверх через onIssued — окно выдачи
// доступа (IssuedCredentialsDialog) открывает вызывающий компонент.
export const ResetPasswordDialog = ({
  userId,
  open,
  onClose,
  onIssued,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
  onIssued: (login: string | null, password: string | null) => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [mode, setMode] = useState<PasswordMode>('generate');
  const [manualPassword, setManualPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetLocalState = (): void => {
    setMode('generate');
    setManualPassword('');
    setError(null);
  };

  const handleClose = (): void => {
    if (saving) return;
    resetLocalState();
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    let password: string | undefined;
    if (mode === 'manual') {
      const trimmed = manualPassword.trim();
      const formatError = trimmed === '' ? 'Введите пароль' : validatePasswordFormat(trimmed);
      if (formatError) {
        setError(formatError);
        return;
      }
      password = trimmed;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await dataProvider.resetMemberPassword(userId, password);
      setSaving(false);
      resetLocalState();
      onIssued(result?.login ?? null, result?.password ?? null);
    } catch (e: any) {
      setSaving(false);
      const code = e?.body?.code;
      if (code === 'PASSWORD_RESET_NOT_ALLOWED') {
        notify('Этой учётной записью управляет сам сотрудник', { type: 'warning' });
        handleClose();
        return;
      }
      if (code === 'VALIDATION_ERROR') {
        const fieldErrors = (e?.body?.errors ?? {}) as Record<string, string>;
        setError(fieldErrors.password ?? e?.message ?? 'Некорректный пароль');
        return;
      }
      setError(e?.message ?? 'Не удалось сменить пароль');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Сменить пароль</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">Сотрудник будет разлогинен на всех устройствах.</Alert>
          <FormControl>
            <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as PasswordMode)}>
              <FormControlLabel
                value="generate"
                control={<Radio size="small" />}
                label="Сгенерировать"
              />
              <FormControlLabel
                value="manual"
                control={<Radio size="small" />}
                label="Ввести вручную"
              />
            </RadioGroup>
          </FormControl>
          {mode === 'manual' && (
            <TextField
              label="Новый пароль"
              value={manualPassword}
              onChange={(e) => setManualPassword(e.target.value)}
              helperText="Не менее 8 символов, минимум одна буква и одна цифра"
              error={Boolean(error)}
              autoFocus
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Смена…' : 'Сменить пароль'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
