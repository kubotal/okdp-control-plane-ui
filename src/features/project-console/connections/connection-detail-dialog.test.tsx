import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionDetailDialog, type ConnectionDetail } from './connection-detail-dialog';

const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

const postgres: ConnectionDetail = {
  name: 'crm-postgres',
  typeDisplay: 'PostgreSQL',
  description: 'CRM externe',
  values: { host: 'crm.corp.example.com', port: 5432, dbName: 'crm', username: 'reader' },
  credentialsSecret: {
    name: 'crm-postgres-credentials',
    namespace: 'analytics',
    keys: ['password'],
    owned: true,
  },
};

function renderDialog(detail: ConnectionDetail | null, onCopied = vi.fn()) {
  return {
    onCopied,
    ...render(
      <ConnectionDetailDialog
        detail={detail}
        visible={detail !== null}
        onHide={vi.fn()}
        onCopied={onCopied}
      />,
    ),
  };
}

describe('ConnectionDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it('should show the values needed to reach the resource', () => {
    renderDialog(postgres);

    expect(screen.getByText('crm-postgres')).toBeInTheDocument();
    expect(screen.getByText('crm.corp.example.com')).toBeInTheDocument();
    expect(screen.getByText('5432')).toBeInTheDocument();
  });

  // They are plumbing for a package binding the connection, and the Credentials
  // section says the same thing in readable form.
  // secretRef is plumbing for a package binding the connection, and the
  // Credentials section says the same thing in readable form. The filter used to
  // name credentialsSecret and credentialsVersion, two keys that no longer
  // exist, and let secretRef straight through.
  it('should keep the credential plumbing out of the details grid', () => {
    renderDialog({
      ...postgres,
      values: { ...postgres.values, secretRef: 'crm-postgres-credentials' },
    });

    expect(screen.queryByText('secretRef')).not.toBeInTheDocument();
    // The Credentials section still names the secret.
    expect(screen.getByText('analytics/crm-postgres-credentials')).toBeInTheDocument();
    expect(screen.getByText('Keys')).toBeInTheDocument();
  });

  it('should name the secret holding the credentials, and its keys', () => {
    renderDialog(postgres);

    expect(screen.getByText('analytics/crm-postgres-credentials')).toBeInTheDocument();
    expect(screen.getByText('Keys')).toBeInTheDocument();
    expect(screen.getByText('password')).toBeInTheDocument();
  });

  // The whole point of the secret indirection: opening a connection must never
  // put a credential on screen.
  it('should never display a credential value', () => {
    renderDialog({
      ...postgres,
      // Even if the API regressed and sent one, it must not be rendered.
      values: { ...postgres.values, password: 's3cret' } as ConnectionDetail['values'],
    });

    expect(screen.queryByText('s3cret')).not.toBeInTheDocument();
  });

  // An internal connection carries no Secret; the section must simply not appear.
  it('should omit the credentials section when there is no secret', () => {
    renderDialog({
      name: 'analytics-trino',
      typeDisplay: 'Trino',
      values: { host: 'trino.analytics.svc.cluster.local', port: 8080 },
    });

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
  });

  it('should render nothing when no connection is selected', () => {
    const { container } = renderDialog(null);

    expect(container).toBeEmptyDOMElement();
  });

  // The two cases behave differently on delete, and the Secret's name alone
  // does not tell them apart: an external one is free to follow the same
  // naming convention.
  it('says a secret written by the console goes with the connection', () => {
    renderDialog(postgres);

    expect(screen.getByText(/deleted with this connection/)).toBeInTheDocument();
  });

  it('says a secret from elsewhere stays behind', () => {
    renderDialog({
      ...postgres,
      credentialsSecret: { ...postgres.credentialsSecret!, name: 'from-vault', owned: false },
    });

    expect(screen.getByText(/stays when this connection goes/)).toBeInTheDocument();
  });
});
