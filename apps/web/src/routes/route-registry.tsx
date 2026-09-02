import {
  type AnyRoute,
  createRootRouteWithContext,
  createRoute,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import {
  type AuthorizedMenuNode,
  type PermissionKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
  transactionTypes,
} from "@xpense/shared";
import { lazy, type ReactNode, Suspense } from "react";
import { useStore } from "zustand";

import {
  AuthenticatedLayout,
  type CapturedRegisteredPageInput,
} from "../components/layout/authenticated-layout";
import type { RegisteredPageInput } from "../components/layout/page-cache-host";
import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import { ApiError } from "../services/api-client";
import type { ListTransactionsQuery } from "../services/bookkeeping-api";
import type {
  ListRentalContractsQuery,
  ListRentalPropertiesQuery,
  ListRentalTenantsQuery,
  RentalApi,
} from "../services/rental-api";
import type { WebSessionDependency } from "../services/web-session";

const DashboardPage = lazy(() =>
  import("../pages/dashboard-page").then((module) => ({ default: module.DashboardPage })),
);
const MembersPage = lazy(() =>
  import("../features/members/members-page").then((module) => ({ default: module.MembersPage })),
);
const RolesPage = lazy(() =>
  import("../features/roles/roles-page").then((module) => ({ default: module.RolesPage })),
);
const SessionsPage = lazy(() =>
  import("../features/sessions/sessions-page").then((module) => ({ default: module.SessionsPage })),
);
const AuditLogsPage = lazy(() =>
  import("../features/audit/audit-logs-page").then((module) => ({ default: module.AuditLogsPage })),
);
const MenuManagementPage = lazy(() =>
  import("../features/menus/menu-management-page").then((module) => ({
    default: module.MenuManagementPage,
  })),
);
const TransactionsPage = lazy(() =>
  import("../features/bookkeeping/transactions/transactions-page").then((module) => ({
    default: module.TransactionsPage,
  })),
);
const AccountsPage = lazy(() =>
  import("../features/bookkeeping/accounts/accounts-page").then((module) => ({
    default: module.AccountsPage,
  })),
);
const CategoriesPage = lazy(() =>
  import("../features/bookkeeping/categories/categories-page").then((module) => ({
    default: module.CategoriesPage,
  })),
);
const PropertiesPage = lazy(() =>
  import("../features/rental/properties/properties-page").then((module) => ({
    default: module.PropertiesPage,
  })),
);
const PropertyDetailPage = lazy(() =>
  import("../features/rental/spaces/property-detail-page").then((module) => ({
    default: module.PropertyDetailPage,
  })),
);
const RentalTenantsPage = lazy(() =>
  import("../features/rental/tenants/tenants-page").then((module) => ({
    default: module.TenantsPage,
  })),
);
const RentalTenantDetailPage = lazy(() =>
  import("../features/rental/tenants/tenant-detail-page").then((module) => ({
    default: module.TenantDetailPage,
  })),
);
const RentalContractsPage = lazy(() =>
  import("../features/rental/contracts/contracts-page").then((module) => ({
    default: module.ContractsPage,
  })),
);
const RentalContractDetailPage = lazy(() =>
  import("../features/rental/contracts/contract-detail-page").then((module) => ({
    default: module.ContractDetailPage,
  })),
);
const RentalContractCreatePage = lazy(() =>
  import("../features/rental/contracts/contract-form-page").then((module) => ({
    default: module.ContractFormPage,
  })),
);

export type AppRouterContext = {
  registeredMenu?: AuthorizedMenuNode;
  registeredMenuAuthorization?: object;
  session: WebSessionDependency;
};

export type WebRouteRegistration<TRoute extends AnyRoute = AnyRoute> = {
  label: string;
  route: TRoute;
  render: (input: RegisteredPageInput<TRoute>) => ReactNode;
};

type WebRouteRegistrationConstraint = {
  label: string;
  route: AnyRoute;
  render: (input: never) => ReactNode;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    routeKey?: RouteKey;
  }
}

export const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: Outlet,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  beforeLoad: ({ context, location }) => requireAuthenticatedRouteAccess(context, location),
  component: AuthenticatedRoutePage,
});

