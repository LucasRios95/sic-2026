import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotFoundError } from '@shared/errors';

import { parseEmittedNFeXml } from '../../domain/emittedXmlParser';
import { DocumentStatus, FormaEmissao } from '../../domain/nfe-enums';
import { INFeRepository } from '../../repositories/INFeRepository';

interface ImportXmlFile {
  nome: string;
  xmlBase64: string;
}

interface IRequest {
  companyId: string;
  userId?: string;
  arquivos: ImportXmlFile[];
}

interface ImportFailure {
  nome: string;
  erro: string;
}

interface ImportResultItem {
  nome: string;
  chaveAcesso: string;
  numero: string;
  serie: number;
}

interface IResponse {
  importados: ImportResultItem[];
  /** Notas que já existiam SEM XML (ex.: importação legada) e tiveram o XML completado. */
  atualizados: ImportResultItem[];
  duplicados: ImportResultItem[];
  falhas: ImportFailure[];
}

/** cStat que indicam NF-e efetivamente autorizada pela SEFAZ. */
const CSTAT_AUTORIZADA = new Set(['100', '150']);

/**
 * Importa XMLs de NF-e 55 autorizadas emitidas em OUTRO sistema para o histórico de notas
 * emitidas desta empresa. Registra como AUTHORIZED (read-only) com o XML original guardado.
 *
 * Regras:
 *  - só aceita XML cujo emitente é o CNPJ da empresa selecionada (consolidação do próprio
 *    histórico) — XML de terceiros é rejeitado com mensagem clara.
 *  - só aceita NF-e efetivamente autorizada (nfeProc com cStat 100/150).
 *  - deduplica por (série, número): reimportar a mesma nota não duplica.
 *  - NÃO reserva número na série (a numeração veio do sistema de origem).
 */
