import { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { testErrorMessage } from '../../utils/format';

// Форма ответа GET .../test-attempts/{id} не зафиксирована в backend.md дословно (там описано
// только «вопросы-снимки, что выбрал сотрудник, что верно, баллы по вопросам»), поэтому типы
// собраны по документированной схеме таблиц-снимков (test_attempts/test_attempt_questions/
// test_attempt_options, backend.md «Домен»): text/type/points/position — снимок вопроса;
// text/is_correct/is_selected/position — снимок варианта. awarded_points — опциональное поле
// на случай, если бэк его отдаёт; если нет, баллы по вопросу считаются на клиенте ниже
// (тем же правилом all-or-nothing, что задокументировано в «Оценивание»).
interface AttemptReviewOption {
  id: string;
  text: string;
  is_correct: boolean;
  is_selected: boolean;
}

interface AttemptReviewQuestion {
  id: string;
  text: string;
  type: string;
  points: number;
  awarded_points?: number;
  options: AttemptReviewOption[];
}

interface AttemptReview {
  score: number;
  max_score: number;
  percent: number;
  passed: boolean;
  attempt_number?: number;
  status?: string;
  started_at?: string | null;
  submitted_at?: string | null;
  questions?: AttemptReviewQuestion[];
}

// Верно ли отвечено на вопрос (all-or-nothing, backend.md «Оценивание»): множество выбранных
// вариантов совпадает с множеством верных.
const isQuestionCorrect = (options: AttemptReviewOption[]): boolean => {
  const correct = options.filter((o) => o.is_correct).map((o) => o.id);
  const selected = options.filter((o) => o.is_selected).map((o) => o.id);
  if (correct.length !== selected.length) return false;
  const selectedSet = new Set(selected);
  return correct.every((id) => selectedSet.has(id));
};

interface AttemptReviewDialogProps {
  attemptId: string;
  onClose: () => void;
}

// Детали попытки (admin.md, «Строка → детали попытки»): вопросы-снимки с разметкой
// верно/неверно и баллами. GET .../test-attempts/{attempt_id} (backend.md).
export const AttemptReviewDialog = ({ attemptId, onClose }: AttemptReviewDialogProps) => {
  const dataProvider = useDataProvider();
  const [attempt, setAttempt] = useState<AttemptReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAttempt(null);
    setError(null);
    dataProvider
      .getTestAttempt(attemptId)
      .then((data: AttemptReview) => {
        if (active) setAttempt(data);
      })
      .catch((e: unknown) => {
        if (active) setError(testErrorMessage(e, 'Не удалось загрузить попытку'));
      });
    return () => {
      active = false;
    };
  }, [attemptId, dataProvider]);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Детали попытки</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {!attempt && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {attempt && (
          <Stack spacing={2}>
            <Alert severity={attempt.passed ? 'success' : 'error'}>
              {attempt.score}/{attempt.max_score} баллов ({attempt.percent}%) —{' '}
              {attempt.passed ? 'зачёт' : 'незачёт'}
            </Alert>
            {(attempt.questions ?? []).map((q, qi) => {
              const options = q.options ?? [];
              const correct = isQuestionCorrect(options);
              const awarded =
                typeof q.awarded_points === 'number' ? q.awarded_points : correct ? q.points : 0;
              return (
                <Box key={q.id ?? qi}>
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="space-between"
                    alignItems="baseline"
                  >
                    <Typography variant="subtitle2">
                      {qi + 1}. {q.text}
                    </Typography>
                    <Chip
                      size="small"
                      color={correct ? 'success' : 'error'}
                      label={`${awarded}/${q.points}`}
                    />
                  </Stack>
                  <Stack spacing={0.25} sx={{ pl: 2, mt: 0.5 }}>
                    {options.map((o) => (
                      <Stack key={o.id} direction="row" spacing={0.5} alignItems="center">
                        {o.is_selected ? (
                          <CheckBoxIcon fontSize="small" />
                        ) : (
                          <CheckBoxOutlineBlankIcon fontSize="small" />
                        )}
                        <Typography
                          variant="body2"
                          sx={{
                            color: o.is_correct
                              ? 'success.main'
                              : o.is_selected
                                ? 'error.main'
                                : 'text.secondary',
                            fontWeight: o.is_selected ? 600 : 400,
                          }}
                        >
                          {o.text}
                        </Typography>
                        {o.is_correct && <CheckCircleIcon fontSize="small" color="success" />}
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};
