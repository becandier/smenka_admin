import { describe, expect, it } from 'vitest';
import {
  NETWORK_ERROR_CODE,
  NETWORK_ERROR_MESSAGE,
  networkErrorMessage,
  networkHttpErrorArgs,
} from './networkError';

describe('networkHttpErrorArgs', () => {
  it('maps a fetch failure to HttpError(status 0, code NETWORK_ERROR) with a readable message', () => {
    const args = networkHttpErrorArgs();
    expect(args.status).toBe(0);
    expect(args.body.code).toBe('NETWORK_ERROR');
    expect(args.body.code).toBe(NETWORK_ERROR_CODE);
    expect(args.body.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(args.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(NETWORK_ERROR_MESSAGE).toBe('Нет связи с сервером. Проверьте сеть и повторите попытку.');
  });
});

describe('networkErrorMessage', () => {
  it('returns the human-readable text for NETWORK_ERROR', () => {
    expect(networkErrorMessage('NETWORK_ERROR')).toBe(NETWORK_ERROR_MESSAGE);
    expect(networkErrorMessage(NETWORK_ERROR_CODE)).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('returns undefined for any other code — callers keep their own fallback', () => {
    // Код с бэка (weeklyRulesErrorMessage должен показать "<fallback> (CODE)", не сетевой текст).
    expect(networkErrorMessage('SCHEDULE_INVALID_TIME')).toBeUndefined();
    // Старое поведение до фикса: у ошибки вовсе нет code (голый TypeError без body) —
    // маппинг не должен подставлять сетевой текст произвольно, только по точному коду.
    expect(networkErrorMessage(undefined)).toBeUndefined();
    expect(networkErrorMessage('')).toBeUndefined();
  });
});
