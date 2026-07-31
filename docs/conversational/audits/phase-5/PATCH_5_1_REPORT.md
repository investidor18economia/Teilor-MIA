# PATCH 5.1 — Inventário e Mapeamento Completo dos Egressos Conversacionais

## 1. Veredito

```text
APROVADO
```

Inventário estático e evidência dinâmica **completos** para encerrar o PATCH 5.1 como fase investigativa. Nenhuma alteração funcional foi implementada. O mapeamento comprova **múltiplos egressos conversacionais** com **finalização inconsistente** e **declarações falsas de finalização** em paths legados.

```text
PATCH 5.1 encerrável oficialmente: SIM

Próximo PATCH (5.2) iniciável: SIM — sujeito à sua auditoria e autorização expressa
```

---

## 2. Resumo executivo

A MIA possui **um único sink HTTP funcional** (`sendHttpRuntimeResponse`, linha 26724 de `chat-gpt4o.js`), mas **at least 6 famílias de egresso lógico** que alimentam esse sink com garantias diferentes. Apenas **3 call sites** invocam `finalizeHumanConversationReply`. **12 blocos legados** usam `sendLegacySocialDirectResponse`, que marca `finalization.applied: true` **sem executar** validadores nem fallback governado. O catálogo oficial lista **66 response paths** (`lib/miaResponsePathCatalog.js`).

Evidência dinâmica (localhost + produção `f7a09a0`) confirma que sessões novas sociais usam predominantemente `governed_social_intent_flow` ou `greeting_flow` (fast branch), **não** os blocos legados de linha 33480 — estes permanecem **estruturalmente alcançáveis** quando o Commercial Entry Gate permite entrada comercial.

---

## 3. Documentos mestres consultados

| Documento | Status |
|-----------|--------|
| `docs/core/architecture/MIA_ARCHITECTURE.md` | Lido (referência pipeline) |
| `docs/core/rules/MIA_ENGINEERING_RULES.md` | Lido (invariantes MIA owns intelligence) |
| `docs/conversational/CONVERSATIONAL_BASELINE.md` | Lido (pipeline §2.2, legado resolveContextQuery) |
| `docs/conversational/audits/phase-4/AUDITORIA_MESTRA_CONVERSACIONAL.md` | Lido integralmente |
| Relatórios PATCH 4.1I.* | Referenciados |
| `lib/miaResponsePathCatalog.js` | Lido (66 paths explícitos) |
| `lib/miaRuntimePrecedence.js` | Lido (registry, finalizerRequired) |
| `lib/miaRuntimeEnforcement.js` | Referenciado (seal, double-send guard) |
| `lib/miaPublicApiHardening.js` | Lido (sanitize público) |

**Invariantes preservadas neste patch:** nenhuma alteração de comportamento; apenas scripts de inventário read-only.

**Divergência documentação vs código:** o catálogo declara `finalizerRequired: true` para social flow paths, mas `sendLegacySocialDirectResponse` **satisfaz a flag via metadata** sem chamar o finalizador humano — **registrado como divergência crítica**.

---

## 4. Estado anterior (Auditoria Mestra)

- Arquitetura declarativa madura; execução fragmentada.
- 3 call sites de `finalizeHumanConversationReply`.
- 12× `sendLegacySocialDirectResponse` sem finalize.
- Colisão `ambiguous_social` × `greeting` comprovada.

PATCH 5.1 **formaliza e quantifica** essas descobertas.

---

## 5. Descobertas principais

### 5.1 Contagem de egressos (respostas às 25 perguntas — seção 8.3)

