import {
  siApachekafka,
  siApachespark,
  siApachesuperset,
  siJupyter,
  siMlflow,
  siTrino,
} from 'simple-icons';
import { BrandIcon, type BrandGlyph } from '../../shared/components/brand-icon';
import { SERVICE_AREAS } from './services/service-utils';

/** Apache Airflow brandmark, vendored from the official multicolor pinwheel
 *  icon (via the gilbarbara/svg-logos collection, CC0) — the simple-icons
 *  variant is outline-only hairlines and unreadable at sidebar size. */
const siteApacheairflow: BrandGlyph = {
  viewBox: '0 0 256 256',
  paths: [
    {
      fill: '#017cee',
      d: 'm4.127 254.974l122.568-125.639a2.265 2.265 0 0 0 .274-2.896c-7.453-10.406-21.207-12.21-26.303-19.203c-15.098-20.711-18.929-32.434-25.417-31.708a1.98 1.98 0 0 0-1.178.622l-44.276 45.388C4.322 147.628.661 205.137 0 253.295a2.4 2.4 0 0 0 4.127 1.679',
    },
    {
      fill: '#00ad46',
      d: 'M254.974 251.873L129.335 129.296a2.266 2.266 0 0 0-2.9-.274c-10.406 7.457-12.21 21.207-19.203 26.303c-20.712 15.098-32.435 18.93-31.709 25.417c.066.451.286.866.622 1.174l45.389 44.276c26.09 25.473 83.598 29.134 131.757 29.795a2.401 2.401 0 0 0 1.683-4.114',
    },
    {
      fill: '#04d659',
      d: 'M121.534 226.205c-14.263-13.915-20.872-41.44 6.462-98.2c-44.437 19.859-60.008 45.962-52.35 53.437z',
    },
    {
      fill: '#00c7d4',
      d: 'M251.869 1.03L129.305 126.67a2.26 2.26 0 0 0-.274 2.895c7.457 10.406 21.202 12.21 26.303 19.203c15.098 20.712 18.933 32.435 25.417 31.709c.453-.065.87-.285 1.178-.622l44.276-45.389C251.678 108.376 255.339 50.868 256 2.71a2.405 2.405 0 0 0-4.131-1.678',
    },
    {
      fill: '#11e1ee',
      d: 'M226.226 134.466c-13.915 14.263-41.44 20.873-98.204-6.462c19.859 44.437 45.963 60.009 53.437 52.351z',
    },
    {
      fill: '#e43921',
      d: 'm1.018 4.131l125.638 122.565c.772.78 1.992.896 2.896.273c10.406-7.457 12.21-21.207 19.203-26.303c20.712-15.098 32.435-18.929 31.709-25.417a2 2 0 0 0-.622-1.178l-45.389-44.276C108.363 4.322 50.855.661 2.696 0a2.4 2.4 0 0 0-1.678 4.131',
    },
    {
      fill: '#ff7557',
      d: 'M134.475 29.8c14.263 13.915 20.872 41.44-6.462 98.204c44.437-19.859 60.008-45.967 52.35-53.437z',
    },
    {
      fill: '#0cb6ff',
      d: 'M29.795 121.543C43.71 107.28 71.235 100.67 128 128.004c-19.86-44.436-45.963-60.008-53.438-52.35z',
    },
    {
      fill: '#4a4848',
      d: 'M133.496 127.983a5.479 5.479 0 1 1-10.958 0a5.479 5.479 0 1 1 10.958 0',
    },
  ],
};

/** Apache Polaris brandmark, vendored from the project site's favicon
 *  (site/static/favicons/favicon.svg, Apache-2.0) — not in simple-icons. */
