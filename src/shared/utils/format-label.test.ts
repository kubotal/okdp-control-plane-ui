import { describe, expect, it } from 'vitest';
import { formatLabel } from './format-label';

describe('formatLabel', () => {
  it.each([
    ['oidcUsePKCE', 'OIDC Use PKCE'],
    ['oidcClientId', 'OIDC Client ID'],
    ['oidcClientSecretRef', 'OIDC Client Secret Ref'],
    ['oidcInsecureSkipVerify', 'OIDC Insecure Skip Verify'],
    ['oidcRoleMapping', 'OIDC Role Mapping'],
    ['additionalJVMConfig', 'Additional JVM Config'],
    ['enableDCR', 'Enable DCR'],
    ['enableOPA', 'Enable OPA'],
    ['enablePVC', 'Enable PVC'],
    ['redirectURIs', 'Redirect URIs'],
    ['apiSecretKeySecretName', 'API Secret Key Secret Name'],
    ['apiUrl', 'API URL'],
    ['idClaimPath', 'ID Claim Path'],
    ['jwtSecretName', 'JWT Secret Name'],
    ['s3SecretRef', 'S3 Secret Ref'],
    ['ttlSecondsAfterFinished', 'TTL Seconds After Finished'],
  ])('spells the acronyms of %s', (name, expected) => {
    expect(formatLabel(name)).toBe(expected);
  });

  it.each([
    ['replicaCount', 'Replica Count'],
    ['driverMemory', 'Driver Memory'],
    ['storage_class', 'Storage Class'],
    ['node-selector', 'Node Selector'],
    ['identities', 'Identities'],
    ['identity', 'Identity'],
    ['name', 'Name'],
  ])('leaves ordinary names alone: %s', (name, expected) => {
    expect(formatLabel(name)).toBe(expected);
  });

  it('keeps the words of an already spaced name', () => {
    expect(formatLabel('Existing Title')).toBe('Existing Title');
  });

  it('returns an empty string rather than throwing on an empty name', () => {
    expect(formatLabel('')).toBe('');
  });
});
