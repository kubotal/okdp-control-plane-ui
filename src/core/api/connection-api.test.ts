import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./http', () => ({
  http: {
    getList: vi.fn(() => Promise.resolve([])),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve()),
  },
}));

import { connectionApi } from './connection-api';
import { http } from './http';

// Dev environment base URL (import.meta.env.PROD is false under Vitest).
const PROJECT = 'http://localhost:8093/api/projects/demo/connections';

describe('connectionApi.selectable', () => {
  beforeEach(() => vi.clearAllMocks());

  // Pins the query parameter name against the server contract. The picker test
  // mocks this method, so it would not notice the wire name drifting.
  it('names the query parameter contract', () => {
    connectionApi.selectable('demo', 'database-server');
    expect(http.getList).toHaveBeenCalledWith(`${PROJECT}/selectable?contract=database-server`);
  });

  it('encodes a contract carrying URL-unsafe characters', () => {
    connectionApi.selectable('demo', 'object store/s3');
    expect(http.getList).toHaveBeenCalledWith(`${PROJECT}/selectable?contract=object%20store%2Fs3`);
  });
});
