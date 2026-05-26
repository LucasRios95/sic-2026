import { inject, injectable } from 'tsyringe';

import { AuditService } from '@modules/Auditoria/AuditService';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { BusinessRuleError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

import { OrigemCaptura, TipoDFe } from '../../domain/nfe-recepcao-enums';
import { NFeDistribuicaoDFeService } from '../../infra/sefaz/NFeDistribuicaoDFeService';
import { parseResumoNFe } from '../../infra/sefaz/sefazPayload';
import { INsuCursorRepository } from '../../repositories/INsuCursorRepository';
import { IReceivedDocumentRepository } from '../../repositories/IReceivedDocumentRepository';

interface IRequest {
  companyId: string;
  certificateVaultRef: string;
  /** Máximo de iterações por execução. Default 10 — cada uma traz até 50 docs. */
  maxIterations?: number;
}

interface IResponse {
  iterations: number;
  capturedDocs: number;
  finalCursor: string;
  lastCStat: string | null;
}

const ORIGEM_NSU = 'sefaz_nfe_cte';

/**
 * Sincroniza documentos recebidos contra o CNPJ da empresa via Distribuição DF-e da SEFAZ.
 * PRD ENT-02. Padrão:
 *  - Carrega o cursor `sefaz_nfe_cte` da empresa.
 *  - Itera até esgotar a fila SEFAZ (cStat 138 = sem novidades) ou bater `maxIterations`.
 *  - Para cada `docZip` retornado: descompacta, identifica schema (resNFe/procNFe), grava
 *    em `received_documents` com upsert por chave.
 *  - Avança o cursor após cada lote (mesmo que processamento individual falhe — para não
 *    repetir documentos já recebidos).
 *  - Notifica inbox quando há documentos novos.
 *
 * Idempotência: re-execução com o mesmo cursor é segura — `upsertByChave` não duplica.
 *
 * Esta versão processa apenas `resNFe`. Eventos (`resEvento`) e CT-e ficam para iteração
 * futura — registramos no AuditLog mas não persistimos como documento.
 */
@injectable()
export class SincronizarRecebidosUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('NsuCursorRepository')
    private readonly cursorRepository: INsuCursorRepository,

    @inject('ReceivedDocumentRepository')
    private readonly documentRepository: IReceivedDocumentRepository,

    @inject(NFeDistribuicaoDFeService)
    private readonly distribService: NFeDistribuicaoDFeService,

    @inject(AuditService)
    private readonly audit: AuditService,

    @inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');
    if (!company.cnpj) {
      throw new BusinessRuleError('Empresa sem CNPJ cadastrado', 'COMPANY_MISSING_CNPJ');
    }

    const cursor = await this.cursorRepository.findOrCreate(company.id, ORIGEM_NSU);
    let currentNSU = cursor.cursorValue;
    let iterations = 0;
    let capturedDocs = 0;
    let lastCStat: string | null = null;
    const maxIterations = request.maxIterations ?? 10;

    while (iterations < maxIterations) {
      const result = await this.distribService.consultarPorNSU({
        companyId: company.id,
        ambiente: company.ambienteSefaz,
        ufEmitente: company.uf,
        cnpjEmpresa: company.cnpj,
        ultNSU: currentNSU,
        certificateVaultRef: request.certificateVaultRef,
      });
      iterations += 1;
      lastCStat = result.cStat;

      // cStat 138 = "Não existe documento(s) para o interessado pesquisado" — fim do lote.
      if (result.cStat === '138' || result.documentos.length === 0) {
        // Ainda atualiza last_fetched_at para registrar a checagem.
        await this.cursorRepository.advance(cursor.id, currentNSU, result.cStat);
        break;
      }

      // Persiste cada documento. Erros individuais não interrompem o lote.
      for (const doc of result.documentos) {
        try {
          await this.persistDocumento(company.id, doc);
          capturedDocs += 1;
        } catch (err) {
          logger.warn(
            { err, nsu: doc.nsu, schema: doc.schema },
            'Falha ao persistir docZip — pulando',
          );
        }
      }

      // Avança o cursor para o maior NSU retornado neste lote.
      if (result.maxNSU && result.maxNSU > currentNSU) {
        currentNSU = result.maxNSU;
        await this.cursorRepository.advance(cursor.id, currentNSU, result.cStat);
      }

      // Critério de parada antecipada: maxNSU == ultNSU significa "não há mais documentos
      // após esse ponto". Mais explícito que esperar o próximo cStat 138.
      if (result.ultNSU && result.maxNSU && result.maxNSU === result.ultNSU) {
        break;
      }
    }

    await this.audit.record({
      action: 'recepcao.sync',
      entityType: 'company',
      entityId: company.id,
      payload: { iterations, capturedDocs, finalCursor: currentNSU, lastCStat },
    });

    if (capturedDocs > 0) {
      await this.notifications.info({
        companyId: company.id,
        category: 'recepcao.new-documents',
        title: `${capturedDocs} documento(s) recebido(s)`,
        message: 'Novos documentos fiscais aguardando manifestação no inbox.',
        link: '/fiscal/recebidos',
      });
    }

    return { iterations, capturedDocs, finalCursor: currentNSU, lastCStat };
  }

  /**
   * Decide o que fazer com cada docZip recebido. Por enquanto, processa apenas o resumo
   * de NF-e (`resNFe`). Outras schemas — `procNFe` (XML completo após manifestação),
   * `resEvento`, `procEventoNFe` — são logadas como warning e ignoradas; entram em
   * iteração futura com tabelas próprias para eventos recebidos.
   */
  private async persistDocumento(
    companyId: string,
    doc: { nsu: string; schema: string; xml: string },
  ): Promise<void> {
    if (doc.schema === 'resNFe' || doc.xml.includes('<resNFe')) {
      const resumo = parseResumoNFe(doc.xml);
      await this.documentRepository.upsertByChave({
        companyId,
        tipo: TipoDFe.NFE_55,
        chaveAcesso: resumo.chaveAcesso,
        numero: resumo.numero,
        serie: resumo.serie,
        emitenteCnpj: resumo.emitenteCnpj,
        emitenteNome: resumo.emitenteNome,
        emitenteUf: resumo.ufEmitente ?? null,
        dhEmissao: resumo.dhEmissao,
        valorTotal: resumo.valorTotal,
        nsu: doc.nsu,
        resumoXml: doc.xml,
      });
      return;
    }
    logger.info(
      { schema: doc.schema, nsu: doc.nsu },
      'Schema de docZip não tratado nesta versão — registrado e ignorado',
    );
  }
}
