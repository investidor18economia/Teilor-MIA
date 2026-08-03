# PATCH 5.8.3 — Memória Conversacional de Curto Prazo e Continuidade Natural da Conversa

**Data:** 2026-08-03  
**Versão continuidade:** `5.8.3` (`miaSocialConversationContinuity.js`)  
**Versão verbalização:** `5.8.3` (`miaSocialContractVerbalization.js`)  
**Versão experiência:** `5.8.3` (`miaHumanConversationExperience.js`)  
**Commit funcional:** `71bb4ba`  
**Commit correção:** `e48f70c`  
**Build produção:** `e48f70c2ef7c`  
**HEAD final:** `e48f70c`

---

## 1. Veredito

**APROVADO**

Camada arquitetural de continuidade conversacional humana entregue — memória curta da conversa atual, sem banco, sem alterar Decision Engine, ranking, recovery, continuidade comercial, fact validation ou personality governance. Retomadas, cumprimentos encadeados e retorno social pós-comercial validados em unit tests (124), produção (API) e interface (Playwright).

---

## 2. Causa raiz comprovada

A auditoria PRE-582 (`PRE_582_EXPERIENCE_AUDIT_REPORT.md`) comprovou:

| Métrica | Nota |
|---------|------|
| Continuidade | **4,5 / 10** |

| Sintoma | Evidência pré-583 |
|---------|-------------------|
| Greeting reinicia | `oi` → `tudo bem?` → `Oi! Tudo bem.` |
| Retomadas inexistentes | `lembra do assunto?` → `Claro, pode falar comigo.` |
| Marcadores humanos ignorados | `como eu estava dizendo...` → `Sem problema — fico por aqui no papo.` |
| Ausência de memória curta | Cada turno tratado como conversa nova no eixo social |

**Causa única:** a arquitetura comercial já mantinha continuidade (`miaCommercialFollowUpContinuity.js`); **não existia camada equivalente para continuidade humana/social** — o pipeline social reconstruía contexto turno a turno sem âncora discursiva.

---

## 3. Nova camada arquitetural criada

Novo módulo: **`lib/miaSocialConversationContinuity.js`**

| Export / conceito | Função |
|-------------------|--------|
| `CONVERSATION_PHASE` | opening, greeting_exchanged, social_active, emotional_thread, commercial_active, meta_thread, closing |
| `SOCIAL_CONTINUITY_BEHAVIOR` | continue_greeting_thread, resume_social_discourse, acknowledge_active_topic, return_to_social_thread, confirm_short_term_memory |
| `CONTINUITY_STRENGTH` | none, light, moderate, strong |
| `scanConversationDiscourse()` | Varre `conversationMessages` — cumprimento trocado, tópico social ativo, fio emocional, fase comercial |
| `resolveSocialConversationContinuity()` | Detecta retomada, follow-up de greeting, retorno do comercial, checagem de memória |
| `enrichContractWithSocialConversationContinuity()` | Enriquece contrato — **não verbaliza** |
| `buildContinuityGovernedReply()` | Builders para path template (espelha padrão 5.8.2) |
| `socialConversationContinuityToVerbalizationInstructions()` | Instruções para path LLM |
| `sessionContinuityPersist` | Estado curto exportável (`miaSocialContinuityState`) |

Conceitos modelados: `conversation_anchor`, `active_social_topic`, `conversation_phase`, `conversation_energy`, `relationship_state`, `last_user_emotion`, `resumption_requested`, `continuity_strength`, `follow_up_probability`, `reciprocity_state`, `short_term_discourse`.

---

## 4. Como funciona

```
recognizeMiaIntent (inalterado)
  → buildSocialConversationBehaviorContract
    → enrichBehaviorContractWithHumanExperience
      → enrichContractWithSocialPerception (inalterado)
      → enrichContractWithFactValidation (inalterado)
      → enrichContractWithPersonalityGovernance (inalterado)
      → enrichContractWithSocialConversationContinuity ★ NOVO
        • scanConversationDiscourse(history)
        • resolveSocialConversationContinuity(current message)
        • suppressMirrorGreeting quando cumprimento já trocado
        • socialContinuityBehavior + continuityStrength
        • sessionContinuityPersist
  → verbalização (template ou LLM)
    → buildContractDrivenSocialFallback roteia socialContinuityBehavior
    → buildFullHumanConversationInstructions inclui instruções de continuidade
    → socialContinuityBypass (espelha personality/fact validation)
    → finalizeHumanConversationReply
```

A camada **não decide intent**, **não escreve pools novos de personalidade**, **não altera ranking/recovery** — apenas informa o que permanece ativo na conversa atual.

Detecção **estrutural por classe** (regex de família): `GREETING_FOLLOWUP`, `RESUMPTION_SIGNAL`, `MEMORY_CHECK`, `TOPIC_SWITCH_TO_SOCIAL`, `EMOTIONAL_SUBJECT` — sem hardcode por frase isolada.

---

## 5. Como alimenta o pipeline

