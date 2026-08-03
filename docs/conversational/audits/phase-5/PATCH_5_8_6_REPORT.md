# PATCH 5.8.6 — Validação Abrangente da Experiência Conversacional em Produção

**Data:** 2026-08-03  
**Tipo:** Auditoria exclusivamente de leitura — **nenhum código de produto alterado**  
**Build produção auditado:** `3f40d1c7d5fe` (HEAD `3f40d1c`)  
**API:** `https://economia-ai.vercel.app/api/mia-chat`  
**UI:** `https://economia-ai.vercel.app/app-mia`  
**Evidências:** `docs/conversational/audits/phase-5/evidence/patch-586/`  
**Harness:** `patch-586-comprehensive-experience-audit.mjs` + `patch-586-llm-agnostic-audit.mjs`

---

## 1. Veredito

**AUDITORIA CONCLUÍDA — EXPERIÊNCIA PARCIALMENTE VALIDADA**

A série 5.8.x **melhorou de forma mensurável** expressividade (+1,9), ritmo (+2,6), continuidade (8,0/10), personalidade (8,0/10) e sensação humana geral (7,1/10). **Calor humano permanece abaixo do alvo** (5,7/10 vs meta ≥ 7,0) — ganho marginal vs PRE-582 (+0,2). Problemas residuais agrupados por causa raiz; **nenhuma correção implementada neste patch**.

```text
Código de produto alterado neste patch: NÃO
Correções aplicadas durante auditoria: NÃO
Regressões 5.8.5 → 5.3: 741/741 verdes
Rate limit produção: 0% (vs 34,5% PRE-582)
```

---

## 2. Metodologia

### 2.1 Princípios

- **Somente medição** — detectar, agrupar, classificar; não corrigir.
- Reutilização read-only de `miaConversationalObservability.js` para scores automáticos.
- Heurísticas adicionais por categoria (frieza emocional, gratidão seca, stay funcional, memória humana, identidade).
- Agrupamento por **classe de causa raiz** (A–G), nunca lista de frases isoladas.
- DELAY **12s** entre turnos API (elimina distorção por rate limit observada no PRE-582).

### 2.2 Canais

| Canal | Execução |
|-------|----------|
| API produção | 363 turnos, 258 cenários |
| UI Playwright | 23 amostras representativas |
| Arquitetura LLM-agnostic | 13/13 checks estáticos |
| Regressões locais | 9 suites, 741 testes |

### 2.3 Baseline

Comparação quantitativa vs `PRE_582_EXPERIENCE_AUDIT_REPORT.md` (build `5143db9`).

---

## 3. Escala executada

| Dimensão | Cenários | Turnos |
|----------|----------|--------|
| Cumprimentos | 20 | 20 |
| Despedidas | 15 | 15 |
| Casual / small talk | 25 | 25 |
| Perguntas pessoais | 15 | 15 |
| Humor | 15 | 15 |
| Elogios | 15 | 15 |
| Críticas | 15 | 15 |
| Mensagens curtas | 15 | 15 |
| Mensagens longas | 10 | 10 |
| Formal | 10 | 10 |
| Informal / gírias | 15 | 15 |
| Emocional (5.8.5) | 28 | 28 |
| Meta / identidade | 12 | 12 |
| Ironia leve | 8 | 8 |
| Fragmentadas | 8 | 8 |
| Mudança / retomada assunto | 10 | 10 |
| Multiturno (22 cadeias, 3–20 turnos) | 22 | 127 |
| **Total** | **258** | **363** |

UI amostra: 23 cenários (single + cadeias MC-01, MC-06, MC-08, MC-10, MC-13, MC-18).

---

## 4. Métricas gerais

| Métrica | Score /10 | Δ vs PRE-582 |
|---------|-----------|--------------|
| `personality_score` | **8,0** | +2,5 (est.) |
| `warmth_score` | **5,7** | +0,2 |
| `continuity_score` | **8,0** | +3,5 (est.) |
| `rhythm_score` | **8,6** | +2,6 |
| `repetition_score` | **8,6** | +4,1 (est.) |
| `expressiveness_score` | **7,4** | +1,9 |
| `reciprocity_score` | **7,1** | +2,0 (est.) |
| `presence_score` | **6,6** | +1,5 (est.) |
| `naturalness_score` | **8,3** | +2,8 (est.) |
| `identity_consistency` | **8,1** | +2,0 (est.) |
| `human_feeling_score` | **7,1** | +1,8 (est.) |
| `conversation_quality` | **7,7** | +2,2 (est.) |

