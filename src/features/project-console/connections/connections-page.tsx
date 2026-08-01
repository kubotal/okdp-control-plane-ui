import { TabPanel, TabView } from 'primereact/tabview';
import { ExternalConnectionList } from './external-connection-list';
import { InternalConnectionList } from './internal-connection-list';

/** The project's connections, in two sections: the external resources the
 *  user declares, and what the project's own deployed services expose to one
 *  another. */
export default function ConnectionsPage() {
  return (
    <div className="connections-page">
      <TabView>
        <TabPanel header="External" leftIcon="pi pi-cloud mr-2">
          <ExternalConnectionList />
        </TabPanel>
        <TabPanel header="Internal" leftIcon="pi pi-sitemap mr-2">
          <InternalConnectionList />
        </TabPanel>
      </TabView>
    </div>
  );
}
