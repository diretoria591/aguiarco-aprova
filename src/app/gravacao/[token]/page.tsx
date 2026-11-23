import type { Metadata } from 'next';
import { Wordmark } from '@/components/ui';
import { ConfigWarning } from '@/components/config-warning';
import { GRAVACAO_TOKEN_RE, gravacaoSupabase, type GravacaoData } from '@/lib/roteiros-public';
import { GravacaoView } from './gravacao-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Área de gravação', robots: { index: false, follow: false } };

function Invalid() {
  return (
    <div className="invalid">
      <div>
        <Wordmark style={{ fontSize: 26 }} />
        <h2 style={{ margin: '26px 0 8px' }}>Link <b>indisponível</b></h2>
        <p className="muted">Link inválido ou expirado. Peça um novo para a equipe da Aguiar&amp;Co.</p>
      </div>
    </div>
  );
}

export default async function GravacaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!GRAVACAO_TOKEN_RE.test(token)) return <Invalid />;
  let supabase;
  try {
    supabase = gravacaoSupabase();
  } catch (e) {
    return <ConfigWarning message={(e as Error).message} />;
  }
  const { data, error } = await supabase.rpc('gravacao_get', { p_token: token });
  if (error || !data) return <Invalid />;
  return <GravacaoView token={token} initial={data as GravacaoData} />;
}
