import { Message } from 'primereact/message';
import type { ConnectionTestResult } from '../../../core/api/connection-api';
import { testResultIcon } from './connection-status';

/**
 * The outcome of a connectivity test.
 *
 * A contract may publish several addresses, and they do not answer alike: an
 * object store is often reachable through its ingress and unreachable at its
 * in-cluster address, which is the one the deployed workload will use. The
 * headline verdict is that decisive path; the others are listed underneath so a
 * reader can tell a broken store from a broken route to it.
 */
export function ConnectionTestReport({ result }: { result: ConnectionTestResult }) {
  const extra = (result.checks ?? []).filter((check) => !check.decisive);

  return (
    <div className="mt-2">
      <Message
        severity={result.success ? 'success' : 'error'}
        className="w-full justify-start"
        icon={testResultIcon(result)}
        text={`${result.message} (${result.durationMs} ms)`}
      />
      {extra.length > 0 && (
        <ul className="reset-list mt-2">
          {extra.map((check) => (
            <li key={check.label} className="flex items-start gap-2 py-1 text-[12px]">
              <i
                className={`pi ${check.success ? 'pi-check-circle text-success' : 'pi-times-circle text-danger'} mt-0.5`}
                aria-hidden="true"
              />
              <span className="text-fg-secondary">
                <strong>{check.label}</strong>
                {check.target ? <span className="mono"> {check.target}</span> : null}
                {': '}
                {check.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ConnectionTestReport;
