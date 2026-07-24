import { useMemo, useState } from 'react';
import { useDataProvider, useGetList, useNotify } from 'react-admin';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField as MuiTextField,
  Typography,
} from '@mui/material';
import { formatMemberNameFlat, type MemberNameSource } from '../../utils/memberName';
import { testErrorMessage } from '../../utils/format';
import { localInputToUtcIso } from '../../utils/dates';

interface MemberOption {
  id: string;
  label: string;
}

interface AssignTestDialogProps {
  templateId: string;
  templateTitle: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

// Диалог «Назначить» (admin.md): мультиселект сотрудников организации + due_at (опц.) →
// POST .../test-templates/{id}/assignments. member_ids — id записи участия (members.id,
// он же organization_members.id), а не user_id: контракт test_assignments.member_id — FK
// organization_members (backend.md), и MemberResponse.id — именно «UUID записи об участии».
export const AssignTestDialog = ({
  templateId,
  templateTitle,
  open,
  onClose,
  onDone,
}: AssignTestDialogProps) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { data: members } = useGetList<MemberNameSource & { id: string }>(
    'members',
    { pagination: { page: 1, perPage: 500 }, sort: { field: 'user_name', order: 'ASC' } },
    { enabled: open },
  );

  const options = useMemo<MemberOption[]>(
    () => (members ?? []).map((m) => ({ id: String(m.id), label: formatMemberNameFlat(m) })),
    [members],
  );

  const [selected, setSelected] = useState<MemberOption[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleClose = (): void => {
    if (saving) return;
    setSelected([]);
    setDueAt('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    if (selected.length === 0) {
      setError('Выберите хотя бы одного сотрудника');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await dataProvider.assignTestTemplate(templateId, {
        member_ids: selected.map((m) => m.id),
        due_at: dueAt ? (localInputToUtcIso(dueAt) ?? null) : null,
      });
      notify(`Назначено ${res?.created ?? 0}, обновлено ${res?.updated ?? 0}`, {
        type: 'success',
      });
      setSelected([]);
      setDueAt('');
      onDone();
    } catch (e) {
      setError(testErrorMessage(e, 'Не удалось назначить тест'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Назначить «{templateTitle}»</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Выберите сотрудников, которым нужно пройти тест.
        </Typography>
        <Autocomplete
          multiple
          options={options}
          value={selected}
          onChange={(_, value) => setSelected(value)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <MuiTextField {...params} label="Сотрудники" placeholder="Выбрать" />
          )}
          sx={{ mb: 2 }}
        />
        <MuiTextField
          type="datetime-local"
          label="Дедлайн (опционально)"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Назначение…' : 'Назначить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
