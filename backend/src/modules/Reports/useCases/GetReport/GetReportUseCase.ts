import { injectable } from 'tsyringe';

import { DocumentStatus } from '@modules/NFe/domain/nfe-enums';
import { ReceivedDocumentStatus } from '@modules/NFeRecepcao/domain/nfe-recepcao-enums';
import { appDataSource } from '@shared/infra/typeorm/data-source';

export type ReportType = 'faturamento' | 'apuracao' | 'entradas' | 'rankings';

interface IRequest {
  companyId: string;
  type: ReportType;
  from: Date;
  to: Date;
}

export interface ReportResponse {
  type: ReportType;
  from: string;
  to: string;
  totals: Record<string, string | number>;
  rows: Array<Record<string, string | number | null>>;
}

@injectable()
export class GetReportUseCase {
  async execute(request: IRequest): Promise<ReportResponse> {
    switch (request.type) {
      case 'faturamento':
        return this.faturamento(request);
      case 'apuracao':
        return this.apuracao(request);
      case 'entradas':
        return this.entradas(request);
      case 'rankings':
        return this.rankings(request);
      default:
        return assertNever(request.type);
    }
  }

  private async faturamento(request: IRequest): Promise<ReportResponse> {
    const base = appDataSource
      .createQueryBuilder()
      .from('nfes', 'nfe')
      .where('nfe.company_id = :companyId', { companyId: request.companyId })
      .andWhere('nfe.status = :status', { status: DocumentStatus.AUTHORIZED })
      .andWhere('nfe.dh_emissao BETWEEN :from AND :to', {
        from: request.from,
        to: request.to,
      });

    const totals = await base
      .clone()
      .select('COUNT(*)::int', 'documentos')
      .addSelect('COALESCE(SUM(nfe.valor_total), 0)::text', 'valorTotal')
      .addSelect('COALESCE(SUM(nfe.valor_produtos), 0)::text', 'valorProdutos')
      .getRawOne<Record<string, string | number>>();

    const porCliente = await base
      .clone()
      .leftJoin('customers', 'customer', 'customer.id = nfe.customer_id')
      .select('COALESCE(customer.nome_razao, \'Sem cliente vinculado\')', 'grupo')
      .addSelect('COUNT(*)::int', 'documentos')
      .addSelect('COALESCE(SUM(nfe.valor_total), 0)::text', 'valorTotal')
      .groupBy('grupo')
      .orderBy('COALESCE(SUM(nfe.valor_total), 0)', 'DESC')
      .limit(50)
      .getRawMany<Record<string, string | number | null>>();

    const porCfop = await appDataSource
      .createQueryBuilder()
      .from('nfe_items', 'item')
      .innerJoin('nfes', 'nfe', 'nfe.id = item.nfe_id')
      .where('nfe.company_id = :companyId', { companyId: request.companyId })
      .andWhere('nfe.status = :status', { status: DocumentStatus.AUTHORIZED })
      .andWhere('nfe.dh_emissao BETWEEN :from AND :to', {
        from: request.from,
        to: request.to,
      })
      .select('item.cfop', 'grupo')
      .addSelect('COUNT(DISTINCT nfe.id)::int', 'documentos')
      .addSelect('COALESCE(SUM(item.valor_total), 0)::text', 'valorTotal')
      .groupBy('item.cfop')
      .orderBy('COALESCE(SUM(item.valor_total), 0)', 'DESC')
      .limit(50)
      .getRawMany<Record<string, string | number | null>>();

    return this.response(request, totals ?? {}, [
      ...porCliente.map((row) => ({ dimensao: 'cliente', ...row })),
      ...porCfop.map((row) => ({ dimensao: 'cfop', ...row })),
    ]);
  }

  private async apuracao(request: IRequest): Promise<ReportResponse> {
    const totals = await appDataSource
      .createQueryBuilder()
      .from('nfes', 'nfe')
      .where('nfe.company_id = :companyId', { companyId: request.companyId })
      .andWhere('nfe.status = :status', { status: DocumentStatus.AUTHORIZED })
      .andWhere('nfe.dh_emissao BETWEEN :from AND :to', {
        from: request.from,
        to: request.to,
      })
      .select('COUNT(*)::int', 'documentos')
      .addSelect('COALESCE(SUM(nfe.base_icms), 0)::text', 'baseIcms')
      .addSelect('COALESCE(SUM(nfe.valor_icms), 0)::text', 'valorIcms')
      .addSelect('COALESCE(SUM(nfe.valor_icms_st), 0)::text', 'valorIcmsSt')
      .addSelect('COALESCE(SUM(nfe.valor_ipi), 0)::text', 'valorIpi')
      .addSelect('COALESCE(SUM(nfe.valor_pis), 0)::text', 'valorPis')
      .addSelect('COALESCE(SUM(nfe.valor_cofins), 0)::text', 'valorCofins')
      .addSelect('COALESCE(SUM(nfe.valor_ibs), 0)::text', 'valorIbs')
      .addSelect('COALESCE(SUM(nfe.valor_cbs), 0)::text', 'valorCbs')
      .addSelect('COALESCE(SUM(nfe.valor_is), 0)::text', 'valorIs')
      .getRawOne<Record<string, string | number>>();

    const rows = Object.entries(totals ?? {})
      .filter(([key]) => key !== 'documentos')
      .map(([tributo, valor]) => ({ tributo, valor }));

    return this.response(request, totals ?? {}, rows);
  }

