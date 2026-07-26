# PATCH 4A.4 — Narrative Planner Closure

**Date:** 2026-07-26  
**Version:** `4A.4.0`

---

## 1. Auditoria inicial (classificação A/B/C)

| Achado | Categoria | PATCH responsável |
|--------|-----------|-------------------|
| Múltiplos contratos de ordem narrativa paralelos | **A** | 4A.4 (este PATCH) |
| `hierarchy[]` não consumida por verbalização | **A** | 4A.4 |
| LLM ainda recebe strings do adapter legado | **B** | 4A.5 |
| Linguagem pouco natural / variação limitada | **B** | 4A.5 |
| Repetição de frases cristalizadas | **B** | 4A.6 |
| Specs traduzidas sem confiança governada | **B** | 4A.7 |
| Personalização insuficiente por perfil/intenção | **B** | 4A.8 |
| Brand switch (Samsung→iPhone) não re-rota | **B** | 4A.8 / 4A.9 |
| Contestação por review externo fraca | **B** | 4A.9 |
| Continuidade "explica/continua" rasa | **B** | 4A.5 + 4A.6 |

---

## 2. Arquitetura anterior

```text
StructuredDecisionFacts → consumidores montavam ordem própria
(hardcoded: gains[0], presentation blocks, narrativeOrder fixo)
```

## 3. Arquitetura nova

```text
StructuredDecisionFacts → miaNarrativePlanner → NarrativePlan → consumidores unificados
```

## 4. Testes

| Suite | Resultado |
|-------|-----------|
| patch-44:narrative-planner-audit | **36/36** |
| patch-41a | **30/30** |
| patch-42 | **30/30** |
| patch-43 | **21/21** |
| patch-4a2vf | **60/60** |
| patch-35a | **15/15** |
| patch-34b | **18/18** |
| patch-32 | **22/22** |

## 5. Veredito

**APROVADA** — deploy `fefd397bfeeb`, produção 12/12, interface local 12/12.

## 6. Deploy e validação

| Etapa | Resultado |
|-------|-----------|
| Commit | `fefd397` |
| Build Vercel | `fefd397bfeeb` |
| Produção API | **12/12** |
| Interface local | **12/12** (`localhost:3004/app-mia`) |
| Evidências | `evidence/PATCH_4A_4_NARRATIVE_PLANNER_EVIDENCE.json` |
