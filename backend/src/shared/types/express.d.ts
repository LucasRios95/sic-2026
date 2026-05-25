// Augmentação do Request do Express com os campos populados pelos middlewares
// requireAuth e tenantContext. Centralizar aqui evita import circular e mantém
// o tipo consistente em controllers/middlewares.

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      tenantId: string;
      email: string;
      accessibleCompanyIds: string[];
      permissions: string[];
      roles: string[];
    }

    interface Request {
      user?: AuthenticatedUser;
      companyId?: string;
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

export {};
