import { Box, Typography } from '@mui/material';
import { getMemberNameParts, type MemberNameSource } from '../utils/memberName';

// Единая ячейка «сотрудник» (member_display_name/admin.md, «Правило отображения»): основная
// строка + подпись настоящим именем, если оно отличается от display_name. reversed — для
// раздела «Зарплата» (обратный приоритет: основное — user_name, подпись — display_name).
// Используется в Datagrid-колонках (FunctionField render) и в TableCell — НЕ внутри чужой
// <Typography> (двойное вложение <p>): для InfoRow-заголовков есть formatMemberNameFlat.
export const MemberNameCell = ({
  reversed,
  ...source
}: MemberNameSource & { reversed?: boolean }) => {
  const { primary, secondary } = getMemberNameParts(source, { reversed });
  return (
    <Box sx={{ lineHeight: 1.3 }}>
      <Typography variant="body2" component="div">
        {primary}
      </Typography>
      {secondary && (
        <Typography variant="caption" color="text.secondary" component="div">
          {secondary}
        </Typography>
      )}
    </Box>
  );
};