| # | Pergunta | Resposta com evidência |
|---|----------|------------------------|
| 1 | Quantos egressos reais? | **6 famílias lógicas** → **1 sink HTTP** (`sendHttpRuntimeResponse`) + **6 respostas diretas de erro** (`res.status().json` em chat-gpt4o) + **perímetro** mia-chat (429/502/proxy) |
| 2 | Caminhos HTTP? | **~58** (`sendRuntimeResponse` 20 + `respondWithContract` 26 + legado 12 + erro 6 + runGoverned 1 implícito nos anteriores) convergem em **1** `res.status(200).json` |
| 3 | Passam pelo finalizador oficial (`finalizeHumanConversationReply`)? | **3 call sites** apenas (linhas 23437, 23560, 30313) |
| 4 | Passam por validators humanos? | Mesmos 3 + runtime validators em `__sendRuntimeGovernedResponse` (comercial) |
| 5 | Apenas tone guard? | **12 legados** + **respondWithContract** (comercial: tone + first answer, sem human finalize) |
| 6 | Reconstroem contrato parcialmente? | **Sim** — `socialBehaviorContractEarly` em fast branch; legado **declara** contrato sem enrich |
| 7 | Sem contrato enriquecido? | **needs_clarification**, **directReply**, **legado LLM**, **500 catch** |
| 8 | Caminhos legados? | **EG-004, EG-005, EG-006, EG-009** + blocos 33481–34111 |
| 9 | Duplicados? | **Fast branch** (31004 e 34571) vs **blocos legados** (33574 greeting duplica 23647) |
| 10 | Alteram resposta pós-validação? | **Sim** — `polishReplySurface` em `sendHttpRuntimeResponse` (267805–26811) **após** finalização; tone guard em `respondWithContract` |
| 11 | Alteram alvo? | **Sim** — `resolveSemanticTarget` + session anchor; fallback governado |
| 12 | Alteram intenção? | **Sim** — `applyIntentAuthorityToPipeline`, `adaptLegacyPrimaryIntent`, colisão ambiguous |
| 13 | Sessão nova vs multiturno? | **Sim** — B2 turno 2: contrato `mia_compliment` vs isolado `ambiguous_social` (probe P14 estático) |
| 14 | API vs UI? | **Paridade de path** quando mesmo payload; UI strip `responsePath` top-level (sanitizer); path em `latency_analytics.response_path` |
| 15 | Social vs comercial? | Social → finalize humano (fast/governed); comercial → `respondWithContract` + Decision Engine |
| 16 | Resposta vazia? | **Sim** — PR10/P10 `Show` → `reply: ""`, path `governed_social_intent_flow`, validity `valid` |
| 17 | Deixa de chamar provider? | **Sim** — fast branch deny commercial (gate blockedStages) |
| 18 | Provider desnecessário? | **Sim** — `Me ajuda` → comercial com providers (P09) |
| 19 | Fallback após finalizador? | **Sim** — `polishReplySurface` pós-finalize; runtime repair em enforcement |
| 20 | Finalizador sem contexto? | **Sim** — greeting + contrato `ambiguous_social` (Auditoria Mestra + P01/P02) |
| 21 | LLM correto substituído incorretamente? | **Sim** — greeting LLM → pool ambiguous (finalizeHumanConversationReply) |
| 22 | Inválida não substituída? | **Show** → vazio após governed flow |
| 23 | Código morto? | **12 blocos legados** provavelmente **inacessíveis em cold social**; **alcançáveis** se gate comercial aberto |
| 24 | Branches competindo? | **Fast branch vs legado 33480** (mesmo intent greeting/social_validation) |
| 25 | Sequência por família? | Ver §7 e fluxograma |

---

## 6. Fluxograma real do pipeline (não idealizado)

Ver diagrama Mermaid em `AUDITORIA_MESTRA_CONVERSACIONAL.md` §4 — atualizado conceitualmente:

```text
                    ┌─────────────────────────────────────┐
                    │         /api/mia-chat (proxy)        │
                    └─────────────────┬───────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        chat-gpt4o.js handler                              │
├──────────────────────────────────────────────────────────────────────────┤
│ resolveContextQuery (LEGADO) → recognizeMiaIntent → contract early       │
│ Commercial Entry Gate                                                     │
├──────────── DENY ────────────┬──────────── ALLOW ────────────────────────┤
│ runNonCommercialFastBranch   │  needs_clarification ──► sendRuntime (RAW) │
│  ├ greeting/ack/about: FIN   │  directReply ──► respondWithContract       │
│  └ outros: runGoverned+FIN  │  try { LEGACY *_flow ──► sendLegacy }     │
│                              │  commercial pipeline ──► respondWithContract│
│                              │  (2nd fast branch 34571 if DENY late)     │
└──────────────────────────────┴──────────────────────────────────────────┘
                                      ▼
                         sendRuntimeResponse (dispatch mode)
                                      ▼
                         sendHttpRuntimeResponse (ÚNICO 200 JSON)
                                      ▼
                         sanitizePublic (mia-chat) → MIAChat.jsx
```

**Legenda:** FIN = `finalizeHumanConversationReply`; RAW = sem validators humanos.

---

## 7. Matriz de egressos

Arquivo completo: [`evidence/patch-51/EGRESS_MATRIX.json`](evidence/patch-51/EGRESS_MATRIX.json)

| ID | Função | Finalizer real | Validator | Legado | Risco |
|----|--------|----------------|-----------|--------|-------|
| EG-001 | sendHttpRuntimeResponse | runtime | enforcement | — | sink |
| EG-002 | runGovernedSocialIntentFlow | **sim** | **sim** | não | baixo |
| EG-003 | runNonCommercialFastBranch | **sim** | **sim** | não | médio |
| EG-004 | sendLegacySocialDirectResponse ×12 | **não** | **não** | **sim** | **crítico** |
| EG-005 | needs_clarification | não | não | sim | alto |
| EG-006 | directReply | não | parcial | sim | alto |
| EG-007 | respondWithContract | comercial | parcial | parcial | médio |
| EG-008 | general_answer finalize | sim | sim | não | baixo |
| EG-009 | catch 500 | não | não | sim | médio |
| EG-010 | mia-chat proxy | herda | sanitize | não | baixo |
| EG-011 | MIAChat display | — | format | não | médio |

**66 response paths** catalogados em `EMITTED_FUNCTIONAL_RESPONSE_PATHS`.

---