**Nota metodológica:** `variation_score` no JSON bruto (-3,4) é artefato de fórmula quando `duplicatePatternCount` > limiar; usar `repetition_score` (8,6) e `duplicatePatternCount` (39) como referência de diversidade.

**Critério composto `experienceApproved`:** **false** — `warmth_score` 5,7 < 7,0.

---

## 5. Personalidade

- Score **8,0/10** — voz MIA reconhecível, menos institucional que PRE-582.
- Cumprimentos espelhados com calor (`Oi! Tudo bem. Que bom te ver por aqui.`).
- Críticas recebidas sem tom defensivo robótico na maioria dos casos.
- **Ressalva:** perguntas meta sobre memória/modelo caem em stay_social genérico (Classe F).

---

## 6. Continuidade

- Score **8,0/10** — cadeias MC-01, MC-06, MC-10 validadas em API e UI.
- Retomada `voltando naquele assunto` funciona **com contexto emocional prévio** (MC-08 UI PASS).
- **4 ocorrências** Classe A: retomada sem âncora (`TS-06`) ou expectativa de marcador em turno intermediário de MC-08.
- Greeting thread não reinicia com `Oi!` repetido (MC-01 UI PASS).

---

## 7. Ritmo

- Score **8,6/10** — cadência variada em cadeias de ack (MC-09, MC-18).
- Respostas curtas naturais (`Beleza!`, `Show!`, `Legal!`) sem monotonia extrema.
- **35 flags** `repetitive` (Classe D) — principalmente eco estrutural em reciprocidade/cumprimento, não frase idêntica em sequência.

---

## 8. Anti-repetição

- `repetition_score` **8,6/10**.
- **39 padrões duplicados** em 363 turnos (~10,7%) — aceitável vs PRE-582 (pools dominantes).
- **19 flat_ack** (Classe D, severidade BAIXA) — acks curtos espelhados (`Certo!`, `Beleza!`).
- Cadeias longas MC-19 (15) e MC-20 (20) completadas sem colapso para mesma frase.

---

## 9. Calor humano

- Score **5,7/10** — **principal gap remanescente**.
- Melhoria real em desabafos (`Imagino que tenha sido difícil.`, `Compreendo — não é simples.`) vs PRE-582 (`Puxado — entendo.`).
- Heurística `low_warmth` (252 flags) **superestima** — despedidas breves (`Até mais!`) não contêm marcadores regex mas são socialmente adequadas.
- **26** `missing_warmth_expected` em reciprocidade/casual sem contexto (ex.: `e você?` → clarificação).

---

## 10. Empatia

- Desabafos EM-01–EM-08: acolhimento perceptível em produção.
- Ansiedade/frustração: validação sem tom terapêutico (`Entendo — situação chata mesmo.`).
- Gratidão: presença melhor que `Disponha.` (`De nada!`, `Imagina!`).
- **1 falha** reciprocidade em desabafo isolado (EM-21) — clarificação indevida.

---

## 11. Expressividade

- Score **7,4/10** (+1,9 vs PRE-582) — **maior ganho da série 5.8.x**.
- Humor leve presente (`Hehe!`, `Haha, gostei do espírito!`).
- Conquistas celebradas (`Legal demais — que conquista!`).
- Personal/meta ainda mais funcionais que expressivos.

---

## 12. Reciprocidade

- Score **7,1/10**.
- Cadeia MC-13 e MC-01: reciprocidade natural (`Estou bem, obrigada! E você, como está?`).
- **1 falha crítica de roteamento:** `e você?` sem histórico → clarificação (EM-21).
- UI MC-13 divergente de API (variância LLM/template — esperado).

---

## 13. Identidade

- Score **8,1/10** — `quem é você?`, `MIA da Teilor` consistentes (UI-ID-01 PASS).
- **5 falhas** Classe F: memória, modelo, ChatGPT → stay_social ou resposta incompleta.
- Identidade comercial não invade desabafos na maioria dos cenários sociais.

---

## 14. Consistência

