import type { StatusTone } from '../../../shared/components/status-tag';
import type { ConnectionTestReason, ConnectionTestResult } from '../../../core/api/connection-api';

/** Tone of a connection status pill. Connections carry the KuboCD phase when
 *  they exist as CRDs, and the release status when they are derived from a
 *  deployed service, so both vocabularies are handled here. */
export function connectionStatusTone(status: string): StatusTone {
  switch (status) {
    case 'Ready':
    case 'READY':
      return 'success';
    case 'Error':
    case 'ERROR':
    case 'FAILED':
      return 'danger';
    case 'Pending':
    case 'Installing':
      return 'warning';
    default:
      return 'info';
  }
}

const REASON_ICON: Record<ConnectionTestReason, string> = {
  unreachable: 'pi pi-ban',
  'auth-failed': 'pi pi-lock',
  'not-found': 'pi pi-question-circle',
  timeout: 'pi pi-clock',
  'invalid-config': 'pi pi-exclamation-triangle',
  unknown: 'pi pi-times-circle',
};

/** Icon summarising why a connectivity test failed: a wrong password and an
 *  unreachable host are different problems and should not look alike. */
export function testResultIcon(result: ConnectionTestResult): string {
  if (result.success) return 'pi pi-check-circle';
  return (result.reason && REASON_ICON[result.reason]) || REASON_ICON.unknown;
}
