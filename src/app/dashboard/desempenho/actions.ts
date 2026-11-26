'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { currentViewer } from '@/lib/auth';
import { sendResendEmail } from '@/lib/ideias-email';
import { firstName, monthName } from '@/lib/format';
import type { Tone } from '@/lib/desempenho';

type Result = { ok: true; warning?: string } | { ok: false; error: string };
const TONES: Tone[] = ['otimo', 'bom', 'atencao', 'neutro'];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e) });

async function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}

/** Kim (ou quem tem a aba Desempenho) envia o recado do mês: aparece no topo do Aprova da pessoa e, se quiser, por e-mail. */
export async function sendFeedback(input: { profileId: string; month: string; tone: Tone; message: string; metrics: Record<string, unknown>; email: boolean }): Promise<Result> {
  const v = await currentViewer();
  if (!v || !(v.real.owner || v.real.sections.includes('desempenho'))) return { ok: false, error: 'Só quem tem a aba Desempenho envia recados.' };
  const message = input.message.trim();
  if (!message) return { ok: false, error: 'Escreva o recado.' };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) return { ok: false, error: 'Mês inválido.' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('feedbacks').insert({
      profile_id: input.profileId, ref_month: input.month, tone: TONES.includes(input.tone) ? input.tone : 'bom',
      message: message.slice(0, 4000), metrics: input.metrics ?? {}, sent_by: v.real.id, sent_by_name: v.real.name,
    }).select('id').single();
    if (error) throw error;
    let warning: string | undefined;
    if (input.email) {
      const { data: prof } = await supabase.from('profiles').select('name, email').eq('id', input.profileId).maybeSingle();
      const who = prof as { name: string; email: string | null } | null;
      if (!who?.email) warning = 'O recado está no Aprova, mas a pessoa não tem e-mail cadastrado.';
      else {
        const url = `${await siteUrl()}/dashboard`;
        const from = firstName(v.real.name);
        const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#fff;padding:18px 22px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">SEU MÊS</span></td></tr>
<tr><td style="padding:22px;font-size:15px;line-height:1.6">
<div style="white-space:pre-wrap">${esc(message)}</div>
<p style="margin:16px 0 0;color:#8C8781;font-size:13px">${esc(from)} · resumo de ${esc(monthName(input.month))}</p>
<p style="margin:16px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#E1CABA;color:#2C2C2C;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:999px">Abrir o Aprova</a></p>
</td></tr></table></td></tr></table></body></html>`;
        try {
          await sendResendEmail({ to: [who.email], subject: `Seu resumo de ${monthName(input.month)} · recado da ${from}`, html, text: `${message}\n\n${from} · resumo de ${monthName(input.month)}\n${url}` }, `feedback-${data.id}`);
          await supabase.from('feedbacks').update({ email_sent_at: new Date().toISOString() }).eq('id', data.id);
        } catch (e) {
          warning = `O recado está no Aprova, mas o e-mail não saiu: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }
    revalidatePath('/dashboard/desempenho');
    revalidatePath('/dashboard', 'layout');
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

/** A pessoa leu o recado (no "Ver como" não marca: quem leu foi a Kim). */
export async function markFeedbackSeen(id: string): Promise<Result> {
  const v = await currentViewer();
  if (!v) return { ok: false, error: 'Faça login de novo.' };
  if (v.view.id !== v.real.id) return { ok: true };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('feedbacks').update({ seen_at: new Date().toISOString() }).eq('id', id).eq('profile_id', v.real.id);
    if (error) throw error;
    revalidatePath('/dashboard', 'layout');
    return { ok: true };
  } catch (e) { return fail(e); }
}
