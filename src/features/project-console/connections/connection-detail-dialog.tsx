import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import type { ConnectionValues, CredentialsSecretRef } from '../../../core/api/connection-api';
import { connectionStatusTone } from './connection-status';
import { StatusTag } from '../../../shared/components/status-tag';

export interface ConnectionDetail {
  name: string;
  typeDisplay: string;
  icon?: string;
  description?: string;
  status?: string;
  /** Why the connection is not usable. In the list it only exists as a native
   *  tooltip, which cannot be selected, copied, or reached with a keyboard. */
  message?: string;
  values: ConnectionValues;
  credentialsSecret?: CredentialsSecretRef;
}

function CopyButton({
  text,
  label,
  onCopied,
}: {
  text: string;
  label: string;
  onCopied: (what: string) => void;
}) {
  return (
    <Button
      icon="pi pi-copy"
      text
      rounded
      className="shrink-0"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => onCopied(label))
          .catch(() => onCopied(''));
      }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-fg-secondary uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * What a connection actually holds, opened from either list: its values, its
 * state when it is not ready, and where its credentials live. Consuming it is
 * the controller's job, so this panel describes and never instructs.
 */
export function ConnectionDetailDialog({
  detail,
  visible,
  onHide,
  onCopied,
}: {
  detail: ConnectionDetail | null;
  visible: boolean;
  onHide: () => void;
  onCopied: (what: string) => void;
}) {
  if (!detail) {
    return null;
  }

  // Never render a field the type marks as a credential. The server already
  // keeps them out of `values`, but this panel exists to be looked at — it
  // must not become the one place a password shows up if that ever regresses.
  //
  // The field naming the Secret is dropped too: it is plumbing for a package
  // binding the connection, and the Credentials section below says the same
  // thing in readable form. `credentialsSecret` and `credentialsVersion` were
  // its previous names, and were still filtered here long after `secretRef`
  // replaced them, which let the live key through and hid nothing.
  const credentialKeys = new Set([...(detail.credentialsSecret?.keys ?? []), 'secretRef']);
  const entries = Object.entries(detail.values ?? {}).filter(([key]) => !credentialKeys.has(key));

  return (
    <Dialog
      header={
        <span className="inline-flex items-center gap-2">
          <i className={detail.icon || 'pi pi-link'}></i>
          {detail.name}
          <span className="text-[12px] font-normal text-fg-secondary">{detail.typeDisplay}</span>
        </span>
      }
      visible={visible}
      onHide={onHide}
      style={{ width: '46rem', maxWidth: '95vw' }}
      dismissableMask
    >
      {detail.description && (
        <p className="mb-5 text-[13px] text-fg-secondary">{detail.description}</p>
      )}

      {/* A connection that is not ready is the case a user opens this panel
          for. The reason belongs here, in full and copiable, rather than in a
          tooltip that truncates and disappears. */}
      {detail.status && detail.status !== 'Ready' && detail.status !== 'READY' && (
        <Section title="Status">
          <div className="rounded-xs border border-border-light bg-surface-secondary p-2 text-[13px]">
            <StatusTag value={detail.status} tone={connectionStatusTone(detail.status)} />
            {detail.message && (
              <div className="mt-2 flex items-start gap-2">
                <span className="flex-1 break-words">{detail.message}</span>
                <CopyButton text={detail.message} label="the status message" onCopied={onCopied} />
              </div>
            )}
          </div>
        </Section>
      )}

      {entries.length > 0 && (
        <Section title="Details">
          <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {entries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-fg-secondary">{key}</dt>
                <dd className="mono break-all">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {detail.credentialsSecret && (
        <Section title="Credentials">
          <div className="rounded-xs border border-border-light bg-surface-secondary p-2 text-[13px]">
            <div className="flex items-start gap-2">
              <span className="mono flex-1 break-all">
                {detail.credentialsSecret.namespace
                  ? `${detail.credentialsSecret.namespace}/${detail.credentialsSecret.name}`
                  : detail.credentialsSecret.name}
              </span>
              <CopyButton
                text={detail.credentialsSecret.name}
                label="the secret name"
                onCopied={onCopied}
              />
            </div>
            {detail.credentialsSecret.keys?.length ? (
              <p className="mt-1 text-[12px] text-fg-secondary">
                Keys: <span className="mono">{detail.credentialsSecret.keys.join(', ')}</span>. The
                console never reads their values.
              </p>
            ) : null}
          </div>
        </Section>
      )}
    </Dialog>
  );
}

export default ConnectionDetailDialog;
