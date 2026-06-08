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

const locationFilters = [<SearchInput key="q" source="q" alwaysOn />];

const LocationForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Название" validate={required()} />
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
  </SimpleForm>
);

export const WorkLocationList = () => (
  <List filters={locationFilters} sort={{ field: 'created_at', order: 'DESC' }} exporter={false}>
    <Datagrid rowClick="edit">
      <TextField source="name" label="Название" />
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
