import type { Metadata } from 'next';
import { Wordmark } from '@/components/ui';
import { ConfigWarning } from '@/components/config-warning';
import { TOKEN_RE, fetchPortal, portalSupabase, type PortalData } from '@/lib/portal';
import { Portal } from './portal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Área de aprovação',
  robots: { index: false, follow: false },
};

function Invalid({ message }: { message: string }) {
  return (
    <div className="invalid">
      <div>
        <Wordmark style={{ fontSize: 26 }} />
        <h2 style={{ margin: '26px 0 8px' }}>Link <b>indisponível</b></h2>
        <p className="muted">{message}</p>
      </div>
    </div>
  );
}

export default async function ApprovalPage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { token } = await params;
  const { preview } = await searchParams;
  if (!TOKEN_RE.test(token)) return <Invalid message="Link inválido ou expirado." />;

  let supabase;
  try {
    supabase = portalSupabase(token);
  } catch (e) {
    return <ConfigWarning message={(e as Error).message} />;
  }

  let data: PortalData | null = null;
  try {
    // registra a abertura do link no "Movimento dos clientes" (exceto na prévia da equipe)
    if (preview !== '1') await supabase.rpc('portal_register_access', { p_token: token });
    data = await fetchPortal(supabase);
  } catch {
    data = null;
  }
  if (!data) return <Invalid message="Link inválido ou expirado." />;

  return <Portal token={token} initial={data} />;
}