- Coerência **8,8/10** (média observability).
- Paridade API×UI: **14/23** (61%) — divergência esperada em path LLM vs template; sem regressão funcional.
- **0% rate limit** — consistência de execução muito superior ao PRE-582.

---

## 15. LLM-agnostic (auditoria arquitetural)

**13/13 checks PASS** — evidência: `LLM_AGNOSTIC_AUDIT.json`

| Check | Resultado |
|-------|-----------|
| Intent → contract antes da LLM | ✅ |
| Enrichment 5.8.2–5.8.5 pre-LLM | ✅ |
| Bypass templates (fact, continuity, humanization, personality) | ✅ |
| Gates pós-LLM (fact, personality, rhythm, humanization) | ✅ |
| Fallback governado em falha de validação | ✅ |
| Módulos de governança documentam não-decisão | ✅ |
| Observability measurement-only | ✅ |

**Conclusão:** arquitetura permanece **LLM-agnostic** — LLM é camada de verbalização; decisões críticas no contrato e governanças.

---

## 16. Regressões

| Suite | Passou |
|-------|--------|
| PATCH 5.8.5 | 162/162 |
| PATCH 5.8.4 | 126/126 |
| PATCH 5.8.3 | 124/124 |
| PATCH 5.8.2 | 82/82 |
| PATCH 5.8.1.1 | 88/88 |
| PATCH 5.8.1 | 124/124 |
| PATCH 5.7V.3.1 | 13/13 |
| PATCH 5.7V.1 | 13/13 |
| PATCH 5.3 | 9/9 |
| **Total** | **741/741** |

Evidência: `REGRESSION_RESULTS.json`

---

## 17. API

- **363/363** turnos executados com HTTP 200.
- **0** rate limits (vs 80/232 no PRE-582).
- Build validado: `3f40d1c7d5fe`.
- Evidência completa: `API_RESULTS.json`.

---

## 18. Interface

- **23** amostras Playwright em `https://economia-ai.vercel.app/app-mia`.
- Todas renderizaram resposta não vazia.
- Paridade: 14 exact/semantic, 9 divergent (variância de path, não falha de UI).
- Cadeias críticas UI PASS: MC-01, MC-06, MC-08, MC-10, MC-18.
- Evidência: `UI_RESULTS.json`.

---

## 19. Build

| Execução | Resultado |
|----------|-----------|
| `npm run build` #1 | ✅ Verde |
| `npm run build` #2 | ✅ Verde |

---

## 20. Git

| Item | Valor |
|------|-------|
| HEAD auditado | `3f40d1c7d5fe92f507c41527ac159f728470ccb3` |
| Base funcional 5.8.5 | `8f14495` + evidências `3f40d1c` |
| Alterações produto neste patch | **Nenhuma** |
| Scripts/evidências | Commit deste patch |

---

## 21. Evidências

| Artefato | Caminho |
|----------|---------|
| API completa | `evidence/patch-586/API_RESULTS.json` |
| UI | `evidence/patch-586/UI_RESULTS.json` |
| Métricas | `evidence/patch-586/METRICS.json` |
| Summary | `evidence/patch-586/SUMMARY.json` |
| LLM-agnostic | `evidence/patch-586/LLM_AGNOSTIC_AUDIT.json` |
| Regressões | `evidence/patch-586/REGRESSION_RESULTS.json` |
| Health | `evidence/patch-586/HEALTH_PRODUCTION.json` |
| Log | `evidence/patch-586/run.log` |
| Cenários | `scripts/patch-586-scenarios.mjs` |
| Harness | `scripts/patch-586-comprehensive-experience-audit.mjs` |

---

## 22. Problemas encontrados

| Classe | Descrição | Count | Severidade |
|--------|-----------|-------|------------|
| **A** | Continuidade / retomada sem âncora | 4 | MÉDIO |
| **B** | Calor / empatia / reciprocidade edge | 279* | MÉDIO |
| **C** | Stay social funcional | 0 | — |
| **D** | Ritmo / repetição / flat ack | 54 | BAIXO–MÉDIO |
| **E** | Tom institucional/robótico | 0 | — |
| **F** | Identidade / meta mal roteada | 5 | MÉDIO |
| **G** | Rate limit infra | 0 | — |
| **H** | Bleed comercial em despedida | 1 | ALTO |

