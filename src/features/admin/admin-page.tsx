import { ActionCard, QuickActions } from '../../shared/components/action-card';
import { useCapabilities } from '../../core/context/capabilities-context';

/** /admin — control plane administration zone. Tiles fan out to the
 *  individual administration areas. */
export default function AdminPage() {
  // Identity only exists under kubauth. On a platform with its own OIDC
  // provider the tile would lead to a screen with nothing to manage.
  const { userManagement } = useCapabilities();

  return (
    <section className="flex animate-[fadeInUp_0.4s_ease-out] flex-col gap-7">
      <div>
        <h1>Administration</h1>
        <p className="page-sub mt-1">
          Control plane administration. These settings apply to the whole platform.
        </p>
      </div>

      <QuickActions>
        <ActionCard
          to="/projects"
          icon="pi pi-th-large"
          tone="blue"
          title="Projects"
          description="Create and manage data projects"
        />
        {userManagement && (
          <ActionCard
            to="/identity"
            icon="pi pi-users"
            tone="primary"
            title="Identity"
            description="Manage users and groups"
          />
        )}
        <ActionCard
          to="/catalog"
          icon="pi pi-box"
          tone="blue"
          title="Service Catalog"
          description="Manage deployable platform services"
        />
      </QuickActions>
    </section>
  );
}
