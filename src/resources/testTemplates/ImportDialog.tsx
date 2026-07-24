import { useState } from 'react';
import { useDataProvider, useNotify, useRedirect } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField as MuiTextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { testErrorMessage } from '../../utils/format';
import { AI_TEST_IMPORT_PROMPT } from './importPrompt';

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'valid'; question_count: number; total_points: number }
  | { status: 'invalid'; message: string };

interface ImportTestTemplateDialogProps {
  open: boolean;
  onClose: () => void;
}

// Диалог «Импорт из JSON» (admin.md): textarea с телом теста + готовый промпт для ИИ рядом
// (import-format.md). «Проверить» — сухой прогон через .../test-templates/validate; «Создать» —
// реальный POST .../test-templates тем же телом (importTestTemplate — без прогона через
// buildTestTemplateBody, чтобы отправить JSON пользователя как есть).
export const ImportTestTemplateDialog = ({ open, onClose }: ImportTestTemplateDialogProps) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const redirect = useRedirect();
  const [json, setJson] = useState('');
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [creating, setCreating] = useState(false);

  const reset = (): void => {
    setJson('');
    setCheck({ status: 'idle' });
  };

  const handleClose = (): void => {
    if (creating) return;
    reset();
    onClose();
  };

  // Возвращает распарсенное тело или null (и сразу выставляет ошибку в check).
  const parseBody = (): unknown => {
    try {
      return JSON.parse(json);
    } catch {
      setCheck({ status: 'invalid', message: 'Некорректный JSON — проверьте синтаксис' });
      return null;
    }
  };

  const handleValidate = async (): Promise<void> => {
    const body = parseBody();
    if (body === null) return;
    setCheck({ status: 'checking' });
    try {
      const res = await dataProvider.validateTestTemplate(body);
      setCheck({
        status: 'valid',
        question_count: res?.question_count ?? 0,
        total_points: res?.total_points ?? 0,
      });
    } catch (e) {
      setCheck({ status: 'invalid', message: testErrorMessage(e, 'Тест не прошёл проверку') });
    }
  };

  const handleCreate = async (): Promise<void> => {
    const body = parseBody();
    if (body === null) return;
    setCreating(true);
    try {
      const created = await dataProvider.importTestTemplate(body);
      notify('Тест создан из JSON', { type: 'success' });
      const createdId = (created as { id?: string } | null)?.id;
      reset();
      onClose();
      if (createdId) redirect('edit', 'test-templates', createdId);
    } catch (e) {
      setCheck({ status: 'invalid', message: testErrorMessage(e, 'Не удалось создать тест') });
    } finally {
      setCreating(false);
    }
  };

  const copyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(AI_TEST_IMPORT_PROMPT);
      notify('Промпт скопирован', { type: 'info' });
    } catch {
      notify('Не удалось скопировать — выделите текст вручную', { type: 'warning' });
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Импорт теста из JSON</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 0.5 }}
            >
              <Typography variant="subtitle2">Промпт для нейросети</Typography>
              <Tooltip title="Скопировать промпт">
                <IconButton size="small" onClick={() => void copyPrompt()}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <MuiTextField
              value={AI_TEST_IMPORT_PROMPT}
              multiline
              minRows={4}
              maxRows={8}
              fullWidth
              InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
            />
            <Typography variant="caption" color="text.secondary">
              Скопируйте промпт, подставьте тему/материал в ChatGPT/Claude — получите готовый JSON
              для поля ниже.
            </Typography>
          </Box>

          <MuiTextField
            label="JSON теста"
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setCheck({ status: 'idle' });
            }}
            multiline
            minRows={10}
            maxRows={20}
            fullWidth
            placeholder='{"title": "...", "questions": [...]}'
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
          />

          {check.status === 'valid' && (
            <Alert severity="success">
              JSON корректен: {check.question_count} вопрос(ов), {check.total_points} балл(ов)
              суммарно.
            </Alert>
          )}
          {check.status === 'invalid' && <Alert severity="error">{check.message}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={creating}>
          Отмена
        </Button>
        <Button
          onClick={() => void handleValidate()}
          disabled={!json.trim() || check.status === 'checking' || creating}
        >
          Проверить
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleCreate()}
          disabled={!json.trim() || creating}
        >
          {creating ? 'Создание…' : 'Создать'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
