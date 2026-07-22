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

// Фильтр-select по участникам организации: значения — user_id, отображение и поиск — по
// единому правилу имени. Общий для ленты смен («Сотрудник») и реестра чек-листов.
export const MemberSelectFilter = (props: {
  source: string;
  label: string;
  alwaysOn?: boolean;
}) => {
  const { data } = useGetList('members', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'user_name', order: 'ASC' },
  });
  const choices = useMemo<MemberChoice[]>(
    () =>
      (data ?? []).map((m) => ({
        id: m.user_id,
        user_name: m.user_name,
        display_name: m.display_name ?? null,
      })),
    [data],
  );
  return (
    <AutocompleteInput
      {...props}
      choices={choices}
      optionText={optionText}
      inputText={inputText}
      matchSuggestion={matchSuggestion}
    />
  );
};
