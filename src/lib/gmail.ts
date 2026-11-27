import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Projeto } from './projetos';
import { fromProject } from './projetos';

/**
 * Leitura do Gmail (só leitura, escopo gmail.readonly) para os projetos especiais.
 * Guarda só remetente, destinatários, assunto, data e um trecho: nunca a caixa inteira.
 * Variáveis: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (Google Cloud → OAuth, app interno).
 */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function authUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google: ${j.error_description || j.error || r.status}`);
  return j;
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });

async function gmail<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Gmail respondeu ${r.status}`);
  return r.json() as Promise<T>;
}

export async function gmailProfile(token: string) {
  return gmail<{ emailAddress: string }>(token, 'profile');
}

type Header = { name: string; value: string };
type Msg = { id: string; threadId: string; snippet: string; internalDate: string; payload?: { headers?: Header[] } };

function parseAddr(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: v.trim().toLowerCase() };
}
const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Busca os e-mails novos do projeto (pelos domínios) e grava. Usa o cliente admin (service role). */
export async function syncProjeto(admin: SupabaseClient, projeto: Projeto) {
  const { data: conn } = await admin.from('projeto_gmail').select('*').eq('projeto_id', projeto.id).maybeSingle();
  if (!conn) return { projeto: projeto.slug, skipped: 'Gmail não conectado' };
  if (!projeto.gmail_domains.length) return { projeto: projeto.slug, skipped: 'Sem domínios cadastrados' };
  try {
    const { access_token } = await tokenRequest({ refresh_token: conn.refresh_token as string, grant_type: 'refresh_token' });
    const token = access_token!;
    const terms = projeto.gmail_domains.flatMap((d) => [`from:${d}`, `to:${d}`, `cc:${d}`]).join(' ');
    // da última leitura (menos 2 dias de folga) ou dos últimos 30 dias
    const since = conn.last_sync_at ? new Date(Date.parse(conn.last_sync_at as string) - 2 * 86400e3) : new Date(Date.now() - 30 * 86400e3);
    const after = `${since.getUTCFullYear()}/${since.getUTCMonth() + 1}/${since.getUTCDate()}`;
    const q = `{${terms}} after:${after}`;
    const ids: { id: string }[] = [];
    let page: string | undefined;
    for (let i = 0; i < 4; i++) {
      const res = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token,
        `messages?maxResults=100&q=${encodeURIComponent(q)}${page ? `&pageToken=${page}` : ''}`);
      ids.push(...(res.messages ?? []));
      if (!res.nextPageToken) break;
      page = res.nextPageToken;
    }
    const { data: have } = ids.length
      ? await admin.from('projeto_emails').select('gmail_id').in('gmail_id', ids.map((m) => m.id))
      : { data: [] };
    const known = new Set((have ?? []).map((h) => h.gmail_id as string));
    const rows = [];
    for (const { id } of ids.filter((m) => !known.has(m.id)).slice(0, 150)) {
      const m = await gmail<Msg>(token, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`);
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? '';
      const from = parseAddr(h('From'));
      rows.push({
        projeto_id: projeto.id, gmail_id: m.id, thread_id: m.threadId,
        from_name: from.name.slice(0, 200), from_email: from.email.slice(0, 200),
        to_list: h('To').slice(0, 1000), cc_list: h('Cc').slice(0, 1000),
        subject: h('Subject').slice(0, 300), snippet: decode(m.snippet ?? '').slice(0, 500),
        sent_at: new Date(Number(m.internalDate)).toISOString(),
        direction: fromProject(from.email, projeto.gmail_domains) ? 'in' : 'out',
      });
    }
    if (rows.length) {
      const { error } = await admin.from('projeto_emails').upsert(rows, { onConflict: 'gmail_id', ignoreDuplicates: true });
      if (error) throw error;
    }
    await admin.from('projeto_gmail').update({ last_sync_at: new Date().toISOString(), last_error: '' }).eq('projeto_id', projeto.id);
    return { projeto: projeto.slug, novos: rows.length };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await admin.from('projeto_gmail').update({ last_error: msg }).eq('projeto_id', projeto.id);
    return { projeto: projeto.slug, error: msg };
  }
}

export async function syncAll(admin: SupabaseClient) {
  const { data } = await admin.from('projetos').select('*').eq('active', true);
  const out = [];
  for (const p of (data ?? []) as Projeto[]) out.push(await syncProjeto(admin, p));
  return out;
}
