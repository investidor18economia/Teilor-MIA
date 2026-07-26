with production_events as (
  select *
  from analytics_events
  where not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
),
funnel_events as (
  select
    *,
    (created_at at time zone 'UTC')::date as activity_day
  from production_events
  where event_name in (
    'session_started',
    'user_authenticated',
    'mia_question_sent',
    'mia_recommendation_shown',
    'offer_click',
    'favorite_created',
    'price_alert_created'
  )
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
stage_counts as (
  select
    count(*) filter (where t_sessao is not null) as n_sessao,
    count(*) filter (
      where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao
    ) as n_pergunta,
    count(*) filter (
      where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta
    ) as n_recomendacao,
    count(*) filter (
      where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao
    ) as n_clique,
    count(*) filter (
      where t_clique is not null and t_favorito is not null and t_favorito >= t_clique
    ) as n_favorito,
    count(*) filter (
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as n_alerta
  from visitor_milestones
),
transitions as (
  select *
  from (
    values
      (1, 'sessao_para_pergunta', 'sessoes_iniciadas', 'perguntas_enviadas'),
      (2, 'pergunta_para_recomendacao', 'perguntas_enviadas', 'recomendacoes_exibidas'),
      (3, 'recomendacao_para_clique', 'recomendacoes_exibidas', 'cliques_em_oferta'),
      (4, 'clique_para_favorito', 'cliques_em_oferta', 'favoritos_criados'),
      (5, 'favorito_para_alerta', 'favoritos_criados', 'alertas_preco_criados')
  ) as t(ordem_transicao, transicao, etapa_origem, etapa_destino)
),
transition_metrics as (
  select
    t.ordem_transicao,
    t.transicao,
    t.etapa_origem,
    t.etapa_destino,
    case t.ordem_transicao
      when 1 then sc.n_sessao
      when 2 then sc.n_pergunta
      when 3 then sc.n_recomendacao
      when 4 then sc.n_clique
      when 5 then sc.n_favorito
    end as visitantes_entrada,
    case t.ordem_transicao
      when 1 then sc.n_pergunta
      when 2 then sc.n_recomendacao
      when 3 then sc.n_clique
      when 4 then sc.n_favorito
      when 5 then sc.n_alerta
    end as visitantes_saida
  from transitions t
  cross join stage_counts sc
),
transition_rates as (
  select
    tm.*,
    tm.visitantes_entrada - tm.visitantes_saida as perda_absoluta_visitantes,
    round(
      tm.visitantes_saida::numeric / nullif(tm.visitantes_entrada, 0),
      4
    ) as taxa_conversao_transicao,
    round(
      1 - tm.visitantes_saida::numeric / nullif(tm.visitantes_entrada, 0),
      4
    ) as taxa_abandono_transicao
  from transition_metrics tm
)
select
  r.ref_day as dia_referencia,
  tr.ordem_transicao,
  tr.transicao as transicao,
  tr.etapa_origem,
  tr.etapa_destino,
  tr.visitantes_entrada,
  tr.visitantes_saida,
  tr.perda_absoluta_visitantes,
  tr.taxa_conversao_transicao,
  tr.taxa_abandono_transicao,
  rank() over (order by tr.taxa_abandono_transicao desc nulls last) as rank_abandono,
  (
    tr.taxa_abandono_transicao = max(tr.taxa_abandono_transicao) over ()
  ) as is_gargalo_principal
from transition_rates tr
cross join reference_day r
order by tr.ordem_transicao;

-- ═══════════════════════════════════════════════════════════════════════════════