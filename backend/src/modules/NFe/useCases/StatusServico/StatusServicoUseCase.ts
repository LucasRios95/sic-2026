import { inject, injectable } from 'tsyringe';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { BusinessRuleError, NotFoundError } from '@shared/errors';

import { UF_CODIGO } from '../../domain/nfe-enums';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';

interface IRequest {
  companyId: string;
  certificateVaultRef: string;
  /** UF a consultar — default = UF da empresa. */
  uf?: string;
  /** Ambiente — default = ambiente configurado na empresa. */
  ambiente?: AmbienteSefaz;
  contingenciaSvc?: boolean;
}

interface IResponse {
  cStat?: string;
  xMotivo?: string;
  durationMs: number;
  endpointUrl: string;
  ambiente: AmbienteSefaz;
}

/**
 * StatusServico — primeiro caso de uso da integração SEFAZ. Equivalente a um "ping
 * fiscal": valida que o certificado está no cofre, a conexão HTTPS+mTLS funciona, o
 * envelope SOAP está bem-formado e a SEFAZ responde.
 *
 * Usado como smoke test no setup de uma empresa nova (PRD Fluxo Crítico 6, onboarding):
 * antes de habilitar emissão real, faturista clica "testar conexão SEFAZ" e este use
 * case roda. cStat 107 = "Serviço em Operação" significa tudo verde.
 *
 * NÃO emite NF-e — isso é EmitirNFeUseCase no EP-07.
 */
@injectable()
export class StatusServicoUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const uf = request.uf ?? company.uf;
    const cUF = UF_CODIGO[uf];
    if (!cUF) {
      throw new BusinessRuleError(`UF ${uf} sem código IBGE conhecido`, 'INVALID_UF');
    }
    const ambiente = request.ambiente ?? company.ambienteSefaz;

    // Corpo do serviço NFeStatusServico4: payload mínimo com cUF + tpAmb.
    const bodyXml = [
      '<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      '<tpAmb>',
      ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2',
      '</tpAmb>',
      `<cUF>${cUF}</cUF>`,
      '<xServ>STATUS</xServ>',
      '</consStatServ>',
    ].join('');

    const result = await this.soap.call({
      companyId: company.id,
      uf,
      ambiente,
      service: 'NFeStatusServico4',
      bodyXml,
      certificateVaultRef: request.certificateVaultRef,
      contingenciaSvc: request.contingenciaSvc,
    });

    return {
      cStat: result.cStat,
      xMotivo: result.xMotivo,
      durationMs: result.durationMs,
      endpointUrl: result.endpointUrl,
      ambiente,
    };
  }
}
