import { useCallback, useState } from 'react';
import { serviceApi } from '../../../core/api/service-api';
import type { PlatformService } from '../../../core/models/service.model';
import type { StatusTone } from '../../../shared/components/status-tag';

/** Map an instance status to its StatusTag tone. */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'Ready':
    case 'Running':
      return 'success';
    case 'Installing':
    case 'Updating':
      return 'warning';
    case 'Error':
    case 'CrashLoopBackOff':
    case 'Failed':
      return 'danger';
    default:
      return 'info';
  }
}

/** In-flight instance states — rendered with the animated activity dot. */
export function isTransitioning(status: string): boolean {
  return status === 'Installing' || status === 'Updating';
}

export interface ServiceArea {
  /** Breadcrumb / back-link label. */
  label: string;
  /** URL segments of the service area under /projects/:projectId. */
  basePath: string[];
}

/**
 * Registry mapping a platform service name to its console area. Single
 * source for breadcrumb labels and area base paths (the route quadruples in
 * app-routes.tsx and the sidebar links mirror these paths).
 */
export const SERVICE_AREAS: Record<string, ServiceArea> = {
  jupyterhub: { label: 'JupyterHub', basePath: ['jupyterhub'] },
  'spark-history-server': { label: 'History Server', basePath: ['spark', 'history-server'] },
  trino: { label: 'Trino', basePath: ['trino'] },
  polaris: { label: 'Polaris', basePath: ['polaris'] },
  superset: { label: 'Superset', basePath: ['superset'] },
  airflow: { label: 'Airflow', basePath: ['airflow'] },
  'hive-metastore': { label: 'Hive Metastore', basePath: ['hive-metastore'] },
};

/** Breadcrumb back-link label for a service name. */
export function parentLabel(service: string | undefined | null): string {
  return SERVICE_AREAS[service ?? '']?.label || service || 'Services';
}

/** URL segments of a service's console area. Services with a bespoke area use
 *  it; any other catalog service falls back to the generic `services/<name>`
 *  area (rendered by the same list/deploy/detail pages) instead of being
 *  wrongly nested under jupyterhub. */
export function areaBasePath(service: string | undefined | null): string[] {
  if (!service) return ['services'];
  return SERVICE_AREAS[service]?.basePath ?? ['services', service];
}

/** Open an external (cluster-workload) URL without handing it window.opener. */
export function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Version dropdown options for a platform service, flagging the default. */
export function versionOptionsFor(svc: PlatformService): { label: string; value: string }[] {
  return (svc.versions ?? []).map((v) => ({
    label: v === svc.defaultVersion ? `${v} (recommended)` : v,
    value: v,
  }));
}

// Lives in core/api/http (next to HttpError) so non-project-console features
// can surface backend error messages without importing from this module.
export { apiErrorMessage } from '../../../core/api/http';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** True when the schema declares a profile-editor widget (e.g. JupyterHub). */
export function hasProfileEditorWidget(schema: any): boolean {
  if (!schema?.properties) return false;
  return Object.values<any>(schema.properties).some(
    (def) => def['x-ui-widget'] === 'profile-editor',
  );
}

/**
 * Schema loading shared by the deploy and edit pages: holds the schema and
 * its loading flag, and warns (via the page's showWarn) on fetch failure —
 * `unavailableDetail` carries the page-specific copy.
 */
export function useServiceSchema(
  showWarn: (detail: string, summary: string) => void,
  unavailableDetail: string,
) {
  const [schema, setSchema] = useState<any>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const loadSchema = useCallback(
    (service: string, tag: string) => {
      setSchemaLoading(true);
      serviceApi
        .getServiceSchema(service, tag)
        .then((loaded) => {
          setSchema(loaded);
          setSchemaLoading(false);
        })
        .catch(() => {
          showWarn(unavailableDetail, 'Schema unavailable');
          setSchemaLoading(false);
        });
    },
    [showWarn, unavailableDetail],
  );
  return { schema, setSchema, schemaLoading, loadSchema };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Mirror of the backend's formatCPU: compact human-readable core count. */
export function formatCpuCores(cores: number): string {
  if (cores === 0) return '0';
  return cores < 1 ? cores.toFixed(3) : cores.toFixed(2);
}

/** Mirror of the backend's formatMemory: byte value in binary units. */
export function formatMemoryBytes(bytes: number): string {
  if (bytes === 0) return '0';
  const units: [number, string][] = [
    [1024 ** 3, 'Gi'],
    [1024 ** 2, 'Mi'],
    [1024, 'Ki'],
  ];
  for (const [threshold, suffix] of units) {
    if (bytes >= threshold) return `${(bytes / threshold).toFixed(2)}${suffix}`;
  }
  return `${bytes.toFixed(0)}B`;
}

/** Angular `date: 'mediumDate'` equivalent (e.g. "Jun 10, 2026"). */
export function formatMediumDate(value: string | undefined | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Angular `date: 'medium'` equivalent (e.g. "Jun 10, 2026, 1:15:00 PM"). */
export function formatMediumDateTime(value: string | undefined | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}
