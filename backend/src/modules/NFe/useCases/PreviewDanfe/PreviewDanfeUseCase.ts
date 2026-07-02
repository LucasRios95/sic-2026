import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { IProductRepository } from '@modules/Products/repositories/IProductRepository';
import { IProductTaxRuleRepository } from '@modules/Products/repositories/IProductTaxRuleRepository';
import { ContextoCalculo } from '@modules/TaxEngine/domain/ContextoCalculo';
import { MotorTributario } from '@modules/TaxEngine/MotorTributario';
import { NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { ChaveAcesso } from '../../domain/ChaveAcesso';
import { FinalidadeNFe, TipoOperacao } from '../../domain/nfe-enums';
import { renderChaveAcessoBarcode, renderConsultaQrCode } from '../../infra/pdf/barcode';
import { DanfeDocument, type DanfeTransporte } from '../../infra/pdf/DanfeDocument';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { NFeItem } from '../../infra/typeorm/entities/NFeItem';
import { aplicarOverrideIcms } from '../EmitirNFe/EmitirNFeUseCase';

/**
 * Gera um DANFE de PRÉ-VISUALIZAÇÃO (espelho) a partir dos dados que o faturista está
 * digitando — sem reservar número, persistir, assinar ou transmitir. Reaproveita o mesmo
 * `DanfeDocument` do DANFE oficial e o `MotorTributario`, então o layout e os valores de
 * imposto batem com o que será emitido.
 *
 * Diferenças em relação ao DANFE real:
 *  - chave de acesso é fictícia (número/cNF placeholder) só para renderizar o código de
 *    barras/QR — a chave definitiva só existe após a autorização.
 *  - o documento recebe tarja "PRÉ-VISUALIZAÇÃO — SEM VALOR FISCAL".
 *  - é tolerante: itens sem produto resolvível são ignorados; se o cálculo tributário
 *    falhar (regra ausente/config incompleta), cai para valores sem imposto em vez de
 *    quebrar — a prévia sempre renderiza.
 */
@injectable()
export class PreviewDanfeUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('CustomerRepository')
    private readonly customerRepository: ICustomerRepository,

    @inject('ProductRepository')
    private readonly productRepository: IProductRepository,

    @inject('ProductTaxRuleRepository')
    private readonly taxRuleRepository: IProductTaxRuleRepository,

    @inject(MotorTributario)
    private readonly motorTributario: MotorTributario,
  ) {}

  async execute(request: PreviewDanfeRequest): Promise<Buffer> {
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');
    const customer = await this.customerRepository.findById(
      request.companyId,
      request.customerId,
    );
    if (!customer) throw new NotFoundError('Cliente não encontrado');

    const dhEmissao = new Date();
    const operacaoInterestadual = customer.uf !== company.uf;
    const tipoOperacao = request.tipoOperacao ?? TipoOperacao.SAIDA;

    // Resolve produto + regra tributária de cada item. Itens sem produto (o faturista
    // ainda não escolheu) são simplesmente ignorados na prévia.
    const resolved: ResolvedItem[] = [];
    for (const item of request.itens) {
      const product = await this.productRepository.findById(company.id, item.productId);
      if (!product) continue;
      const cfop = ajustarCfopOperacao(item.cfop, operacaoInterestadual, tipoOperacao);
      const taxRuleVigente = await this.taxRuleRepository.findActiveAt(item.productId, dhEmissao);
      resolved.push({ item, product, cfop, taxRuleVigente });
    }

    // Tenta o cálculo tributário completo. Só roda quando TODOS os itens têm regra vigente
    // (o motor precisa da regra por item); caso contrário usa o fallback sem imposto.
    let calculo: Awaited<ReturnType<MotorTributario['calcular']>> | null = null;
    if (resolved.length > 0 && resolved.every((r) => r.taxRuleVigente)) {
      try {
        const contexto: ContextoCalculo = {
          dataOperacao: dhEmissao,
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
            uf: customer.uf,
            consumidorFinal: customer.consumidorFinal,
            indicadorIE: customer.indicadorIE,
            crt: customer.crtDestinatario ?? null,
            suframa: customer.suframa,
            codigoPais: customer.codigoPais ?? '1058',
          },
          itens: resolved.map((r) => ({
            itemId: `item-${r.item.numeroItem}`,
            productId: r.product.id,
            ncm: r.product.ncm,
            cest: r.product.cest,
            origem: r.product.origem,
            quantidade: r.item.quantidade,
            valorUnitario: r.item.valorUnitario,
            valorDesconto: r.item.valorDesconto,
            valorFrete: r.item.valorFrete,
            cfop: r.cfop,
            taxRule: aplicarOverrideIcms(
              r.taxRuleVigente!,
              r.item,
              company.crt,
              r.product.codigo,
            ),
          })),
        };
        calculo = await this.motorTributario.calcular(contexto);
      } catch (err) {
        // Config tributária incompleta durante a digitação não deve quebrar a prévia.
        logger.debug({ err }, 'Preview DANFE: cálculo tributário falhou, usando fallback');
        calculo = null;
      }
    }

    // Monta itens em memória (subconjunto de campos que o DanfeDocument lê).
    const items = resolved.map<NFeItem>((r, idx) => {
      const c = calculo?.itens[idx];
      const ruleAplicada = r.taxRuleVigente
        ? aplicarOverrideIcms(r.taxRuleVigente, r.item, company.crt, r.product.codigo)
        : null;
      const valorTotal = c?.valorTotal ?? fallbackValorTotal(r.item);
      return {
        numeroItem: r.item.numeroItem,
        codigo: r.product.codigo,
        descricao: r.item.descricao ?? r.product.descricao,
        ncm: r.product.ncm,
        cfop: r.cfop,
        unidadeComercial: r.item.unidadeComercial,
        quantidadeComercial: r.item.quantidade,
        valorUnitario: r.item.valorUnitario,
        valorTotal,
        origemMercadoria: r.product.origem,
        cstIcms: ruleAplicada?.cstIcms ?? r.item.cstIcms ?? null,
        csosnIcms: ruleAplicada?.csosnIcms ?? r.item.csosnIcms ?? null,
        baseIcms: c?.baseIcms ?? null,
        aliqIcms: c?.aliqIcms ?? null,
        valorIcms: c?.valorIcms ?? null,
        aliqIpi: c?.aliqIpi ?? null,
        valorIpi: c?.valorIpi ?? null,
      } as unknown as NFeItem;
    });

    // Totais: do motor quando disponível; senão soma simples dos produtos.
    const somaProdutos = items
      .reduce((acc, it) => acc + Number(it.valorTotal), 0)
      .toFixed(2);
    const t = calculo?.totais;
    const nfe = {
      companyId: company.id,
      customerId: customer.id,
      numero: request.numero ?? '0',
      serie: request.serie,
      modelo: '55',
      chaveAcesso: this.buildPlaceholderChave(company, request, dhEmissao),
      dhEmissao,
      dhSaiEnt: null,
      tipoOperacao,
      finalidade: request.finalidade ?? FinalidadeNFe.NORMAL,
      naturezaOperacao: request.naturezaOperacao,
      ambiente: company.ambienteSefaz,
      status: 'DRAFT',
      protocoloAutorizacao: null,
      dhAutorizacao: null,
      valorProdutos: t?.valorProdutos ?? somaProdutos,
      valorFrete: t?.valorFrete ?? '0.00',
      valorSeguro: t?.valorSeguro ?? '0.00',
      valorDesconto: t?.valorDesconto ?? '0.00',
      valorOutros: t?.valorOutros ?? '0.00',
      valorTotal: t?.valorTotal ?? somaProdutos,
      baseIcms: '0.00',
      valorIcms: t?.valorIcms ?? '0.00',
      baseIcmsST: '0.00',
      valorIcmsST: t?.valorIcmsST ?? '0.00',
      valorIpi: t?.valorIpi ?? '0.00',
      baseIbsCbs: t?.baseIbsCbs ?? '0.00',
      valorIbs: t?.valorIbs ?? '0.00',
      valorCbs: t?.valorCbs ?? '0.00',
      valorIs: t?.valorIs ?? '0.00',
      infCpl: request.infCpl ?? null,
      infAdFisco: null,
      items,
    } as unknown as NFe & { items: NFeItem[] };

    const barcodePng = await renderChaveAcessoBarcode(nfe.chaveAcesso!);
    const qrCodePng = await renderConsultaQrCode(nfe.chaveAcesso!);

    return renderToBuffer(
      React.createElement(DanfeDocument, {
        nfe,
        emitente: company,
        destinatario: customer,
        barcodePng,
        qrCodePng,
        preview: true,
        modalidadeFrete: request.modalidadeFrete,
        consumidorFinal: customer.consumidorFinal,
        transporte: request.transporte,
      }),
    );
  }

  /**
   * Chave de acesso FICTÍCIA só para renderizar o código de barras/QR na prévia. Usa o
   * número informado (ou 1) e um cNF aleatório. Não tem valor fiscal — a chave real só
   * é composta na emissão.
   */
  private buildPlaceholderChave(
    company: NonNullable<Awaited<ReturnType<ICompanyRepository['findById']>>>,
    request: PreviewDanfeRequest,
    dhEmissao: Date,
  ): string {
    const numero = Number(request.numero ?? '1');
    return ChaveAcesso.build({
      ufEmitente: company.uf,
      anoEmissao: dhEmissao.getUTCFullYear(),
      mesEmissao: dhEmissao.getUTCMonth() + 1,
      cnpjEmitente: company.cnpj,
      modelo: '55',
      serie: request.serie,
      numero: Number.isFinite(numero) && numero > 0 ? numero : 1,
      tipoEmissao: 1,
      codigoNumerico: ChaveAcesso.generateCodigoNumerico(),
    }).value;
  }
}