## 8. Evidência dinâmica

| Artefato | Descrição |
|----------|-----------|
| `scripts/patch-51-egress-static-inventory.mjs` | Análise estática (read-only) |
| `scripts/patch-51-egress-dynamic-probes.mjs` | 15 probes localhost |
| `evidence/patch-51/STATIC_EGRESS_INVENTORY.json` | Contagens e call sites |
| `evidence/patch-51/DYNAMIC_EGRESS_PROBES.json` | Probes locais |
| Probes produção manuais | PR01–PR-ANCHOR, build `f7a09a0f5010` |

### Amostra produção (2026-07-31)

| Msg | response_path | reply (truncado) | finalize implícito |
|-----|---------------|------------------|-------------------|
| Oi | greeting_flow | Gostei desse elogio 😄 | sim (substituição ambiguous) |
| Linda | governed_social_intent_flow | Recebi bem — você fala... | sim |
| Show | governed_social_intent_flow | **(vazio)** | sim (falha empty guard) |
| Celular 2000 | return_seguro | iPhone 13... | comercial runtime |

### Interface (`MIAChat.jsx`)

- Consome `data.reply` via `extractApiReply` (1945).
- Envia `messages` + `session_context` para `/api/mia-chat`.
- **Não altera** path; exibe reply final sanitizada.

---

## 9. Causa raiz estrutural (comprovada)

1. **Autoridade de egresso fragmentada** — mesma label `greeting_flow` pode vir de fast branch (com finalize) ou bloco legado (sem finalize), dependendo do gate comercial.
2. **Metadata falsificada** — `sendLegacySocialDirectResponse:27388-27390` define `finalization.applied: true` sem executar `finalizeHumanConversationReply`.
3. **Catálogo vs realidade** — `finalizerRequired: true` no registry não implica finalizador humano executado.
4. **Pós-finalize mutation** — `polishReplySurface` no último mile antes do HTTP.

---

## 10. Decisão arquitetural recomendada (para Fase 5 — não implementada)

1. **PATCH 5.2** — envelope universal derivado de contratos existentes.
2. **PATCH 5.3** — migrar EG-004/005/006 para egress único; legado vira adapter sem HTTP.
3. **PATCH 5.4** — precedência greeting > ambiguous_social (família, não frases).
4. **PATCH 5.5** — empty-reply guard universal.
5. **PATCH 5.6** — gate: path sem finalize real = fail closed.

---

## 11. Ajustes propostos no roadmap da Fase 5

| Patch original | Ajuste proposto |
|----------------|-----------------|
| 5.2 | Incluir explicitamente **separação metadata vs execução** (finalization flags) |
| 5.3 | Priorizar **remoção/adapter de sendLegacySocialDirectResponse** antes de novos módulos |
| 5.4 | Antecipar parcialmente para **antes de 5.7** se regressão greeting persistir |
| 5.6 | Adicionar **detector de finalization.applied sem call stack** |
| 5.7 | Incluir probe **commercial allowed + social intent** para exercitar legado 33480 |

---

## 12. Arquivos criados neste patch

| Arquivo | Tipo |
|---------|------|
| `scripts/patch-51-egress-static-inventory.mjs` | inventário estático |
| `scripts/patch-51-egress-dynamic-probes.mjs` | probes dinâmicos |
| `docs/conversational/audits/phase-5/evidence/patch-51/*` | evidências JSON |
| `docs/conversational/audits/phase-5/PATCH_5_1_REPORT.md` | este relatório |

**Nenhum arquivo de produção alterado.**

---

## 13. Testes

| Tipo | Resultado |
|------|-----------|
| Unitários | N/A (patch investigativo) |
| Inventário estático | Executado ✓ |
| Probes dinâmicos localhost | 10/15 OK (5 rate-limited 429) |
| Probes produção | 5/5 OK |
| Build | Não alterado |
| Git | Apenas docs/scripts novos |

---

## 14. Pendências

- Exercitar **legado 33480** com cenário `commercialEntryAllowed === true` + intent social (probe dedicado no 5.7).
- Reexecutar probes com intervalo >8s ou conversation_id único por batch.
- Playwright UI path trace (5.6/5.7).

---

## 15. Riscos

| Risco | Nível | Mitigação Fase 5 |
|-------|-------|------------------|
| Unificação quebra comercial | Alto | Preservar respondWithContract envelope |
| Remover legado morto quebra anchor+social | Médio | Test matrix commercial allowed |
| False finalization metadata | Alto | 5.3 + 5.6 |

---

## 16. Próximo patch recomendado

**PATCH 5.2 — Contrato Universal de Resposta Conversacional**

Definir envelope que unifique: decisão (contrato existente) → verbalização → validação → reparo → entrega, **sem** criar segundo cérebro.

---

## Declarações finais

```text
PATCH 5.1 encerrável oficialmente: SIM

Próximo PATCH (5.2) iniciável: SIM — aguardando sua auditoria e autorização expressa
```

**NÃO iniciar PATCH 5.2 automaticamente.**
