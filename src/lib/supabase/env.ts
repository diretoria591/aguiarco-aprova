export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!/^https?:\/\//.test(url) || !anonKey || anonKey.startsWith('[')) {
    throw new Error(
      'Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local (ou nas variáveis da Vercel).',
    );
  }
  return { url, anonKey };
}

export const MEDIA_BUCKET = 'approvals-media';
