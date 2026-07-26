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
visitor_day_profile as (
  select
    de.visitor_id,
    bool_or(de.user_id is not null) as visitante_autenticado,
    count(*) filter (where de.event_name = 'mia_question_sent') as perguntas_no_dia,
    bool_or(
      de.event_name = 'mia_question_sent'
      and coalesce((de.metadata->>'has_image')::boolean, false)
    ) as usou_imagem
  from day_events de
  where de.visitor_id is not null
  group by de.visitor_id
),
visitor_milestones as (
  select
    de.visitor_id,
    min(de.created_at) filter (where de.event_name = 'session_started') as t_sessao,
    min(de.created_at) filter (where de.event_name = 'mia_question_sent') as t_pergunta,
    min(de.created_at) filter (where de.event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(de.created_at) filter (where de.event_name = 'offer_click') as t_clique,
    min(de.created_at) filter (where de.event_name = 'favorite_created') as t_favorito,
    min(de.created_at) filter (where de.event_name = 'price_alert_created') as t_alerta
  from day_events de
  where de.visitor_id is not null
  group by de.visitor_id
),
classified as (
  select
    vm.*,
    vdp.visitante_autenticado,
    vdp.perguntas_no_dia,
    vdp.usou_imagem
  from visitor_milestones vm
  join visitor_day_profile vdp on vdp.visitor_id = vm.visitor_id
),
segment_funnel as (
  select
    'segmento_autenticacao'::text as tipo_analise,
    case when c.visitante_autenticado then 'usuario_autenticado' else 'visitante_anonimo' end as subsegmento,
    count(*) filter (where c.t_sessao is not null) as n_sessao,
    count(*) filter (
      where c.t_sessao is not null and c.t_pergunta is not null and c.t_pergunta >= c.t_sessao
    ) as n_pergunta,
    count(*) filter (
      where c.t_pergunta is not null and c.t_recomendacao is not null and c.t_recomendacao >= c.t_pergunta
    ) as n_recomendacao,
    count(*) filter (
      where c.t_recomendacao is not null and c.t_clique is not null and c.t_clique >= c.t_recomendacao
    ) as n_clique,
    count(*) filter (
      where c.t_favorito is not null and c.t_alerta is not null and c.t_alerta >= c.t_favorito
    ) as n_intencao
  from classified c
  group by 1, 2

  union all

  select
    'profundidade_conversa'::text,
    case when c.perguntas_no_dia >= 2 then 'conversa_profunda' else 'conversa_rasa' end,
    count(*) filter (where c.t_sessao is not null),
    count(*) filter (
      where c.t_sessao is not null and c.t_pergunta is not null and c.t_pergunta >= c.t_sessao
    ),
    count(*) filter (
      where c.t_pergunta is not null and c.t_recomendacao is not null and c.t_recomendacao >= c.t_pergunta
    ),
    count(*) filter (
      where c.t_recomendacao is not null and c.t_clique is not null and c.t_clique >= c.t_recomendacao
    ),
    count(*) filter (
      where c.t_favorito is not null and c.t_alerta is not null and c.t_alerta >= c.t_favorito
    )
  from classified c
  where c.t_pergunta is not null
  group by 1, 2

  union all

  select
    'modalidade_pergunta'::text,
    case when c.usou_imagem then 'pergunta_com_imagem' else 'pergunta_so_texto' end,
    count(*) filter (where c.t_sessao is not null),
    count(*) filter (
      where c.t_sessao is not null and c.t_pergunta is not null and c.t_pergunta >= c.t_sessao
    ),
    count(*) filter (
      where c.t_pergunta is not null and c.t_recomendacao is not null and c.t_recomendacao >= c.t_pergunta
    ),
    count(*) filter (
      where c.t_recomendacao is not null and c.t_clique is not null and c.t_clique >= c.t_recomendacao
    ),
    count(*) filter (
      where c.t_favorito is not null and c.t_alerta is not null and c.t_alerta >= c.t_favorito
    )
  from classified c
  where c.t_pergunta is not null
  group by 1, 2
)
select
  sf.tipo_analise,
  sf.subsegmento,
  sf.n_sessao as visitantes_topo_funil,
  sf.n_pergunta,
  sf.n_recomendacao,
  sf.n_clique,
  sf.n_intencao,
  round(sf.n_pergunta::numeric / nullif(sf.n_sessao, 0), 4) as taxa_conversao_sessao_pergunta,
  round(sf.n_recomendacao::numeric / nullif(sf.n_pergunta, 0), 4) as taxa_conversao_pergunta_recomendacao,
  round(sf.n_clique::numeric / nullif(sf.n_recomendacao, 0), 4) as taxa_conversao_recomendacao_clique,
  round(sf.n_intencao::numeric / nullif(sf.n_sessao, 0), 4) as conversao_acumulada_intencao,
  round(
    1 - sf.n_pergunta::numeric / nullif(sf.n_sessao, 0),
    4
  ) as abandono_topo_pergunta,
  rd.ref_day as dia_referencia
from segment_funnel sf
cross join reference_day rd
order by sf.tipo_analise, sf.subsegmento;

-- ═══════════════════════════════════════════════════════════════════════════════