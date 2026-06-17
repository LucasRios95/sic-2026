import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { useAuthStore } from '@/features/auth/auth-store';
import { CertificatesPage } from '@/pages/CertificatesPage';
import { CfopFormPage } from '@/pages/CfopFormPage';
import { CfopsPage } from '@/pages/CfopsPage';
import { NcmsPage } from '@/pages/NcmsPage';
import { CompaniesPage } from '@/pages/CompaniesPage';
import { CompanyFormPage } from '@/pages/CompanyFormPage';
import { CustomerFormPage } from '@/pages/CustomerFormPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { IcmsStMvaPage } from '@/pages/IcmsStMvaPage';
import { InboxRecebidosPage } from '@/pages/InboxRecebidosPage';
import { InutilizacaoPage } from '@/pages/InutilizacaoPage';
import { InterstateAliquotsPage } from '@/pages/InterstateAliquotsPage';
import { LoginPage } from '@/pages/LoginPage';
import { UserFormPage } from '@/pages/UserFormPage';
import { UsersPage } from '@/pages/UsersPage';
import { NFeDetailsPage } from '@/pages/NFeDetailsPage';
import { NFeListPage } from '@/pages/NFeListPage';
import { NFeNewPage } from '@/pages/NFeNewPage';
import { ProductFormPage } from '@/pages/ProductFormPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ReceivedDocumentDetailsPage } from '@/pages/ReceivedDocumentDetailsPage';
import { SelectCompanyPage } from '@/pages/SelectCompanyPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TaxBenefitsPage } from '@/pages/TaxBenefitsPage';
import { TaxParameterFormPage } from '@/pages/TaxParameterFormPage';
import { TaxParametersPage } from '@/pages/TaxParametersPage';
import { AppLayout } from '@/shared/components/AppLayout';

const GLOBAL_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Guarda que aplica a páginas autenticadas. Quando há múltiplas empresas e nenhuma
 * selecionada, redireciona para o seletor. Centralizamos aqui para todas as rotas
 * dentro do AppLayout reaproveitarem.
 */
function requireAuthAndCompany(): void {
  const { accessToken, user, selectedCompanyId } = useAuthStore.getState();
  if (!accessToken) throw redirect({ to: '/login' });

  const real = user?.accessibleCompanyIds.filter((id) => id !== GLOBAL_COMPANY_ID) ?? [];
  if (real.length > 1 && !selectedCompanyId) {
    throw redirect({ to: '/select-company' });
  }
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    const token = useAuthStore.getState().accessToken;
    if (token) throw redirect({ to: '/dashboard' });
  },
});

const selectCompanyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/select-company',
  component: SelectCompanyPage,
  beforeLoad: () => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) throw redirect({ to: '/login' });
  },
});

/**
 * Rota wrapper que aplica o AppLayout a todas as páginas autenticadas. As rotas filhas
 * (dashboard, NFe, cadastros, certificados) ficam dentro dela e ganham layout uniforme.
 */
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app-layout',
  component: AppLayout,
  beforeLoad: requireAuthAndCompany,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const certificatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/certificates',
  component: CertificatesPage,
});

const companiesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/companies',
  component: CompaniesPage,
});

const companyNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/companies/new',
  component: CompanyFormPage,
});

const companyEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/companies/$id/edit',
  component: CompanyFormPage,
});

const taxParamsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/tax-params',
  component: TaxParametersPage,
});

const taxParamNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/tax-params/new',
  component: TaxParameterFormPage,
});

const taxParamEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/tax-params/$id/edit',
  component: TaxParameterFormPage,
});

const taxInterstateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/tax-interstate',
  component: InterstateAliquotsPage,
});

const taxIcmsStRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/tax-icms-st',
  component: IcmsStMvaPage,
});

const taxBenefitsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/tax-benefits',
  component: TaxBenefitsPage,
});

const cfopsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/cfops',
  component: CfopsPage,
});

const cfopNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/cfops/new',
  component: CfopFormPage,
});

const cfopEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/cfops/$id/edit',
  component: CfopFormPage,
});

const ncmsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/ncms',
  component: NcmsPage,
});

const customersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/cadastros/customers',
  component: CustomersPage,
});

const customerNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/cadastros/customers/new',
  component: CustomerFormPage,
});

const customerEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/cadastros/customers/$id/edit',
  component: CustomerFormPage,
});

const productsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/cadastros/products',
  component: ProductsPage,
});

const productNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/cadastros/products/new',
  component: ProductFormPage,
});

const productEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/cadastros/products/$id/edit',
  component: ProductFormPage,
});

const usersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/users',
  component: UsersPage,
});

const userNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/users/new',
  component: UserFormPage,
});

const userEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/users/$id/edit',
  component: UserFormPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/configuracoes',
  component: SettingsPage,
});

const nfeListRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fiscal/nfe',
  component: NFeListPage,
});

const nfeNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fiscal/nfe/new',
  component: NFeNewPage,
  // `reissueFrom=<id>` permite abrir o form pre-populado com os dados de uma NF-e
  // existente (REJECTED/PENDING/DENIED). Validacao ad-hoc — o id eh apenas string opcional.
  validateSearch: (search: Record<string, unknown>) => ({
    reissueFrom: typeof search.reissueFrom === 'string' ? search.reissueFrom : undefined,
  }),
});

const nfeDetailsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fiscal/nfe/$id',
  component: NFeDetailsPage,
});

const nfeInutilizarRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fiscal/nfe/inutilizar',
  component: InutilizacaoPage,
});

const inboxRecebidosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fiscal/recebidos',
  component: InboxRecebidosPage,
});

const receivedDocumentDetailsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fiscal/recebidos/$id',
  component: ReceivedDocumentDetailsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  selectCompanyRoute,
  appLayoutRoute.addChildren([
    dashboardRoute,
    certificatesRoute,
    companiesRoute,
    companyNewRoute,
    companyEditRoute,
    usersRoute,
    userNewRoute,
    userEditRoute,
    settingsRoute,
    customersRoute,
    customerNewRoute,
    customerEditRoute,
    productsRoute,
    productNewRoute,
    productEditRoute,
    nfeListRoute,
    nfeNewRoute,
    nfeInutilizarRoute,
    nfeDetailsRoute,
    inboxRecebidosRoute,
    receivedDocumentDetailsRoute,
    taxParamsRoute,
    taxParamNewRoute,
    taxParamEditRoute,
    taxInterstateRoute,
    taxIcmsStRoute,
    taxBenefitsRoute,
    cfopsRoute,
    cfopNewRoute,
    cfopEditRoute,
    ncmsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
