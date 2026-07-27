/**
 * Formatação de data/hora no padrão exigido pelos schemas da SEFAZ (NF-e 4.00 e eventos).
 *
 * O tipo `TDateTimeUTC` do schema exige `AAAA-MM-DDThh:mm:ss±hh:mm` — SEM milissegundos e
 * SEM o sufixo "Z" do UTC. `Date.toISOString()` devolve "2026-05-28T12:03:53.098Z", o que
 * dispara cStat 225/215 (Falha no Schema do XML). Isso vale tanto para `dhEmi` da NF-e
 * quanto para `dhEvento`/`dhEmi` dos eventos (cancelamento, CC-e, EPEC).
 *
 * Estratégia: serializa em horário do fuso de São Paulo (UTC−03:00) — o Brasil não observa
 * horário de verão desde 2019, então o offset é constante. Se a operação precisar de outro
 * fuso (Acre etc.), trocar a constante; suporte multi-fuso fica para quando houver demanda.
 */
export function formatSefazDateTime(d: Date): string {
  const OFFSET_MIN = -180; // UTC−03:00
  const local = new Date(d.getTime() + OFFSET_MIN * 60_000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  const sign = OFFSET_MIN <= 0 ? '-' : '+';
  const offH = String(Math.floor(Math.abs(OFFSET_MIN) / 60)).padStart(2, '0');
  const offM = String(Math.abs(OFFSET_MIN) % 60).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}
