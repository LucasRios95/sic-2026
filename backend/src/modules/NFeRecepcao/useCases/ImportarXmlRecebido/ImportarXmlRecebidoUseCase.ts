import { inject, injectable } from 'tsyringe';

import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { AuditService } from '@modules/Auditoria/AuditService';
import { NotFoundError } from '@shared/errors';

import { OrigemCaptura } from '../../domain/nfe-recepcao-enums';
import { parseReceivedXml } from '../../infra/sefaz/receivedXmlParsers';
import { IReceivedDocumentRepository } from '../../repositories/IReceivedDocumentRepository';

interface ImportXmlFile {
  nome: string;
  xmlBase64: string;
}

interface IRequest {
  companyId: string;
  arquivos: ImportXmlFile[];
}

interface ImportFailure {
  nome: string;
  erro: string;
}

interface ImportWarning {
  nome: string;
  chaveAcesso: string;
  aviso: string;
}

interface IResponse {
  importados: number;
  duplicados: number;
  falhas: ImportFailure[];
  avisos: ImportWarning[];
}

@injectable()
export class ImportarXmlRecebidoUseCase {
  constructor(
    @inject('CompanyRepository')
    private readonly companyRepository: ICompanyRepository,

    @inject('ReceivedDocumentRepository')
    private readonly documentRepository: IReceivedDocumentRepository,

    @inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    const company = await this.companyRepository.findById(request.companyId);
    if (!company) throw new NotFoundError('Empresa não encontrada');

    const companyCnpj = company.cnpj?.replace(/\D/g, '') ?? '';
    const response: IResponse = {
      importados: 0,
      duplicados: 0,
      falhas: [],
      avisos: [],
    };

    for (const arquivo of request.arquivos) {
      try {
        const xml = Buffer.from(arquivo.xmlBase64, 'base64').toString('utf8');
        const parsed = parseReceivedXml(xml);
        const existing = await this.documentRepository.findByChave(
          company.id,
          parsed.chaveAcesso,
        );

        if (
          companyCnpj &&
          parsed.destinatarioCnpj &&
          parsed.destinatarioCnpj !== companyCnpj
        ) {
          response.avisos.push({
            nome: arquivo.nome,
            chaveAcesso: parsed.chaveAcesso,
            aviso: 'CNPJ do destinatário difere do CNPJ da empresa selecionada',
          });
        }

        await this.documentRepository.upsertByChave({
          companyId: company.id,
          tipo: parsed.tipo,
          chaveAcesso: parsed.chaveAcesso,
          numero: parsed.numero,
          serie: parsed.serie,
          emitenteCnpj: parsed.emitenteCnpj,
          emitenteNome: parsed.emitenteNome,
          emitenteUf: parsed.emitenteUf,
          dhEmissao: parsed.dhEmissao,
          valorTotal: parsed.valorTotal,
          xmlCompleto: xml,
          origemCaptura: OrigemCaptura.UPLOAD_XML,
        });

        if (existing) response.duplicados += 1;
        else response.importados += 1;
      } catch (err) {
        response.falhas.push({
          nome: arquivo.nome,
          erro: err instanceof Error ? err.message : 'Falha desconhecida ao importar XML',
        });
      }
    }

    await this.audit.record({
      action: 'recepcao.import_xml',
      entityType: 'company',
      entityId: company.id,
      payload: response,
    });

    return response;
  }
}
