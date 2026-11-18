import type { ReactNode } from 'react';
import type { ActivityLog, Comment } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { Icon, type IconName } from './icon';

const KIND_CLASS: Record<Comment['kind'], string> = {
  comment: 'comentario', approval: 'aprovacao', adjustment: 'ajuste', version: 'versao', rejection: 'reprovacao',
};

export function Thread({ comments }: { comments: Comment[] }) {
  if (!comments.length) return null;
  return (
    <div className="thread">
      {comments.map((c) => {
        const label = c.kind === 'approval' ? 'aprovou' : c.kind === 'adjustment' ? 'pediu alteração' : c.kind === 'rejection' ? 'reprovou' : '';
        const role = c.author_role === 'agency' ? 'equipe' : 'cliente';
        return (
          <div key={c.id} className={`msg ${role} k-${KIND_CLASS[c.kind]}`}>
            <div className="bubble">{c.content}</div>
            <div className="meta" suppressHydrationWarning>
              {c.kind === 'version' ? '' : `${c.author_name}${label ? ' · ' + label : ''} · `}
              {fmtDate(c.created_at)}
              {c.version > 1 && c.kind !== 'version' ? ` · v${c.version}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const EV: Record<string, [IconName, string, (e: ActivityLog) => ReactNode]> = {
  acesso: ['eye', 'view', () => 'Acessou a área de aprovação'],
  visualizou: ['eye', 'view', (e) => <>Visualizou <b>{e.posts?.title}</b></>],
  aprovado: ['check', 'ok', (e) => <>Aprovou <b>{e.posts?.title}</b></>],
  ajustes: ['edit', 'fix', (e) => <>Pediu alterações em <b>{e.posts?.title}</b></>],
  reprovado: ['x', 'fix', (e) => <>Reprovou <b>{e.posts?.title}</b> (não publicar)</>],
  comentario_cliente: ['chat', '', (e) => <>Comentou em <b>{e.posts?.title}</b></>],
  enviado: ['upload', '', (e) => <>{e.actor} enviou <b>{e.posts?.title}</b></>],
  nova_versao: ['refresh', '', (e) => <>{e.actor} enviou nova versão de <b>{e.posts?.title}</b> ({e.meta})</>],
  resposta: ['chat', '', (e) => <>{e.actor} respondeu em <b>{e.posts?.title}</b></>],
  ajustado_interno: ['check', 'ok', (e) => <>{e.actor} marcou <b>{e.posts?.title}</b> como ajustado e agendado</>],
  aviso: ['bell', '', (e) => <>{e.actor} avisou o cliente ({e.meta})</>],
  cliente_criado: ['plus', '', (e) => <>{e.actor} cadastrou o cliente</>],
};
const CLIENT_SIDE = ['acesso', 'visualizou', 'aprovado', 'ajustes', 'reprovado', 'comentario_cliente'];

export function Timeline({ events, withClient }: { events: ActivityLog[]; withClient?: boolean }) {
  if (!events.length) return null;
  return (
    <ul className="timeline">
      {events.map((e) => {
        const d = EV[e.type];
        // post excluído: usa o texto gravado no log
        const text = d && (e.post_id === null && !['acesso', 'aviso', 'cliente_criado'].includes(e.type))
          ? e.action_text
          : d ? d[2](e) : e.action_text;
        const who = CLIENT_SIDE.includes(e.type) ? (
          <>
            {withClient && <b>{e.clients?.name}</b>}
            {e.actor ? `${withClient ? ' · ' : ''}${e.actor}` : ''}
          </>
        ) : null;
        const hasWho = CLIENT_SIDE.includes(e.type) && (withClient || !!e.actor);
        return (
          <li key={e.id}>
            <span className={`dot ${d?.[1] ?? ''}`}><Icon name={d?.[0] ?? 'sparkle'} /></span>
            <div>
              {hasWho && <>{who}<br /></>}
              {text}
              <time suppressHydrationWarning>{fmtDate(e.created_at)}</time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
