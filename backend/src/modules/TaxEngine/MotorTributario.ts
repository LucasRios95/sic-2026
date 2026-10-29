import { inject, injectable } from 'tsyringe';

import { Money } from '@shared/domain/Money';

import { CalculadoraCreditoSimples } from './calculadoras/CalculadoraCreditoSimples';
import { CalculadoraDifal, CalculadoraFcpDestino } from './calculadoras/CalculadoraDifal';
import { CalculadoraIbsCbs } from './calculadoras/CalculadoraIbsCbs';
import { CalculadoraIcmsProprio } from './calculadoras/CalculadoraIcmsProprio';
import { CalculadoraIcmsSt } from './calculadoras/CalculadoraIcmsSt';
import { CalculadoraIpi } from './calculadoras/CalculadoraIpi';
import { CalculadoraPisCofins } from './calculadoras/CalculadoraPisCofins';
import { CalculadoraTributosAproximados } from './calculadoras/CalculadoraTributosAproximados';
import { ContextoCalculo, ItemContexto } from './domain/ContextoCalculo';
import { ICalculadoraTributo } from './domain/ICalculadoraTributo';
import {
  PassoMemoria,
  ResultadoCalculoDocumento,
  ResultadoCalculoItem,
  TotaisDocumento,
} from './domain/ResultadoCalculo';

/**
 * Pipeline orquestrador. Aplica as calculadoras em ordem fixa:
 *
 *   1. IPI                (integra a base do ICMS p/ consumidor final e a base da ST)
 *   2. ICMS próprio       (deduzido no cálculo de ST)
 *   3. ICMS-ST            (depende do ICMS próprio e do IPI na fórmula)
 *   4. DIFAL              (só em interestadual para consumidor final não contribuinte)
 *   5. FCP destino        (acompanha DIFAL)
 *   6. Crédito Simples    (pCredSN/vCredICMSSN — CSOSN 101/201/900)
 *   7. PIS / COFINS       (até 2026; base sem o ICMS destacado — Tema 69/STF)
 *   8. IBS / CBS          (ano-teste 2026 / pleno 2027+)
 *   9. Tributos aprox.    (vTotTrib, Lei 12.741 — soma o que os anteriores apuraram)
 *
 * Cada calculadora recebe o resultado parcial das anteriores (somente leitura).
 *
 * Princípio: o motor é IDEMPOTENTE — mesmo contexto produz mesmo resultado, sem
 * efeitos colaterais. Toda configuração faltante vira `warnings` no resultado,
 * nunca exception (faturista precisa ver o que está pendente para resolver).
 *
 * Calculadora de Imposto Seletivo (IS) entra na Fase 1 (vigência 2027); calculadora
 * de ISS entra junto com NFS-e na Fase 1b.
 */
@injectable()
export class MotorTributario {
  private readonly calculadoras: ICalculadoraTributo[];

  constructor(
    @inject(CalculadoraIcmsProprio) icmsProprio: CalculadoraIcmsProprio,
    @inject(CalculadoraIcmsSt) icmsSt: CalculadoraIcmsSt,
    @inject(CalculadoraDifal) difal: CalculadoraDifal,
    @inject(CalculadoraFcpDestino) fcpDestino: CalculadoraFcpDestino,
    @inject(CalculadoraIpi) ipi: CalculadoraIpi,
    @inject(CalculadoraPisCofins) pisCofins: CalculadoraPisCofins,
    @inject(CalculadoraIbsCbs) ibsCbs: CalculadoraIbsCbs,
    @inject(CalculadoraCreditoSimples) creditoSimples: CalculadoraCreditoSimples,
    @inject(CalculadoraTributosAproximados) tributosAproximados: CalculadoraTributosAproximados,
  ) {
    this.calculadoras = [
      ipi,
      icmsProprio,
      icmsSt,
      difal,
      fcpDestino,
      creditoSimples,
      pisCofins,
      ibsCbs,
      tributosAproximados,
    ];
  }

  async calcular(contexto: ContextoCalculo): Promise<ResultadoCalculoDocumento> {
    const itens: ResultadoCalculoItem[] = [];
    for (const item of contexto.itens) {
      itens.push(await this.calcularItem(contexto, item));
    }

    return {
      itens,
      totais: this.agregarTotais(contexto, itens),
      warnings: itens.flatMap((i) => i.warnings),
    };
  }

