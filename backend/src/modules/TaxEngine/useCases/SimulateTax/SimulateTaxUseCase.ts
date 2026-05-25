import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { IProductRepository } from '@modules/Products/repositories/IProductRepository';
import { IProductTaxRuleRepository } from '@modules/Products/repositories/IProductTaxRuleRepository';
import { BusinessRuleError, NotFoundError } from '@shared/errors';
import { IndicadorIE } from '@shared/types/fiscal-enums';

import { ContextoCalculo } from '../../domain/ContextoCalculo';
import { ResultadoCalculoDocumento } from '../../domain/ResultadoCalculo';
import { MotorTributario } from '../../MotorTributario';

export interface SimulateItem {
  itemId: string;
  productId: string;
  quantidade: string;
  valorUnitario: string;
  valorDesconto?: string;
  valorFrete?: string;
  valorSeguro?: string;
  valorOutros?: string;
  cfop: string;
}

export interface SimulateRequest {
  companyId: string;
  dataOperacao?: string; // ISO 8601; default = agora
  destinatario: {
    uf: string;
    consumidorFinal: boolean;
    indicadorIE: IndicadorIE;
    crt?: string | null;
    suframa?: string | null;
    codigoPais?: string;
  };
  itens: SimulateItem[];
}

@injectable()
export class SimulateTaxUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,

    @inject(MotorTributario)
    private readonly motor: MotorTributario,
  ) {}

  /**
   * Recebe um payload pronto para emissão (itens + cliente) e devolve a memória
   * de cálculo completa SEM persistir nada. Caminho usado pelo frontend para
   * pré-visualização da NF-e em tempo real (TSK-072 do Plano).
   */
  async execute(request: SimulateRequest): Promise<ResultadoCalculoDocumento> {
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    if (request.itens.length === 0) {
      throw new BusinessRuleError('Pelo menos um item é obrigatório', 'EMPTY_ITEMS');
    }

    const dataOperacao = request.dataOperacao ? new Date(request.dataOperacao) : new Date();

    // Resolve produto + regra vigente para cada item de uma vez (carregamento em lote
    // ainda fica como melhoria — para itens repetidos, há cache implícito por productId).
    const cacheRegra = new Map<string, Awaited<ReturnType<IProductTaxRuleRepository['findActiveAt']>>>();
    const cacheProduto = new Map<string, Awaited<ReturnType<IProductRepository['findById']>>>();
    const itensCtx = [];

    for (const item of request.itens) {
      let produto = cacheProduto.get(item.productId);
      if (produto === undefined) {
        produto = await this.productRepository.findById(request.companyId, item.productId);
        cacheProduto.set(item.productId, produto);
      }
      if (!produto) throw new NotFoundError(`Produto ${item.productId} não encontrado`);

      let regra = cacheRegra.get(item.productId);
      if (regra === undefined) {
        regra = await this.taxRuleRepository.findActiveAt(item.productId, dataOperacao);
        cacheRegra.set(item.productId, regra);
      }
      if (!regra) {
        throw new BusinessRuleError(
          `Produto ${produto.codigo} não tem regra tributária vigente em ${dataOperacao.toISOString()}`,
          'NO_ACTIVE_TAX_RULE',
        );
      }

      itensCtx.push({
        itemId: item.itemId,
        productId: produto.id,
        ncm: produto.ncm,
        cest: produto.cest,
        origem: produto.origem,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        valorDesconto: item.valorDesconto,
        valorFrete: item.valorFrete,
        valorSeguro: item.valorSeguro,
        valorOutros: item.valorOutros,
        cfop: item.cfop,
        taxRule: regra,
      });
    }

    const contexto: ContextoCalculo = {
      dataOperacao,
      empresa: {
        companyId: company.id,
        crt: company.crt,
        uf: company.uf,
        flags: {
          usaIcms: company.usaIcms,
          usaIcmsSt: company.usaIcmsSt,
          usaIpi: company.usaIpi,
          usaDifal: company.usaDifal,
          usaFcp: company.usaFcp,
          usaIcmsDesonerado: company.usaIcmsDesonerado,
        },
      },
      destinatario: {
        uf: request.destinatario.uf,
        consumidorFinal: request.destinatario.consumidorFinal,
        indicadorIE: request.destinatario.indicadorIE,
        crt: (request.destinatario.crt ?? null) as ContextoCalculo['destinatario']['crt'],
        suframa: request.destinatario.suframa ?? null,
        codigoPais: request.destinatario.codigoPais ?? '1058',
      },
      itens: itensCtx,
    };

    return this.motor.calcular(contexto);
  }
}
