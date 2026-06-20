import {
  List,
  Datagrid,
  TextField,
  NumberField,
  DateField,
  Edit,
  Create,
  SimpleForm,
  TextInput,
  NumberInput,
  SearchInput,
  required,
  minValue,
  maxValue,
} from 'react-admin';
import { LocationMapField } from '../components/LocationMapField';

const locationFilters = [<SearchInput key="q" source="q" alwaysOn />];

const LocationForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Название" validate={required()} />
    {/* Карта — основной способ выбора точки; поля ниже синхронны с ней и работают как фолбэк. */}
    <LocationMapField />
    <NumberInput
      source="latitude"
      label="Широта"
      validate={[required(), minValue(-90), maxValue(90)]}
    />
    <NumberInput
      source="longitude"
      label="Долгота"
      validate={[required(), minValue(-180), maxValue(180)]}
    />
    <NumberInput
      source="radius_meters"
      label="Радиус, м"
      defaultValue={100}
      validate={[required(), minValue(10), maxValue(10000)]}
    />
    <TextInput source="address" label="Адрес" fullWidth helperText="Заполняется с карты, можно править вручную" />
  </SimpleForm>
);

export const WorkLocationList = () => (
  <List filters={locationFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit">
      <TextField source="name" label="Название" />
      <TextField source="address" label="Адрес" />
      <NumberField source="latitude" label="Широта" options={{ maximumFractionDigits: 6 }} />
      <NumberField source="longitude" label="Долгота" options={{ maximumFractionDigits: 6 }} />
      <NumberField source="radius_meters" label="Радиус, м" />
      <DateField source="created_at" label="Создана" showTime />
    </Datagrid>
  </List>
);

export const WorkLocationEdit = () => (
  <Edit mutationMode="pessimistic" redirect="list">
    <LocationForm />
  </Edit>
);

export const WorkLocationCreate = () => (
  <Create redirect="list">
    <LocationForm />
  </Create>
);
