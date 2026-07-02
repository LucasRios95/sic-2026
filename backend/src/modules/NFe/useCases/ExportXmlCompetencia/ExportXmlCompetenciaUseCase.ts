import JSZip from 'jszip';
import { inject, injectable } from 'tsyringe';

import { BusinessRuleError } from '@shared/errors';

import { INFeRepository } from '../../repositories/INFeRepository';

interface IRequest {
  companyId: string;
  ano: number;
  mes: number; // 1-12
}

interface IResponse {
  zip: Buffer;
  filename: string;
  total: number;
}

/**
 * Exporta, num único ZIP, os XMLs de todas as NF-e emitidas numa competência (mês/ano).
 * Cada arquivo é nomeado pela chave de acesso. Só entram notas com XML (AUTHORIZED/CANCELLED).
 */
@injectable()
export class ExportXmlCompetenciaUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,
  ) {}

  async execute({ companyId, ano, mes }: IRequest): Promise<IResponse> {
    if (mes < 1 || mes > 12) {
      throw new BusinessRuleError('Mês inválido (1-12)', 'INVALID_COMPETENCIA');
    }
    // Intervalo [início do mês, início do mês seguinte) — cobre o mês inteiro em UTC.
    const from = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(ano, mes, 1, 0, 0, 0, 0) - 1);

    const rows = await this.nfeRepository.listXmlByPeriodo(companyId, from, to);
    if (rows.length === 0) {
      throw new BusinessRuleError(
        `Nenhuma NF-e com XML encontrada na competência ${String(mes).padStart(2, '0')}/${ano}.`,
        'NO_NFE_IN_PERIODO',
      );
    }

    const zip = new JSZip();
    for (const row of rows) {
      zip.file(`${row.chaveAcesso}.xml`, row.xml);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return {
      zip: buffer,
      filename: `nfe-emitidas-${ano}-${String(mes).padStart(2, '0')}.zip`,
      total: rows.length,
    };
  }
}
