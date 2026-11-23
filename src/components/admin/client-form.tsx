'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { removeFiles, safePath, uploadFile } from '@/lib/upload';
import { portalLink } from '@/lib/constants';
import type { Client, ClientSegment } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, Mono, copyText, useUI } from '@/components/ui';
import { useMe } from './me';

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const editing = !!client;
  const router = useRouter();
  const me = useMe();
  const { toast, confirm } = useUI();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [segment, setSegment] = useState<ClientSegment>(client?.segment ?? '');
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(client?.logo_url ?? null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Client | null>(null);
  const [name, setName] = useState(client?.name ?? '');

  function pickLogo(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Escolha uma imagem para o logo.', 'err');
    if (f.size > 5 * 1024 * 1024) return toast('O logo precisa ter até 5 MB.', 'err');
    setLogo(f);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(f));
  }

  async function save() {
    const f = Object.fromEntries(new FormData(formRef.current!)) as Record<string, string>;
    const fields = {
      name: (f.name || '').trim(),
      contact_name: (f.contact_name || '').trim(),
      whatsapp: (f.whatsapp || '').trim(),
      email: (f.email || '').trim(),
      instagram: normalizeIg(f.instagram || ''),
      segment,
      revision_limit: Math.min(20, Math.max(0, Math.round(Number(f.revision_limit)) || 0)),
    };
    if (!fields.name) return toast('Dê um nome para o cliente.', 'err');
    setBusy(true);
    const supabase = createClient();
    try {
      let row: Client;
      if (editing) {
        const { data, error } = await supabase.from('clients').update(fields).eq('id', client.id).select().single();
        if (error) throw error;
        row = data as Client;
      } else {
        const { data, error } = await supabase.from('clients').insert(fields).select().single();
        if (error) throw error;
        row = data as Client;
        await supabase.from('activity_logs').insert({
          client_id: row.id, type: 'cliente_criado', actor: me.name, action_text: `${me.name} cadastrou o cliente`,
        });
      }

      if (logo) {
        const path = safePath(`clients/${row.id}`, logo);
        const url = await uploadFile(path, logo);
        const { data, error } = await supabase.from('clients').update({ logo_url: url, logo_path: path }).eq('id', row.id).select().single();
        if (error) throw error;
        if (client?.logo_path) await removeFiles([client.logo_path]).catch(() => {});
        row = data as Client;
      } else if (removeLogo && client?.logo_path) {
        await supabase.from('clients').update({ logo_url: null, logo_path: null }).eq('id', row.id);
        await removeFiles([client.logo_path]).catch(() => {});
      }

      router.refresh();
      if (editing) {
        toast('Cliente atualizado');
        onClose();
      } else {
        toast('Cliente cadastrado');
        setCreated(row);
      }
    } catch (e) {
      toast(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function relink() {
    if (!client) return;
    const ok = await confirm({
      title: 'Gerar novo link?',
      text: 'O link atual deixa de funcionar imediatamente. Você precisará enviar o novo link para o cliente.',
      okLabel: 'Gerar novo link',
    });
    if (!ok) return;
    const { error } = await createClient().from('clients').update({ access_token: randomToken() }).eq('id', client.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Novo link gerado');
    onClose();
    router.refresh();
  }

  async function del() {
    if (!client) return;
    const ok = await confirm({
      title: `Excluir ${client.name}?`,
      text: 'Todos os materiais, arquivos e comentários deste cliente serão apagados. Essa ação não pode ser desfeita.',
      okLabel: 'Excluir definitivamente',
      danger: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { data: media } = await supabase
      .from('post_media').select('storage_path, posts!inner(client_id)').eq('posts.client_id', client.id);
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) return toast(errMsg(error), 'err');
    await removeFiles([...(media ?? []).map((m) => m.storage_path as string | null), client.logo_path]).catch(() => {});
    toast('Cliente excluído');
    onClose();
    router.push('/dashboard');
    router.refresh();
  }

  if (created) {
    const link = portalLink(created.access_token, window.location.origin);
    return (
      <Modal
        title={<>Cliente <b>cadastrado</b></>}
        onClose={onClose}
        foot={
          <>
            <button className="btn line" onClick={onClose}>Fechar</button>
            <button className="btn" onClick={() => { onClose(); router.push(`/dashboard/clientes/${created.id}`); }}>
              <Icon name="upload" />Enviar primeiro material
            </button>
          </>
        }
      >
        <div className="success">
          <div className="logo-pick">
            <Mono name={created.name} logo={created.logo_url} />
            <div>
              <div style={{ fontWeight: 500 }}>{created.name}</div>
              <div className="small muted">Link exclusivo de aprovação gerado.</div>
            </div>
          </div>
          <div className="linkbox">
            <code>{link}</code>
            <button className="btn sm sand" onClick={async () => { const ok = await copyText(link); toast(ok ? 'Link copiado' : 'Não foi possível copiar', ok ? undefined : 'err'); }}>
              <Icon name="copy" />Copiar link
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Envie este link para o cliente. Ele acessa sem senha e só enxerga os próprios materiais.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={editing ? <>Editar <b>cliente</b></> : <>Novo <b>cliente</b></>}
      onClose={onClose}
      foot={
        <>
          <button className="btn line" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Cadastrar'}</button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="field">
          <label>Logo do cliente <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
          <div className="logo-pick">
            <Mono name={name || '?'} logo={logoPreview} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm line" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" />{logoPreview ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {logoPreview && (
                <button type="button" className="btn sm ghost" onClick={() => { setLogo(null); setLogoPreview(null); setRemoveLogo(true); }}>
                  Remover
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="field">
          <label>Nome do cliente / marca</label>
          <input className="input" name="name" required defaultValue={client?.name ?? ''} placeholder="Ex.: Operlead" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Pessoa de contato</label>
          <input className="input" name="contact_name" defaultValue={client?.contact_name ?? ''} placeholder="Quem aprova os conteúdos" />
        </div>
        <div className="row2">
          <div className="field">
            <label>WhatsApp</label>
            <input className="input" name="whatsapp" inputMode="tel" defaultValue={client?.whatsapp ?? ''} placeholder="+55 11 90000-0000" />
          </div>
          <div className="field">
            <label>E-mail</label>
            <input className="input" name="email" type="email" defaultValue={client?.email ?? ''} placeholder="contato@cliente.com" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cf-ig">Instagram do cliente</label>
          <input className="input" id="cf-ig" name="instagram" defaultValue={client?.instagram ?? ''} placeholder="@perfil" autoComplete="off" />
          <span className="hint">Usado para lembrar a marcação na hora de agendar.</span>
        </div>
        <div className="field">
          <label htmlFor="cf-rev">Rodadas de revisão por conteúdo</label>
          <input className="input" id="cf-rev" name="revision_limit" type="number" min={0} max={20} inputMode="numeric"
            defaultValue={client?.revision_limit ?? 2} style={{ maxWidth: 120 }} />
          <span className="hint">Depois desse número, o cliente é avisado de que a alteração será cobrada à parte. Erros da agência não contam.</span>
        </div>
        <div className="field">
          <label>Área do cliente</label>
          <div className="chips">
            {SEGMENTS.map(([k, l]) => (
              <button type="button" key={k} className={`chip-opt ${segment === k ? 'on' : ''}`} onClick={() => setSegment(segment === k ? '' : k)}>{l}</button>
            ))}
          </div>
          {segment === 'beleza' && <span className="hint">Na área da beleza, quem agenda recebe o lembrete de marcar o salão e a profissional que aparece.</span>}
        </div>
        {editing && (
          <div className="card" style={{ padding: '14px 16px', boxShadow: 'none', margin: '6px 0 4px', display: 'grid', gap: 10 }}>
            <div className="small muted">Gerar um link novo desativa o link antigo — use se o link foi compartilhado com alguém por engano.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm line" onClick={relink}><Icon name="refresh" />Gerar novo link</button>
              <button type="button" className="btn sm danger" onClick={del}><Icon name="trash" />Excluir cliente</button>
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const SEGMENTS: [Exclude<ClientSegment, ''>, string][] = [
  ['saude', 'Saúde'], ['gastronomia', 'Gastronomia'], ['beleza', 'Área da beleza'], ['empresas', 'Empresas / B2B'], ['outra', 'Outra'],
];

/** "perfil", "@perfil" ou "instagram.com/perfil" → "@perfil". */
export function normalizeIg(v: string) {
  const h = v.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@+/, '');
  return h ? `@${h}` : '';
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const m = (e as { message: string }).message;
    if (/row-level security|permission denied/i.test(m)) return 'Sem permissão para esta ação.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Tente novamente.';
    return m;
  }
  return 'Não foi possível concluir. Tente novamente.';
}