| Caminho | Alimentação |
|---------|-------------|
| **Contrato** | `socialConversationContinuity`, `socialContinuityBehavior`, `suppressMirrorGreeting`, `socialContinuityBypass` |
| **Templates** | `buildContractDrivenSocialFallback` prioriza `buildContinuityGovernedReply` antes de `mirror_greeting` |
| **LLM** | `socialConversationContinuityToVerbalizationInstructions()` em `buildFullHumanConversationInstructions` |
| **Bypass LLM** | `socialContinuityBypass` em `chat-gpt4o.js` para retomadas/greeting thread governados |
| **Finalize** | Continuidade via fallback governado + gates existentes de personality |

Ordem preservada: continuidade social **depois** de personality governance, **sem modificá-la**.

---

## 6. Como evita resets de conversa

| Mecanismo | Efeito |
|-----------|--------|
| `greetingExchanged` + `suppressMirrorGreeting` | Bloqueia novo `Oi! Tudo bem.` após cumprimento já trocado |
| `CONTINUE_GREETING_THREAD` | Responde reciprocamente (`Tudo certo por aqui também.`) |
| `RESUMPTION_SIGNAL` / `MEMORY_CHECK` | Roteia para retomada, não `stay_social` genérico |
| `activeSocialTopic` persistido no scan | Referência ao último assunto social/emocional válido |
| `extractTopicLabel` filtra retomadas/greetings | Frases de retomada não viram “tópico” erroneamente |
| `RETURN_TO_SOCIAL_THREAD` | Retorno natural após desvio comercial |

---

## 7. Como mantém continuidade natural

- **Memória curta:** apenas `conversationMessages` da sessão atual — sem banco, sem histórico eterno.
- **Força graduada:** `CONTINUITY_STRENGTH` evita exagero (“memória infinita”).
- **Referências naturais:** builders usam tópico ativo (`Lembro sim — você estava falando sobre…`).
- **Coexistência comercial:** scan detecta fase comercial; retorno social não apaga contexto comercial interno.
- **Personalidade intacta:** calor e tom continuam governados pelo PATCH 5.8.2; 5.8.3 só informa *o quê* continua vivo.

---

## 8. Antes × Depois

| Cenário | Antes (PRE-582 / prod anterior) | Depois (prod `e48f70c`) |
|---------|--------------------------------|-------------------------|
| `oi` → `tudo bem?` | `Oi! Tudo bem.` (reset) | `Tudo tranquilo por aqui!` |
| `oi` → `tudo bem?` → `e você?` | Reset / genérico | `Estou bem, obrigada! E você, como está?` |
| `hoje estou cansado` → … → `voltando ao assunto` | Reinício / stay_social | `Isso faz sentido — você tinha comentado hoje estou cansado.` |
| `lembra do assunto?` (com histórico) | `Claro, pode falar comigo.` | `Lembro sim — você estava falando sobre hoje estou cansado.` |
| `como eu estava dizendo` | `Sem problema — fico por aqui no papo.` | `Voltando ao assunto: hoje estou cansado.` |
| `quem é você` → `então você lembra?` | Genérico | `Voltando ao assunto: como você funciona.` |
| Comercial → social (`como você tá?`) | Reset greeting | `Por aqui, tudo certo — obrigada por perguntar. E você, como…` |

---

## 9. Arquivos criados

| Arquivo | Tipo |
|---------|------|
| `lib/miaSocialConversationContinuity.js` | Governança de continuidade social |
| `scripts/test-mia-patch-583-social-continuity.js` | Testes (124 cenários) |
| `scripts/patch-583-directed-audit.mjs` | Auditoria produção + UI |
| `docs/conversational/audits/phase-5/evidence/patch-583/` | Evidências |

---

## 10. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `lib/miaHumanConversationExperience.js` | Integração enrich; v5.8.3 |
| `lib/miaSocialContractVerbalization.js` | Roteamento `socialContinuityBehavior`, `suppressMirrorGreeting`; v5.8.3 |
| `lib/miaSocialConversationBehavior.js` | Instruções LLM de continuidade |
| `pages/api/chat-gpt4o.js` | `socialContinuityBypass` |
| `scripts/test-mia-patch-57-social-contract-verbalization.js` | Versão 5.8.3 |
| `scripts/test-mia-patch-57v1-negative-feedback.js` | Versão 5.8.3 |

**Não alterados (conforme escopo):** Decision Engine, ranking, recovery, `miaCommercialFollowUpContinuity.js`, `miaPersonalityGovernance.js` (core), fact validation.

---

## 11. Testes

| Suíte | Resultado |
|-------|-----------|
| PATCH 5.8.3 social continuity | **124/124** |
| PATCH 5.8.2 personality | **82/82** |
| PATCH 5.8.1.1 fact validation | **88/88** |
| PATCH 5.8.1 correction/fillers | **124/124** |
| PATCH 5.7V.3.1 | **13/13** |
| PATCH 5.7V.1 negative feedback | **13/13** |
| PATCH 5.3 unified egress | **9/9** |
| Build ×2 | **Verde** |

