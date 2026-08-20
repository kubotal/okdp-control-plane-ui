import { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Chips, type ChipsChangeEvent } from 'primereact/chips';
import { Dropdown } from 'primereact/dropdown';
import { Toast } from 'primereact/toast';
import { catalogApi } from '../../../core/api/catalog-api';
import { apiErrorMessage } from '../../../core/api/http';
import type { PlatformService, PlatformServiceRequest } from '../../../core/models/service.model';
import { useCatalog } from './use-catalog';
import EmptyState from '../../../shared/components/empty-state';
import SearchFilter from '../../../shared/components/search-filter';
import { PageHeader } from '../../../shared/components/page-header';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { useRowActionsMenu } from '../../../shared/hooks/use-row-actions-menu';
import { DialogFooter } from '../../../shared/components/dialog-footer';
import DeleteConfirmDialog from '../../../shared/components/delete-confirm-dialog';

/** Editable shape of the create/edit form — arrays/strings always defined so
 *  the inputs stay controlled. Mapped to a PlatformServiceRequest on save. */
interface CatalogForm {
  name: string;
  versions: string[];
  defaultVersion: string;
  description: string;
  icon: string;
  category: string;
  repository: string;
}

const EMPTY_FORM: CatalogForm = {
  name: '',
  versions: [],
  defaultVersion: '',
  description: '',
  icon: '',
  category: '',
  repository: '',
};