const dashboardRoute = createRegisteredRoute("Dashboard");
const accountsRoute = createRegisteredRoute("Accounts");
const categoriesRoute = createRegisteredRoute("Categories");
const membersRoute = createRegisteredRoute("Members");
const rolesRoute = createRegisteredRoute("Roles");
const sessionsRoute = createRegisteredRoute("Sessions");
const menusRoute = createRegisteredRoute("Menus");
const transactionsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.Transactions.path,
  staticData: { routeKey: "Transactions" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "Transactions"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateTransactionSearch,
});
const auditLogsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.AuditLogs.path,
  staticData: { routeKey: "AuditLogs" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "AuditLogs"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateAuditLogSearch,
});
const rentalPropertiesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalProperties.path,
  staticData: { routeKey: "RentalProperties" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "RentalProperties"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateRentalPropertiesSearch,
});
const rentalPropertyDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalPropertyDetail.path,
  staticData: { routeKey: "RentalPropertyDetail" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "RentalPropertyDetail"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});
const rentalTenantsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalTenants.path,
  staticData: { routeKey: "RentalTenants" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "RentalTenants"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateRentalTenantsSearch,
});
const rentalTenantDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalTenantDetail.path,
  staticData: { routeKey: "RentalTenantDetail" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "RentalTenantDetail"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});
const rentalContractsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalContracts.path,
  staticData: { routeKey: "RentalContracts" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "RentalContracts"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateRentalContractsSearch,
});
const rentalContractDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalContractDetail.path,
  staticData: { routeKey: "RentalContractDetail" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "RentalContractDetail"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});
const rentalContractCreateRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.RentalContractCreate.path,
  staticData: { routeKey: "RentalContractCreate" },
  beforeLoad: async ({ context, location }) => {
    const access = await requireRegisteredRouteAccess(context, location, "RentalContracts");
    if (!context.session.authStore.getState().permissions.includes("rental_contracts:create")) {
      throw redirect({ to: "/forbidden" });
    }
    return access;
  },
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateRentalContractCreateSearch,
});

export const ROUTE_REGISTRY = {
  Dashboard: defineRouteRegistration({
    label: "仪表盘",
    route: dashboardRoute,
    render: (input) => renderLazyPage(<DashboardPageAdapter input={input} />),
  }),
  Members: defineRouteRegistration({
    label: "成员管理",
    route: membersRoute,
    render: (input) => renderLazyPage(<MembersPageAdapter input={input} />),
  }),
  Roles: defineRouteRegistration({
    label: "角色管理",
    route: rolesRoute,
    render: (input) => renderLazyPage(<RolesPageAdapter input={input} />),
  }),
  Sessions: defineRouteRegistration({
    label: "会话管理",
    route: sessionsRoute,
    render: (input) => renderLazyPage(<SessionsPageAdapter input={input} />),
  }),
  AuditLogs: defineRouteRegistration({
    label: "审计日志",
    route: auditLogsRoute,
    render: (input) => renderLazyPage(<AuditLogsPageAdapter input={input} />),
  }),
  Menus: defineRouteRegistration({
    label: "菜单管理",
    route: menusRoute,
    render: (input) => renderLazyPage(<MenusPageAdapter input={input} />),
  }),
  Transactions: defineRouteRegistration({
    label: "交易记录",
    route: transactionsRoute,
    render: (input) => renderLazyPage(<TransactionsPageAdapter input={input} />),
  }),
  Accounts: defineRouteRegistration({
    label: "账户管理",
    route: accountsRoute,
    render: (input) => renderLazyPage(<AccountsPageAdapter input={input} />),
  }),
  Categories: defineRouteRegistration({
    label: "分类管理",
    route: categoriesRoute,
    render: (input) => renderLazyPage(<CategoriesPageAdapter input={input} />),
  }),
  RentalProperties: defineRouteRegistration({
    label: "房产管理",
    route: rentalPropertiesRoute,
    render: (input) => renderLazyPage(<PropertiesPageAdapter input={input} />),
  }),
  RentalPropertyDetail: defineRouteRegistration({
    label: "房产详情",
    route: rentalPropertyDetailRoute,
    render: (input) => renderLazyPage(<PropertyDetailPageAdapter input={input} />),
  }),
  RentalTenants: defineRouteRegistration({
    label: "租户管理",
    route: rentalTenantsRoute,
    render: (input) => renderLazyPage(<RentalTenantsPageAdapter input={input} />),
  }),
  RentalTenantDetail: defineRouteRegistration({
    label: "租户详情",
    route: rentalTenantDetailRoute,
    render: (input) => renderLazyPage(<RentalTenantDetailPageAdapter input={input} />),
  }),
  RentalContracts: defineRouteRegistration({
    label: "合同管理",
    route: rentalContractsRoute,
    render: (input) => renderLazyPage(<RentalContractsPageAdapter input={input} />),
  }),
  RentalContractDetail: defineRouteRegistration({
    label: "合同详情",
    route: rentalContractDetailRoute,
    render: (input) => renderLazyPage(<RentalContractDetailPageAdapter input={input} />),
  }),
  RentalContractCreate: defineRouteRegistration({
    label: "新增合同",
    route: rentalContractCreateRoute,
    render: (input) => renderLazyPage(<RentalContractCreatePageAdapter input={input} />),
  }),
} satisfies Record<RouteKey, WebRouteRegistrationConstraint>;

