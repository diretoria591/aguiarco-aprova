-- Dados de um relatório mensal para gerar a apresentação (scripts/apresentacao.py),
-- incluindo os posts de outras plataformas (tabela posts_externos, ex.: Aprova Job).
-- Troque :client_id e :mes (AAAA-MM) antes de rodar. Retorna um único JSON.
with p as (
  select p.*,
    (select count(*) from comments k where k.post_id = p.id and k.author_role = 'client'
       and k.kind = 'adjustment' and not coalesce(k.agency_error, false)) as adjustments,
    (select m.file_url from post_media m where m.post_id = p.id
       and (m.file_type like 'cover/image/%' or m.file_type like 'image/%')
     order by m.order_index limit 1) as cover
  from posts p
  where p.client_id = ':client_id'
    and coalesce(to_char(p.scheduled_date, 'YYYY-MM'), to_char(p.sent_at at time zone 'America/Sao_Paulo', 'YYYY-MM')) = ':mes'
)
select json_build_object(
  'month', ':mes',
  'client', (select json_build_object('id', id, 'name', name, 'instagram', coalesce(instagram, ''), 'revision_limit', coalesce(revision_limit, 2))
             from clients where id = ':client_id'),
  'report', (select row_to_json(r) from relatorios r where r.client_id = ':client_id' and r.ref_month = ':mes'),
  'posts', coalesce((select json_agg(t.x order by t.sort_key) from (
      select json_build_object(
        'id', id, 'title', title, 'caption', caption, 'format', format, 'status', status,
        'scheduled_date', scheduled_date, 'scheduled_at', scheduled_at, 'created_at', created_at,
        'approved_at', approved_at, 'adjustments', adjustments, 'cover', cover, 'external', false)::jsonb as x0,
        coalesce(scheduled_date::timestamptz, sent_at) as sort_key from p
      union all
      select json_build_object(
        'id', id, 'title', title, 'caption', caption, 'format', format, 'status', 'approved',
        'scheduled_date', publish_date, 'scheduled_at', publish_date, 'created_at', null,
        'approved_at', null, 'adjustments', 0, 'cover', nullif(image_url, ''), 'external', true,
        'format_label', format_label)::jsonb, publish_date::timestamptz
      from posts_externos
      where client_id = ':client_id'
        and publish_date >= (':mes' || '-01')::date and publish_date < (':mes' || '-01')::date + interval '1 month'
    ) t(x, sort_key)), '[]'::json)
) as data;
