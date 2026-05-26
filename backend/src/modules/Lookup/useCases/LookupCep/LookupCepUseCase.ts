import axios, { AxiosError } from 'axios';
import { injectable } from 'tsyringe';

import { BusinessRuleError, IntegrationError, NotFoundError } from '@shared/errors';
import { logger } from '@shared/logger';

export interface CepLookupResult {
  cep: string;
  logradouro: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  codigoIbgeMunicipio: string | null;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean;
}

/**
 * Lookup de CEP via ViaCEP (https://viacep.com.br) — API pública gratuita, sem auth.
 *
 * Cache em memória LRU simples (TTL 12h) — CEPs raramente mudam. Reduz drasticamente o
 * volume de chamadas externas e melhora latência (~1ms vs ~200ms upstream).
 *
 * Para escalar entre instâncias, trocar pelo Redis (mesmo provider de fila já disponível).
 * Por ora, manter local — o tráfego ainda é baixo para justificar a complexidade.
 */
@injectable()
export class LookupCepUseCase {
  private static readonly TTL_MS = 12 * 60 * 60 * 1000;
  private static readonly MAX_ENTRIES = 5000;
  private cache = new Map<string, { value: CepLookupResult; expiresAt: number }>();

  async execute(cepRaw: string): Promise<CepLookupResult> {
    const cep = cepRaw.replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) {
      throw new BusinessRuleError('CEP deve ter 8 dígitos', 'INVALID_CEP');
    }

    const cached = this.cache.get(cep);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const { data } = await axios.get<ViaCepResponse>(
        `https://viacep.com.br/ws/${cep}/json/`,
        { timeout: 5000 },
      );
      if (data.erro) {
        throw new NotFoundError(`CEP ${cep} não encontrado`);
      }
      const result: CepLookupResult = {
        cep,
        logradouro: data.logradouro ?? '',
        complemento: data.complemento || null,
        bairro: data.bairro ?? '',
        municipio: data.localidade ?? '',
        uf: data.uf ?? '',
        codigoIbgeMunicipio: data.ibge || null,
      };
      this.put(cep, result);
      return result;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      const axiosErr = err as AxiosError;
      logger.warn({ err, cep }, 'ViaCEP indisponível');
      throw new IntegrationError(
        'Serviço de busca de CEP indisponível no momento',
        'CEP_UPSTREAM_UNAVAILABLE',
        { upstreamStatus: axiosErr.response?.status },
      );
    }
  }

  private put(key: string, value: CepLookupResult): void {
    // LRU simples: remove a entrada mais antiga quando bate o teto.
    if (this.cache.size >= LookupCepUseCase.MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + LookupCepUseCase.TTL_MS });
  }
}