const MENU_ROUTE_OPTIONS = (Object.keys(ROUTE_DEFINITIONS) as RouteKey[]).map((key) => ({
  key,
  label: ROUTE_REGISTRY[key].label,
  path: ROUTE_DEFINITIONS[key].path,
}));

function defineRouteRegistration<TRoute extends AnyRoute>(
  registration: WebRouteRegistration<TRoute>,
): WebRouteRegistration<TRoute> {
  return registration;
}

function createRegisteredRoute<const Key extends Exclude<RouteKey, "AuditLogs" | "Transactions">>(
  routeKey: Key,
) {
  return createRoute({
    getParentRoute: () => authenticatedRoute,
    path: ROUTE_DEFINITIONS[routeKey].path,
    staticData: { routeKey },
    beforeLoad: ({ context, location }) =>
      requireRegisteredRouteAccess(context, location, routeKey),
    component: RegisteredRouteLeaf,
    pendingComponent: RouteAccessPending,
    pendingMs: 0,
  });
}

type RouteGuardLocation = {
  href: string;
  pathname: string;
};

export function requireAuthenticatedRouteAccess(
  context: AppRouterContext,
  location: RouteGuardLocation,
): void {
  if (context.session.authStore.getState().status !== "authenticated") {
    throw redirect({
      to: "/login",
      search: { redirect: location.href },
    });
  }
}

async function requireRegisteredRouteAccess(
  context: AppRouterContext,
  location: RouteGuardLocation,
  routeKey: RouteKey,
): Promise<{
  registeredMenu?: AuthorizedMenuNode;
  registeredMenuAuthorization?: object;
}> {
  requireAuthenticatedRouteAccess(context, location);

  const { session } = context;
  const organizationId = session.authStore.getState().currentOrganization?.id ?? null;
  let menuState = session.menuStore.getState();

  if (
    organizationId &&
    menuState.status !== "error" &&
    (menuState.status !== "ready" || menuState.organizationId !== organizationId)
  ) {
    await menuState.loadMenusForOrganization(organizationId, session.iamApi.getAuthorizedMenus);
    menuState = session.menuStore.getState();
  }

  if (menuState.status !== "ready" || menuState.organizationId !== organizationId) {
    return {};
  }

  const registeredMenu = menuState.getAuthorizedRoute(routeKey);

  if (registeredMenu) {
    return { registeredMenu, registeredMenuAuthorization: menuState.byRouteKey };
  }

  try {
    const resolvedRoute = await session.iamApi.resolveMenuRoute(location.pathname);

    if (resolvedRoute.routeKey !== routeKey) {
      throw notFound();
    }

    return {
      registeredMenu: resolvedRoute,
      registeredMenuAuthorization: menuState.byRouteKey,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw redirect({ to: "/forbidden" });
    }
    if (error instanceof ApiError && error.status === 404) {
      throw notFound();
    }
    throw error;
  }
}

function AuthenticatedRoutePage() {
  const { session } = authenticatedRoute.useRouteContext();

  return <AuthenticatedLayout renderRegisteredPage={renderRegisteredPage} session={session} />;
}

function RegisteredRouteLeaf(): null {
  return null;
}

