import Link from 'next/link';
import { Wordmark } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="invalid">
      <div>
        <Wordmark style={{ fontSize: 26 }} />
        <h2 style={{ margin: '26px 0 8px' }}>Página <b>não encontrada</b></h2>
        <p className="muted">O endereço pode ter mudado ou não existe mais.</p>
        <Link className="btn line" href="/" style={{ marginTop: 10 }}>Voltar ao início</Link>
      </div>
    </div>
  );
}
