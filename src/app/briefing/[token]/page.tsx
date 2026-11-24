import type { Metadata } from 'next';
import { Wordmark } from '@/components/ui';
import { ConfigWarning } from '@/components/config-warning';
import { TOKEN_RE, portalSupabase } from '@/lib/portal';
import { BriefingForm, type BriefingData } from './briefing-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Briefing', robots: { index: false, follow: false } };

function Invalid() {
  return (
    <div className="invalid">
      <div>
        <Wordmark style={{ fontSize: 26 }} />
        <h2 style={{ margin: '26px 0 8px' }}>Link <b>indisponível</b></h2>
        <p className="muted">Link inválido ou expirado. Fale com a equipe da Aguiar&amp;Co.</p>
      </div>
    </div>
  );
}

/** Briefing inicial do cliente: mesmo link (token) da área de aprovação, sem senha. */
export default async function BriefingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return <Invalid />;
  let supabase;
  try {
    supabase = portalSupabase(token);
  } catch (e) {
    return <ConfigWarning message={(e as Error).message} />;
  }
  const { data, error } = await supabase.rpc('briefing_get', { p_token: token });
  if (error || !data) return <Invalid />;
  return <BriefingForm token={token} initial={data as BriefingData} />;
}
