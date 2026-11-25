/* Cobrança das rodadas extras: preço por região e formatação (usado no servidor e no navegador). */

export type BillingRegion = 'brasil' | 'europa';
export type Currency = 'BRL' | 'EUR';

/** Valor padrão de uma rodada extra; cada cliente pode ter um valor próprio no cadastro de cobrança. */
export const EXTRA_ROUND_PRICE: Record<BillingRegion, number> = { brasil: 30, europa: 1.5 };
export const REGION_CURRENCY: Record<BillingRegion, Currency> = { brasil: 'BRL', europa: 'EUR' };
export const REGION_LABEL: Record<BillingRegion, string> = { brasil: 'Brasil · Asaas', europa: 'Europa · Wise' };

export type BillingClient = {
  id: string; name: string; billing_region?: string | null; extra_round_price?: number | string | null; asaas_customer_id?: string | null;
};

export const regionOf = (c: BillingClient): BillingRegion => (c.billing_region === 'europa' ? 'europa' : 'brasil');

export function priceOf(c: BillingClient): number {
  const own = c.extra_round_price === null || c.extra_round_price === undefined || c.extra_round_price === '' ? NaN : Number(c.extra_round_price);
  return Number.isFinite(own) && own >= 0 ? own : EXTRA_ROUND_PRICE[regionOf(c)];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function money(n: number, cur: Currency): string {
  return new Intl.NumberFormat(cur === 'EUR' ? 'pt-PT' : 'pt-BR', { style: 'currency', currency: cur }).format(n);
}

export type ExtraCharge = {
  id: string; client_id: string; ref_month: string; comment_ids: string[]; rounds: number; unit_price: number;
  currency: Currency; total: number; status: 'cobrando' | 'mensalidade' | 'avulsa' | 'wise' | 'falhou';
  asaas_payment_id: string; asaas_due_date: string | null; asaas_invoice_url: string; previous_value: number | null;
  error: string; charged_by: string; charged_at: string | null;
};
