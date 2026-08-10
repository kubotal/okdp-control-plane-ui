import { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Password } from 'primereact/password';
import { MultiSelect } from 'primereact/multiselect';
import { Checkbox } from 'primereact/checkbox';
import { Toast } from 'primereact/toast';
import { identityApi, type User } from '../../../../core/api/identity-api';
import { useIdentityGroups, useIdentityUsers } from '../use-identity';
import EmptyState from '../../../../shared/components/empty-state';
import SearchFilter from '../../../../shared/components/search-filter';
import { PageHeader } from '../../../../shared/components/page-header';
import { useToastMessages } from '../../../../shared/hooks/use-toast-messages';
import { useRowActionsMenu } from '../../../../shared/hooks/use-row-actions-menu';
import { DialogFooter } from '../../../../shared/components/dialog-footer';
import DeleteConfirmDialog from '../../../../shared/components/delete-confirm-dialog';
import { StatusTag } from '../../../../shared/components/status-tag';

export function UserList() {
  const { toast, showSuccess, showError } = useToastMessages();

  const { users, loading, error, unavailable, refresh: refreshUsers } = useIdentityUsers();
  const { groups: availableGroups } = useIdentityGroups();

  const [globalFilter, setGlobalFilter] = useState('');
  const [userDialog, setUserDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [user, setUser] = useState<User>({ username: '', name: '' });
  const [emailInput, setEmailInput] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const openNew = () => {
    setUser({ username: '', name: '', disabled: false });
    setEmailInput('');
    setSelectedGroups([]);
    setIsEditMode(false);
    setUserDialog(true);
  };

  const editUser = (u: User) => {
    setUser({ ...u, password: '' });
    setEmailInput(u.email ? u.email.join(', ') : '');
    setSelectedGroups(u.groups || []);
    setIsEditMode(true);
    setUserDialog(true);
  };

  const deleteUser = (u: User) => {
    identityApi
      .deleteUser(u.username)
      .then(() => {
        showSuccess('User deleted');
        refreshUsers();
      })
      .catch(() => showError('Failed to delete user'));
  };

  const hideDialog = () => setUserDialog(false);

  const saveUser = () => {
    if (!user.username?.trim()) {
      return;
    }

    const payload: User = {
      ...user,
      email: emailInput.trim() ? emailInput.split(',').map((e) => e.trim()) : [],
      groups: selectedGroups,
    };

    const save = isEditMode
      ? identityApi.updateUser(payload.username, payload)
      : identityApi.createUser(payload);

    save
      .then(() => {
        showSuccess(isEditMode ? 'User updated' : 'User created');
        refreshUsers();
        hideDialog();
      })
      .catch(() => showError(isEditMode ? 'Failed to update user' : 'Failed to create user'));
  };

  const { menuElement, openMenu } = useRowActionsMenu<User>([
    { label: 'Edit', icon: 'pi pi-pencil', command: editUser },
    { separator: true },
    { label: 'Delete', icon: 'pi pi-trash', command: setDeleteTarget },
  ]);

  const dialogFooter = (
    <DialogFooter
      onCancel={hideDialog}
      onConfirm={saveUser}
      confirmLabel={isEditMode ? 'Save' : 'Create'}
      confirmDisabled={!user.name || !user.username}
    />
  );

  return (
    <div>
      <Toast ref={toast} />
      <DeleteConfirmDialog
        resourceName={deleteTarget?.username ?? null}
        resourceKind="user"
        message={
          deleteTarget && (
            <>
              This will permanently remove <strong>{deleteTarget.name}</strong>. This action cannot
              be undone.
            </>
          )
        }
        onHide={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteUser(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      {/* Top Bar */}
      <PageHeader
        title="Users"
        actions={
          <button className="create-btn" onClick={openNew}>
            <i className="pi pi-plus"></i>
            <span>Create user</span>
          </button>
        }
      />

      {unavailable ? (
        <EmptyState
          icon="pi pi-info-circle"
          title="Identity management is not installed"
          description={`This cluster does not carry ${unavailable}, so users are managed by the identity provider itself rather than from here.`}
        />
      ) : error && users.length === 0 ? (
        <EmptyState
          icon="pi pi-exclamation-triangle"
          title="Failed to load users"
          description="The user list could not be retrieved. Check your connection and try again."
          action={
            <button className="btn-secondary mt-3" onClick={refreshUsers}>
              <i className="pi pi-refresh"></i>
              <span>Retry</span>
            </button>
          }
        />
      ) : (
        <>
          <SearchFilter
            value={globalFilter}
            onChange={setGlobalFilter}
            placeholder="Filter users..."
          />

          {/* Data Table */}
          <div className="table-wrapper">
            <DataTable
              value={users}
              loading={loading}
              globalFilter={globalFilter}
              globalFilterFields={['name', 'email']}
              className="minimal-table"
              emptyMessage="No users found."
            >
              <Column
                header="Name"
                field="name"
                style={{ width: '20%' }}
                body={(u: User) => <span className="font-medium">{u.name}</span>}
              />
              <Column
                header="Email"
                style={{ width: '25%' }}
                body={(u: User) => u.email?.join(', ') || '-'}
              />
              <Column
                header="Groups"
                style={{ width: '25%' }}
                body={(u: User) => (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.groups?.slice(0, 3).map((group) => (
                      <span key={group} className="okdp-tag">
                        {group}
                      </span>
                    ))}
                    {(u.groups?.length ?? 0) > 3 && (
                      <span className="text-xs text-fg-muted">+{u.groups!.length - 3}</span>
                    )}
                  </div>
                )}
              />
              <Column
                header="Status"
                style={{ width: '15%' }}
                body={(u: User) =>
                  u.disabled ? (
                    <StatusTag value="Disabled" tone="neutral" />
                  ) : (
                    <StatusTag value="Active" tone="success" />
                  )
                }
              />
              <Column
                style={{ width: '15%', textAlign: 'right' }}
                body={(u: User) => (
                  <div className="actions">
                    <Button icon="pi pi-ellipsis-v" text rounded onClick={(e) => openMenu(u, e)} />
                  </div>
                )}
              />
            </DataTable>
            {menuElement}
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        header={isEditMode ? 'Edit user' : 'Create new user'}
        visible={userDialog}
        modal
        draggable={false}
        resizable={false}
        style={{ width: '500px' }}
        className="db-dialog"
        closable
        onHide={hideDialog}
        footer={dialogFooter}
      >
        <div className="dialog-content">
          <div className="field">
            <label htmlFor="username">Username</label>
            <InputText
              id="username"
              value={user.username}
              onChange={(e) => setUser((u) => ({ ...u, username: e.target.value }))}
              className="w-full dialog-input"
              placeholder="e.g., john.doe"
              disabled={isEditMode}
            />
          </div>

          <div className="field">
            <label htmlFor="name">Display Name</label>
            <InputText
              id="name"
              value={user.name}
              onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))}
              className="w-full dialog-input"
              placeholder="e.g., John Doe"
            />
          </div>

          <div className="field">
            <label htmlFor="email">
              Email <span className="optional">(comma-separated for multiple)</span>
            </label>
            <InputText
              id="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full dialog-input"
              placeholder="e.g., john@example.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">
              Password{' '}
              {isEditMode && <span className="optional">(leave empty to keep current)</span>}
            </label>
            <Password
              value={user.password ?? ''}
              onChange={(e) => setUser((u) => ({ ...u, password: e.target.value }))}
              toggleMask
              feedback={false}
              className="w-full"
            />
          </div>

          <div className="field">
            <label htmlFor="groups">Groups</label>
            <MultiSelect
              options={availableGroups}
              value={selectedGroups}
              onChange={(e) => setSelectedGroups(e.value)}
              optionLabel="name"
              optionValue="name"
              placeholder="Select groups"
              style={{ width: '100%' }}
              appendTo={document.body}
              display="chip"
            />
          </div>

          <div className="field">
            <label htmlFor="comment">
              Comment <span className="optional">(optional)</span>
            </label>
            <InputTextarea
              id="comment"
              value={user.comment ?? ''}
              onChange={(e) => setUser((u) => ({ ...u, comment: e.target.value }))}
              rows={3}
              className="w-full dialog-input"
              placeholder="Add a note about this user..."
            />
          </div>

          <div className="field-checkbox">
            <Checkbox
              checked={!!user.disabled}
              onChange={(e) => setUser((u) => ({ ...u, disabled: !!e.checked }))}
              inputId="disabled"
            />
            <label htmlFor="disabled">Disable account</label>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