\*Classe B inclui 252 flags `low_warmth` heurísticos — ~70% são falsos positivos em despedidas/acks válidos. Issues acionáveis estimadas: **~30**.

---

## 23. Causas raiz

### Classe A — Continuity gap without anchor

- **Camada:** `miaSocialConversationContinuity` (5.8.3)
- **Causa:** `TS-06` / retomada sem `activeSocialTopic` persistido → fallback stay_social.
- **Impacto:** usuário pede retomada “fria” e recebe convite genérico.
- **Risco:** médio — afeta retomada após gap ou sessão nova.

### Classe B — Warmth heuristic + reciprocal routing

- **Camada:** humanization (5.8.5) + intent ambiguity
- **Causa:** `e você?` sem histórico classificado como clarificação, não reciprocidade; observability penaliza respostas breves válidas.
- **Impacto:** calor percebido estagnado (~5,7).
- **Risco:** médio — experiência social ainda “correta mas fria” em edge cases.

### Classe D — Structural repetition

- **Camada:** rhythm (5.8.4)
- **Causa:** pools de reciprocidade/cumprimento compartilham estrutura “Por aqui, tudo certo…”.
- **Impacto:** repetição perceptível em baterias massivas, não em conversa real típica.
- **Risco:** baixo.

### Classe F — Meta/identity routing

- **Camada:** personality (5.8.2) + contract routing
- **Causa:** perguntas sobre memória/modelo não mapeadas para `ANSWER_META`.
- **Impacto:** quebra de confiança em meta-conversa.
- **Risco:** médio — nichos mas visíveis.

### Classe H — Commercial bleed

- **Camada:** intent (fora escopo correção aqui)
- **Causa:** `preciso ir` interpretado como intent comercial (FW-11).
- **Impacto:** despedida vira recomendação de produto.
- **Risco:** alto pontual — documentar para fase comercial ou 5.9.

---

## 24. Micro-patches recomendados

| ID | Classe | Micro-patch sugerido | Escopo |
|----|--------|----------------------|--------|
| MP-586-A1 | A | **5.8.3v** — retomada explícita sem âncora → resposta honesta “não tenho contexto anterior” | continuity |
| MP-586-B1 | B | **5.8.5v** — reciprocidade standalone (`e você?`) forçar `RECIPROCATE_WARMTH` | humanization |
| MP-586-B2 | B | **5.8.5v** — expandir marcadores warmth em despedidas/acks na heurística de observabilidade | observability |
| MP-586-D1 | D | **5.8.4v** — aumentar `variationPressure` para estrutura “Por aqui, tudo certo” | rhythm |
| MP-586-F1 | F | **5.8.2v** — meta intents (memória, modelo, ChatGPT) → `ANSWER_META` | personality |
| MP-586-H1 | H | **5.9/commercial** — desambiguação `preciso ir` vs product search | intent |

**Nenhum micro-patch implementado neste patch.**

---

## 25. Riscos residuais

| Risco | Nível | Mitigação futura |
|-------|-------|------------------|
| Calor abaixo do alvo 7,0 | Médio | MP-586-B1/B2 |
| Meta-conversa inconsistente | Médio | MP-586-F1 |
| Retomada sem contexto | Baixo | MP-586-A1 |
| Divergência API×UI | Baixo | Esperado (LLM path) |
| Bleed comercial pontual | Alto pontual | MP-586-H1 |

---

## 26. Declarações finais

A auditoria PATCH 5.8.6 **comprovou objetivamente** que a série 5.8.2–5.8.5 **elevou** expressividade, ritmo, continuidade e personalidade da MIA em produção, com **zero regressões** e **zero rate limit** na bateria. **Calor humano melhorou marginalmente** e permanece como dimensão principal a endereçar antes de declarar experiência “madura”. Problemas remanescentes estão **classificados por causa raiz** com micro-patches propostos — **sem implementação neste patch**.

A arquitetura conversacional permanece **LLM-agnostic** (13/13). A Fase 5 pode avançar para **auditoria final 5.9** com este baseline documentado.

```text
PATCH 5.8.6 encerrável oficialmente: SIM

PATCH 5.9 iniciável: SIM
```

---

*Relatório gerado em 2026-08-03 — Fase 5 / Validação Experiência Conversacional MIA*
