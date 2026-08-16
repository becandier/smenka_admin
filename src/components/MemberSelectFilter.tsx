import { useMemo } from 'react';
import { AutocompleteInput, useGetList, useRecordContext } from 'react-admin';
import { MemberNameCell } from './MemberNameCell';
import {
  formatMemberNameFlat,
  memberSearchHaystack,
  type MemberNameSource,
} from '../utils/memberName';

interface MemberChoice extends MemberNameSource {
  id: string;
}

interface RawMember extends MemberNameSource {
  id: string;
  user_id: string;
}

// Опция выпадающего списка: отображение по единому правилу (member_display_name/admin.md) —
// основная строка + подпись настоящим именем, если отличается.
const MemberOption = () => {
  const record = useRecordContext<MemberChoice>();
  if (!record) return null;
  return <MemberNameCell user_name={record.user_name} display_name={record.display_name} />;
};

const optionText = <MemberOption />;
// Текст в поле после выбора — плоская строка (Autocomplete требует string, не React-узел).
const inputText = (choice: MemberChoice): string => formatMemberNameFlat(choice);
// Поиск по подстроке — по обоим именам сразу (admin.md: «поиск/фильтрация по подстроке
// должны находить и по имени в организации, и по настоящему»).
const matchSuggestion = (filter: string, choice: MemberChoice): boolean =>
  memberSearchHaystack(choice).includes(filter.trim().toLowerCase());

// Фильтр-select по участникам организации: значения по умолчанию — user_id (лента смен,
// реестр чек-листов — эти эндпоинты фильтруют по user_id), отображение и поиск — по
// единому правилу имени. idField='id' переключает значения на organization_members.id
// (payroll_adjustments/manual_time_entry: GET .../adjustments фильтрует по member_id, не user_id).
export const MemberSelectFilter = (props: {
  source: string;
  label: string;
  alwaysOn?: boolean;
  idField?: 'user_id' | 'id';
}) => {
  const { idField = 'user_id', ...inputProps } = props;
  const { data } = useGetList<RawMember>('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const choices = useMemo<MemberChoice[]>(
    () =>
      (data ?? []).map((m) => ({
        id: idField === 'id' ? m.id : m.user_id,
        user_name: m.user_name,
        display_name: m.display_name ?? null,
      })),
    [data, idField],
  );
  return (
    <AutocompleteInput
      {...inputProps}
      choices={choices}
      optionText={optionText}
      inputText={inputText}
      matchSuggestion={matchSuggestion}
    />
  );
};
