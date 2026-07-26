-- PATCH 5.3 — Conversion Funnel Analytics Estratégico (MIA public events · production scope)
-- Canonical base: docs/analytics/EXECUTIVE_METRICS.md · docs/analytics/CONVERSION_DASHBOARD.md (PATCH 4.3)
-- Operational funnel: docs/analytics/analytics-conversion-dashboard.sql — NÃO duplicar
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Drop-off analysis & bottleneck ranking (reference day · sequential visitor funnel)
-- Query 2 — Cohort conversion funnel (by visitor first_active_day)
-- Query 3 — Sequential conversion by segment & behavioral modifiers
-- Query 4 — Funnel trend comparison (recent vs previous activity windows)

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Drop-off analysis & bottleneck ranking
-- Reuses sequential logic from PATCH 4.3 — outputs strategic drop-off only
-- Does NOT expose reach volumes (visitantes/sessoes/eventos per stage — PATCH 4.3 Q1)
-- ═══════════════════════════════════════════════════════════════════════════════

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
-- QUERY 2 — Cohort conversion funnel (visitor acquisition cohort · lifetime sequential journey)
-- Cohort = first_active_day (EXECUTIVE_METRICS §3.5 · PATCH 5.1)
-- ═══════════════════════════════════════════════════════════════════════════════

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
qualifying_events as (
  select * from funnel_events where visitor_id is not null
),
visitor_first_day as (
  select
    visitor_id,
    min(activity_day) as cohort_day
  from qualifying_events
  group by visitor_id
),
visitor_milestones as (
  select
    vfd.cohort_day,
    qe.visitor_id,
    min(qe.created_at) filter (where qe.event_name = 'session_started') as t_sessao,
    min(qe.created_at) filter (where qe.event_name = 'mia_question_sent') as t_pergunta,
    min(qe.created_at) filter (where qe.event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(qe.created_at) filter (where qe.event_name = 'offer_click') as t_clique,
    min(qe.created_at) filter (where qe.event_name = 'favorite_created') as t_favorito,
    min(qe.created_at) filter (where qe.event_name = 'price_alert_created') as t_alerta
  from qualifying_events qe
  join visitor_first_day vfd on vfd.visitor_id = qe.visitor_id
  group by vfd.cohort_day, qe.visitor_id
),
cohort_funnel as (
  select
    cohort_day,
    count(*) as visitantes_cohort,
    count(*) filter (where t_sessao is not null) as visitantes_seq_sessao,
    count(*) filter (
      where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao
    ) as visitantes_seq_pergunta,
    count(*) filter (
      where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta
    ) as visitantes_seq_recomendacao,
    count(*) filter (
      where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao
    ) as visitantes_seq_clique,
    count(*) filter (
      where t_clique is not null and t_favorito is not null and t_favorito >= t_clique
    ) as visitantes_seq_favorito,
    count(*) filter (
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as visitantes_seq_alerta
  from visitor_milestones
  group by cohort_day
),
reference_day as (
  select max(activity_day) as ref_day from qualifying_events
)
select
  cf.cohort_day,
  cf.visitantes_cohort,
  cf.visitantes_seq_sessao,
  cf.visitantes_seq_pergunta,
  cf.visitantes_seq_recomendacao,
  cf.visitantes_seq_clique,
  cf.visitantes_seq_favorito,
  cf.visitantes_seq_alerta,
  round(
    cf.visitantes_seq_pergunta::numeric / nullif(cf.visitantes_seq_sessao, 0),
    4
  ) as taxa_conversao_sessao_pergunta_cohort,
  round(
    cf.visitantes_seq_recomendacao::numeric / nullif(cf.visitantes_seq_pergunta, 0),
    4
  ) as taxa_conversao_pergunta_recomendacao_cohort,
  round(
    cf.visitantes_seq_clique::numeric / nullif(cf.visitantes_seq_recomendacao, 0),
    4
  ) as taxa_conversao_recomendacao_clique_cohort,
  round(
    cf.visitantes_seq_alerta::numeric / nullif(cf.visitantes_seq_sessao, 0),
    4
  ) as conversao_acumulada_intencao_cohort,
  rd.ref_day as dia_referencia
from cohort_funnel cf
cross join reference_day rd
order by cf.cohort_day desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Sequential conversion by segment & behavioral modifiers (reference day)
-- PATCH 4.3 Q3 uses reach only — this query adds sequential funnel by subsegment
-- ═══════════════════════════════════════════════════════════════════════════════

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
-- QUERY 4 — Funnel trend comparison (7-day windows · sequential visitor funnel)
-- Does NOT reproduce daily reach volume series (PATCH 4.3 Q2)
-- ═══════════════════════════════════════════════════════════════════════════════

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
windows as (
  select
    'janela_recente'::text as janela,
    r.ref_day - 6 as dia_inicio,
    r.ref_day as dia_fim
  from reference_day r
  union all
  select
    'janela_anterior'::text,
    r.ref_day - 13,
    r.ref_day - 7
  from reference_day r
),
window_events as (
  select
    w.janela,
    fe.*
  from funnel_events fe
  cross join windows w
  where fe.activity_day between w.dia_inicio and w.dia_fim
    and fe.visitor_id is not null
),
visitor_window_milestones as (
  select
    we.janela,
    we.activity_day,
    we.visitor_id,
    min(we.created_at) filter (where we.event_name = 'session_started') as t_sessao,
    min(we.created_at) filter (where we.event_name = 'mia_question_sent') as t_pergunta,
    min(we.created_at) filter (where we.event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(we.created_at) filter (where we.event_name = 'offer_click') as t_clique,
    min(we.created_at) filter (where we.event_name = 'favorite_created') as t_favorito,
    min(we.created_at) filter (where we.event_name = 'price_alert_created') as t_alerta
  from window_events we
  group by we.janela, we.activity_day, we.visitor_id
),
window_funnel as (
  select
    janela,
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
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as n_intencao
  from visitor_window_milestones
  group by janela
),
window_rates as (
  select
    wf.janela,
    round(wf.n_pergunta::numeric / nullif(wf.n_sessao, 0), 4) as taxa_conversao_sessao_pergunta,
    round(wf.n_recomendacao::numeric / nullif(wf.n_pergunta, 0), 4) as taxa_conversao_pergunta_recomendacao,
    round(wf.n_clique::numeric / nullif(wf.n_recomendacao, 0), 4) as taxa_conversao_recomendacao_clique,
    round(wf.n_intencao::numeric / nullif(wf.n_sessao, 0), 4) as conversao_acumulada_intencao,
    round(1 - wf.n_pergunta::numeric / nullif(wf.n_sessao, 0), 4) as abandono_topo_pergunta
  from window_funnel wf
)
select
  wr.janela,
  w.dia_inicio,
  w.dia_fim,
  wr.taxa_conversao_sessao_pergunta,
  wr.taxa_conversao_pergunta_recomendacao,
  wr.taxa_conversao_recomendacao_clique,
  wr.conversao_acumulada_intencao,
  wr.abandono_topo_pergunta,
  rd.ref_day as dia_referencia,
  round(
    wr.taxa_conversao_sessao_pergunta
    - lag(wr.taxa_conversao_sessao_pergunta) over (order by wr.janela desc),
    4
  ) as delta_taxa_sessao_pergunta,
  round(
    wr.taxa_conversao_recomendacao_clique
    - lag(wr.taxa_conversao_recomendacao_clique) over (order by wr.janela desc),
    4
  ) as delta_taxa_recomendacao_clique,
  round(
    wr.conversao_acumulada_intencao
    - lag(wr.conversao_acumulada_intencao) over (order by wr.janela desc),
    4
  ) as delta_conversao_acumulada_intencao,
  case
    when wr.conversao_acumulada_intencao is null then null
    when wr.conversao_acumulada_intencao > lag(wr.conversao_acumulada_intencao) over (order by wr.janela desc)
      then 'melhorando'
    when wr.conversao_acumulada_intencao < lag(wr.conversao_acumulada_intencao) over (order by wr.janela desc)
      then 'piorando'
    else 'estavel'
  end as sinal_tendencia_funil
from window_rates wr
join windows w on w.janela = wr.janela
cross join reference_day rd
order by wr.janela desc;
