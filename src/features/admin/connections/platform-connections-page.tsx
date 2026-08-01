import { ExternalConnectionList } from '../../project-console/connections/external-connection-list';

/** Cluster-wide connections, shared by every project. Same list as a
 *  project's external connections, addressed at the platform scope. */
export default function PlatformConnectionsPage() {
  return (
    <div className="platform-connections-page">
      <ExternalConnectionList scope="platform" />
    </div>
  );
}
