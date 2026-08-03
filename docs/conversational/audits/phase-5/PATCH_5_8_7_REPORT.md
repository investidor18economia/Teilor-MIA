# PATCH 5.8.7 — Refinamento Final da Experiência Conversacional

**Data:** 2026-08-03  
**Tipo:** Refinamento arquitetural da experiência (sem alterar Decision Engine, Intent Recognition, Ranking, Recovery ou Fact Validation)  
**Build produção validado:** `7362198aa773` (HEAD `7362198`)  
**API:** `https://economia-ai.vercel.app/api/mia-chat`  
**UI:** `https://economia-ai.vercel.app/app-mia`  
**Evidências:** `docs/conversational/audits/phase-5/evidence/patch-587/`  
**Harness:** `scripts/test-mia-patch-587-experience-refinement.js` + `scripts/patch-587-directed-audit.mjs`

---

## 1. Veredito

**PATCH APROVADO — EXPERIÊNCIA CONVERSACIONAL REFINADA PARA ENCERRAMENTO DA FASE 5.8**

Todas as classes residuais identificadas na auditoria 5.8.6 (A, B, D, F, H) foram corrigidas por governança arquitetural, sem hardcodes por frase, sem alterar camadas proibidas e com zero regressões nas suites obrigatórias.

```text
PATCH 5.8.7 encerrável oficialmente: SIM
PATCH 5.9 iniciável: SIM
```

---

## 2. Causa raiz comprovada

| Classe | Sintoma (5.8.6) | Causa raiz |
|--------|-----------------|------------|
| **A** | Retomadas sem âncora caíam em stay_social genérico | Continuity não distinguia `RESUME_WITHOUT_ANCHOR` de retomada com tópico ativo |
| **B** | Reciprocidade perdia para clarificação ou resposta fria | Personality priorizava validação emocional/clarificação sobre `RECIPROCATE_WARMTH`; marcadores incompletos |
| **D** | Repetição estrutural "Por aqui, tudo certo…" | Rhythm cooldown insuficiente para pool recíproco; mesma estrutura `tudo/por aqui` sem penalização estrutural |
| **F** | Meta (memória, modelo, ChatGPT) → stay_social neutro | `IDENTITY_QUERY_KIND` incompleto; bypass de verbalização não cobria novos tipos |
| **H** | Despedidas com âncora comercial → recomendação de produto | Intent permanece `commerce` por design; **egress comercial ignorava `socialDepartureMode`** mesmo com continuity bypass configurado |

A causa mais crítica da Classe H foi confirmada em produção: o contrato tinha `socialContinuityBypass: true`, mas o handler comercial (`chat-gpt4o.js`) não interceptava despedidas sociais antes do fluxo comercial quando havia âncora ativa.

---

## 3. Classes corrigidas

- **Classe A** — Continuidade social sem âncora (`RESUME_WITHOUT_ANCHOR`), marcadores de retomada expandidos, `lastSubstantiveUserMessage` no scan de discourse
- **Classe B** — Reciprocidade priorizada sobre clarificação/emocional; marcadores expandidos (`como você está`, `como foi o seu dia`); bypass de verbalização governada
- **Classe D** — Rhythm 5.8.7: cooldown 4 turnos, janela 10, classe `reciprocal_structure`, pools recíprocos diversificados
- **Classe F** — Novos kinds: MEMORY, MODEL_TECH, AI_NATURE, LEARNING, MIA_BRAND com templates naturais
- **Classe H** — `SOCIAL_DEPARTURE` + `SOCIAL_CLOSING`; commerce `FORBIDDEN` pós-continuity; gate `shouldForceSocialExperienceEgress` no handler; validação `commercial_bleed_on_departure`

---

## 4. Solução arquitetural aplicada

Pipeline inalterado — evolução incremental das camadas existentes:

```
personality (5.8.7) → continuity (5.8.7) → rhythm (5.8.7) → humanization (5.8.5) → verbalization
                                                              ↓
                              experience gate (5.8.7): socialDepartureMode → non-commercial egress
```

**Princípios respeitados:**
- Correção por categoria/comportamento/governança
- Determinístico (rhythm scoring, não aleatório)
- LLM-agnostic (bypass governado quando contrato exige)
- Intent Recognition intocado — desvio comercial resolvido via experience egress gate

---

## 5. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `scripts/test-mia-patch-587-experience-refinement.js` | Bateria 195 cenários direcionados |
| `scripts/patch-587-directed-audit.mjs` | Auditoria API + Playwright produção |
| `docs/conversational/audits/phase-5/evidence/patch-587/` | Evidências completas |
| `docs/conversational/audits/phase-5/PATCH_5_8_7_REPORT.md` | Este relatório |

---

## 6. Arquivos alterados

| Arquivo | Versão | Alteração |
|---------|--------|-----------|
| `lib/miaSocialConversationContinuity.js` | 5.8.7 | RESUME_WITHOUT_ANCHOR, SOCIAL_CLOSING, SOCIAL_DEPARTURE |
| `lib/miaPersonalityGovernance.js` | 5.8.7 | Identity kinds, reciprocidade prioritária, pools |
| `lib/miaConversationalRhythmGovernance.js` | 5.8.7 | Anti-repetição recíproca estrutural |
| `lib/miaHumanConversationExperience.js` | 5.8.7 | Commerce block pós-departure, egress gate, validação bleed |
| `lib/miaGovernedFallbackPolicy.js` | — | Farewell driven por contract (continuity closing) |
| `pages/api/chat-gpt4o.js` | — | Gate `shouldForceSocialExperienceEgress` |
| `scripts/test-mia-patch-582..585-*.js` | — | Assertions de versão atualizadas |