  private async entradas(request: IRequest): Promise<ReportResponse> {
    const base = appDataSource
      .createQueryBuilder()
      .from('received_documents', 'doc')
      .where('doc.company_id = :companyId', { companyId: request.companyId })
      .andWhere('doc.dh_emissao BETWEEN :from AND :to', {
        from: request.from,
        to: request.to,
      });

    const totals = await base
      .clone()
      .select('COUNT(*)::int', 'documentos')
      .addSelect('COALESCE(SUM(doc.valor_total), 0)::text', 'valorTotal')
      .addSelect(
        `COUNT(*) FILTER (WHERE doc.status = '${ReceivedDocumentStatus.PENDENTE}')::int`,
        'pendentes',
      )
      .getRawOne<Record<string, string | number>>();

    const rows = await base
      .clone()
      .select('doc.emitente_cnpj', 'emitenteCnpj')
      .addSelect('doc.emitente_nome', 'emitenteNome')
      .addSelect('doc.status', 'status')
      .addSelect('COUNT(*)::int', 'documentos')
      .addSelect('COALESCE(SUM(doc.valor_total), 0)::text', 'valorTotal')
      .groupBy('doc.emitente_cnpj')
      .addGroupBy('doc.emitente_nome')
      .addGroupBy('doc.status')
      .orderBy('COALESCE(SUM(doc.valor_total), 0)', 'DESC')
      .limit(100)
      .getRawMany<Record<string, string | number | null>>();

    return this.response(request, totals ?? {}, rows);
  }

  private async rankings(request: IRequest): Promise<ReportResponse> {
    const produtos = await appDataSource
      .createQueryBuilder()
      .from('nfe_items', 'item')
      .innerJoin('nfes', 'nfe', 'nfe.id = item.nfe_id')
      .where('nfe.company_id = :companyId', { companyId: request.companyId })
      .andWhere('nfe.status = :status', { status: DocumentStatus.AUTHORIZED })
      .andWhere('nfe.dh_emissao BETWEEN :from AND :to', {
        from: request.from,
        to: request.to,
      })
      .select('item.codigo', 'codigo')
      .addSelect('item.descricao', 'descricao')
      .addSelect('COALESCE(SUM(item.quantidade_comercial), 0)::text', 'quantidade')
      .addSelect('COALESCE(SUM(item.valor_total), 0)::text', 'valorTotal')
      .groupBy('item.codigo')
      .addGroupBy('item.descricao')
      .orderBy('COALESCE(SUM(item.valor_total), 0)', 'DESC')
      .limit(20)
      .getRawMany<Record<string, string | number | null>>();

    const clientes = await appDataSource
      .createQueryBuilder()
      .from('nfes', 'nfe')
      .leftJoin('customers', 'customer', 'customer.id = nfe.customer_id')
      .where('nfe.company_id = :companyId', { companyId: request.companyId })
      .andWhere('nfe.status = :status', { status: DocumentStatus.AUTHORIZED })
      .andWhere('nfe.dh_emissao BETWEEN :from AND :to', {
        from: request.from,
        to: request.to,
      })
      .select('COALESCE(customer.nome_razao, \'Sem cliente vinculado\')', 'cliente')
      .addSelect('COUNT(*)::int', 'documentos')
      .addSelect('COALESCE(SUM(nfe.valor_total), 0)::text', 'valorTotal')
      .groupBy('cliente')
      .orderBy('COALESCE(SUM(nfe.valor_total), 0)', 'DESC')
      .limit(20)
      .getRawMany<Record<string, string | number | null>>();

    const totalProdutos = produtos.reduce((acc, row) => acc + Number(row.valorTotal ?? 0), 0);
    const rows = [
      ...produtos.map((row, index) => ({
        dimensao: 'produto',
        posicao: index + 1,
        participacao: totalProdutos > 0 ? ((Number(row.valorTotal) / totalProdutos) * 100).toFixed(2) : '0.00',
        ...row,
      })),
      ...clientes.map((row, index) => ({ dimensao: 'cliente', posicao: index + 1, ...row })),
    ];

    return this.response(request, { produtos: produtos.length, clientes: clientes.length }, rows);
  }

  private response(
    request: IRequest,
    totals: Record<string, string | number>,
    rows: Array<Record<string, string | number | null>>,
  ): ReportResponse {
    return {
      type: request.type,
      from: request.from.toISOString(),
      to: request.to.toISOString(),
      totals,
      rows,
    };
  }
}

function assertNever(value: never): never {
  throw new Error(`Relatório não suportado: ${String(value)}`);
}