  private async calcularItem(
    contexto: ContextoCalculo,
    item: ItemContexto,
  ): Promise<ResultadoCalculoItem> {
    // vProd é o valor BRUTO do item (qCom × vUnCom). Desconto/frete/seguro/outros vão em
    // campos próprios (vDesc/vFrete/vSeg/vOutro) e NÃO entram no vProd — senão a SEFAZ
    // rejeita com cStat 629 (vProd ≠ vUnCom × qCom). A base de cálculo dos tributos
    // continua sendo `baseDefaultItem` (líquida) dentro de cada calculadora.
    const valorTotal = new Money(item.quantidade).mul(item.valorUnitario).round(2).toString(2);
    const result: ResultadoCalculoItem = {
      itemId: item.itemId,
      valorTotal,
      calculadorasAplicadas: [],
      codigos: {
        cstIcms: item.taxRule.cstIcms ?? null,
        csosnIcms: item.taxRule.csosnIcms ?? null,
        cstIpi: item.taxRule.cstIpi ?? null,
        cstPis: item.taxRule.cstPis ?? null,
        cstCofins: item.taxRule.cstCofins ?? null,
      },
      memoria: [],
      warnings: [],
    };

    for (const calc of this.calculadoras) {
      if (!calc.aplica(contexto, item)) continue;
      result.calculadorasAplicadas.push(calc.nome);
      const slice = await calc.calcular(contexto, item, result);
      Object.assign(result, slice.campos);
      if (slice.passo) result.memoria.push(slice.passo as PassoMemoria);
      if (slice.warnings?.length) result.warnings.push(...slice.warnings);
    }

    return result;
  }

  private agregarTotais(
    contexto: ContextoCalculo,
    itens: ResultadoCalculoItem[],
  ): TotaisDocumento {
    const sum = (selector: (i: ResultadoCalculoItem) => string | undefined): Money =>
      itens.reduce((acc, i) => acc.add(selector(i) ?? 0), Money.zero());

    // vProd do total = soma dos vProd JÁ ARREDONDADOS dos itens. Somar qtd × unit. sem
    // arredondar e arredondar no fim diverge em centavos com vários itens (cStat 564).
    const valorProdutos = sum((i) => i.valorTotal).round(2);
    const valorDesconto = contexto.itens
      .reduce((acc, i) => acc.add(i.valorDesconto ?? 0), Money.zero())
      .round(2);
    const valorFrete = contexto.itens
      .reduce((acc, i) => acc.add(i.valorFrete ?? 0), Money.zero())
      .round(2);
    const valorSeguro = contexto.itens
      .reduce((acc, i) => acc.add(i.valorSeguro ?? 0), Money.zero())
      .round(2);
    const valorOutros = contexto.itens
      .reduce((acc, i) => acc.add(i.valorOutros ?? 0), Money.zero())
      .round(2);

    const valorIpi = sum((i) => i.valorIpi).round(2);
    // Valor total do documento = produtos − desconto + frete + seguro + outros + ST + IPI
    // (FCP/DIFAL/IBS/CBS NÃO compõem o total da nota — entram em grupos próprios).
    const valorIcmsST = sum((i) => i.valorIcmsST).round(2);
    const valorTotal = valorProdutos
      .sub(valorDesconto)
      .add(valorFrete)
      .add(valorSeguro)
      .add(valorOutros)
      .add(valorIcmsST)
      .add(valorIpi)
      .round(2);

    const modoAnoTesteIbsCbs = itens.some((i) => i.modoAnoTesteIbsCbs === true);

    return {
      valorProdutos: valorProdutos.toString(2),
      valorDesconto: valorDesconto.toString(2),
      valorFrete: valorFrete.toString(2),
      valorSeguro: valorSeguro.toString(2),
      valorOutros: valorOutros.toString(2),
      valorTotal: valorTotal.toString(2),
      baseIcms: sum((i) => i.baseIcms).round(2).toString(2),
      valorIcms: sum((i) => i.valorIcms).round(2).toString(2),
      valorIcmsDeson: sum((i) => i.valorIcmsDeson).round(2).toString(2),
      baseIcmsST: sum((i) => i.baseIcmsST).round(2).toString(2),
      valorIcmsST: valorIcmsST.toString(2),
      valorFCP: sum((i) => i.valorFCP).round(2).toString(2),
      valorICMSUFDest: sum((i) => i.valorICMSUFDest).round(2).toString(2),
      valorICMSUFRemet: sum((i) => i.valorICMSUFRemet).round(2).toString(2),
      valorFCPUFDest: sum((i) => i.valorFCPUFDest).round(2).toString(2),
      valorIpi: valorIpi.toString(2),
      valorPis: sum((i) => i.valorPis).round(2).toString(2),
      valorCofins: sum((i) => i.valorCofins).round(2).toString(2),
      baseIbsCbs: sum((i) => i.baseIbsCbs).round(2).toString(2),
      valorIbs: sum((i) => i.valorIbs).round(2).toString(2),
      valorCbs: sum((i) => i.valorCbs).round(2).toString(2),
      valorIs: sum((i) => i.valorIs).round(2).toString(2),
      modoAnoTesteIbsCbs,
      valorCredSN: sum((i) => i.valorCredSN).round(2).toString(2),
      valorTotTrib: sum((i) => i.valorTotTrib).round(2).toString(2),
      valorTotTribFederal: sum((i) => i.valorTotTribFederal).round(2).toString(2),
      valorTotTribEstadual: sum((i) => i.valorTotTribEstadual).round(2).toString(2),
    };
  }
}