function renderRegisteredPage(input: CapturedRegisteredPageInput): ReactNode {
  switch (input.routeKey) {
    case "Dashboard":
      return ROUTE_REGISTRY.Dashboard.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "Members":
      return ROUTE_REGISTRY.Members.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "Roles":
      return ROUTE_REGISTRY.Roles.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "Sessions":
      return ROUTE_REGISTRY.Sessions.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "AuditLogs":
      return ROUTE_REGISTRY.AuditLogs.render({
        navigate: input.navigate,
        params: input.params as never,
        search: validateAuditLogSearch(input.search),
        session: input.session,
      });
    case "Menus":
      return ROUTE_REGISTRY.Menus.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "Transactions":
      return ROUTE_REGISTRY.Transactions.render({
        navigate: input.navigate,
        params: input.params as never,
        search: validateTransactionSearch(input.search),
        session: input.session,
      });
    case "Accounts":
      return ROUTE_REGISTRY.Accounts.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "Categories":
      return ROUTE_REGISTRY.Categories.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "RentalProperties":
      return ROUTE_REGISTRY.RentalProperties.render({
        navigate: input.navigate,
        params: input.params as never,
        search: validateRentalPropertiesSearch(input.search),
        session: input.session,
      });
    case "RentalPropertyDetail":
      return ROUTE_REGISTRY.RentalPropertyDetail.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "RentalTenants":
      return ROUTE_REGISTRY.RentalTenants.render({
        navigate: input.navigate,
        params: input.params as never,
        search: validateRentalTenantsSearch(input.search),
        session: input.session,
      });
    case "RentalTenantDetail":
      return ROUTE_REGISTRY.RentalTenantDetail.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "RentalContracts":
      return ROUTE_REGISTRY.RentalContracts.render({
        navigate: input.navigate,
        params: input.params as never,
        search: validateRentalContractsSearch(input.search),
        session: input.session,
      });
    case "RentalContractDetail":
      return ROUTE_REGISTRY.RentalContractDetail.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
    case "RentalContractCreate":
      return ROUTE_REGISTRY.RentalContractCreate.render({
        navigate: input.navigate,
        params: input.params as never,
        search: input.search,
        session: input.session,
      });
  }
}

function TransactionsPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof transactionsRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <TransactionsPage
      api={input.session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
      search={input.search}
      onSearchChange={(search) => void input.navigate({ search, replace: true })}
    />
  );
}

/** 将当前组织的真实记账服务注入 Dashboard。 */
function DashboardPageAdapter({ input }: { input: RegisteredPageInput<typeof dashboardRoute> }) {
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return <DashboardPage api={input.session.bookkeepingApi} organizationId={organizationId} />;
}

function AccountsPageAdapter({ input }: { input: RegisteredPageInput<typeof accountsRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <AccountsPage
      api={input.session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
    />
  );
}

function CategoriesPageAdapter({ input }: { input: RegisteredPageInput<typeof categoriesRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <CategoriesPage
      api={input.session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
    />
  );
}

function PropertiesPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalPropertiesRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <PropertiesPage
      api={input.session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      search={input.search}
      onSearchChange={(search) => void input.navigate({ search, replace: true })}
      onNavigate={(propertyId) =>
        void input.navigate({
          to: "/rentals/properties/$propertyId",
          params: { propertyId },
        })
      }
      onCreateContract={(propertyId) =>
        void input.navigate({ to: "/rentals/contracts/new", search: { propertyId } })
      }
    />
  );
}

function PropertyDetailPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalPropertyDetailRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <PropertyDetailPage
      api={input.session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      propertyId={input.params.propertyId}
      onCreateContract={(propertyId) =>
        void input.navigate({ to: "/rentals/contracts/new", search: { propertyId } })
      }
      onNavigateContract={(contractId) =>
        void input.navigate({ to: "/rentals/contracts/$contractId", params: { contractId } })
      }
    />
  );
}

type RentalRoutePageContext = {
  canCreate?: boolean;
  organizationId: string;
  permissions: readonly PermissionKey[];
};

export type RentalTenantsRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  navigate: RegisteredPageInput<typeof rentalTenantsRoute>["navigate"];
  search: ListRentalTenantsQuery;
};

export type RentalTenantDetailRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  navigate: RegisteredPageInput<typeof rentalTenantDetailRoute>["navigate"];
  search: Record<string, unknown>;
  tenantId: string;
};

export type RentalContractsRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  navigate: RegisteredPageInput<typeof rentalContractsRoute>["navigate"];
  search: ListRentalContractsQuery;
};

