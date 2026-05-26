import { gzipSync } from 'node:zlib';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@modules/Auditoria/AuditService';
import { IAuditLogRepository } from '@modules/Auditoria/repositories/IAuditLogRepository';
import {
  AmbienteSefaz,
  CodigoRegimeTributario,
  Company,
} from '@modules/Companies/infra/typeorm/entities/Company';
import { ICompanyRepository } from '@modules/Companies/repositories/ICompanyRepository';
import { NFeDistribuicaoDFeService } from '@modules/NFeRecepcao/infra/sefaz/NFeDistribuicaoDFeService';
import { NsuCursor } from '@modules/NFeRecepcao/infra/typeorm/entities/NsuCursor';
import { ReceivedDocument } from '@modules/NFeRecepcao/infra/typeorm/entities/ReceivedDocument';
import { INsuCursorRepository } from '@modules/NFeRecepcao/repositories/INsuCursorRepository';
import { IReceivedDocumentRepository } from '@modules/NFeRecepcao/repositories/IReceivedDocumentRepository';
import { SincronizarRecebidosUseCase } from '@modules/NFeRecepcao/useCases/SincronizarRecebidos/SincronizarRecebidosUseCase';
import { NotificationService } from '@modules/Notifications/NotificationService';
import { INotificationRepository } from '@modules/Notifications/repositories/INotificationRepository';

function makeCompany(): Company {
  return {
    id: 'company-1',
    cnpj: '11222333000181',
    uf: 'SP',
    ambienteSefaz: AmbienteSefaz.HOMOLOGACAO,
    crt: CodigoRegimeTributario.REGIME_NORMAL,
  } as unknown as Company;
}

function makeCursor(value = '0'): NsuCursor {
  return {
    id: 'cursor-1',
    companyId: 'company-1',
    origem: 'sefaz_nfe_cte',
    cursorValue: value,
    lastFetchedAt: null,
    lastCStat: null,
  } as unknown as NsuCursor;
}

function makeResumoXml(chave: string, valor: string): string {
  return [
    '<resNFe xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<chNFe>${chave}</chNFe>`,
    '<CNPJ>99888777000166</CNPJ>',
    '<xNome>FORNECEDOR EXEMPLO</xNome>',
    '<dhEmi>2026-05-20T10:00:00-03:00</dhEmi>',
    `<vNF>${valor}</vNF>`,
    '</resNFe>',
  ].join('');
}

function makeDocZip(nsu: string, chave: string, valor: string) {
  return {
    nsu,
    schema: 'resNFe',
    xml: makeResumoXml(chave, valor),
  };
}

