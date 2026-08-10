import { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Toast } from 'primereact/toast';
import { identityApi, type Group } from '../../../../core/api/identity-api';
import { useIdentityGroups } from '../use-identity';
import EmptyState from '../../../../shared/components/empty-state';
import SearchFilter from '../../../../shared/components/search-filter';
import { PageHeader } from '../../../../shared/components/page-header';
import { useToastMessages } from '../../../../shared/hooks/use-toast-messages';
import { useRowActionsMenu } from '../../../../shared/hooks/use-row-actions-menu';
import { DialogFooter } from '../../../../shared/components/dialog-footer';
import DeleteConfirmDialog from '../../../../shared/components/delete-confirm-dialog';

export function GroupList() {
  const { toast, showSuccess, showError } = useToastMessages();

  const { groups, loading, error, unavailable, refresh: refreshGroups } = useIdentityGroups();

  const [globalFilter, setGlobalFilter] = useState('');
  const [groupDialog, setGroupDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [group, setGroup] = useState<Group>({ name: '' });
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const openNew = () => {
    setGroup({ name: '' });
    setIsEditMode(false);
    setGroupDialog(true);
  };

  const editGroup = (g: Group) => {
    setGroup({ ...g });
    setIsEditMode(true);
    setGroupDialog(true);
  };

  const deleteGroup = (g: Group) => {
    identityApi
      .deleteGroup(g.name)
      .then(() => {
        showSuccess('Group deleted');
        refreshGroups();
      })
      .catch(() => showError('Failed to delete group'));
  };

  const hideDialog = () => setGroupDialog(false);

  const saveGroup = () => {
    if (!group.name?.trim()) {
      return;
    }

    const save = isEditMode
      ? identityApi.updateGroup(group.name, group)
      : identityApi.createGroup(group);

    save
      .then(() => {
        showSuccess(isEditMode ? 'Group updated' : 'Group created');
        refreshGroups();
        hideDialog();
      })
      .catch(() => showError(isEditMode ? 'Failed to update group' : 'Failed to create group'));
  };

  const { menuElement, openMenu } = useRowActionsMenu<Group>([
    { label: 'Edit', icon: 'pi pi-pencil', command: editGroup },
    { separator: true },
    { label: 'Delete', icon: 'pi pi-trash', command: setDeleteTarget },
  ]);

  const dialogFooter = (
    <DialogFooter
      onCancel={hideDialog}
      onConfirm={saveGroup}
      confirmLabel={isEditMode ? 'Save' : 'Create'}
      confirmDisabled={!group.name}
    />
  );

  return (
    <div>
      <Toast ref={toast} />
      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="group"
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
          if (deleteTarget) deleteGroup(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      {/* Top Bar */}
      <PageHeader
        title="Groups"
        actions={
          <button className="create-btn" onClick={openNew}>
            <i className="pi pi-plus"></i>
            <span>Create group</span>
          </button>
        }
      />

      {unavailable ? (
        <EmptyState
          icon="pi pi-info-circle"
          title="Identity management is not installed"
          description={`This cluster does not carry ${unavailable}, so groups are managed by the identity provider itself rather than from here.`}
        />
      ) : error && groups.length === 0 ? (
        <EmptyState
          icon="pi pi-exclamation-triangle"
          title="Failed to load groups"
          description="The group list could not be retrieved. Check your connection and try again."
          action={
            <button className="btn-secondary mt-3" onClick={refreshGroups}>
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
            placeholder="Filter groups..."
          />

          {/* Data Table */}
          <div className="table-wrapper">
            <DataTable
              value={groups}
              loading={loading}
              globalFilter={globalFilter}
              globalFilterFields={['name', 'description']}
              className="minimal-table"
              emptyMessage="No groups found."
              rowClassName={() => 'group-row'}
            >
              <Column
                header="Name"
                field="name"
                style={{ width: '30%' }}
                body={(g: Group) => <span className="font-medium">{g.name}</span>}
              />
              <Column
                header="Description"
                field="description"
                style={{ width: '55%' }}
                body={(g: Group) => g.description || '-'}
              />
              <Column
                style={{ width: '15%', textAlign: 'right' }}
                body={(g: Group) => (
                  <div className="actions">
                    <Button icon="pi pi-ellipsis-v" text rounded onClick={(e) => openMenu(g, e)} />
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
        header={isEditMode ? 'Edit group' : 'Create new group'}
        visible={groupDialog}
        modal
        draggable={false}
        resizable={false}
        style={{ width: '450px' }}
        className="db-dialog"
        closable
        onHide={hideDialog}
        footer={dialogFooter}
      >
        <div className="dialog-content">
          <div className="field">
            <label htmlFor="name">Group name</label>
            <InputText
              id="name"
              value={group.name}
              onChange={(e) => setGroup((g) => ({ ...g, name: e.target.value }))}
              className="w-full dialog-input"
              placeholder="e.g., developers"
              disabled={isEditMode}
            />
          </div>

          <div className="field">
            <label htmlFor="description">
              Description <span className="optional">(optional)</span>
            </label>
            <InputTextarea
              id="description"
              value={group.description ?? ''}
              onChange={(e) => setGroup((g) => ({ ...g, description: e.target.value }))}
              rows={4}
              className="w-full dialog-input"
              placeholder="Describe the purpose of this group..."
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