export type RentalContractDetailRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  contractId: string;
  navigate: RegisteredPageInput<typeof rentalContractDetailRoute>["navigate"];
  search: Record<string, unknown>;
};

export type RentalContractCreateRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  canCreate: boolean;
  navigate: RegisteredPageInput<typeof rentalContractCreateRoute>["navigate"];
  search: RentalContractCreateSearch;
};

export type RentalContractCreateSearch = {
  draftId?: string;
  propertyId?: string;
  spaceIds?: string[];
};

export function createRentalTenantsRoutePageProps(
  input: RegisteredPageInput<typeof rentalTenantsRoute>,
  context: RentalRoutePageContext,
): RentalTenantsRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    navigate: input.navigate,
    search: input.search,
  };
}

export function createRentalTenantDetailRoutePageProps(
  input: RegisteredPageInput<typeof rentalTenantDetailRoute>,
  context: RentalRoutePageContext,
): RentalTenantDetailRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    navigate: input.navigate,
    search: input.search,
    tenantId: input.params.tenantId,
  };
}

export function createRentalContractsRoutePageProps(
  input: RegisteredPageInput<typeof rentalContractsRoute>,
  context: RentalRoutePageContext,
): RentalContractsRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    navigate: input.navigate,
    search: input.search,
  };
}

export function createRentalContractDetailRoutePageProps(
  input: RegisteredPageInput<typeof rentalContractDetailRoute>,
  context: RentalRoutePageContext,
): RentalContractDetailRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    contractId: input.params.contractId,
    navigate: input.navigate,
    search: input.search,
  };
}

export function createRentalContractCreateRoutePageProps(
  input: RegisteredPageInput<typeof rentalContractCreateRoute>,
  context: RentalRoutePageContext,
): RentalContractCreateRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    canCreate: context.permissions.includes("rental_contracts:create"),
    navigate: input.navigate,
    search: input.search,
  };
}

function RentalTenantsPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalTenantsRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <RentalTenantsPage
      api={input.session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      search={input.search}
      onSearchChange={(search) => void input.navigate({ search, replace: true })}
      onNavigate={(tenantId) =>
        void input.navigate({ to: "/rentals/tenants/$tenantId", params: { tenantId } })
      }
    />
  );
}

function RentalTenantDetailPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalTenantDetailRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <RentalTenantDetailPage
      api={input.session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      tenantId={input.params.tenantId}
    />
  );
}

function RentalContractsPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalContractsRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <RentalContractsPage
      {...createRentalContractsRoutePageProps(input, { organizationId, permissions })}
    />
  );
}

function RentalContractDetailPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalContractDetailRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <RentalContractDetailPage
      {...createRentalContractDetailRoutePageProps(input, { organizationId, permissions })}
    />
  );
}

function RentalContractCreatePageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof rentalContractCreateRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    input.session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <RentalContractCreatePage
      {...createRentalContractCreateRoutePageProps(input, { organizationId, permissions })}
      onNonDraft={(detail) =>
        void input.navigate({
          to: "/rentals/contracts/$contractId",
          params: { contractId: detail.id },
          replace: true,
        })
      }
    />
  );
}

