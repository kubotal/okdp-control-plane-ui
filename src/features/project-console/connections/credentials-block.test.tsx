import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ConnectionType } from '../../../core/api/connection-api';
import { CredentialsBlock, type CredentialsMode } from './credentials-block';

const DATABASE_SERVER: ConnectionType = {
  name: 'database-server',
  displayName: 'SQL database',
  description: 'SQL database server.',
  icon: 'pi pi-database',
  category: 'database',
  external: true,
  fields: [
    { name: 'host', label: 'Host', type: 'string', required: true },
    { name: 'username', label: 'User', type: 'string', required: true, secret: true },
    { name: 'password', label: 'Password', type: 'string', required: true, secret: true, masked: true },
  ],
};

function renderBlock(mode: CredentialsMode = 'enter', overrides = {}) {
  const onModeChange = vi.fn();
  const onValueChange = vi.fn();
  const onExistingSecretChange = vi.fn();
  const result = render(
    <CredentialsBlock
      connectionType={DATABASE_SERVER}
      mode={mode}
      onModeChange={onModeChange}
      values={{}}
      onValueChange={onValueChange}
      existingSecret=""
      onExistingSecretChange={onExistingSecretChange}
      {...overrides}
    />,
  );
  return { ...result, onModeChange, onValueChange, onExistingSecretChange };
}

describe('CredentialsBlock', () => {
  it('asks only for the credential fields, not for the rest of the contract', () => {
    renderBlock();

    expect(screen.getByLabelText(/^User/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Host/)).not.toBeInTheDocument();
  });

  it('hides the password and only the password', () => {
    const { container } = renderBlock();

    // The user name lives in the Secret because the contract puts it there, but
    // hiding it only stops the user from checking what they typed.
    expect(container.querySelector('input#password')?.getAttribute('type')).toBe('password');
    expect(container.querySelector('input#username')?.getAttribute('type')).not.toBe('password');
  });

  // Credentials increasingly arrive in the namespace on their own, projected
  // from a vault by External Secrets. Naming one beats copying a password into
  // a form so the console can write a second copy of it.
  it('takes a secret name instead of credentials, and says which keys it needs', () => {
    renderBlock('existing');

    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Secret name')).toBeInTheDocument();
    expect(screen.getByText(/username, password/)).toBeInTheDocument();
  });

  it('reports the chosen secret name to its parent', () => {
    const { onExistingSecretChange } = renderBlock('existing');

    fireEvent.change(screen.getByLabelText('Secret name'), {
      target: { value: 'warehouse-from-vault' },
    });

    expect(onExistingSecretChange).toHaveBeenCalledWith('warehouse-from-vault');
  });

  // On an edit the stored credentials are kept when nothing is retyped, so the
  // mandatory marker would be a lie.
  it('drops the mandatory marker when editing', () => {
    renderBlock('enter', { editMode: true });

    expect(screen.getByText(/^Password/).textContent).not.toContain('*');
    expect(screen.getAllByText(/Leave blank to keep the stored value/).length).toBeGreaterThan(0);
  });

  it('renders nothing for a contract that carries no credentials', () => {
    const { container } = render(
      <CredentialsBlock
        connectionType={{ ...DATABASE_SERVER, fields: [DATABASE_SERVER.fields[0]] }}
        mode="enter"
        onModeChange={vi.fn()}
        values={{}}
        onValueChange={vi.fn()}
        existingSecret=""
        onExistingSecretChange={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