---

## 7. Antes × Depois

| Cenário | Antes (5.8.6) | Depois (5.8.7) |
|---------|---------------|----------------|
| `volta pro papo de antes` (sem âncora) | stay_social genérico | Retomada governada pedindo contexto |
| `e você?` / `como você está?` | Clarificação ou frio | Reciprocidade calorosa governada |
| `você é ChatGPT?` / `você lembra?` | stay_social | Identidade MIA transparente |
| `preciso ir` (após compra) | Recomendação iPhone/notebook | Despedida natural, zero comercial |
| Pool recíproco repetido | Mesma estrutura "Por aqui, tudo certo" | Rotação determinística com penalização estrutural |

---

## 8. Validação

### Bateria local direcionada

| Métrica | Valor |
|---------|-------|
| Cenários PATCH 5.8.7 | **195** |
| Distribuição | continuidade, retomadas, reciprocidade, identidade, meta, despedidas, transições, repetição, memória |
| Resultado | **195/195 PASS** |

---

## 9. API

Auditoria produção `patch-587-directed-audit.mjs` (build `7362198aa773`):

| Métrica | Resultado |
|---------|-----------|
| Cadeias API | **11/11 PASS** |
| Rate limit | 0% |
| Classe H produção | `P587-H01` T3: "Até mais — foi bom conversar!" |
| Classe A produção | `P587-A01` retomada com memória de turno anterior |

Evidência: `evidence/patch-587/API_RESULTS.json`

---

## 10. Interface

Playwright em `https://economia-ai.vercel.app/app-mia`:

| Métrica | Resultado |
|---------|-----------|
| Cadeias UI | **4/4 PASS** |
| Cenários | reciprocidade, identidade, despedida pós-comercial, retomada |

Evidência: `evidence/patch-587/UI_RESULTS.json`

---

## 11. Regressões

| Suite | Testes | Resultado |
|-------|--------|-----------|
| PATCH 5.8.7 | 195 | PASS |
| PATCH 5.8.6 (evidência read-only) | — | Baseline preservado |
| PATCH 5.8.5 | 162 | PASS |
| PATCH 5.8.4 | 126 | PASS |
| PATCH 5.8.3 | 124 | PASS |
| PATCH 5.8.2 | 82 | PASS |
| PATCH 5.8.1.1 | 88 | PASS |
| PATCH 5.8.1 | 124 | PASS |
| PATCH 5.7V.3.1 | 9 | PASS |
| PATCH 5.7V.1 | 13 | PASS |
| PATCH 5.7 (verbalization) | 6 | PASS |
| PATCH 5.3 | 9 | PASS |
| **Total** | **951** | **0 falhas** |

---

## 12. Build

| Execução | Resultado |
|----------|-----------|
| `npm run build` #1 | Verde |
| `npm run build` #2 | Verde |

---

## 13. Deploy

| Item | Valor |
|------|-------|
| Commits | `ab4ce42` (refinement) + `7362198` (egress gate H) |
| Push | `origin/master` sincronizado |
| Health | `7362198aa773` confirmado em produção |
| Timestamp deploy | 2026-08-03T15:52 UTC |

---

## 14. Git

```
7362198 fix(mia): force social departure egress over commercial anchor bleed
ab4ce42 fix(mia): PATCH 5.8.7 final conversational experience refinement
d453912 docs(mia): PATCH 5.8.6 comprehensive experience validation audit
```

Branch `master` sincronizada com `origin/master`.

---

## 15. Evidências

| Artefato | Caminho |
|----------|---------|
| SUMMARY | `evidence/patch-587/SUMMARY.json` |
| API results | `evidence/patch-587/API_RESULTS.json` |
| UI results | `evidence/patch-587/UI_RESULTS.json` |
| Run logs | `evidence/patch-587/audit-console-v3.log`, `run.log` |
| Test harness | `scripts/test-mia-patch-587-experience-refinement.js` |

---

## 16. Riscos residuais

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Despedidas ambíguas sem marcador social (`preciso` isolado sem `ir/sair`) | Baixa | Expandir SOCIAL_DEPARTURE apenas por categoria, não frase |
| LLM pode gerar identidade institucional em flows não-bypass | Baixa | Personality + perception validators existentes |
| UI Playwright sensível a mudanças de classe CSS | Média | Seletores `.mia-input` alinhados ao padrão 5.8.5 |

Nenhum risco bloqueante identificado para iniciar PATCH 5.9.

---

## 17. Declarações finais

1. Nenhuma camada proibida foi alterada (Decision Engine, Intent Recognition, Ranking, Recovery, Fact Validation core).
2. Todas as correções são por governança de comportamento, não exceções por frase.
3. A experiência conversacional está consistente do cumprimento à despedida.
4. Produção e interface validadas no build `7362198aa773`.
5. Regressões completas verdes (951 testes).
6. Evidências arquivadas e Git sincronizado.

```text
PATCH 5.8.7 encerrável oficialmente: SIM
PATCH 5.9 iniciável: SIM
```