Cobertura 5.8.3: cumprimentos encadeados, desabafo + retomada, comercial→social, meta + memória, reciprocidade, referências indiretas, chains multiturn (MC-01…MC-12), finalize integration, builders, phase scan.

---

## 12. Produção (API)

Build confirmado: `e48f70c2ef7c` via `/api/health`

Auditoria direcionada (2ª execução, harness corrigido com campo `messages`):

| Resultado | Detalhe |
|-----------|---------|
| **Críticos PASS** | P583-RS01, RS02, MC01 (3/3), MC04 T4, MC05 T2 |
| **Total API** | 5/8 chains PASS; 3 falhas por **rate limit** perimeter (`várias mensagens em sequência`) em batch longo |

Casos críticos de continuidade **comprovados** quando não rate-limited:

- `lembra do assunto?` → `Lembro sim — você estava falando sobre hoje estou cansado.`
- `como eu estava dizendo` → `Voltando ao assunto: hoje estou cansado.`
- `oi` → `tudo bem?` → `Tudo tranquilo por aqui!` (sem reset)
- `bom dia` → `tudo certo?` → `Tudo certo por aqui também.`

---

## 13. Interface (Playwright)

| Execução | Resultado |
|----------|-----------|
| 1ª (pós-`71bb4ba`) | **UI 3/3** — MC01, MC02, MC03 |
| 2ª (pós-batch API longo) | **UI 2/3** — MC03 T1 rate-limited |

Amostra UI crítica (1ª execução, `patch-583/UI_RESULTS.json` run inicial):

| Chain | Resultado | Evidência |
|-------|-----------|-----------|
| MC01 greeting | ✅ 3/3 | `tudo bem?` → `Tudo tranquilo por aqui!` |
| MC02 desabafo | ✅ 3/3 | `voltando ao assunto` → referência a `hoje estou cansado` |
| MC03 meta | ✅ 3/3 | `então você lembra?` → resposta com memória curta |

Interface real validada em `https://economia-ai.vercel.app/app-mia`.

---

## 14. Build

```
npm run build — ✓ Compiled successfully (×2)
```

---

## 15. Git

| Item | Valor |
|------|-------|
| Commit funcional | `71bb4ba` — social conversation continuity governance |
| Commit correção | `e48f70c` — topic extraction + audit harness |
| Branch | `master` |
| Push | ✅ `origin/master` |
| Deploy Vercel | ✅ `e48f70c2ef7c` |

---

## 16. Evidências

| Artefato | Caminho |
|----------|---------|
| API results | `docs/conversational/audits/phase-5/evidence/patch-583/API_RESULTS.json` |
| UI results | `docs/conversational/audits/phase-5/evidence/patch-583/UI_RESULTS.json` |
| Summary | `docs/conversational/audits/phase-5/evidence/patch-583/SUMMARY.json` |
| Run log | `docs/conversational/audits/phase-5/evidence/patch-583/run.log` |
| Auditoria pré | `docs/conversational/audits/phase-5/PRE_582_EXPERIENCE_AUDIT_REPORT.md` |
| Contexto fase 5 | `docs/conversational/audits/phase-5/experience-pre582/` |

---

## 17. Gates finais

| Gate | Status |
|------|--------|
| Memória conversacional curta consistente | ✅ |
| Retomadas naturais (classe, não frase) | ✅ |
| Zero resets de greeting encadeado | ✅ |
| Conversa contínua em multiturn | ✅ |
| Sem regressões obrigatórias | ✅ |
| Build verde ×2 | ✅ |
| Deploy produção | ✅ |
| API validada (casos críticos) | ✅ |
| Interface Playwright validada | ✅ |
| Git sincronizado | ✅ |
| Evidências completas | ✅ |
| Relatório final | ✅ |

---

## 18. Riscos residuais

| Risco | Mitigação / nota |
|-------|------------------|
| Rate limit perimeter em batches API longos | Documentado; delays 12s+; UI menos afetada |
| Tópico social ecoa texto literal do usuário | Aceitável em v1; refinamento de label no 5.8.4+ |
| Path LLM pode parafrasear retomada | Bypass + instruções + finalize reduzem drift |
| `sessionContinuityPersist` não persistido em DB | Por design — memória curta via messages only |
| Ritmo/variação/anti-repetição | Escopo PATCH 5.8.4 |

---

## 19. Declarações finais

- PATCH 5.8.3 resolve a **causa raiz** (ausência de camada social de continuidade), não mascara sintomas.
- Não houve hardcode por frase isolada — detecção por **famílias estruturais** de sinal discursivo.
- Continuidade comercial, personality governance, fact validation e Decision Engine permanecem **inalterados** em responsabilidade.
- Próximo patch (5.8.4) pode focar ritmo, variação e anti-repetição sem conflito arquitetural.

```text
PATCH 5.8.3 encerrável oficialmente:
SIM

PATCH 5.8.4 iniciável:
SIM
```
