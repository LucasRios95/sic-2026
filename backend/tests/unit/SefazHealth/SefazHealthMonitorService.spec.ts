import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AmbienteSefaz } from '@modules/Companies/infra/typeorm/entities/Company';
import { SefazSoapClient } from '@modules/NFe/infra/sefaz/SefazSoapClient';
import { SefazHealthMonitorService } from '@modules/SefazHealth/SefazHealthMonitorService';
import { SefazHealthState } from '@modules/SefazHealth/domain/sefaz-health-enums';
import { SefazHealthStatus } from '@modules/SefazHealth/infra/typeorm/entities/SefazHealthStatus';
import {
  ISefazHealthStatusRepository,
  UpsertSefazHealthData,
} from '@modules/SefazHealth/repositories/ISefazHealthStatusRepository';

function makeStatus(overrides: Partial<SefazHealthStatus> = {}): SefazHealthStatus {
  return {
    id: 'h-1',
    autorizadora: 'SP',
    ambiente: AmbienteSefaz.HOMOLOGACAO,
    state: SefazHealthState.UP,
    stateSince: new Date('2026-05-20T00:00:00Z'),
    lastCheckAt: new Date(),
    lastCStat: '107',
    lastXMotivo: 'ok',
    meanLatencyMs: 800,
    consecutiveFailures: 0,
    consecutiveSuccesses: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as SefazHealthStatus;
}

describe('SefazHealthMonitorService', () => {
  let repo: ISefazHealthStatusRepository;
  let soap: SefazSoapClient;
  let service: SefazHealthMonitorService;
  let lastUpsert: UpsertSefazHealthData | undefined;

  beforeEach(() => {
    lastUpsert = undefined;
    repo = {
      find: vi.fn(),
      list: vi.fn(async () => []),
      upsert: vi.fn(async (data) => {
        lastUpsert = data;
        return makeStatus(data as unknown as Partial<SefazHealthStatus>);
      }),
    };
    soap = { call: vi.fn() } as unknown as SefazSoapClient;
    service = new SefazHealthMonitorService(repo, soap);
  });

  describe('getState / isAvailable', () => {
    it('UNKNOWN quando autorizadora nunca foi probada', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const out = await service.getState('SP', AmbienteSefaz.HOMOLOGACAO);
      expect(out.state).toBe(SefazHealthState.UNKNOWN);
      // UNKNOWN não bloqueia — fail-open para não travar primeira emissão
      expect(await service.isAvailable('SP', AmbienteSefaz.HOMOLOGACAO)).toBe(true);
    });

    it('DOWN bloqueia isAvailable', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({ state: SefazHealthState.DOWN }),
      );
      expect(await service.isAvailable('SP', AmbienteSefaz.HOMOLOGACAO)).toBe(false);
    });

    it('DEGRADED ainda é disponível', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({ state: SefazHealthState.DEGRADED }),
      );
      expect(await service.isAvailable('SP', AmbienteSefaz.HOMOLOGACAO)).toBe(true);
    });
  });

  describe('máquina de estados — probe()', () => {
    it('primeira probe com cStat 107 → UP imediatamente', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (soap.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        cStat: '107',
        xMotivo: 'Servico em Operacao',
        responseXml: '',
        durationMs: 800,
        httpStatus: 200,
        endpointUrl: 'https://x',
      });

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.UP);
      expect(lastUpsert?.consecutiveSuccesses).toBe(1);
      expect(lastUpsert?.consecutiveFailures).toBe(0);
    });

    it('cStat 107 com latência alta → DEGRADED', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(makeStatus());
      (soap.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        cStat: '107',
        xMotivo: 'Servico em Operacao',
        responseXml: '',
        durationMs: 8000, // > LATENCY_DEGRADED_MS (5s)
        httpStatus: 200,
        endpointUrl: 'https://x',
      });

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.DEGRADED);
    });

    it('1ª falha (cStat 108) a partir de UP → DEGRADED (ainda não promove a DOWN)', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({ state: SefazHealthState.UP, consecutiveFailures: 0 }),
      );
      (soap.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        cStat: '108',
        xMotivo: 'Servico Paralisado Momentaneamente',
        responseXml: '',
        durationMs: 100,
        httpStatus: 200,
        endpointUrl: 'https://x',
      });

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.DEGRADED);
      expect(lastUpsert?.consecutiveFailures).toBe(1);
    });

    it('3 falhas consecutivas → DOWN (histerese)', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({ state: SefazHealthState.DEGRADED, consecutiveFailures: 2 }),
      );
      (soap.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        cStat: '108',
        xMotivo: 'Servico Paralisado',
        responseXml: '',
        durationMs: 100,
        httpStatus: 200,
        endpointUrl: 'https://x',
      });

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.DOWN);
      expect(lastUpsert?.consecutiveFailures).toBe(3);
      expect(lastUpsert?.consecutiveSuccesses).toBe(0);
    });

    it('exceção lançada pelo SOAP é tratada como falha (probeFailed)', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({ state: SefazHealthState.UP, consecutiveFailures: 2 }),
      );
      (soap.call as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ETIMEDOUT'));

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.DOWN);
      expect(lastUpsert?.lastCStat).toBe(null);
      expect(lastUpsert?.lastXMotivo).toContain('ETIMEDOUT');
    });

    it('DOWN + cStat 107 (1 sucesso) → ainda DOWN (precisa 2 sucessos)', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({
          state: SefazHealthState.DOWN,
          consecutiveFailures: 5,
          consecutiveSuccesses: 0,
        }),
      );
      (soap.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        cStat: '107',
        xMotivo: 'ok',
        responseXml: '',
        durationMs: 500,
        httpStatus: 200,
        endpointUrl: 'https://x',
      });

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.DOWN);
      expect(lastUpsert?.consecutiveSuccesses).toBe(1);
    });

    it('DOWN + 2 sucessos consecutivos → UP', async () => {
      (repo.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStatus({
          state: SefazHealthState.DOWN,
          consecutiveFailures: 5,
          consecutiveSuccesses: 1,
        }),
      );
      (soap.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        cStat: '107',
        xMotivo: 'ok',
        responseXml: '',
        durationMs: 500,
        httpStatus: 200,
        endpointUrl: 'https://x',
      });

      const out = await service.probe({
        autorizadora: 'SP',
        sampleUf: 'SP',
        ambiente: AmbienteSefaz.HOMOLOGACAO,
        companyId: 'company-1',
        certificateVaultRef: 'vault://cert/1',
      });

      expect(out.state).toBe(SefazHealthState.UP);
      expect(lastUpsert?.consecutiveSuccesses).toBe(2);
    });
  });
});
