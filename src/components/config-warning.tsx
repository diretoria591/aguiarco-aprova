import { Wordmark } from './ui';

export function ConfigWarning({ message }: { message: string }) {
  return (
    <div className="card config-warn">
      <Wordmark style={{ fontSize: 22 }} />
      <h2 style={{ margin: '20px 0 8px' }}>Configuração <b>pendente</b></h2>
      <p className="muted" style={{ margin: 0 }}>{message}</p>
    </div>
  );
}
