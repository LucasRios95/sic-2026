import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Company } from '@modules/Companies/infra/typeorm/entities/Company';
import { BaseEntity } from '@shared/infra/typeorm/BaseEntity';

/**
 * Parâmetro tributário genérico versionado por chave/JSON. Aceita qualquer estrutura
 * para evitar mudanças de schema quando uma nova alíquota da Reforma é publicada
 * (PRD Seção 9 / Roadmap de conformidade).
 *
 * Exemplos de chaves:
 *  - "ibs.aliquota.padrao"                  → valor: { aliquota: "0.10", modo: "ANO_TESTE" }
 *  - "cbs.aliquota.padrao"                  → valor: { aliquota: "0.90", modo: "ANO_TESTE" }
 *  - "ibs.aliquota.uf.SP"                   → valor: { aliquota: "11.5" }
 *  - "pis_cofins.encerramento"              → valor: { dataExtincao: "2027-01-01" }
 *
 * Suporta escopo por empresa (companyId não nulo) ou global (companyId NULL).
 * Empresa específica sobrescreve o global na mesma chave/vigência.
 */
@Entity('tax_parameters')
@Index('idx_tax_parameters_lookup', ['chave', 'validFrom', 'validTo'])
@Index('uq_tax_parameters_scope_chave_from', ['companyId', 'chave', 'validFrom'], {
  unique: true,
})
export class TaxParameter extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'company_id' })
  company?: Company | null;

  @Column({ type: 'varchar', length: 120 })
  chave!: string;

  /** JSON: número, string, ou objeto com múltiplos campos. */
  @Column({ type: 'jsonb' })
  valor!: unknown;

  /** Referência à Nota Técnica/dispositivo (RT 2025.002, NT 007/2026, etc.). */
  @Column({ name: 'fonte_norma', type: 'varchar', length: 200, nullable: true })
  fonteNorma?: string | null;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;
}
