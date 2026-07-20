import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { ListNFesUseCase } from './ListNFesUseCase';

interface ListQuery {
  status?: string;
  customerId?: string;
  search?: string;
  from?: string;
  to?: string;
  ano?: number;
  mes?: number;
  limit?: number;
  offset?: number;
}

export class ListNFesController {
  async handle(request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(ListNFesUseCase);
    const q = (request.validatedQuery as ListQuery) ?? {};
    const result = await useCase.execute({
      companyId: request.companyId!,
      status: q.status,
      customerId: q.customerId,
      search: q.search,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      ano: q.ano,
      mes: q.mes,
      limit: q.limit,
      offset: q.offset,
    });
    // DTO enxuto do relatório: não serializamos o agregado inteiro (XML, itens etc.) —
    // só as colunas que a listagem consome + o destinatário resolvido.
    const data = result.items.map((nfe) => ({
      id: nfe.id,
      numero: nfe.numero,
      serie: nfe.serie,
      chaveAcesso: nfe.chaveAcesso ?? null,
      dhEmissao: nfe.dhEmissao,
      status: nfe.status,
      cStat: nfe.cStat ?? null,
      xMotivo: nfe.xMotivo ?? null,
      valorTotal: nfe.valorTotal,
      ufDestino: nfe.ufDestino ?? null,
      customerId: nfe.customerId ?? null,
      customerNome: nfe.customerNome,
      customerCnpjCpf: nfe.customerCnpjCpf,
      naturezaOperacao: nfe.naturezaOperacao,
      dhAutorizacao: nfe.dhAutorizacao ?? null,
    }));
    return response.json({ data, meta: { total: result.total } });
  }
}
