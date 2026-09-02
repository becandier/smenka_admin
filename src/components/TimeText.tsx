import {
  deviceTime,
  formatDate,
  formatDateTime,
  formatTime,
  organizationTime,
} from '../utils/time';
import { useOrgTimezone } from '../utils/useOrgTimezone';

type TimeValue = string | Date | null | undefined;
type TimeKind = 'date' | 'dateTime' | 'time';

const formatByKind = (value: TimeValue, kind: TimeKind, timeZone: string): string => {
  const context = organizationTime(timeZone);
  if (kind === 'date') return formatDate(value, context);
  if (kind === 'time') return formatTime(value, context);
  return formatDateTime(value, context);
};

// `timeZone` from a self-contained DTO has priority. A screen scoped to one organization can
// safely use its loaded timezone while old backend instances are rolling out the additive field.
export const OrganizationTimeText = ({
  value,
  timeZone,
  kind = 'dateTime',
}: {
  value: TimeValue;
  timeZone?: string | null;
  kind?: TimeKind;
}) => {
  const scopedTimeZone = useOrgTimezone();
  return <>{formatByKind(value, kind, timeZone ?? scopedTimeZone)}</>;
};

export const DeviceTimeText = ({
  value,
  kind = 'dateTime',
}: {
  value: TimeValue;
  kind?: TimeKind;
}) => {
  const context = deviceTime();
  if (kind === 'date') return <>{formatDate(value, context)}</>;
  if (kind === 'time') return <>{formatTime(value, context)}</>;
  return <>{formatDateTime(value, context)}</>;
};
