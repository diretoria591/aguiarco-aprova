-- Novo formato "destaque" (destaques do Instagram: stories + capa redonda).
-- Pode rodar de novo sem problema.
alter table public.posts drop constraint if exists posts_format_check;
alter table public.posts add constraint posts_format_check
  check (format in ('foto', 'video', 'reels', 'carrossel', 'arte', 'stories', 'destaque', 'texto'));
