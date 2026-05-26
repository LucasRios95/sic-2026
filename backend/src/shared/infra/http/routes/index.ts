import { Router } from 'express';

import { auditoriaRoutes } from '@modules/Auditoria/infra/http/routes/auditoria.routes';
import { authRoutes } from '@modules/Auth/infra/http/routes/auth.routes';
import { certificatesRoutes } from '@modules/Certificates/infra/http/routes/certificates.routes';
import { cfopsRoutes } from '@modules/Cfop/infra/http/routes/cfops.routes';
import { companiesRoutes } from '@modules/Companies/infra/http/routes/companies.routes';
import { lookupRoutes } from '@modules/Lookup/infra/http/routes/lookup.routes';
import { customersRoutes } from '@modules/Customers/infra/http/routes/customers.routes';
import { nfeRoutes } from '@modules/NFe/infra/http/routes/nfe.routes';
import { recepcaoRoutes } from '@modules/NFeRecepcao/infra/http/routes/recepcao.routes';
import { ncmsRoutes } from '@modules/Ncm/infra/http/routes/ncms.routes';
import { notificationsRoutes } from '@modules/Notifications/infra/http/routes/notifications.routes';
import { sefazHealthRoutes } from '@modules/SefazHealth/infra/http/routes/sefazHealth.routes';
import { productsRoutes } from '@modules/Products/infra/http/routes/products.routes';
import { servicesRoutes } from '@modules/Services/infra/http/routes/services.routes';
import { suppliersRoutes } from '@modules/Suppliers/infra/http/routes/suppliers.routes';
import { taxRoutes } from '@modules/TaxEngine/infra/http/routes/tax.routes';
import { usersRoutes } from '@modules/Users/infra/http/routes/users.routes';

import { healthRoutes } from './health.routes';
import { storageRoutes } from './storage.routes';

export const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/companies', companiesRoutes);
router.use('/users', usersRoutes);
router.use('/customers', customersRoutes);
router.use('/suppliers', suppliersRoutes);
router.use('/products', productsRoutes);
router.use('/services', servicesRoutes);
router.use('/tax', taxRoutes);
router.use('/nfe', nfeRoutes);
router.use('/fiscal/recebidos', recepcaoRoutes);
router.use('/certificates', certificatesRoutes);
router.use('/cfops', cfopsRoutes);
router.use('/ncms', ncmsRoutes);
router.use('/lookup', lookupRoutes);
router.use('/sefaz-health', sefazHealthRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/audit-logs', auditoriaRoutes);
// Rota pública (sem JWT) — autentica pelo HMAC do token de URL assinada.
router.use('/storage', storageRoutes);
