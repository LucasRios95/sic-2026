import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ValidationError } from '@shared/errors';

import { inferirTipoEEscopo } from '../../domain/cfop-enums';
import { Cfop } from '../../infra/typeorm/entities/Cfop';
import { ICfopRepository } from '../../repositories/ICfopRepository';

interface IRequest {
  codigo: string;
  descricao: string;
  grupo?: string | null;
  geraCreditoPisCofins?: boolean;
  ativo?: boolean;
  observacoes?: string | null;
}

/**
 * Cria ou atualiza um CFOP no catálogo. tipoOperacao + escopo são DERIVADOS do
 * primeiro dígito do código — o caller não escolhe (evita inconsistência entre
 * "5102" e tipo=ENTRADA, por exemplo).
 */
@injectable()
export class UpsertCfopUseCase {
  constructor(
    @inject('CfopRepository')
    private readonly repo: ICfopRepository,
    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(req: IRequest): Promise<Cfop> {
    if (!/^[123567]\d{3}$/.test(req.codigo)) {
      throw new ValidationError(
        `CFOP ${req.codigo} inválido — deve ter 4 dígitos começando com 1, 2, 3, 5, 6 ou 7`,
        { field: 'codigo' },
      );
    }
    const { tipo, escopo } = inferirTipoEEscopo(req.codigo);
    const saved = await this.repo.upsert({
      codigo: req.codigo,
      descricao: req.descricao,
      tipoOperacao: tipo,
      escopo,
      grupo: req.grupo ?? null,
      geraCreditoPisCofins: req.geraCreditoPisCofins ?? false,
      ativo: req.ativo ?? true,
      observacoes: req.observacoes ?? null,
    });
    await this.audit.record({
      action: 'cfop.upsert',
      entityType: 'cfop',
      entityId: saved.id,
      payload: { codigo: saved.codigo, ativo: saved.ativo },
    });
    return saved;
  }
}
