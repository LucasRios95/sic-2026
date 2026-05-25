import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { ICustomerRepository } from '@modules/Customers/repositories/ICustomerRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { IProductRepository } from '@modules/Products/repositories/IProductRepository';
import { IProductTaxRuleRepository } from '@modules/Products/repositories/IProductTaxRuleRepository';
import { ContextoCalculo } from '@modules/TaxEngine/domain/ContextoCalculo';
import { MotorTributario } from '@modules/TaxEngine/MotorTributario';
import { ICertificateVault } from '@shared/container/providers/CertificateVault/ICertificateVault';
import { BusinessRuleError, IntegrationError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { ChaveAcesso } from '../../domain/ChaveAcesso';
import {
  DocumentStatus,
  FinalidadeNFe,
  FormaEmissao,
  TipoOperacao,
} from '../../domain/nfe-enums';
import { NFeDocument, NFeItem as NFeItemDoc } from '../../domain/NFeDocument';
import { NFeXmlBuilder } from '../../domain/NFeXmlBuilder';
import { NFe } from '../../infra/typeorm/entities/NFe';
import { SefazSoapClient } from '../../infra/sefaz/SefazSoapClient';
import { NFeSigner } from '../../infra/signing/NFeSigner';
import { INFeRepository } from '../../repositories/INFeRepository';
import { INumberingSeriesRepository } from '../../repositories/INumberingSeriesRepository';

/**
 * Use case central da Fase 1a — emite uma NF-e modelo 55 fim-a-fim.
 *
 * Fluxo:
 *  1. Idempotência — se já existe NFe com a mesma `idempotencyKey`, retorna ela.
 *  2. Carrega empresa, cliente, produtos + regras tributárias vigentes.
 *  3. Reserva número de forma atômica via NumberingSeries (lock pessimista).
 *  4. Compõe ChaveAcesso (44 dígitos + DV mod11).
 *  5. Chama MotorTributario para calcular todos os tributos por item + totais.
 *  6. Persiste NFe agregada (cabeçalho + items + pagamentos) com status PENDING.
 *  7. Compõe XML via NFeXmlBuilder.
 *  8. Assina via NFeSigner (xml-crypto + C14N + RSA-SHA256, round-trip incluído).
 *  9. Transmite via SefazSoapClient.
 * 10. Atualiza NFe com status final (AUTHORIZED/REJECTED), protocolo, xmlAutorizado.
 * 11. AuditService.record + NotificationService em caso de rejeição.
 *
 * Pontos de não-determinismo cobertos:
 *  - Falha de transmissão (timeout, 5xx): NFe fica em PROCESSING. Worker de reconciliação
 *    (TSK-112, fora desta entrega) consulta a SEFAZ por protocolo e atualiza depois.
 *  - Concorrência na reserva de número: lock pessimista impede números duplicados.
 *  - Cliente repetindo a emissão (refresh do navegador): idempotência por chave evita
 *    consumir 2 números para a mesma intenção.
 */
@injectable()
export class EmitirNFeUseCase {
  constructor(
    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject('NumberingSeriesRepository')
    private readonly numberingRepository: INumberingSeriesRepository,

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

    @inject(NFeSigner)
    private readonly signer: NFeSigner,

    @inject(SefazSoapClient)
    private readonly soap: SefazSoapClient,

    @inject('CertificateVault')
    private readonly vault: ICertificateVault,

    @inject(AuditService)
    private readonly audit: AuditService,

    @inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async execute(request: EmitirNFeRequest): Promise<EmitirNFeResponse> {
    // 1) Idempotência
    const existing = await this.nfeRepository.findByIdempotencyKey(request.idempotencyKey);
    if (existing) {
      return { nfe: existing, alreadyEmitted: true };
    }

    // 2) Carrega entidades referenciadas
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');
    const customer = await this.customerRepository.findById(request.companyId, request.customerId);
    if (!customer) throw new NotFoundError('Cliente não encontrado');

    const dhEmissao = request.dhEmissao ?? new Date();
    const ano = dhEmissao.getUTCFullYear();
    const mes = dhEmissao.getUTCMonth() + 1;

    // 3) Reserva número de forma atômica
    await this.numberingRepository.ensureSeries(company.id, '55', request.serie);
    const allocated = await this.numberingRepository.allocateNumber(company.id, '55', request.serie);

    // 4) Compõe ChaveAcesso
    const codigoNumerico = ChaveAcesso.generateCodigoNumerico();
    const chave = ChaveAcesso.build({
      ufEmitente: company.uf,
      anoEmissao: ano,
      mesEmissao: mes,
      cnpjEmitente: company.cnpj,
      modelo: '55',
      serie: allocated.serie,
      numero: Number(allocated.numero),
      tipoEmissao: 1,
      codigoNumerico,
    });

    // 5) Motor tributário — calcula tributos por item
    const itensCtx = [];
    for (const item of request.itens) {
      const product = await this.productRepository.findById(company.id, item.productId);
      if (!product) throw new NotFoundError(`Produto ${item.productId} não encontrado`);
      const taxRule = await this.taxRuleRepository.findActiveAt(item.productId, dhEmissao);
      if (!taxRule) {
        throw new BusinessRuleError(
          `Produto ${product.codigo} sem regra tributária vigente em ${dhEmissao.toISOString()}`,
          'NO_ACTIVE_TAX_RULE',
        );
      }
      itensCtx.push({
        itemId: `item-${item.numeroItem}`,
        productId: product.id,
        ncm: product.ncm,
        cest: product.cest,
        origem: product.origem,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        valorDesconto: item.valorDesconto,
        valorFrete: item.valorFrete,
        valorSeguro: item.valorSeguro,
        valorOutros: item.valorOutros,
        cfop: item.cfop,
        taxRule,
        // Mantém referência para a persistência depois.
        __sourceItem: { ...item, product, taxRule },
      });
    }

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
      // Cast porque enriquecemos com __sourceItem.
      itens: itensCtx as unknown as ContextoCalculo['itens'],
    };
    const calculo = await this.motorTributario.calcular(contexto);

    // 6) Persiste NFe + items + pagamentos com status PENDING (sem XML ainda)
    const operacaoInterestadual = customer.uf !== company.uf;
    const ufDestino = operacaoInterestadual ? customer.uf : null;
    const t = calculo.totais;

    // Composição NFeDocument (para o builder) — separa o que vai no XML do que persistimos.
    const nfeDoc = this.buildNfeDocument(
      chave.value,
      codigoNumerico,
      dhEmissao,
      company,
      customer,
      request,
      calculo,
      itensCtx,
    );
    const xmlUnsigned = new NFeXmlBuilder().build(nfeDoc);

    const persisted = await this.nfeRepository.createAggregate(
      {
        companyId: company.id,
        customerId: customer.id,
        idempotencyKey: request.idempotencyKey,
        modelo: '55',
        serie: allocated.serie,
        numero: allocated.numero,
        chaveAcesso: chave.value,
        dhEmissao,
        dhSaiEnt: request.dhSaiEnt ?? null,
        tipoOperacao: request.tipoOperacao ?? TipoOperacao.SAIDA,
        finalidade: request.finalidade ?? FinalidadeNFe.NORMAL,
        formaEmissao: FormaEmissao.NORMAL,
        ambiente: company.ambienteSefaz,
        naturezaOperacao: request.naturezaOperacao,
        status: DocumentStatus.PENDING,
        valorProdutos: t.valorProdutos,
        valorFrete: t.valorFrete,
        valorSeguro: t.valorSeguro,
        valorDesconto: t.valorDesconto,
        valorOutros: t.valorOutros,
        valorTotal: t.valorTotal,
        baseIcms: '0',
        valorIcms: t.valorIcms,
        valorIcmsDeson: t.valorIcmsDeson,
        baseIcmsST: '0',
        valorIcmsST: t.valorIcmsST,
        valorFCP: t.valorFCP,
        valorFCPST: '0',
        valorFCPSTRet: '0',
        valorICMSUFDest: t.valorICMSUFDest,
        valorICMSUFRemet: t.valorICMSUFRemet,
        valorFCPUFDest: t.valorFCPUFDest,
        valorIpi: t.valorIpi,
        valorPis: t.valorPis,
        valorCofins: t.valorCofins,
        valorII: '0',
        valorTotTrib: '0',
        baseIbsCbs: t.baseIbsCbs,
        valorIbs: t.valorIbs,
        valorCbs: t.valorCbs,
        valorIs: t.valorIs,
        operacaoInterestadual,
        ufDestino,
        infCpl: request.infCpl ?? null,
        infAdFisco: request.infAdFisco ?? null,
        createdBy: request.userId ?? null,
      },
      itensCtx.map((it, idx) => {
        const r = calculo.itens[idx];
        const src = (it as unknown as { __sourceItem: typeof request.itens[number] & { product: { codigo: string; ncm: string; cest?: string | null }; }; }).__sourceItem;
        return {
          numeroItem: src.numeroItem,
          codigo: src.product.codigo,
          descricao: src.descricao ?? src.product.codigo,
          ncm: src.product.ncm,
          cest: src.product.cest ?? null,
          cfop: src.cfop,
          unidadeComercial: src.unidadeComercial,
          quantidadeComercial: src.quantidade,
          valorUnitario: src.valorUnitario,
          valorTotal: r.valorTotal,
          valorDesconto: src.valorDesconto ?? '0',
          valorFrete: src.valorFrete ?? '0',
          valorSeguro: src.valorSeguro ?? '0',
          valorOutros: src.valorOutros ?? '0',
          productId: src.productId,
          // tributos
          baseIcms: r.baseIcms ?? null,
          aliqIcms: r.aliqIcms ?? null,
          valorIcms: r.valorIcms ?? null,
          motDesICMS: r.motDesICMS ?? null,
          valorIcmsDeson: r.valorIcmsDeson ?? null,
          baseIcmsST: r.baseIcmsST ?? null,
          aliqIcmsST: r.aliqIcmsST ?? null,
          valorIcmsST: r.valorIcmsST ?? null,
          pMVAST: r.pMVAST ?? null,
          modBCST: r.modBCST ?? null,
          baseFCP: r.baseFCP ?? null,
          pFCP: r.pFCP ?? null,
          valorFCP: r.valorFCP ?? null,
          baseICMSUFDest: r.baseICMSUFDest ?? null,
          pICMSUFDest: r.pICMSUFDest ?? null,
          pICMSInter: r.pICMSInter ?? null,
          valorICMSUFDest: r.valorICMSUFDest ?? null,
          valorICMSUFRemet: r.valorICMSUFRemet ?? null,
          baseFCPUFDest: r.baseFCPUFDest ?? null,
          pFCPUFDest: r.pFCPUFDest ?? null,
          valorFCPUFDest: r.valorFCPUFDest ?? null,
          baseIpi: r.baseIpi ?? null,
          aliqIpi: r.aliqIpi ?? null,
          valorIpi: r.valorIpi ?? null,
          basePis: r.basePis ?? null,
          aliqPis: r.aliqPis ?? null,
          valorPis: r.valorPis ?? null,
          baseCofins: r.baseCofins ?? null,
          aliqCofins: r.aliqCofins ?? null,
          valorCofins: r.valorCofins ?? null,
          cstIbsCbs: r.cstIbsCbs ?? null,
          cClassTrib: r.cClassTrib ?? null,
          baseIbsCbs: r.baseIbsCbs ?? null,
          aliqIbs: r.aliqIbs ?? null,
          valorIbs: r.valorIbs ?? null,
          aliqCbs: r.aliqCbs ?? null,
          valorCbs: r.valorCbs ?? null,
        };
      }),
      request.pagamentos.map((p) => ({ meio: p.meio, valor: p.valor, bandeira: p.bandeira })),
    );

    // 7-9) Assina e transmite (caminho síncrono nesta versão)
    let finalNFe = persisted;
    if (request.certificateVaultRef && request.transmitirImediatamente !== false) {
      try {
        finalNFe = await this.signAndTransmit(persisted, xmlUnsigned, chave.value, request);
      } catch (err) {
        // Falha na transmissão deixa a NFe em PROCESSING; o worker de reconciliação
        // (TSK-112, próxima sessão) consultará por protocolo. Logamos como warning,
        // não como erro porque o caller PODE escolher reemitir.
        logger.warn({ err, nfeId: persisted.id }, 'Falha ao transmitir; NFe em PROCESSING');
        finalNFe = await this.nfeRepository.update(persisted.id, {
          status: DocumentStatus.PROCESSING,
          xmlAssinado: xmlUnsigned, // guarda mesmo sem assinatura — útil para debug
        });
        if (err instanceof IntegrationError) {
          await this.notifications.warn({
            companyId: company.id,
            userId: request.userId ?? null,
            category: 'nfe.emission.processing',
            title: `NF-e ${allocated.numero} em processamento`,
            message: `Falha transitória na transmissão. ${err.message}`,
            link: `/fiscal/nfe/${persisted.id}`,
          });
        }
      }
    } else {
      // Sem certificateVaultRef: persiste como PENDING — fluxo que algumas implementações
      // usam (separar persistência de transmissão para retentativa manual).
      finalNFe = await this.nfeRepository.update(persisted.id, { xmlAssinado: xmlUnsigned });
    }

    await this.audit.record({
      action: 'nfe.emit',
      entityType: 'nfe',
      entityId: finalNFe.id,
      payload: {
        chaveAcesso: chave.value,
        status: finalNFe.status,
        cStat: finalNFe.cStat,
        valorTotal: finalNFe.valorTotal,
      },
    });

    if (finalNFe.status === DocumentStatus.REJECTED) {
      await this.notifications.error({
        companyId: company.id,
        userId: request.userId ?? null,
        category: 'nfe.rejection',
        title: `NF-e ${allocated.numero} rejeitada`,
        message: `cStat ${finalNFe.cStat}: ${finalNFe.xMotivo}`,
        link: `/fiscal/nfe/${finalNFe.id}`,
      });
    }

    return { nfe: finalNFe, alreadyEmitted: false };
  }

  private async signAndTransmit(
    persisted: NFe,
    xmlUnsigned: string,
    chaveAcesso: string,
    request: EmitirNFeRequest,
  ): Promise<NFe> {
    const cert = await this.vault.retrieve(request.certificateVaultRef!);
    const signedXml = this.signer.sign(xmlUnsigned, cert.content, cert.password, `NFe${chaveAcesso}`);

    // Envelope nfeAutorizacao4: precisa do <enviNFe> wrapping a <NFe> assinada.
    const enviNFe = [
      '<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      '<idLote>1</idLote>',
      '<indSinc>1</indSinc>', // 1 = processamento síncrono
      signedXml.replace(/^<\?xml[^>]+\?>\s*/, ''), // remove o declaration interno
      '</enviNFe>',
    ].join('');

    const company = await this.companyRepository.findById(persisted.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada (race condition)');

    const result = await this.soap.call({
      companyId: persisted.companyId,
      uf: company.uf,
      ambiente: persisted.ambiente,
      service: 'NFeAutorizacao4',
      bodyXml: enviNFe,
      certificateVaultRef: request.certificateVaultRef!,
      nfeId: persisted.id,
    });

    // Interpreta retorno. cStat 100 = autorizada; 110/301/302 = denegada; demais = rejeitada.
    const cStat = result.cStat ?? null;
    const xMotivo = result.xMotivo ?? null;
    const finalStatus = mapCStatToStatus(cStat);

    return this.nfeRepository.update(persisted.id, {
      status: finalStatus,
      cStat,
      xMotivo,
      xmlAssinado: signedXml,
      xmlAutorizado:
        finalStatus === DocumentStatus.AUTHORIZED ? result.responseXml : null,
      dhAutorizacao: finalStatus === DocumentStatus.AUTHORIZED ? new Date() : null,
      protocoloAutorizacao: extractProtocolo(result.responseXml),
    });
  }

  /**
   * Compõe o NFeDocument que o NFeXmlBuilder consome. Apartado para deixar o execute()
   * legível — a montagem é mecânica (mapeamento 1:1 entre Customer/Product/itens e o
   * shape do builder).
   */
  private buildNfeDocument(
    chaveAcesso: string,
    codigoNumerico: string,
    dhEmissao: Date,
    company: NonNullable<Awaited<ReturnType<ICompanyRepository['findById']>>>,
    customer: NonNullable<Awaited<ReturnType<ICustomerRepository['findById']>>>,
    request: EmitirNFeRequest,
    calculo: Awaited<ReturnType<MotorTributario['calcular']>>,
    itensCtx: { __sourceItem: EmitirNFeRequest['itens'][number] & { product: { codigo: string; ncm: string; cest?: string | null }; descricao?: string } }[],
  ): NFeDocument {
    const operacaoInterestadual = customer.uf !== company.uf;
    return {
      chaveAcesso,
      identificacao: {
        numero: Number(chaveAcesso.slice(25, 34)),
        serie: request.serie,
        modelo: '55',
        naturezaOperacao: request.naturezaOperacao,
        tipoOperacao: request.tipoOperacao ?? TipoOperacao.SAIDA,
        finalidade: request.finalidade ?? FinalidadeNFe.NORMAL,
        formaEmissao: FormaEmissao.NORMAL,
        ambiente: company.ambienteSefaz,
        dhEmissao,
        dhSaiEnt: request.dhSaiEnt,
        codigoNumerico,
        idDest: operacaoInterestadual ? 2 : 1,
      },
      emitente: {
        cnpj: company.cnpj,
        razaoSocial: company.razaoSocial,
        nomeFantasia: company.nomeFantasia,
        ie: company.ie,
        im: company.im,
        cnae: company.cnae,
        crt: company.crt,
        endereco: {
          logradouro: company.logradouro,
          numero: company.numero,
          complemento: company.complemento ?? null,
          bairro: company.bairro,
          codigoMunicipioIbge: company.codigoMunicipioIbge,
          municipio: company.municipio,
          uf: company.uf,
          cep: company.cep,
        },
      },
      destinatario: {
        tipoPessoa: customer.tipoPessoa,
        cnpjCpf: customer.cnpjCpf,
        nome: customer.nomeRazao,
        ie: customer.ie,
        indicadorIE: customer.indicadorIE,
        email: customer.email,
        suframa: customer.suframa,
        consumidorFinal: customer.consumidorFinal,
        endereco: {
          logradouro: customer.logradouro,
          numero: customer.numero,
          complemento: customer.complemento ?? null,
          bairro: customer.bairro,
          codigoMunicipioIbge: customer.codigoMunicipioIbge,
          municipio: customer.municipio,
          uf: customer.uf,
          cep: customer.cep,
        },
      },
      itens: itensCtx.map<NFeItemDoc>((it, idx) => {
        const r = calculo.itens[idx];
        const src = it.__sourceItem;
        return {
          numero: src.numeroItem,
          codigo: src.product.codigo,
          descricao: src.descricao ?? src.product.codigo,
          ncm: src.product.ncm,
          cest: src.product.cest ?? null,
          cfop: src.cfop,
          unidadeComercial: src.unidadeComercial,
          quantidadeComercial: src.quantidade,
          valorUnitario: src.valorUnitario,
          valorTotal: r.valorTotal,
          unidadeTributavel: src.unidadeComercial,
          quantidadeTributavel: src.quantidade,
          valorUnitarioTrib: src.valorUnitario,
          origem: 0,
          baseIcms: r.baseIcms,
          aliqIcms: r.aliqIcms,
          valorIcms: r.valorIcms,
          valorIcmsDeson: r.valorIcmsDeson,
          motDesICMS: r.motDesICMS,
          baseIcmsST: r.baseIcmsST,
          aliqIcmsST: r.aliqIcmsST,
          valorIcmsST: r.valorIcmsST,
          pMVAST: r.pMVAST,
          modBCST: r.modBCST,
          baseFCP: r.baseFCP,
          pFCP: r.pFCP,
          valorFCP: r.valorFCP,
          baseICMSUFDest: r.baseICMSUFDest,
          pICMSUFDest: r.pICMSUFDest,
          pICMSInter: r.pICMSInter,
          valorICMSUFDest: r.valorICMSUFDest,
          valorICMSUFRemet: r.valorICMSUFRemet,
          baseFCPUFDest: r.baseFCPUFDest,
          pFCPUFDest: r.pFCPUFDest,
          valorFCPUFDest: r.valorFCPUFDest,
          baseIpi: r.baseIpi,
          aliqIpi: r.aliqIpi,
          valorIpi: r.valorIpi,
          basePis: r.basePis,
          aliqPis: r.aliqPis,
          valorPis: r.valorPis,
          baseCofins: r.baseCofins,
          aliqCofins: r.aliqCofins,
          valorCofins: r.valorCofins,
          cstIbsCbs: r.cstIbsCbs,
          cClassTrib: r.cClassTrib,
          baseIbsCbs: r.baseIbsCbs,
          aliqIbs: r.aliqIbs,
          valorIbs: r.valorIbs,
          aliqCbs: r.aliqCbs,
          valorCbs: r.valorCbs,
          cstIs: r.cstIs,
          aliqIs: r.aliqIs,
          valorIs: r.valorIs,
        };
      }),
      totais: {
        valorProdutos: calculo.totais.valorProdutos,
        valorDesconto: calculo.totais.valorDesconto,
        valorFrete: calculo.totais.valorFrete,
        valorSeguro: calculo.totais.valorSeguro,
        valorOutros: calculo.totais.valorOutros,
        valorTotal: calculo.totais.valorTotal,
        baseIcms: '0.00',
        valorIcms: calculo.totais.valorIcms,
        valorIcmsDeson: calculo.totais.valorIcmsDeson,
        baseIcmsST: '0.00',
        valorIcmsST: calculo.totais.valorIcmsST,
        valorFCP: calculo.totais.valorFCP,
        valorFCPST: '0.00',
        valorFCPSTRet: '0.00',
        valorICMSUFDest: calculo.totais.valorICMSUFDest,
        valorICMSUFRemet: calculo.totais.valorICMSUFRemet,
        valorFCPUFDest: calculo.totais.valorFCPUFDest,
        valorIpi: calculo.totais.valorIpi,
        valorPis: calculo.totais.valorPis,
        valorCofins: calculo.totais.valorCofins,
        valorII: '0.00',
        valorTotTrib: '0.00',
        baseIbsCbs: calculo.totais.baseIbsCbs,
        valorIbs: calculo.totais.valorIbs,
        valorCbs: calculo.totais.valorCbs,
        valorIs: calculo.totais.valorIs,
      },
      transporte: { modalidadeFrete: request.modalidadeFrete ?? 9 },
      pagamentos: request.pagamentos.map((p) => ({
        meio: p.meio,
        valor: p.valor,
        bandeira: p.bandeira,
      })),
      informacoesAdicionais: request.infCpl,
      informacoesFisco: request.infAdFisco,
    };
  }
}

// === Tipos do contrato externo do use case ===

export interface EmitirNFeItemInput {
  numeroItem: number;
  productId: string;
  descricao?: string;
  cfop: string;
  unidadeComercial: string;
  quantidade: string;
  valorUnitario: string;
  valorDesconto?: string;
  valorFrete?: string;
  valorSeguro?: string;
  valorOutros?: string;
}

export interface EmitirNFePagamentoInput {
  meio: string;
  valor: string;
  bandeira?: string;
}

export interface EmitirNFeRequest {
  /** Idempotência: mesmo valor + duas chamadas = mesma NFe. */
  idempotencyKey: string;
  companyId: string;
  customerId: string;
  serie: number;
  naturezaOperacao: string;
  dhEmissao?: Date;
  dhSaiEnt?: Date;
  tipoOperacao?: TipoOperacao;
  finalidade?: FinalidadeNFe;
  modalidadeFrete?: 0 | 1 | 2 | 3 | 4 | 9;
  itens: EmitirNFeItemInput[];
  pagamentos: EmitirNFePagamentoInput[];
  infCpl?: string;
  infAdFisco?: string;
  /** vaultRef do cert A1. Quando omitido, persiste como PENDING sem transmitir. */
  certificateVaultRef?: string;
  transmitirImediatamente?: boolean;
  userId?: string;
}

export interface EmitirNFeResponse {
  nfe: NFe;
  alreadyEmitted: boolean;
}

/** Mapeia cStat da SEFAZ para o nosso DocumentStatus. */
function mapCStatToStatus(cStat: string | null): DocumentStatus {
  if (!cStat) return DocumentStatus.PROCESSING;
  if (cStat === '100') return DocumentStatus.AUTHORIZED;
  if (cStat === '105') return DocumentStatus.PROCESSING;
  if (['110', '205', '301', '302'].includes(cStat)) return DocumentStatus.DENIED;
  return DocumentStatus.REJECTED;
}

/** Extrai número do protocolo de autorização da resposta. Tolerante a XML parcial. */
function extractProtocolo(responseXml: string): string | null {
  const match = responseXml.match(/<nProt>(\d+)<\/nProt>/);
  return match ? match[1] : null;
}
