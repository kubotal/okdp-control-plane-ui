import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectionDetailDialog, type ConnectionDetail } from './connection-detail-dialog';

const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

const postgres: ConnectionDetail = {
  name: 'crm-postgres',
  typeDisplay: 'PostgreSQL',
  description: 'CRM externe',
  values: { host: 'crm.corp.example.com', port: 5432, database: 'crm', user: 'reader' },
  usage: {
    uri: 'postgresql://reader:${PGPASSWORD}@crm.corp.example.com:5432/crm?sslmode=require',
    uriLabel: 'Connection URI',
    env: [
      { name: 'PGHOST', value: 'crm.corp.example.com' },
      {
        name: 'PGPASSWORD',
        secretRef: { name: 'crm-postgres-credentials', namespace: 'analytics', key: 'password' },
      },
    ],
  },
  credentialsSecret: {
    name: 'crm-postgres-credentials',
    namespace: 'analytics',
    keys: ['password'],
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

  it('should show the paste-ready connection string under its own label', () => {
    renderDialog(postgres);

    expect(screen.getByText('Connection URI')).toBeInTheDocument();
    expect(screen.getByText(/postgresql:\/\/reader:\$\{PGPASSWORD\}@/)).toBeInTheDocument();
  });

  it('should name the secret holding the credentials, and its keys', () => {
    renderDialog(postgres);

    expect(screen.getByText('analytics/crm-postgres-credentials')).toBeInTheDocument();
    expect(screen.getByText('password')).toBeInTheDocument();
  });

  // The whole point of the secret indirection: opening a connection must never
  // put a credential on screen.
  it('should never display a credential value', () => {
    renderDialog({
      ...postgres,
      // Even if the API regressed and sent one, it must not be rendered.
      values: { ...postgres.values, password: 's3cret' } as ConnectionDetail['values'],
      usage: postgres.usage,
    });

    expect(screen.queryByText('s3cret')).not.toBeInTheDocument();
  });

  it('should copy the connection string to the clipboard', async () => {
    const { onCopied } = renderDialog(postgres);

    fireEvent.click(screen.getByLabelText('Copy the connection string'));

    expect(writeText).toHaveBeenCalledWith(postgres.usage!.uri);
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith('the connection string'));
  });

  it('should copy the environment block with the credential as a kubectl command', async () => {
    renderDialog(postgres);

    fireEvent.click(screen.getByLabelText('Copy the environment variables'));

    const copied = writeText.mock.calls.at(-1)![0];
    expect(copied).toContain('PGHOST=crm.corp.example.com');
    expect(copied).toContain('kubectl get secret crm-postgres-credentials -n analytics');
  });

  // An internal connection carries no Secret; the section must simply not appear.
  it('should omit the credentials section when there is no secret', () => {
    renderDialog({
      name: 'analytics-trino',
      typeDisplay: 'Trino',
      values: { host: 'trino.analytics.svc.cluster.local', port: 8080 },
      usage: {
        uri: 'jdbc:trino://trino.analytics.svc.cluster.local:8080',
        uriLabel: 'JDBC URL',
        env: [{ name: 'TRINO_HOST', value: 'trino.analytics.svc.cluster.local' }],
      },
    });

    expect(screen.getByText('JDBC URL')).toBeInTheDocument();
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
  });

  it('should render nothing when no connection is selected', () => {
    const { container } = renderDialog(null);

    expect(container).toBeEmptyDOMElement();
  });
});
