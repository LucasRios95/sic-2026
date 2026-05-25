import { Router } from 'express';

import { ListCertificatesController } from '@modules/Certificates/useCases/ListCertificates/ListCertificatesController';
import { RevokeCertificateController } from '@modules/Certificates/useCases/RevokeCertificate/RevokeCertificateController';
import { UploadCertificateController } from '@modules/Certificates/useCases/UploadCertificate/UploadCertificateController';
import { requireAuth } from '@shared/infra/http/middlewares/requireAuth';
import { requirePermission } from '@shared/infra/http/middlewares/requirePermission';
import { tenantContext } from '@shared/infra/http/middlewares/tenantContext';
import { validate } from '@shared/infra/http/middlewares/validate';

import { uploadCertificateSchema } from '../validators/certificateValidators';

export const certificatesRoutes = Router();

const uploadController = new UploadCertificateController();
const listController = new ListCertificatesController();
const revokeController = new RevokeCertificateController();

certificatesRoutes.use(requireAuth, tenantContext({ required: true }));

// Listar e visualizar: `vault.read` (ler metadata) ou `admin.full`. O conteúdo
// real do PFX nunca volta na resposta — apenas metadata.
certificatesRoutes.get(
  '/',
  requirePermission('vault.read', 'vault.write', 'admin.full'),
  (req, res) => listController.handle(req, res),
);

// Upload e revogação: `vault.write` ou `admin.full`. Ação sensível, auditada.
certificatesRoutes.post(
  '/',
  requirePermission('vault.write', 'admin.full'),
  validate({ body: uploadCertificateSchema }),
  (req, res) => uploadController.handle(req, res),
);
certificatesRoutes.delete(
  '/:id',
  requirePermission('vault.write', 'admin.full'),
  (req, res) => revokeController.handle(req, res),
);
