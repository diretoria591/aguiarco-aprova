/** Observação de conteúdo aprovado pelo cliente no WhatsApp (ver team_approve_whatsapp): aparece em vermelho. */
export const WHATSAPP_NOTE_PREFIX = 'Combinado com o cliente pelo WhatsApp';
export const isWhatsappNote = (note: string | null | undefined) => (note ?? '').trim().startsWith(WHATSAPP_NOTE_PREFIX);

/** Texto que a equipe escreveu, sem o cabeçalho automático "Combinado com o cliente pelo WhatsApp (...):". */
export const noteBody = (note: string | null | undefined) => {
  const n = (note ?? '').trim();
  return isWhatsappNote(n) ? n.split('\n').slice(1).join('\n').trim() : n;
};