const siteApachepolaris: BrandGlyph = {
  hex: '007880',
  viewBox: '0 0 100 100',
  path: 'M1.77396 5.30235C1.17886 4.57499 0 4.9958 0 5.93559V97.8878C0 99.0543 0.945669 100 2.11221 100H94.0452C94.9854 100 95.4059 98.8203 94.6778 98.2255L51.5956 63.0332C50.769 62.3579 49.5973 62.3044 48.7124 62.9013L23.4326 79.9586C21.4731 81.2806 19.1256 78.933 20.4475 76.9737L37.5039 51.6949C38.1012 50.8094 38.0472 49.6369 37.3709 48.8102L1.77396 5.30235ZM98.2255 94.6778C98.8203 95.4059 100 94.9854 100 94.0452V2.11221C100 0.945669 99.0543 0 97.8878 0H5.93558C4.99579 0 4.57499 1.17886 5.30235 1.77396L48.8102 37.3709C49.6369 38.0472 50.8094 38.1014 51.6949 37.5039L76.9735 20.4475C78.9328 19.1256 81.2805 21.4732 79.9586 23.4325L62.9013 48.7125C62.3043 49.5973 62.3579 50.769 63.0332 51.5957L98.2255 94.6778Z',
};

export interface NavItem {
  /** Path under /projects/:projectId — absent for inert placeholders. */
  segment?: string;
  /** primeicons fallback for services without a packaged brand logo. */
  icon: string;
  /** Brand logo (favicon equivalent) rendered instead of `icon`. */
  brand?: BrandGlyph;
  /** Follow text color instead of brand hex (near-black brands). */
  brandMono?: boolean;
  label: string;
  disabled?: boolean;
  /** Hidden from the menu unless the user enables it in their settings. */
  defaultHidden?: boolean;
  collapsedTitle?: string;
}

export interface NavCategory {
  key: string;
  label: string;
  icon: string;
  defaultExpanded: boolean;
  /** Core console functions — exempt from the user's show/hide preferences. */
  fixed?: boolean;
  items: NavItem[];
}

/** Sidebar categories and their service entries, in display order. Shared by
 *  the project console (renderer) and the settings page (per-item show/hide
 *  toggles). */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    key: 'lakehouse',
    label: 'Lakehouse',
    icon: 'pi-database',
    defaultExpanded: true,
    items: [
      { segment: 'polaris', icon: 'pi pi-table', brand: siteApachepolaris, label: 'Polaris' },
      { segment: 'trino', icon: 'pi pi-bolt', brand: siTrino, label: 'Trino' },
    ],
  },
  {
    key: 'data-engineering',
    label: 'Data Engineering',
    icon: 'pi-cog',
    defaultExpanded: true,
    items: [
      {
        segment: 'airflow',
        icon: 'pi pi-sitemap',
        brand: siteApacheairflow,
        label: 'Airflow',
      },
      // Single service entry like every other technology: the instance list.
      // The richer Spark Applications view lives in the views world
      // (/projects/:projectId/views), reachable from the sidebar switcher
      // and the user dropdown.
      {
        segment: 'spark/history-server',
        icon: 'pi pi-bolt',
        brand: siApachespark,
        label: 'Spark',
      },
      {
        icon: 'pi pi-share-alt',
        brand: siApachekafka,
        // The Kafka mark is near-black — keep it on the text color so it
        // stays visible in dark mode.
        brandMono: true,
        label: 'Kafka',
        disabled: true,
        defaultHidden: true,
        collapsedTitle: 'Kafka — exploration',
      },
    ],
  },
  {
    key: 'notebooks',
    label: 'Notebooks',
    icon: 'pi-book',
    defaultExpanded: true,
    items: [
      { segment: 'jupyterhub', icon: 'pi pi-desktop', brand: siJupyter, label: 'JupyterHub' },
    ],
  },
  {
    key: 'sql-bi',
    label: 'SQL & BI',
    icon: 'pi-chart-bar',
    defaultExpanded: true,
    items: [
      {
        segment: 'superset',
        icon: 'pi pi-chart-line',
        brand: siApachesuperset,
        label: 'Superset',
      },
      // SQL Lab is not a service: it lives in the views world as a launcher
      // derived from the deployed Superset instance (views-config).
    ],
  },
  {
    key: 'machine-learning',
    label: 'Machine Learning',
    icon: 'pi-microchip',
    defaultExpanded: false,
    items: [
      {
        icon: 'pi pi-sitemap',
        label: 'Kubeflow',
        disabled: true,
        defaultHidden: true,
        collapsedTitle: 'Kubeflow — exploration',
      },
      {
        icon: 'pi pi-flag',
        brand: siMlflow,
        label: 'MLflow',
        disabled: true,
        defaultHidden: true,
        collapsedTitle: 'MLflow — exploration',
      },
      {
        icon: 'pi pi-send',
        label: 'KServe',
        disabled: true,
        defaultHidden: true,
        collapsedTitle: 'KServe — exploration',
      },
    ],
  },
  {
    key: 'project-configuration',
    label: 'Project Panel',
    icon: 'pi-sliders-h',
    defaultExpanded: true,
    fixed: true,
    items: [
      { segment: 'connections', icon: 'pi pi-link', label: 'Connections' },
      { segment: 'secret-stores', icon: 'pi pi-lock', label: 'Secrets' },
      // Settings also hosts the local-only custom views (custom-views-context).
      { segment: 'settings', icon: 'pi pi-cog', label: 'Settings' },
    ],
  },
];

