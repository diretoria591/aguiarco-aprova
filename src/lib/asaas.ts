import 'server-only';

/**
 * Cliente mínimo da API do Asaas (v3). Chave em ASAAS_API_KEY (Vercel).
 * ASAAS_API_URL troca o ambiente: https://api-sandbox.asaas.com/v3 para testes.
 */
const base = () => (process.env.ASAAS_API_URL || 'https://api.asaas.com/v3').replace(/\/$/, '');

export class AsaasError extends Error {}

export async function asaas<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new AsaasError('A chave do Asaas (ASAAS_API_KEY) não está configurada na Vercel.');
  const r = await fetch(`${base()}${path}`, {
    method: init.method ?? 'GET',
    headers: { access_token: key, 'User-Agent': 'aguiarco-aprova', 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const j = await r.json().catch(() => null) as { errors?: { description?: string }[] } | null;
  if (!r.ok) {
    const msg = j?.errors?.map((e) => e.description).filter(Boolean).join(' ') || `Asaas respondeu ${r.status}`;
    throw new AsaasError(r.status === 401 ? 'Chave do Asaas inválida ou de outro ambiente.' : msg);
  }
  return j as T;
}

type List<T> = { data: T[]; hasMore: boolean };
export type AsaasCustomer = { id: string; name: string; email: string | null; cpfCnpj: string | null; deleted?: boolean };
export type AsaasPayment = {
  id: string; customer: string; subscription: string | null; value: number; description: string | null;
  billingType: string; status: string; dueDate: string; invoiceUrl: string | null;
};
export type AsaasSubscription = { id: string; customer: string; value: number; nextDueDate: string; billingType: string; status: string; description: string | null };

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await asaas<List<T>>(`${path}${sep}limit=100&offset=${offset}`);
    out.push(...page.data);
    if (!page.hasMore) break;
  }
  return out;
}

export const listCustomers = async () => (await all<AsaasCustomer>('/customers')).filter((c) => !c.deleted);

/**
 * Próxima mensalidade em aberto do cliente: a cobrança pendente de assinatura com o vencimento
 * mais próximo a partir de hoje. Sem ela, devolve a assinatura ativa (para criar uma cobrança no mesmo vencimento).
 */
export async function nextMonthly(customer: string, today: string) {
  const pending = (await all<AsaasPayment>(`/payments?customer=${encodeURIComponent(customer)}&status=PENDING`))
    .filter((p) => p.subscription && p.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (pending[0]) return { payment: pending[0], subscription: null };
  const subs = (await all<AsaasSubscription>(`/subscriptions?customer=${encodeURIComponent(customer)}&status=ACTIVE`))
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  return { payment: null, subscription: subs[0] ?? null };
}

export const updatePayment = (p: AsaasPayment, value: number, description: string) =>
  asaas<AsaasPayment>(`/payments/${p.id}`, {
    method: 'PUT',
    body: { billingType: p.billingType, value, dueDate: p.dueDate, description },
  });

export const createPayment = (body: { customer: string; billingType: string; value: number; dueDate: string; description: string; externalReference: string }) =>
  asaas<AsaasPayment>('/payments', { method: 'POST', body });

export const getPayment = (id: string) => asaas<AsaasPayment>(`/payments/${id}`);