export function CatalogList() {
  const { toast, showSuccess, showError } = useToastMessages();

  const { services, loading, error, refresh } = useCatalog();

  const [globalFilter, setGlobalFilter] = useState('');
  const [serviceDialog, setServiceDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<PlatformService | null>(null);
  const [saving, setSaving] = useState(false);

  // Distinct categories already in the catalog — offered in the editable
  // dropdown so admins reuse the existing taxonomy rather than re-typing it.
  const categoryOptions = useMemo(
    () => [...new Set(services.map((s) => s.category).filter((c): c is string => !!c))].sort(),
    [services],
  );

  const openNew = () => {
    setForm(EMPTY_FORM);
    setIsEditMode(false);
    setServiceDialog(true);
  };

  const editService = (s: PlatformService) => {
    setForm({
      name: s.name,
      versions: s.versions ?? [],
      defaultVersion: s.defaultVersion ?? '',
      description: s.description ?? '',
      icon: s.icon ?? '',
      category: s.category ?? '',
      repository: s.repository ?? '',
    });
    setIsEditMode(true);
    setServiceDialog(true);
  };

  const deleteService = (s: PlatformService) => {
    catalogApi
      .deleteService(s.name)
      .then(() => {
        showSuccess('Service removed from catalog');
        refresh();
      })
      .catch((err) => showError(apiErrorMessage(err, 'Failed to delete service')));
  };

  const hideDialog = () => setServiceDialog(false);

  // Versions drive the default-version dropdown; drop a default that is no
  // longer in the list so we never submit an out-of-range default.
  const onVersionsChange = (e: ChipsChangeEvent) => {
    const versions = e.value ?? [];
    setForm((f) => ({
      ...f,
      versions,
      defaultVersion: versions.includes(f.defaultVersion) ? f.defaultVersion : '',
    }));
  };

  const isValid =
    form.name.trim().length > 0 &&
    form.versions.length > 0 &&
    (form.defaultVersion === '' || form.versions.includes(form.defaultVersion));

  const saveService = () => {
    if (!isValid) {
      return;
    }

    const payload: PlatformServiceRequest = {
      name: form.name.trim(),
      versions: form.versions,
      defaultVersion: form.defaultVersion || undefined,
      description: form.description.trim() || undefined,
      icon: form.icon.trim() || undefined,
      category: form.category.trim() || undefined,
      repository: form.repository.trim() || undefined,
    };

    setSaving(true);
    const save = isEditMode
      ? catalogApi.updateService(payload.name, payload)
      : catalogApi.createService(payload);

    save
      .then(() => {
        showSuccess(isEditMode ? 'Service updated' : 'Service added to catalog');
        refresh();
        hideDialog();
      })
      .catch((err) =>
        showError(
          apiErrorMessage(err, isEditMode ? 'Failed to update service' : 'Failed to add service'),
        ),
      )
      .finally(() => setSaving(false));
  };

  const { menuElement, openMenu } = useRowActionsMenu<PlatformService>([
    { label: 'Edit', icon: 'pi pi-pencil', command: editService },
    { separator: true },
    { label: 'Delete', icon: 'pi pi-trash', command: setDeleteTarget },
  ]);

  const dialogFooter = (
    <DialogFooter
      onCancel={hideDialog}
      onConfirm={saveService}
      confirmLabel={isEditMode ? 'Save' : 'Add service'}
      confirmDisabled={!isValid}
      busy={saving}
    />
  );

  return (
    <div>
      <Toast ref={toast} />
      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="service"
        message={
          deleteTarget && (
            <>
              This removes <strong>{deleteTarget.name}</strong> from the catalog. Existing deployed
              instances are not affected, but the service can no longer be deployed.
            </>
          )
        }
        onHide={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteService(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      {/* Top Bar */}
      <PageHeader
        title="Service Catalog"
        subtitle="Platform services that projects can deploy."
        actions={
          <button className="create-btn" onClick={openNew}>
            <i className="pi pi-plus"></i>
            <span>Add service</span>
          </button>
        }
      />

      {error && services.length === 0 ? (
        <EmptyState
          icon="pi pi-exclamation-triangle"
          title="Failed to load the catalog"
          description="The service catalog could not be retrieved. Check your connection and try again."
          action={
            <button className="btn-secondary mt-3" onClick={refresh}>
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
            placeholder="Filter services..."
          />

          {/* Data Table */}
          <div className="table-wrapper">
            <DataTable paginator rows={25} paginatorTemplate="PrevPageLink PageLinks NextPageLink" alwaysShowPaginator={false}
              value={services}
              loading={loading}
              globalFilter={globalFilter}
              globalFilterFields={['name', 'description', 'category']}
              className="minimal-table"
              emptyMessage="No services in the catalog."
            >
              <Column
                header="Name"
                field="name"
                style={{ width: '22%' }}
                body={(s: PlatformService) => <span className="font-medium">{s.name}</span>}
              />
              <Column
                header="Versions"
                style={{ width: '30%' }}
                body={(s: PlatformService) => (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.versions?.map((v) => (
                      <span key={v} className="okdp-tag">
                        {v}
                        {v === s.defaultVersion && (
                          <span className="ml-1 text-fg-muted">(default)</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              />
              <Column
                header="Category"
                field="category"
                style={{ width: '15%' }}
                body={(s: PlatformService) => s.category || '-'}
              />
              <Column
                header="Description"
                field="description"
                style={{ width: '23%' }}
                body={(s: PlatformService) => s.description || '-'}
              />
              <Column
                style={{ width: '10%', textAlign: 'right' }}
                body={(s: PlatformService) => (
                  <div className="actions">
                    <Button icon="pi pi-ellipsis-v" text rounded onClick={(e) => openMenu(s, e)} />
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
        header={isEditMode ? 'Edit service' : 'Add service to catalog'}
        visible={serviceDialog}
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
            <label htmlFor="name">Service name</label>
            <InputText
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full dialog-input"
              placeholder="e.g., jupyterhub"
              disabled={isEditMode}
            />
          </div>

          <div className="field">
            <label htmlFor="versions">Versions</label>
            <Chips
              inputId="versions"
              value={form.versions}
              onChange={onVersionsChange}
              separator=","
              allowDuplicate={false}
              addOnBlur
              className="w-full"
              placeholder={form.versions.length === 0 ? 'Type a version and press Enter' : ''}
            />
            <small className="text-fg-muted">
              Each version is checked against the OCI registry (quay.io) on save.
            </small>
          </div>

          <div className="field">
            <label htmlFor="defaultVersion">
              Default version <span className="optional">(optional)</span>
            </label>
            <Dropdown
              inputId="defaultVersion"
              value={form.defaultVersion || null}
              options={form.versions}
              onChange={(e) =>
                setForm((f) => ({ ...f, defaultVersion: (e.value as string) ?? '' }))
              }
              className="w-full"
              placeholder={
                form.versions.length === 0 ? 'Add a version first' : 'First version (default)'
              }
              disabled={form.versions.length === 0}
              showClear
              appendTo={document.body}
            />
          </div>

          <div className="field">
            <label htmlFor="category">
              Category <span className="optional">(optional)</span>
            </label>
            <Dropdown
              inputId="category"
              editable
              value={form.category}
              options={categoryOptions}
              onChange={(e) => setForm((f) => ({ ...f, category: (e.value as string) ?? '' }))}
              className="w-full"
              placeholder="Pick or type a category"
              appendTo={document.body}
            />
          </div>

          <div className="field">
            <label htmlFor="icon">
              Icon <span className="optional">(optional)</span>
            </label>
            <InputText
              id="icon"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              className="w-full dialog-input"
              placeholder="e.g., jupyter"
            />
          </div>

          <div className="field">
            <label htmlFor="repository">
              Package repository <span className="optional">(optional)</span>
            </label>
            <InputText
              id="repository"
              value={form.repository}
              onChange={(e) => setForm((f) => ({ ...f, repository: e.target.value }))}
              className="w-full dialog-input"
              placeholder="Override the global registry, e.g., quay.io/okdp/packages-dev"
            />
            <small className="text-fg-muted">
              Leave empty to use the platform's default package repository.
            </small>
          </div>

          <div className="field">
            <label htmlFor="description">
              Description <span className="optional">(optional)</span>
            </label>
            <InputTextarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full dialog-input"
              placeholder="Describe what this service provides..."
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