@injectable()
export class ImportarNFeEmitidaUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('NFeRepository')
    private readonly nfeRepository: INFeRepository,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const companyCnpj = (company.cnpj ?? '').replace(/\D/g, '');
    const response: IResponse = { importados: [], atualizados: [], duplicados: [], falhas: [] };

    for (const arquivo of request.arquivos) {
      try {
        const xml = Buffer.from(arquivo.xmlBase64, 'base64').toString('utf8');
        const parsed = parseEmittedNFeXml(xml);

        if (companyCnpj && parsed.emitenteCnpj && parsed.emitenteCnpj !== companyCnpj) {
          throw new Error(
            `Emitente do XML (${parsed.emitenteCnpj}) difere do CNPJ da empresa selecionada — ` +
              'só é possível importar notas emitidas pela própria empresa.',
          );
        }
        if (!parsed.cStat || !CSTAT_AUTORIZADA.has(parsed.cStat)) {
          throw new Error(
            `NF-e não está autorizada (cStat ${parsed.cStat ?? 'ausente'}). ` +
              'Só importamos XMLs de notas autorizadas (nfeProc, cStat 100/150).',
          );
        }

        const existente = await this.nfeRepository.findByScope(
          company.id,
          '55',
          parsed.serie,
          parsed.numero,
        );
        if (existente) {
          const jaTemXml = !!(existente.xmlAutorizado || existente.xmlAssinado);
          if (!jaTemXml) {
            // Nota já existe mas sem XML (ex.: veio da importação legada só com o resumo).
            // Completamos com o XML real + protocolo — assim passa a ser exportável.
            await this.nfeRepository.update(existente.id, {
              status: DocumentStatus.AUTHORIZED,
              cStat: parsed.cStat,
              xMotivo: parsed.xMotivo,
              protocoloAutorizacao: parsed.protocolo,
              dhAutorizacao: parsed.dhAutorizacao,
              chaveAcesso: parsed.chaveAcesso,
              xmlAutorizado: xml,
            });
            response.atualizados.push({
              nome: arquivo.nome,
              chaveAcesso: parsed.chaveAcesso,
              numero: parsed.numero,
              serie: parsed.serie,
            });
            continue;
          }
          response.duplicados.push({
            nome: arquivo.nome,
            chaveAcesso: parsed.chaveAcesso,
            numero: parsed.numero,
            serie: parsed.serie,
          });
          continue;
        }

        await this.nfeRepository.createAggregate(
          {
            companyId: company.id,
            customerId: null,
            idempotencyKey: `import-${parsed.chaveAcesso}`,
            modelo: '55',
            serie: parsed.serie,
            numero: parsed.numero,
            chaveAcesso: parsed.chaveAcesso,
            dhEmissao: parsed.dhEmissao,
            dhSaiEnt: parsed.dhSaiEnt,
            tipoOperacao: parsed.tipoOperacao,
            finalidade: parsed.finalidade,
            formaEmissao: FormaEmissao.NORMAL,
            ambiente: parsed.ambiente,
            naturezaOperacao: parsed.naturezaOperacao,
            status: DocumentStatus.AUTHORIZED,
            cStat: parsed.cStat,
            xMotivo: parsed.xMotivo,
            protocoloAutorizacao: parsed.protocolo,
            dhAutorizacao: parsed.dhAutorizacao,
            valorProdutos: parsed.totais.valorProdutos,
            valorFrete: parsed.totais.valorFrete,
            valorSeguro: parsed.totais.valorSeguro,
            valorDesconto: parsed.totais.valorDesconto,
            valorOutros: parsed.totais.valorOutros,
            valorTotal: parsed.totais.valorTotal,
            baseIcms: parsed.totais.baseIcms,
            valorIcms: parsed.totais.valorIcms,
            valorIcmsDeson: parsed.totais.valorIcmsDeson,
            baseIcmsST: parsed.totais.baseIcmsST,
            valorIcmsST: parsed.totais.valorIcmsST,
            valorFCP: parsed.totais.valorFCP,
            valorICMSUFDest: parsed.totais.valorICMSUFDest,
            valorICMSUFRemet: parsed.totais.valorICMSUFRemet,
            valorFCPUFDest: parsed.totais.valorFCPUFDest,
            valorIpi: parsed.totais.valorIpi,
            valorPis: parsed.totais.valorPis,
            valorCofins: parsed.totais.valorCofins,
            valorII: parsed.totais.valorII,
            valorTotTrib: parsed.totais.valorTotTrib,
            baseIbsCbs: parsed.totais.baseIbsCbs,
            valorIbs: parsed.totais.valorIbs,
            valorCbs: parsed.totais.valorCbs,
            valorIs: parsed.totais.valorIs,
            operacaoInterestadual: parsed.operacaoInterestadual,
            ufDestino: parsed.ufDestino,
            // Guarda o XML original como autorizado — é o que Download/Exportação devolve.
            xmlAutorizado: xml,
            infCpl: parsed.infCpl,
            infAdFisco: parsed.infAdFisco,
            createdBy: request.userId ?? null,
          },
          parsed.items.map((it) => ({
            numeroItem: it.numeroItem,
            codigo: it.codigo,
            descricao: it.descricao,
            ncm: it.ncm,
            cest: it.cest,
            cfop: it.cfop,
            unidadeComercial: it.unidadeComercial,
            quantidadeComercial: it.quantidadeComercial,
            valorUnitario: it.valorUnitario,
            valorTotal: it.valorTotal,
            valorDesconto: it.valorDesconto,
            valorFrete: it.valorFrete,
            valorSeguro: it.valorSeguro,
            valorOutros: it.valorOutros,
            origemMercadoria: it.origemMercadoria,
            cstIcms: it.cstIcms,
            csosnIcms: it.csosnIcms,
            baseIcms: it.baseIcms,
            aliqIcms: it.aliqIcms,
            valorIcms: it.valorIcms,
            cstIpi: it.cstIpi,
            baseIpi: it.baseIpi,
            aliqIpi: it.aliqIpi,
            valorIpi: it.valorIpi,
            cstPis: it.cstPis,
            basePis: it.basePis,
            aliqPis: it.aliqPis,
            valorPis: it.valorPis,
            cstCofins: it.cstCofins,
            baseCofins: it.baseCofins,
            aliqCofins: it.aliqCofins,
            valorCofins: it.valorCofins,
          })),
          [],
        );

        response.importados.push({
          nome: arquivo.nome,
          chaveAcesso: parsed.chaveAcesso,
          numero: parsed.numero,
          serie: parsed.serie,
        });
      } catch (err) {
        response.falhas.push({
          nome: arquivo.nome,
          erro: err instanceof Error ? err.message : 'Falha desconhecida ao importar XML',
        });
      }
    }

    await this.audit.record({
      action: 'nfe.import_xml',
      entityType: 'company',
      entityId: company.id,
      payload: {
        importados: response.importados.length,
        atualizados: response.atualizados.length,
        duplicados: response.duplicados.length,
        falhas: response.falhas.length,
      },
    });

    return response;
  }
}
