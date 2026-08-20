import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import type { Pod } from '../../../core/models/service.model';
import { StatusTag, type StatusTone } from '../../../shared/components/status-tag';

function getStatusTone(status: string): StatusTone {
  switch (status) {
    case 'Running':
      return 'success';
    case 'Succeeded':
      return 'info';
    case 'Pending':
      return 'warning';
    case 'Failed':
    case 'Error':
      return 'danger';
    default:
      return 'neutral';
  }
}

export interface PodListProps {
  pods: Pod[];
  onViewLogs: (pod: Pod) => void;
}

export function PodList({ pods, onViewLogs }: PodListProps) {
  return (
    <DataTable paginator rows={25} paginatorTemplate="PrevPageLink PageLinks NextPageLink" alwaysShowPaginator={false}
      value={pods}
      rowHover
      className="minimal-table"
      dataKey="name"
      emptyMessage={
        <div className="flex items-center justify-center gap-2 p-7 text-[14px] text-fg-secondary">
          <i className="pi pi-box text-[1.2rem] opacity-50"></i>
          No pods found for this instance.
        </div>
      }
    >
      <Column
        header="Pod"
        style={{ width: '35%' }}
        body={(pod: Pod) => <span className="text-[13px] font-medium mono">{pod.name}</span>}
      />
      <Column
        header="Status"
        style={{ width: '15%' }}
        body={(pod: Pod) => <StatusTag value={pod.status} tone={getStatusTone(pod.status)} />}
      />
      <Column header="Ready" field="ready" style={{ width: '10%' }} />
      <Column header="Restarts" field="restarts" style={{ width: '10%' }} />
      <Column header="Age" field="age" style={{ width: '10%' }} />
      <Column
        style={{ width: '20%', textAlign: 'right' }}
        body={(pod: Pod) => (
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-3 py-1.5 text-[13px] font-medium text-primary transition-colors duration-250 ease-smooth hover:bg-primary-50"
            title="View pod logs"
            onClick={() => onViewLogs(pod)}
          >
            <i className="pi pi-file"></i> Logs
          </button>
        )}
      />
    </DataTable>
  );
}
