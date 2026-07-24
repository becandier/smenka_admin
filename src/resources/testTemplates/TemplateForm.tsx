import {
  ArrayInput,
  BooleanInput,
  NumberInput,
  SelectInput,
  SimpleFormIterator,
  TextInput,
} from 'react-admin';
import { QUESTION_TYPE_CHOICES } from './validation';

// Поля конструктора: мета шаблона + ArrayInput вопросов с вложенным ArrayInput вариантов
// (admin.md, «Create/Edit — конструктор»). Reorder — стандартные стрелки SimpleFormIterator
// (disableReordering не задан ⇒ включён по умолчанию), покрывает «Reorder по позиции».
export const TestTemplateFields = () => (
  <>
    <TextInput source="title" label="Название" fullWidth />
    <TextInput source="description" label="Описание / инструкция" fullWidth multiline minRows={2} />
    <NumberInput
      source="pass_threshold_percent"
      label="Порог зачёта, %"
      defaultValue={70}
      inputProps={{ min: 0, max: 100, step: 1 }}
    />
    <NumberInput
      source="max_attempts"
      label="Попыток"
      defaultValue={1}
      inputProps={{ min: 1, step: 1 }}
    />
    <BooleanInput
      source="reveal_answers"
      label="Показывать сотруднику верные ответы после сдачи"
      defaultValue={true}
    />
    <BooleanInput
      source="shuffle_questions"
      label="Перемешивать порядок вопросов"
      defaultValue={false}
    />

    <ArrayInput source="questions" label="Вопросы">
      <SimpleFormIterator getItemLabel={(index) => `Вопрос ${index + 1}`}>
        <TextInput source="text" label="Текст вопроса" fullWidth />
        <SelectInput
          source="type"
          label="Тип"
          choices={QUESTION_TYPE_CHOICES}
          defaultValue="single_choice"
        />
        <NumberInput
          source="points"
          label="Баллы"
          defaultValue={1}
          inputProps={{ min: 1, step: 1 }}
        />
        <ArrayInput source="options" label="Варианты ответа">
          <SimpleFormIterator inline>
            <TextInput source="text" label="Текст варианта" />
            <BooleanInput source="is_correct" label="Верный" defaultValue={false} />
          </SimpleFormIterator>
        </ArrayInput>
      </SimpleFormIterator>
    </ArrayInput>
  </>
);
