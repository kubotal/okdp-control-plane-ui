import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ConnectionTestResult } from '../../../core/api/connection-api';
import { ConnectionTestReport } from './connection-test-result';

// An object store answering through its ingress while its in-cluster address
// does not resolve must not read as a success: the deployed workload takes the
// in-cluster path.
const REACHABLE_OUTSIDE_ONLY: ConnectionTestResult = {
  success: false,
  message: 'Host not found.',
  reason: 'unreachable',
  durationMs: 42,
  checks: [
    {
      label: 'In-cluster URL',
      target: 'http://seaweedfs.demo.svc.cluster.local:8333',
      decisive: true,
      success: false,
      message: 'Host not found.',
      reason: 'unreachable',
    },
    {
      label: 'Public URL',
      target: 'https://s3.okdp.sandbox',
      decisive: false,
      success: true,
      message: 'Connection successful.',
    },
  ],
};

describe('ConnectionTestReport', () => {
  it('leads with the path a workload will take', () => {
    render(<ConnectionTestReport result={REACHABLE_OUTSIDE_ONLY} />);

    expect(screen.getByText(/Host not found\. \(42 ms\)/)).toBeInTheDocument();
  });

  it('still reports the other paths, so a broken route is told from a broken store', () => {
    render(<ConnectionTestReport result={REACHABLE_OUTSIDE_ONLY} />);

    expect(screen.getByText('Public URL')).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/s3\.okdp\.sandbox/)).toBeInTheDocument();
    // The decisive one is the headline, not a bullet repeating it.
    expect(screen.queryByText('In-cluster URL')).not.toBeInTheDocument();
  });

  it('shows a plain verdict for a contract with a single address', () => {
    render(
      <ConnectionTestReport
        result={{ success: true, message: 'Connection successful.', durationMs: 4 }}
      />,
    );

    expect(screen.getByText(/Connection successful\. \(4 ms\)/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
