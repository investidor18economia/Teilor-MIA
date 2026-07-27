# PATCH 4A.7V — Validação Final de Confiança e Paridade

**Date:** 2026-07-27  
**Version:** `4A.7V.0`  
**Depends on:** PATCH 4A.7 (`6ea5930+`)

---

## 1. Veredito

Ver seção 23 após deploy e revalidação REAL.

---

## 2. Resumo executivo

O PATCH 4A.7V fecha o gap de governança de superfície: claims absolutos produzidos por caminhos LLM (contestação, follow-up, comparação) bypassavam o Practical Consequence Engine e o Composition Guard.

**Correção sistêmica:** módulo compartilhado `miaAbsoluteClaimGovernance.js` + integração no `polishReplySurface` (Composition Guard 4A.7V.0).

**Paridade LOCAL × REAL:** divergência 3/5 vs 5/5 explicada por variância LLM (`sempre`, `isso significa que`, `garantindo`) sem guard de superfície — não por catálogo ou engine.

---

## 3. Auditoria dos claims absolutos

| Frase observada | Componente produtor | Passou Confidence Engine? | Passou Composition Guard (pré-4A.7V)? | Quem deveria bloquear | Por que não bloqueou |
|-----------------|---------------------|---------------------------|----------------------------------------|----------------------|---------------------|
| `É sempre bom...` | LLM (contestação/comparação) | N/A (texto final LLM) | Não | Composition Guard | Guard não tinha regra de absolute claims |
| `isso significa que` | LLM (follow-up por quê) | N/A | Não | Composition Guard | Idem |
| `garantindo uma boa experiência` | LLM (follow-up) | N/A | Não | Composition Guard | `\bgarante\b` não cobria flexão `garantindo` |

**Fluxo pós-correção:**

```text
LLM reply → polishReplySurface → governAbsoluteClaimsOnSurface → usuário
Practical Consequence Engine → validatePracticalConsequence (structured)
```

---

## 4. Auditoria LOCAL × REAL

| Hipótese | Evidência | Veredito |
|----------|-----------|----------|
| Catálogo diferente | c3 falha catálogo em LOCAL e REAL igualmente | ❌ Não explica 3/5 vs 5/5 |
| Cache/seed | Mesmos endpoints, mesmos produtos nos cenários principais | ❌ |
| LLM variância | LOCAL c3/c4 falharam por `sempre`; REAL passou sem `sempre` na mesma run | ✅ Causa principal |
| Engine/integration | `hasPracticalConsequences: true` em turno 1 em ambos após 4A.7 fix | ✅ Paridade engine OK |
| Composition Guard gap | Claims absolutos escapavam em paths sem structured consequences | ✅ Causa bloqueante |

---

## 5. Auditoria do Confidence Evaluation

Toda consequência prática estruturada passa por:

1. `buildPracticalConsequences` → tier `high|medium|low|insufficient`
2. `validatePracticalConsequence` → rejeita absolute_claim, missing source/reason
3. `insufficient` → não gera unidade
4. `validateConfidenceReplyAlignment` → rejeita over-assertive quando max confidence ≤ low

---

## 6. Rastreamento completo do pipeline

### Bateria (Galaxy A55)

- **Origem:** `battery_mah: 5000` + `strengths` Data Layer
- **Consequência:** tende a reduzir necessidade de recarga
- **Confiança:** `high`
- **NarrativePlan:** supporting_evidence via semantic units
- **VerbalizationPlan:** mainMessage hedged ("costuma", "tende a")
- **Composition Guard:** governa absolutos na superfície
- **Texto:** autonomia costuma ser um ponto forte...

### Processador (iPhone 13)

- **Origem:** chipset + strengths desempenho
- **Confiança:** `medium`–`high`
- **Texto:** tarefas exigentes sem sentir limite cedo demais (hedged)

### Tela (refresh 120Hz)

- **Origem:** spec-only `refresh_rate_hz`
- **Confiança:** `low`
- **Limitações:** depende do conteúdo exibido
- **Texto:** visual mais confortável — tende a aparecer no uso real

---

## 7–14. Resultados de validação

Ver evidências:

- `evidence/PATCH_4A_7V_LOCAL_CONFIDENCE_PARITY_EVIDENCE.json`
- `evidence/PATCH_4A_7V_PRODUCTION_CONFIDENCE_PARITY_EVIDENCE.json`

---

## 15. Componentes alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/miaAbsoluteClaimGovernance.js` | **Novo** — detecção + governança compartilhada |
| `lib/miaPracticalConsequenceEngine.js` | Import governance compartilhado |
| `lib/miaVerbalizationCompositionGuard.js` | v4A.7V.0 — absolute claims no polish |
| `scripts/patch-4a7v-confidence-parity-validation.mjs` | Validação paridade + confidence |
| `scripts/test-mia-patch-4a7v-absolute-claim-governance-audit.js` | Audit unitário |
| `scripts/test-mia-patch-4a6v-composition-guard-audit.js` | Testes absolute claims |

---

## 16. Classificação A / B / C

### Classe A

- Governança compartilhada de absolute claims
- Composition Guard integrado em `polishReplySurface`
- Validação confidence-reply alignment
- Script 4A.7V com variabilidade (2 runs/cenário)

### Classe B

- Follow-ups sem reexecução do engine (preservam sessão)
- `bem segura` em paths sem `lastPracticalConsequences` no follow-up
- Catálogo A56/Edge 60 ausente
- n2 entry budget com winner malformado ocasional

### Classe C

- Analytics, patches 3.x, scripts patch-83

---

## 17–21. Git / Deploy

Preenchido após commit, push e revalidação REAL.
