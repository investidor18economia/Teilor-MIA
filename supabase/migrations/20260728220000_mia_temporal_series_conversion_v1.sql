-- PATCH A.6 — Temporal Series: Conversion & Performance (PATCH 4.3 + 5.3 canonical SQL)
-- Source: docs/analytics/CONVERSION_DASHBOARD.md

begin;

create or replace function public.mia_temporal_series_conversion(
  p_days integer default 30,
  p_offset_days integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with window_bounds as (
    select
      greatest(p_days, 1) as window_days,
      greatest(coalesce(p_offset_days, 0), 0) as offset_days,
      now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0)) as start_ts,
      now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0)) as end_ts
  ),
  production_events as (
    select e.*
    from analytics_events e
    cross join window_bounds wb
    where e.created_at >= wb.start_ts
      and e.created_at < wb.end_ts
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  funnel_events as (
    select
      *,
      (created_at at time zone 'UTC')::date as activity_day
    from production_events
    where event_name in (
      'session_started',
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
  ),
  period_summary as (
    select
      count(*) filter (where event_name = 'mia_recommendation_shown')::bigint as eventos_recomendacoes,
      count(*) filter (where event_name = 'offer_click')::bigint as eventos_cliques,
      count(*) filter (where event_name = 'favorite_created')::bigint as eventos_favoritos,
      count(*) filter (where event_name = 'price_alert_created')::bigint as eventos_alertas,
      count(*) filter (where event_name = 'mia_question_sent')::bigint as eventos_perguntas,
      count(distinct visitor_id) filter (where event_name = 'mia_recommendation_shown' and visitor_id is not null)::bigint as visitantes_recomendacao,
      count(distinct visitor_id) filter (where event_name = 'offer_click' and visitor_id is not null)::bigint as visitantes_clique
    from funnel_events
  ),
  reference_day as (
    select max(activity_day) as ref_day
    from funnel_events
    where visitor_id is not null
  ),
  day_events as (
    select fe.*
    from funnel_events fe
    cross join reference_day r
    where fe.activity_day = r.ref_day
  ),
  visitor_milestones as (
    select
      visitor_id,
      min(created_at) filter (where event_name = 'session_started') as t_sessao,
      min(created_at) filter (where event_name = 'mia_question_sent') as t_pergunta,
      min(created_at) filter (where event_name = 'mia_recommendation_shown') as t_recomendacao,
      min(created_at) filter (where event_name = 'offer_click') as t_clique,
      min(created_at) filter (where event_name = 'favorite_created') as t_favorito,
      min(created_at) filter (where event_name = 'price_alert_created') as t_alerta
    from day_events
    where visitor_id is not null
    group by visitor_id
  ),
  visitor_sequential as (
    select
      count(*) filter (where t_sessao is not null) as v1,
      count(*) filter (where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao) as v2,
      count(*) filter (where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta) as v3,
      count(*) filter (where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao) as v4,
      count(*) filter (where t_clique is not null and t_favorito is not null and t_favorito >= t_clique) as v5,
      count(*) filter (where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito) as v6
    from visitor_milestones
  ),
  funnel_rows as (
    select *
    from (
      values
        (1, 'sessoes_iniciadas', 'session_started'),
        (2, 'perguntas_enviadas', 'mia_question_sent'),
        (3, 'recomendacoes_exibidas', 'mia_recommendation_shown'),
        (4, 'cliques_em_oferta', 'offer_click'),
        (5, 'favoritos_criados', 'favorite_created'),
        (6, 'alertas_preco_criados', 'price_alert_created')
    ) as t(ordem, etapa, event_name)
  ),
  reach_volumes as (
    select
      count(distinct visitor_id) filter (where event_name = 'session_started') as visitantes_sessao,
      count(*) filter (where event_name = 'session_started') as eventos_sessao,
      count(distinct visitor_id) filter (where event_name = 'mia_question_sent') as visitantes_pergunta,
      count(*) filter (where event_name = 'mia_question_sent') as eventos_perguntas,
      count(distinct visitor_id) filter (where event_name = 'mia_recommendation_shown') as visitantes_recomendacao,
      count(*) filter (where event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
      count(distinct visitor_id) filter (where event_name = 'offer_click') as visitantes_clique,
      count(*) filter (where event_name = 'offer_click') as eventos_cliques,
      count(distinct visitor_id) filter (where event_name = 'favorite_created') as visitantes_favorito,
      count(*) filter (where event_name = 'favorite_created') as eventos_favoritos,
      count(distinct visitor_id) filter (where event_name = 'price_alert_created') as visitantes_alerta,
      count(*) filter (where event_name = 'price_alert_created') as eventos_alertas
    from day_events
  ),
  funnel_data as (
    select
      fr.ordem,
      fr.etapa,
      fr.event_name,
      case fr.ordem
        when 1 then rv.visitantes_sessao when 2 then rv.visitantes_pergunta when 3 then rv.visitantes_recomendacao
        when 4 then rv.visitantes_clique when 5 then rv.visitantes_favorito when 6 then rv.visitantes_alerta
      end as visitantes,
      case fr.ordem
        when 1 then rv.eventos_sessao when 2 then rv.eventos_perguntas when 3 then rv.eventos_recomendacoes
        when 4 then rv.eventos_cliques when 5 then rv.eventos_favoritos when 6 then rv.eventos_alertas
      end as eventos,
      case fr.ordem
        when 1 then vs.v1 when 2 then vs.v2 when 3 then vs.v3 when 4 then vs.v4 when 5 then vs.v5 when 6 then vs.v6
      end as visitantes_sequenciais
    from funnel_rows fr
    cross join reach_volumes rv
    cross join visitor_sequential vs
  ),
  funnel_rates as (
    select
      fd.*,
      lag(fd.visitantes_sequenciais) over (order by fd.ordem) as visitantes_seq_anterior,
      first_value(fd.visitantes_sequenciais) over (order by fd.ordem) as visitantes_topo
    from funnel_data fd
  ),
  funnel_stages_rows as (
    select jsonb_build_object(
      'ordem', fr.ordem,
      'etapa', fr.etapa,
      'event_name', fr.event_name,
      'visitantes', fr.visitantes,
      'eventos', fr.eventos,
      'visitantes_sequenciais', fr.visitantes_sequenciais,
      'taxa_conversao_visitante', round(fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_seq_anterior, 0), 4),
      'abandono_visitante', round(1 - fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_seq_anterior, 0), 4),
      'conversao_acumulada_visitante', round(fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_topo, 0), 4)
    ) as row,
    fr.ordem
    from funnel_rates fr
  ),
  stage_counts as (
    select
      count(*) filter (where t_sessao is not null) as n_sessao,
      count(*) filter (where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao) as n_pergunta,
      count(*) filter (where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta) as n_recomendacao,
      count(*) filter (where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao) as n_clique,
      count(*) filter (where t_clique is not null and t_favorito is not null and t_favorito >= t_clique) as n_favorito,
      count(*) filter (where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito) as n_alerta
    from visitor_milestones
  ),
  transitions as (
    select * from (
      values
        (1, 'sessao_para_pergunta', 'sessoes_iniciadas', 'perguntas_enviadas'),
        (2, 'pergunta_para_recomendacao', 'perguntas_enviadas', 'recomendacoes_exibidas'),
        (3, 'recomendacao_para_clique', 'recomendacoes_exibidas', 'cliques_em_oferta'),
        (4, 'clique_para_favorito', 'cliques_em_oferta', 'favoritos_criados'),
        (5, 'favorito_para_alerta', 'favoritos_criados', 'alertas_preco_criados')
    ) as t(ordem_transicao, transicao, etapa_origem, etapa_destino)
  ),
  transition_rates as (
    select
      t.ordem_transicao,
      t.transicao,
      t.etapa_origem,
      t.etapa_destino,
      case t.ordem_transicao when 1 then sc.n_sessao when 2 then sc.n_pergunta when 3 then sc.n_recomendacao when 4 then sc.n_clique when 5 then sc.n_favorito end as visitantes_entrada,
      case t.ordem_transicao when 1 then sc.n_pergunta when 2 then sc.n_recomendacao when 3 then sc.n_clique when 4 then sc.n_favorito when 5 then sc.n_alerta end as visitantes_saida,
      round(
        (case t.ordem_transicao when 1 then sc.n_pergunta when 2 then sc.n_recomendacao when 3 then sc.n_clique when 4 then sc.n_favorito when 5 then sc.n_alerta end)::numeric
        / nullif(case t.ordem_transicao when 1 then sc.n_sessao when 2 then sc.n_pergunta when 3 then sc.n_recomendacao when 4 then sc.n_clique when 5 then sc.n_favorito end, 0),
        4
      ) as taxa_conversao_transicao,
      round(
        1 - (case t.ordem_transicao when 1 then sc.n_pergunta when 2 then sc.n_recomendacao when 3 then sc.n_clique when 4 then sc.n_favorito when 5 then sc.n_alerta end)::numeric
        / nullif(case t.ordem_transicao when 1 then sc.n_sessao when 2 then sc.n_pergunta when 3 then sc.n_recomendacao when 4 then sc.n_clique when 5 then sc.n_favorito end, 0),
        4
      ) as taxa_abandono_transicao
    from transitions t
    cross join stage_counts sc
  ),
  bottleneck_rows as (
    select jsonb_build_object(
      'ordem_transicao', tr.ordem_transicao,
      'transicao', tr.transicao,
      'etapa_origem', tr.etapa_origem,
      'etapa_destino', tr.etapa_destino,
      'visitantes_entrada', tr.visitantes_entrada,
      'visitantes_saida', tr.visitantes_saida,
      'taxa_conversao_transicao', tr.taxa_conversao_transicao,
      'taxa_abandono_transicao', tr.taxa_abandono_transicao,
      'is_gargalo_principal', tr.taxa_abandono_transicao = max(tr.taxa_abandono_transicao) over ()
    ) as row,
    tr.ordem_transicao
    from transition_rates tr
  ),
  daily_reach as (
    select
      fe.activity_day as dia,
      count(*) filter (where fe.event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
      count(*) filter (where fe.event_name = 'offer_click') as eventos_cliques,
      count(*) filter (where fe.event_name = 'favorite_created') as eventos_favoritos,
      count(*) filter (where fe.event_name = 'price_alert_created') as eventos_alertas
    from funnel_events fe
    where fe.visitor_id is not null
    group by fe.activity_day
  ),
  daily_rows as (
    select jsonb_build_object(
      'activity_day', dr.dia,
      'eventos_recomendacoes', dr.eventos_recomendacoes,
      'eventos_cliques', dr.eventos_cliques,
      'eventos_favoritos', dr.eventos_favoritos,
      'eventos_alertas', dr.eventos_alertas,
      'taxa_clique_recomendacao', round(dr.eventos_cliques::numeric / nullif(dr.eventos_recomendacoes, 0), 4),
      'taxa_favoritos_recomendacao', round(dr.eventos_favoritos::numeric / nullif(dr.eventos_recomendacoes, 0), 4),
      'taxa_alertas_recomendacao', round(dr.eventos_alertas::numeric / nullif(dr.eventos_recomendacoes, 0), 4)
    ) as row,
    dr.dia
    from daily_reach dr
    order by dr.dia desc
    limit 7
  )
  select jsonb_build_object(
    'grain', 'rolling_window',
    'granularity', 'day',
    'window_days', (select window_days from window_bounds),
    'offset_days', (select offset_days from window_bounds),
    'reference_day', (select ref_day from reference_day),
    'summary', (
      select jsonb_build_object(
        'eventos_recomendacoes', coalesce(ps.eventos_recomendacoes, 0),
        'eventos_cliques', coalesce(ps.eventos_cliques, 0),
        'eventos_favoritos', coalesce(ps.eventos_favoritos, 0),
        'eventos_alertas', coalesce(ps.eventos_alertas, 0),
        'eventos_perguntas', coalesce(ps.eventos_perguntas, 0),
        'visitantes_recomendacao', coalesce(ps.visitantes_recomendacao, 0),
        'visitantes_clique', coalesce(ps.visitantes_clique, 0),
        'taxa_clique_recomendacao', round(coalesce(ps.eventos_cliques, 0)::numeric / nullif(coalesce(ps.eventos_recomendacoes, 0), 0), 4),
        'taxa_favoritos_recomendacao', round(coalesce(ps.eventos_favoritos, 0)::numeric / nullif(coalesce(ps.eventos_recomendacoes, 0), 0), 4),
        'taxa_alertas_recomendacao', round(coalesce(ps.eventos_alertas, 0)::numeric / nullif(coalesce(ps.eventos_recomendacoes, 0), 0), 4),
        'conversao_acumulada_visitante', (
          select round(vs.v6::numeric / nullif(vs.v1, 0), 4) from visitor_sequential vs
        )
      )
      from period_summary ps
    ),
    'funnel_stages', coalesce((select jsonb_agg(row order by ordem) from funnel_stages_rows), '[]'::jsonb),
    'bottlenecks', coalesce((select jsonb_agg(row order by ordem_transicao) from bottleneck_rows), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(row order by dia desc) from daily_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.mia_temporal_series_conversion(integer, integer) from public, anon, authenticated;
grant execute on function public.mia_temporal_series_conversion(integer, integer) to service_role;

commit;
