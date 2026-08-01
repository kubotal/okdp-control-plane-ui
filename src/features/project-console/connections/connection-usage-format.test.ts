import { describe, it, expect } from 'vitest';
import { envLine, envBlock } from './connection-usage-format';

describe('envLine', () => {
  it('should render a plain value as a shell assignment', () => {
    expect(envLine({ name: 'PGHOST', value: 'db.example.com' })).toBe('PGHOST=db.example.com');
  });

  // The console never receives a credential, so the line must fetch it rather
  // than pretend to know it.
  it('should turn a credential into the kubectl command that reads the secret', () => {
    const line = envLine({
      name: 'PGPASSWORD',
      secretRef: { name: 'crm-credentials', namespace: 'analytics', key: 'password' },
    });

    expect(line).toBe(
      "PGPASSWORD=$(kubectl get secret crm-credentials -n analytics -o jsonpath='{.data.password}' | base64 -d)",
    );
  });

  it('should omit the namespace flag when the secret reference carries none', () => {
    const line = envLine({
      name: 'AWS_SECRET_ACCESS_KEY',
      secretRef: { name: 'lake-credentials', key: 'secretKey' },
    });

    expect(line).toContain('kubectl get secret lake-credentials -o jsonpath=');
    expect(line).not.toContain(' -n ');
  });

  it('should render an empty value rather than "undefined"', () => {
    expect(envLine({ name: 'PGSSLMODE' })).toBe('PGSSLMODE=');
  });
});

describe('envBlock', () => {
  it('should join the variables one per line, ready to paste', () => {
    const block = envBlock([
      { name: 'PGHOST', value: 'db' },
      { name: 'PGPORT', value: '5432' },
    ]);

    expect(block).toBe('PGHOST=db\nPGPORT=5432');
  });

  it('should produce nothing for an empty environment', () => {
    expect(envBlock([])).toBe('');
  });
});