function MembersPageAdapter({ input }: { input: RegisteredPageInput<typeof membersRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <MembersPage api={input.session.iamApi} permissions={permissions} />;
}

function RolesPageAdapter({ input }: { input: RegisteredPageInput<typeof rolesRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <RolesPage api={input.session.iamApi} permissions={permissions} />;
}

function SessionsPageAdapter({ input }: { input: RegisteredPageInput<typeof sessionsRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const currentSessionId = useStore(input.session.authStore, (state) => state.session?.id);

  return (
    <SessionsPage
      api={input.session.authApi}
      currentSessionId={currentSessionId}
      onCurrentSessionRevoked={() => {
        input.session.authStore.getState().clearAuth();
        void input.navigate({ to: "/login", search: { redirect: "/" }, replace: true });
      }}
      permissions={permissions}
    />
  );
}

function AuditLogsPageAdapter({ input }: { input: RegisteredPageInput<typeof auditLogsRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return (
    <AuditLogsPage
      api={input.session.iamApi}
      permissions={permissions}
      search={input.search}
      onSearchChange={(search) => void input.navigate({ search, replace: true })}
    />
  );
}

function MenusPageAdapter({ input }: { input: RegisteredPageInput<typeof menusRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return (
    <MenuManagementPage
      api={input.session.iamApi}
      permissions={permissions}
      routeOptions={MENU_ROUTE_OPTIONS}
      onAuthorizedMenusRefresh={async () => {
        const organizationId = input.session.authStore.getState().currentOrganization?.id;

        if (!organizationId) {
          throw new Error("Current organization is unavailable");
        }

        await input.session.menuStore
          .getState()
          .loadMenusForOrganization(organizationId, input.session.iamApi.getAuthorizedMenus);

        const menuState = input.session.menuStore.getState();

        if (menuState.status !== "ready" || menuState.organizationId !== organizationId) {
          throw new Error("Authorized menus could not be synchronized");
        }
      }}
    />
  );
}

function renderLazyPage(page: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoading />}>{page}</Suspense>;
}

export function RouteAccessPending() {
  return <RouteStatus>正在验证页面访问权限...</RouteStatus>;
}

function PageLoading() {
  return <RouteStatus>正在加载页面...</RouteStatus>;
}

function RouteStatus({ children }: { children: ReactNode }) {
  return (
    <main
      aria-live="polite"
      className="grid min-h-[50dvh] place-items-center text-sm text-muted-foreground"
    >
      {children}
    </main>
  );
}

function validateAuditLogSearch(search: Record<string, unknown>): AuditLogSearch {
  return {
    action: readSearchString(search.action),
    actorUserId: readSearchString(search.actorUserId),
    from: readSearchDate(search.from),
    page: readSearchPage(search.page),
    targetType: readSearchString(search.targetType),
    to: readSearchDate(search.to),
  };
}

/** 将交易页面 URL 查询参数收敛为服务端支持的筛选字段。 */
function validateTransactionSearch(search: Record<string, unknown>): ListTransactionsQuery {
  const result: ListTransactionsQuery = {};
  const ledgerId = readSearchUuid(search.ledgerId);
  const accountId = readSearchUuid(search.accountId);
  const categoryId = readSearchUuid(search.categoryId);
  const type = readTransactionType(search.type);
  const keyword = readTrimmedSearchString(search.keyword);
  const from = readSearchDate(search.from);
  const to = readSearchDate(search.to);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);

  if (ledgerId) result.ledgerId = ledgerId;
  if (accountId) result.accountId = accountId;
  if (categoryId) result.categoryId = categoryId;
  if (type) result.type = type;
  if (keyword) result.keyword = keyword;
  if (!from || !to || from <= to) {
    if (from) result.from = from;
    if (to) result.to = to;
  }
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;

  return result;
}

/** 校验房产页 URL 筛选，避免无效值进入缓存键或服务端请求。 */
function validateRentalPropertiesSearch(
  search: Record<string, unknown>,
): ListRentalPropertiesQuery {
  const result: ListRentalPropertiesQuery = {};
  const keyword = readTrimmedSearchString(search.keyword);
  const type = readRentalPropertyType(search.type);
  const isActive = readSearchBoolean(search.isActive);
  const province = readTrimmedSearchString(search.province);
  const city = readTrimmedSearchString(search.city);
  const district = readTrimmedSearchString(search.district);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);
  if (keyword) result.keyword = keyword;
  if (type) result.type = type;
  if (isActive !== undefined) result.isActive = isActive;
  if (province) result.province = province;
  if (city) result.city = city;
  if (district) result.district = district;
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;
  return result;
}

function validateRentalTenantsSearch(search: Record<string, unknown>): ListRentalTenantsQuery {
  const result: ListRentalTenantsQuery = {};
  const keyword = readTrimmedSearchString(search.keyword);
  const type = readRentalTenantType(search.type);
  const isActive = readSearchBoolean(search.isActive);
  const documentCountryCode = readSearchString(search.documentCountryCode);
  const documentType = readRentalDocumentType(search.documentType);
  const documentNumber = readSearchRawString(search.documentNumber);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);
  if (keyword) result.keyword = keyword;
  if (type) result.type = type;
  if (isActive !== undefined) result.isActive = isActive;
  if (documentCountryCode) result.documentCountryCode = documentCountryCode;
  if (documentType) result.documentType = documentType;
  if (documentNumber !== undefined) result.documentNumber = documentNumber;
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;
  return result;
}

function validateRentalContractsSearch(search: Record<string, unknown>): ListRentalContractsQuery {
  const result: ListRentalContractsQuery = {};
  const keyword = readTrimmedSearchString(search.keyword);
  const propertyId = readSearchUuid(search.propertyId);
  const tenantId = readSearchUuid(search.tenantId);
  const status = readRentalContractStatus(search.status);
  const startDateFrom = readSearchDate(search.startDateFrom);
  const startDateTo = readSearchDate(search.startDateTo);
  const endDateFrom = readSearchDate(search.endDateFrom);
  const endDateTo = readSearchDate(search.endDateTo);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);

  if (keyword) result.keyword = keyword;
  if (propertyId) result.propertyId = propertyId;
  if (tenantId) result.tenantId = tenantId;
  if (status) result.status = status;
  if (startDateFrom && (!startDateTo || startDateFrom <= startDateTo)) {
    result.startDateFrom = startDateFrom;
  }
  if (startDateTo && (!startDateFrom || startDateFrom <= startDateTo)) {
    result.startDateTo = startDateTo;
  }
  if (endDateFrom && (!endDateTo || endDateFrom <= endDateTo)) {
    result.endDateFrom = endDateFrom;
  }
  if (endDateTo && (!endDateFrom || endDateFrom <= endDateTo)) {
    result.endDateTo = endDateTo;
  }
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;
  return result;
}