interface ResolvedItem {
  item: PreviewDanfeItemInput;
  product: NonNullable<Awaited<ReturnType<IProductRepository['findById']>>>;
  cfop: string;
  taxRuleVigente: Awaited<ReturnType<IProductTaxRuleRepository['findActiveAt']>>;
}

/** Total do item sem imposto (fallback): qtd × unitário − desconto + frete. */
function fallbackValorTotal(item: PreviewDanfeItemInput): string {
  const bruto = Number(item.quantidade) * Number(item.valorUnitario);
  const desconto = Number(item.valorDesconto ?? '0');
  const frete = Number(item.valorFrete ?? '0');
  return Math.max(bruto - desconto + frete, 0).toFixed(2);
}

/**
 * Ajusta o 1º dígito do CFOP conforme a operação (estadual↔interestadual), igual à emissão.
 * Códigos de exterior (3xxx/7xxx) e formatos inválidos ficam intocados.
 */
function ajustarCfopOperacao(
  cfop: string,
  operacaoInterestadual: boolean,
  tipoOp: TipoOperacao,
): string {
  if (!/^[1256]\d{3}$/.test(cfop)) return cfop;
  const restante = cfop.slice(1);
  if (tipoOp === TipoOperacao.SAIDA) {
    return (operacaoInterestadual ? '6' : '5') + restante;
  }
  return (operacaoInterestadual ? '2' : '1') + restante;
}

export interface PreviewDanfeItemInput {
  numeroItem: number;
  productId: string;
  descricao?: string;
  cfop: string;
  unidadeComercial: string;
  quantidade: string;
  valorUnitario: string;
  valorDesconto?: string;
  valorFrete?: string;
  cstIcms?: string;
  csosnIcms?: string;
}

export interface PreviewDanfeRequest {
  companyId: string;
  customerId: string;
  serie: number;
  numero?: string;
  naturezaOperacao: string;
  tipoOperacao?: TipoOperacao;
  finalidade?: FinalidadeNFe;
  modalidadeFrete?: number;
  transporte?: DanfeTransporte;
  itens: PreviewDanfeItemInput[];
  infCpl?: string;
}
