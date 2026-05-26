/**
 * Catálogo central de permissões do sistema. Códigos seguem o padrão
 * `<namespace>.<acao>`, com o namespace coincidindo com o módulo de negócio.
 *
 * Esta lista evolui módulo a módulo — entradas comentadas indicam o que está reservado
 * para fases futuras (NF-e, NFS-e, financeiro, etc.) e ainda não tem implementação.
 */
export interface PermissionSeed {
  code: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionSeed[] = [
  // --- Acesso "super" do administrador ---
  { code: 'admin.full', description: 'Acesso administrativo total (gestor do tenant)' },

  // --- Multiempresa / usuários ---
  { code: 'company.create', description: 'Criar empresa (CNPJ) no tenant' },
  { code: 'company.read', description: 'Visualizar empresas do tenant' },
  { code: 'company.update', description: 'Editar empresa' },

  { code: 'user.create', description: 'Criar usuário no tenant' },
  { code: 'user.read', description: 'Visualizar usuários do tenant' },
  { code: 'user.update', description: 'Editar usuário' },
  { code: 'user.role.assign', description: 'Atribuir papéis a usuários' },

  // --- Cadastros base (EP-03) ---
  { code: 'catalog.read', description: 'Visualizar clientes, fornecedores, produtos e serviços' },
  { code: 'catalog.write', description: 'Criar/editar/desativar cadastros base' },
  { code: 'tax-rule.write', description: 'Adicionar regras tributárias versionadas em produtos/serviços' },

  // --- Fiscal (Fase 1+, reservado) ---
  { code: 'nfe.emit', description: 'Emitir NF-e modelo 55' },
  { code: 'nfe.cancel', description: 'Cancelar NF-e (dentro do prazo legal)' },
  { code: 'nfe.cce', description: 'Emitir Carta de Correção Eletrônica (CC-e)' },
  { code: 'nfe.read', description: 'Consultar NF-e emitidas' },
  { code: 'nfe.contingencia.epec', description: 'Acionar contingência EPEC manualmente (EP-06c)' },
  { code: 'nfse.emit', description: 'Emitir NFS-e' },
  { code: 'nfse.cancel', description: 'Cancelar NFS-e' },
  { code: 'entrada.manifest', description: 'Manifestar destinatário em DF-e recebido' },
  { code: 'entrada.escriturar', description: 'Escriturar nota de entrada (gerar título/estoque)' },

  // --- Financeiro (Fase 2+, reservado) ---
  { code: 'fin.receivable.read', description: 'Visualizar contas a receber' },
  { code: 'fin.receivable.write', description: 'Lançar/editar contas a receber' },
  { code: 'fin.payable.read', description: 'Visualizar contas a pagar' },
  { code: 'fin.payable.write', description: 'Lançar/editar contas a pagar' },

  // --- Configuração fiscal ---
  { code: 'tax.parameter.read', description: 'Visualizar parâmetros tributários' },
  { code: 'tax.parameter.write', description: 'Editar parâmetros tributários' },

  // --- Infraestrutura compartilhada (EP-05) ---
  { code: 'audit.read', description: 'Consultar trilha de auditoria do tenant' },
  { code: 'vault.read', description: 'Recuperar certificado digital do cofre para uso fiscal' },
  { code: 'vault.write', description: 'Gerenciar certificados digitais (upload, revogação)' },
];

export interface RoleSeed {
  name: string;
  description: string;
  permissions: string[];
}

/**
 * Papéis pré-definidos (PRD 5.2). Construídos por código para serem idempotentes —
 * rodar o seed n vezes sempre produz o mesmo resultado.
 */
export const SYSTEM_ROLES: RoleSeed[] = [
  {
    name: 'Administrador',
    description: 'Acesso total à empresa, incluindo administração de usuários e parâmetros',
    permissions: ['admin.full'],
  },
  {
    name: 'Gestor',
    description: 'Acesso de leitura geral; visão consolidada de vendas, compras, margem e caixa',
    permissions: [
      'company.read',
      'user.read',
      'catalog.read',
      'nfe.read',
      'fin.receivable.read',
      'fin.payable.read',
    ],
  },
  {
    name: 'Faturista',
    description: 'Emite NF-e/NFS-e, cancela e emite CC-e',
    permissions: [
      'catalog.read',
      'nfe.emit',
      'nfe.cancel',
      'nfe.cce',
      'nfe.read',
      'nfe.contingencia.epec',
      'nfse.emit',
      'nfse.cancel',
    ],
  },
  {
    name: 'Fiscal',
    description: 'Valida tributação, classifica itens, gera relatórios e ajusta parâmetros fiscais',
    permissions: [
      'catalog.read',
      'catalog.write',
      'tax-rule.write',
      'nfe.read',
      'entrada.manifest',
      'entrada.escriturar',
      'tax.parameter.read',
      'tax.parameter.write',
      'audit.read',
    ],
  },
  {
    name: 'Compras',
    description: 'Importa e confere notas de entrada, vincula a pedidos de compra; gerencia fornecedores',
    permissions: ['catalog.read', 'catalog.write', 'entrada.manifest', 'entrada.escriturar'],
  },
  {
    name: 'Financeiro',
    description: 'Gere títulos, baixas, conciliação bancária e fluxo de caixa',
    permissions: [
      'catalog.read',
      'fin.receivable.read',
      'fin.receivable.write',
      'fin.payable.read',
      'fin.payable.write',
    ],
  },
];
