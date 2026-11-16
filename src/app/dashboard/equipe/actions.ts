'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

const NO_KEY =
  'Para adicionar ou remover pessoas pelo painel, configure SUPABASE_SERVICE_ROLE_KEY nas variáveis do servidor (ou use Authentication → Users no Supabase).';

async function requireTeam() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  return data ? user : null;
}

export async function addMember(input: { name: string; email: string; password: string }): Promise<Result> {
  if (!(await requireTeam())) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Informe nome e e-mail válidos.' };
  if (password.length < 8) return { ok: false, error: 'A senha precisa ter pelo menos 8 caracteres.' };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY };
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) return { ok: false, error: /already|registered|exists/i.test(error.message) ? 'Já existe um acesso com esse e-mail.' : error.message };
  revalidatePath('/dashboard/equipe');
  return { ok: true };
}

export async function removeMember(id: string): Promise<Result> {
  const me = await requireTeam();
  if (!me) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  if (me.id === id) return { ok: false, error: 'Você não pode remover o próprio acesso.' };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY };
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard/equipe');
  return { ok: true };
}