export function validateRentalContractCreateSearch(
  search: Record<string, unknown>,
): RentalContractCreateSearch {
  const draftId = readSearchUuid(search.draftId);
  const propertyId = readSearchUuid(search.propertyId);
  const rawSpaceIds = Array.isArray(search.spaceIds)
    ? search.spaceIds
    : search.spaceId === undefined
      ? []
      : [search.spaceId];
  const spaceIds = [
    ...new Set(rawSpaceIds.map(readSearchUuid).filter((value): value is string => Boolean(value))),
  ];
  return {
    ...(draftId ? { draftId } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(propertyId && spaceIds.length ? { spaceIds } : {}),
  };
}

const uuidPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

/** 按服务端 UUID DTO 的相同边界读取资源 ID。 */
function readSearchUuid(value: unknown): string | undefined {
  const normalized = readTrimmedSearchString(value);
  return normalized && uuidPattern.test(normalized) ? normalized : undefined;
}

/** 读取并修剪非空 URL 字符串。 */
function readTrimmedSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** 读取普通交易类型，排除内部期初余额类型。 */
function readTransactionType(value: unknown): ListTransactionsQuery["type"] {
  return typeof value === "string" && transactionTypes.some((type) => type === value)
    ? (value as ListTransactionsQuery["type"])
    : undefined;
}

function readRentalPropertyType(value: unknown): ListRentalPropertiesQuery["type"] {
  const types = [
    "residential_unit",
    "detached_house",
    "apartment_building",
    "commercial_building",
    "complex",
    "shop",
    "office",
    "warehouse",
    "other",
  ] as const;
  return typeof value === "string" && types.some((type) => type === value)
    ? (value as ListRentalPropertiesQuery["type"])
    : undefined;
}

function readRentalTenantType(value: unknown): ListRentalTenantsQuery["type"] {
  return value === "individual" || value === "company" ? value : undefined;
}

function readRentalDocumentType(value: unknown): ListRentalTenantsQuery["documentType"] {
  const types = [
    "national_id",
    "passport",
    "residence_permit",
    "business_registration",
    "other",
  ] as const;
  return typeof value === "string" && types.some((type) => type === value)
    ? (value as ListRentalTenantsQuery["documentType"])
    : undefined;
}

function readRentalContractStatus(value: unknown): ListRentalContractsQuery["status"] {
  const statuses = [
    "draft",
    "upcoming",
    "active",
    "expiring_soon",
    "expired",
    "cancelled",
    "terminated",
  ] as const;
  return typeof value === "string" && statuses.some((status) => status === value)
    ? (value as ListRentalContractsQuery["status"])
    : undefined;
}

function readSearchBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function readSearchString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readSearchRawString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readSearchDate(value: unknown): string | undefined {
  const date = readSearchString(value);

  if (!date || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

function readSearchPage(value: unknown): number | undefined {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

/** 读取服务端允许的分页大小。 */
function readSearchPageSize(value: unknown): number | undefined {
  const pageSize = readSearchPage(value);
  return pageSize !== undefined && pageSize <= 100 ? pageSize : undefined;
}
