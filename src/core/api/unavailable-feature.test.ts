import { describe, expect, it } from 'vitest';
import { HttpError, unavailableFeature } from './http';

function httpError(status: number, body: string): HttpError {
  return new HttpError(status, 'Not Implemented', body, '/api/v1/identity/users');
}

const notInstalled = JSON.stringify({
  error: 'Identity management is not available on this cluster: the kubauth CRDs are not installed.',
  reason: 'feature-not-installed',
  feature: 'kubauth identity',
});

describe('unavailableFeature', () => {
  it('names the feature the cluster does not carry', () => {
    expect(unavailableFeature(httpError(501, notInstalled))).toBe('kubauth identity');
  });

  // The whole point of the lot: a screen must be able to tell "never installed"
  // from "the server broke", and only the first one deserves a calm empty state.
  it('ignores a server failure', () => {
    expect(unavailableFeature(httpError(500, '{"error":"boom"}'))).toBeNull();
  });

  it('ignores a 501 that is not ours', () => {
    expect(unavailableFeature(httpError(501, 'Not Implemented'))).toBeNull();
    expect(unavailableFeature(httpError(501, '{"error":"something else"}'))).toBeNull();
  });

  it('ignores anything that is not an HTTP error', () => {
    expect(unavailableFeature(new Error('offline'))).toBeNull();
    expect(unavailableFeature(null)).toBeNull();
  });

  // The reason is the contract, the feature name is only prose for the user.
  it('falls back to a generic name when the server names no feature', () => {
    expect(unavailableFeature(httpError(501, JSON.stringify({ reason: 'feature-not-installed' })))).toBe(
      'this feature',
    );
  });
});
