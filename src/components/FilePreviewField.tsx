import { Box, Link, Stack, Typography } from '@mui/material';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

// Презентационное превью файла по presigned URL (общий слой file_storage).
// Изображение → <img>; PDF и прочее → ссылка на открытие (URL ведёт прямо в storage).
// URL короткоживущий: фича-потребитель отдаёт свежий из своего payload (admin.md).
interface FilePreviewFieldProps {
  url: string | null | undefined;
  contentType?: string | null;
  filename?: string | null;
  maxHeight?: number;
}

export const FilePreviewField = ({
  url,
  contentType,
  filename,
  maxHeight = 240,
}: FilePreviewFieldProps) => {
  if (!url) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  if ((contentType ?? '').startsWith('image/')) {
    return (
      <Box
        component="img"
        src={url}
        alt={filename ?? 'Файл'}
        sx={{
          maxWidth: '100%',
          maxHeight,
          borderRadius: 1,
          display: 'block',
          objectFit: 'contain',
        }}
      />
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <InsertDriveFileOutlinedIcon fontSize="small" color="action" />
      <Link href={url} target="_blank" rel="noopener noreferrer">
        {filename ?? 'Открыть файл'}
      </Link>
    </Stack>
  );
};