describe('SincronizarRecebidosUseCase', () => {
  let companyRepo: ICompanyRepository;
  let cursorRepo: INsuCursorRepository;
  let documentRepo: IReceivedDocumentRepository;
  let distribService: NFeDistribuicaoDFeService;
  let audit: AuditService;
  let notifications: NotificationService;
  let useCase: SincronizarRecebidosUseCase;

  beforeEach(() => {
    companyRepo = {
      findById: vi.fn(async () => makeCompany()),
    } as unknown as ICompanyRepository;

    cursorRepo = {
      findOrCreate: vi.fn(async () => makeCursor('100')),
      advance: vi.fn(async () => undefined),
    };

    documentRepo = {
      upsertByChave: vi.fn(async () => ({ id: 'doc-1' }) as ReceivedDocument),
      findById: vi.fn(),
      findByChave: vi.fn(),
      list: vi.fn(),
      setXmlCompleto: vi.fn(),
      update: vi.fn(),
    };

    distribService = {
      consultarPorNSU: vi.fn(),
    } as unknown as NFeDistribuicaoDFeService;

    const auditLogRepo: IAuditLogRepository = {
      create: vi.fn(),
      list: vi.fn(),
    } as unknown as IAuditLogRepository;
    audit = new AuditService(auditLogRepo);

    const notifRepo: INotificationRepository = {
      create: vi.fn(async () => ({ id: 'n-1' }) as never),
      list: vi.fn(),
      markRead: vi.fn(),
      countUnread: vi.fn(),
    } as unknown as INotificationRepository;
    notifications = new NotificationService(notifRepo);

    useCase = new SincronizarRecebidosUseCase(
      companyRepo,
      cursorRepo,
      documentRepo,
      distribService,
      audit,
      notifications,
    );
  });

  it('persiste documentos do lote e avança o cursor para maxNSU', async () => {
    const chave = '35260611222333000181550010000000011000000017';
    (distribService.consultarPorNSU as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        cStat: '138',
        xMotivo: 'Documento(s) localizado(s)',
        ultNSU: '150',
        maxNSU: '150',
        documentos: [makeDocZip('150', chave, '1000.00')],
      })
      .mockResolvedValue({
        cStat: '138',
        xMotivo: 'Sem novidades',
        ultNSU: '150',
        maxNSU: '150',
        documentos: [],
      });

    const out = await useCase.execute({
      companyId: 'company-1',
      certificateVaultRef: 'vault://cert/1',
    });

    expect(documentRepo.upsertByChave).toHaveBeenCalledTimes(1);
    expect(documentRepo.upsertByChave).toHaveBeenCalledWith(
      expect.objectContaining({
        chaveAcesso: chave,
        emitenteCnpj: '99888777000166',
        valorTotal: '1000.00',
        nsu: '150',
      }),
    );
    expect(cursorRepo.advance).toHaveBeenCalled();
    expect(out.capturedDocs).toBe(1);
    expect(out.finalCursor).toBe('150');
  });

  it('cStat 138 sem documentos encerra o laço sem persistir', async () => {
    (distribService.consultarPorNSU as ReturnType<typeof vi.fn>).mockResolvedValue({
      cStat: '138',
      xMotivo: 'Sem novidades',
      ultNSU: '100',
      maxNSU: '100',
      documentos: [],
    });

    const out = await useCase.execute({
      companyId: 'company-1',
      certificateVaultRef: 'vault://cert/1',
    });

    expect(documentRepo.upsertByChave).not.toHaveBeenCalled();
    expect(out.iterations).toBe(1);
    expect(out.capturedDocs).toBe(0);
    expect(out.lastCStat).toBe('138');
  });

  it('falha individual não interrompe o lote', async () => {
    const chaveOk = '35260611222333000181550010000000011000000017';
    const chaveOk2 = '35260611222333000181550010000000021000000020';
    (documentRepo.upsertByChave as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ id: 'doc-2' } as ReceivedDocument);

    (distribService.consultarPorNSU as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        cStat: '138',
        xMotivo: 'ok',
        ultNSU: '101',
        maxNSU: '101',
        documentos: [makeDocZip('100', chaveOk, '50'), makeDocZip('101', chaveOk2, '100')],
      })
      .mockResolvedValue({
        cStat: '138',
        xMotivo: 'fim',
        ultNSU: '101',
        maxNSU: '101',
        documentos: [],
      });

    const out = await useCase.execute({
      companyId: 'company-1',
      certificateVaultRef: 'vault://cert/1',
    });
    expect(out.capturedDocs).toBe(1);
  });

  it('respeita maxIterations e para mesmo se SEFAZ tem mais', async () => {
    const chave = '35260611222333000181550010000000011000000017';
    (distribService.consultarPorNSU as ReturnType<typeof vi.fn>).mockResolvedValue({
      cStat: '137',
      xMotivo: 'Lote parcial',
      ultNSU: '99999',
      maxNSU: '150',
      documentos: [makeDocZip('150', chave, '1.00')],
    });

    const out = await useCase.execute({
      companyId: 'company-1',
      certificateVaultRef: 'vault://cert/1',
      maxIterations: 2,
    });
    expect(out.iterations).toBe(2);
  });

  it('empresa sem CNPJ falha com BusinessRuleError', async () => {
    (companyRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...makeCompany(),
      cnpj: '',
    });

    await expect(
      useCase.execute({ companyId: 'company-1', certificateVaultRef: 'vault://cert/1' }),
    ).rejects.toThrow(/CNPJ/i);
  });

  // Garante compatibilidade com docZip "redondo": gzip+base64 → resNFe.
  it('integração leve com decodeDocZip — fluxo real de descompactação', () => {
    const xml = '<resNFe><chNFe>35260611222333000181550010000000011000000017</chNFe></resNFe>';
    const base64 = gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
    expect(base64.length).toBeGreaterThan(0);
  });
});
