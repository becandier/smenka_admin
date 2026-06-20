import { ChangeEvent, useRef, useState } from 'react';
import { useDataProvider, useInput } from 'react-admin';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  FILE_CATEGORY_POLICY,
  FileCategory,
  UploadedFile,
  fileErrorMessage,
  formatFileSize,
  validateFileForCategory,
} from '../utils/files';
import { FilePreviewField } from './FilePreviewField';

// File-input для <SimpleForm>: грузит файл в /files и кладёт его id в поле формы (source).
// Превью — сразу из ответа загрузки; на Edit — из initial* (фича-потребитель отдаёт свежий url).
// Хранится только file_id; presigned url — короткоживущий, для показа.
interface FileUploadInputProps {
  source: string; // поле формы, куда пишется file_id
  category: FileCategory;
  organizationId?: string | null; // обязателен для org-категорий (checklist_photo, knowledge_base)
  label?: string;
  initialUrl?: string | null;
  initialContentType?: string | null;
  initialFilename?: string | null;
  disabled?: boolean;
}

export const FileUploadInput = ({
  source,
  category,
  organizationId,
  label,
  initialUrl,
  initialContentType,
  initialFilename,
  disabled,
}: FileUploadInputProps) => {
  const dataProvider = useDataProvider();
  const { field } = useInput({ source });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  const policy = FILE_CATEGORY_POLICY[category];

  const handleSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // сброс — чтобы повторный выбор того же файла дал событие
    if (!file) return;
    const validationError = validateFileForCategory(file, category);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const result = (await dataProvider.uploadFile(file, category, organizationId)) as UploadedFile;
      field.onChange(result.id);
      setUploaded(result);
    } catch (err) {
      setError(fileErrorMessage(err, category));
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    field.onChange(null);
    setUploaded(null);
    setError(null);
  };

  const hasValue = Boolean(field.value);
  // После загрузки — превью из ответа; иначе (Edit) — из initial*, пока поле не очищено.
  const previewUrl = uploaded?.url ?? (hasValue ? initialUrl : null);
  const previewType = uploaded?.content_type ?? initialContentType;
  const previewName = uploaded?.original_filename ?? initialFilename;

  return (
    <Box sx={{ width: '100%' }}>
      {label && (
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {label}
        </Typography>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={policy.accept || undefined}
        hidden
        onChange={handleSelect}
      />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Button
          variant="outlined"
          startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileOutlinedIcon />}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {hasValue ? 'Заменить файл' : 'Загрузить файл'}
        </Button>
        {hasValue && !uploading && (
          <Button color="inherit" onClick={clear} disabled={disabled}>
            Убрать
          </Button>
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Допустимо: {policy.acceptLabel}. Максимум {formatFileSize(policy.maxSizeBytes)}.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: previewUrl ? 1 : 0 }}>
          {error}
        </Alert>
      )}

      {previewUrl && (
        <FilePreviewField url={previewUrl} contentType={previewType} filename={previewName} />
      )}
    </Box>
  );
};
