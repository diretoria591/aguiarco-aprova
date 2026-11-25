/** Observação de conteúdo aprovado pelo cliente no WhatsApp (ver team_approve_whatsapp): aparece em vermelho. */
export const WHATSAPP_NOTE_PREFIX = 'Combinado com o cliente pelo WhatsApp';
export const isWhatsappNote = (note: string | null | undefined) => (note ?? '').trim().startsWith(WHATSAPP_NOTE_PREFIX);