/** Brand logo when the service has one, primeicons fallback otherwise. */
export function navItemIcon(item: NavItem): React.ReactNode {
  return item.brand ? <BrandIcon icon={item.brand} mono={item.brandMono} /> : item.icon;
}

/** Lateral-menu item for a console segment — lets other surfaces (the views
 *  page and its sidebar) show a service with the same brand logo. */
export function navItemBySegment(segment: string): NavItem | undefined {
  for (const category of NAV_CATEGORIES) {
    const item = category.items.find((i) => i.segment === segment);
    if (item) return item;
  }
  return undefined;
}

/** Normalize a catalog icon (stored as `pi-box` or `pi pi-box`) into a full
 *  primeicons class, falling back to a generic box. */
function catalogIconClass(icon?: string): string {
  if (!icon) return 'pi pi-box';
  return icon.startsWith('pi ') ? icon : `pi ${icon}`;
}

/** SeaweedFS brandmark — hand-vendored (absent from simple-icons): three green
 *  fronds, so the catalog sidebar entry reads on-brand instead of a plain box. */
const siteSeaweedfs: BrandGlyph = {
  viewBox: '0 0 24 24',
  paths: [
    { fill: '#57c98a', d: 'M12 21 Q4.5 16 6.5 7 Q9.5 13 12 21 Z' },
    { fill: '#57c98a', d: 'M12 21 Q19.5 16 17.5 7 Q14.5 13 12 21 Z' },
    { fill: '#2e9e6b', d: 'M12 21 Q8 12 12 3 Q16 12 12 21 Z' },
  ],
};

/** Real brand logos for catalog services that have no bespoke area, matched by
 *  service name. When a name isn't here, catalogNavItems falls back to the
 *  catalog `icon` and then a generic box. Extend as new UI services are exposed. */
const CATALOG_BRANDS: Record<string, BrandGlyph> = {
  'spark-operator': siApachespark,
  seaweedfs: siteSeaweedfs,
};

/** Maps catalog services that have NO bespoke console area (not a key in
 *  SERVICE_AREAS) to generic sidebar entries pointing at the /services/<name>
 *  area. Bespoke services are excluded — they render from NAV_CATEGORIES with
 *  their own logos. This is what surfaces a freshly-exposed service in the
 *  console without a code change. */
export function catalogNavItems(services: { name: string; icon?: string }[]): NavItem[] {
  return services
    .filter((s) => !SERVICE_AREAS[s.name])
    .map((s) => ({
      segment: `services/${s.name}`,
      icon: catalogIconClass(s.icon),
      brand: CATALOG_BRANDS[s.name],
      label: s.name,
    }));
}
