# PHASE 4A — Semantic Decision Contract

| Campo | Valor |
|-------|-------|
| **PATCH** | 4A.1 |
| **Status** | Implementado |
| **Versão do contrato** | `4A.1.0` |
| **Fechamento regressões** | PATCH 4A.1F — [`audits/phase-4a/PATCH_4A_1F_REGRESSION_CLOSURE.md`](./audits/phase-4a/PATCH_4A_1F_REGRESSION_CLOSURE.md) |
| **Data** | 2026-07-26 |
| **Autoridade** | [`PHASE_4A_GOVERNANCE.md`](./PHASE_4A_GOVERNANCE.md) · [`PHASE_4A_ROOT_CAUSE_AUDIT.md`](./PHASE_4A_ROOT_CAUSE_AUDIT.md) |

---

## 1. Objetivo

Estabelecer o primeiro contrato semântico oficial e agnóstico de categoria da Fase 4A para representar, de forma estruturada e separada:

- evidência;
- implicação;
- prioridade;
- ressalva.

O contrato impede que o pipeline dependa de frases prontas para transportar significado entre cognição e narrativa.

---

## 2. Problema arquitetural resolvido

Antes do PATCH 4A.1, consequências interpretadas eram comprimidas em `compactByFamily` (`lib/miaSemanticFamilyAllocationEngine.js`) antes das camadas narrativas. Isso destruía granularidade semântica — por exemplo, `"mais sensação de fluidez na navegação..."` virava `"tela fluida no cotidiano"`.

O contrato preserva o significado estruturado enquanto um adapter legado temporário continua fornecendo strings para consumidores atuais.

---

## 3. Princípios

1. **MIA owns the intelligence. The LLM only verbalizes.**
2. Evidência, implicação, prioridade e ressalva são entidades distintas.
3. Campos textuais registram fatos ou interpretações de origem — não substituem tipos semânticos.
4. Confiança e origem são governadas pela arquitetura, não inventadas.
5. Agnosticidade de categoria: nenhum campo estrutural pressupõe celular, bateria, Hz ou megapixels.
6. Compatibilidade legada é explícita, temporária e não pode ser fonte principal da verdade.

---

## 4. Modelo conceitual

```text
SemanticEvidence
        ↓
SemanticImplication  ←── evidenceIds[]
        ↓
SemanticPriority     (opcional, targetId → implication)
        ↓
SemanticCaveat       (opcional, relatedImplicationId)
        ↓
SemanticDecisionUnit (unidade principal)
```

---

## 5. Definição de evidência

Representa aquilo que sustenta o raciocínio.

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador rastreável |
| `type` | `factual`, `interpretive`, `commercial`, `comparative`, `absence`, `risk`, `fallback` |
| `source` | `data_layer`, `commercial`, `routing`, `session`, `fallback`, `unknown` |
| `dimension` | Dimensão semântica agnóstica (ex.: `display_smoothness`, `battery_autonomy`) |
| `sourceToken` | Token de origem quando existir |
| `rawValue` | Valor bruto associado |
| `interpretedText` | Texto interpretado pela camada de tradução (não frase final ao usuário) |
| `confidence` | `high`, `medium`, `low`, `unknown` |
| `productName`, `category` | Metadados contextuais opcionais |
| `producerLayer` | Camada que produziu a evidência |
| `available` | Se a evidência está disponível |

---

## 6. Definição de implicação

Representa o significado prático derivado de uma ou mais evidências.

| Campo | Descrição |
|-------|-----------|
| `evidenceIds` | Referências obrigatórias às evidências sustentadoras |
| `effectKey` | Chave semântica estável (ex.: `greater_visual_responsiveness`) |
| `effectKind` | Tipo de efeito (ex.: `usage_experience`, `autonomy`) |
| `scope` | Alcance contextual (ex.: `interface_navigation`) |
| `direction` | `positive`, `negative`, `neutral`, `mixed`, `unknown` |
| `intensity` | `low`, `moderate`, `high` |
| `confidence` | Confiança governada |
| `conditionality` | Universal ou dependente de contexto/prioridade/uso |
| `interpretedSourceText` | Texto interpretado preservado para rastreabilidade |

A implicação **não** é uma frase cristalizada ao usuário.

---

## 7. Definição de prioridade

Representa a importância decisória no contexto atual.

| Campo | Descrição |
|-------|-----------|
| `targetId` | ID da implicação priorizada |
| `targetKind` | Tipo do alvo (`implication`) |
| `relevance` | `primary`, `secondary`, `tertiary`, `contextual`, `irrelevant` |
| `reasonCode` | Código estruturado (ex.: `user_prioritizes_battery`) |
| `reasonText` | Frase bruta opcional para observabilidade |
| `confidence` | Confiança da priorização |

O cálculo completo de priorização contextual pertence ao PATCH 4A.8. Neste PATCH, a estrutura existe e recebe valores mínimos derivados de `primaryAxis` e frases de prioridade do usuário.

---

## 8. Definição de ressalva

Representa limites, condições ou circunstâncias que impedem conclusão absoluta.

| Campo | Descrição |
|-------|-----------|
| `type` | `limitation`, `conditional_value`, `low_confidence`, `partial_coverage`, etc. |
| `evidenceIds` | Evidências que sustentam a ressalva |
| `relatedImplicationId` | Implicação afetada |
| `severity` | Intensidade da limitação |
| `conditionality` | Tipo de dependência contextual |
| `conditionCode` | Código estruturado da condição |
| `confidence` | Confiança |

Ressalva ≠ weakness. Uma fraqueza pode ser evidência; a ressalva descreve como a limitação afeta o raciocínio.

---

## 9. Unidade semântica principal

`SemanticDecisionUnit` agrega:

- `schemaVersion`: `"4A.1.0"`
- `id`
- `evidence`
- `implication`
- `priority` (opcional)
- `caveat` (opcional)
- `decisionRole`: papel decisório (`primary_gain`, `secondary_gain`, `tradeoff`, etc.)
- `legacy` (opcional): superfície textual temporária

Implementação: `lib/miaSemanticDecisionContract.js`

---

## 10. Relações entre entidades

| Relação | Suportada |
|---------|-----------|
| uma evidência → uma implicação | Sim |
| múltiplas evidências → uma implicação | Estruturalmente (via `evidenceIds[]`) |
| uma evidência → múltiplas implicações | Via unidades distintas |
| uma implicação → uma prioridade | Sim (`targetId`) |
| uma implicação → uma ressalva | Sim (`relatedImplicationId`) |
| uma ressalva → evidência sustentadora | Sim (`evidenceIds[]`) |

---

## 11. Confiança

Valores permitidos: `high`, `medium`, `low`, `unknown`.

Reutiliza o padrão já consolidado no projeto (ex.: `MIA_PRICE_CONFIDENCE`). Não utiliza scores numéricos arbitrários.

---

## 12. Rastreabilidade

Cada unidade permite rastrear:

- implicação → evidência (`evidenceIds`)
- ressalva → implicação (`relatedImplicationId`)
- origem → `producerLayer`, `source`, `sourceToken`
- adapter legado → `legacy.adapterVersion`, `legacy.isPrimaryTruth === false`

Função de observabilidade: `buildSemanticDecisionTrace(units)`

---

## 13. Condicionalidade

Campo `conditionality` na implicação e ressalva:

- `universal`
- `priority_dependent`
- `use_case_dependent`
- `comparison_dependent`
- `context_dependent`

Permite que a mesma evidência tenha implicações contextualizadas sem alterar o significado base.

---

## 14. Ausência e incerteza

O contrato aceita:

- evidência com `available: false`
- confiança `low` ou `unknown`
- tipos `absence`, `fallback`, `risk`
- ressalvas `missing_evidence`, `low_confidence`

Validação impede implicação sem evidência referenciada. Não se fabrica implicação para preencher lacunas.

---

## 15. Agnosticidade de categoria

Campos estruturais usam `dimension`, `effectKey`, `scope` genéricos.

Categoria aparece apenas como metadado (`evidence.category`), nunca como campo estrutural específico de produto.

Testado com fixtures de `celular`, `notebook`, `televisao` e `aspirador`.

---

## 16. Compatibilidade legada

Adapter temporário: `lib/miaSemanticDecisionLegacyAdapter.js`

- Produz `legacy.compactedText` via `compactConsequence` existente
- `isPrimaryTruth` é sempre `false`
- **Remoção prevista:** PATCH 4A.6

Fluxo:

```text
SemanticDecisionUnit (fonte principal)
        ↓
LegacyStringAdapter (temporário)
        ↓
Consumidor legado (strings)
```

---

## 17. Invariantes

Validados em runtime por `validateSemanticDecisionUnit`:

1. Implicação deve referenciar ao menos uma evidência
2. Prioridade deve apontar para a implicação da unidade
3. Confiança, direção e tipos devem usar valores permitidos
4. `legacy.isPrimaryTruth` não pode ser `true`
5. `schemaVersion` deve corresponder à versão atual

---

## 18. Exemplos reais

**Entrada interpretada (translation layer):**

```text
"mais sensação de fluidez na navegação e nas interações do dia a dia"
```

**Unidade estruturada (resumo):**

| Entidade | Valor |
|----------|-------|
| evidence.dimension | `display_smoothness` |
| evidence.sourceToken | `tela_fluida` |
| implication.effectKey | `greater_visual_responsiveness` |
| implication.scope | `interface_navigation` |
| priority.reasonCode | `user_prioritizes_battery` (quando eixo = battery) |
| legacy.compactedText | `"tela fluida no cotidiano"` (não é fonte principal) |

---

## 19. Exemplo de outra categoria

**Notebook — autonomia:**

```text
evidence.dimension: battery_autonomy
evidence.category: notebook
implication.effectKey: extended_off_grid_autonomy
implication.scope: daily_usage
```

Mesma estrutura, categoria diferente apenas em metadado.

---

## 20. Integração com o pipeline

| Camada | Papel no PATCH 4A.1 |
|--------|---------------------|
| `miaConsequenceTranslationLayer` | Produz texto interpretado (entrada) |
| `miaSemanticDecisionBridge` | Constrói unidades a partir do pool |
| `miaSemanticDecisionContract` | Define tipos, validação, serialização |
| `miaSemanticFamilyAllocationEngine` | `selectTradeoffGainsWithSemantics` — unidades antes de legacy |
| `miaSemanticDecisionLegacyAdapter` | Strings temporárias para consumidores |
| `miaTradeoffCommunicationLayer` | Expõe `semanticUnits` e `semanticTrace` |

Ranking, winner e runner-up **não são alterados**.

---

## 21. Limitações atuais

- Priorização contextual completa reservada ao PATCH 4A.8
- Ressalvas não são geradas automaticamente em todo o pipeline — estrutura pronta, geração parcial
- `compactByFamily` ainda existe para compatibilidade legada
- Decision Facts e First Answer Contract ainda consomem strings — migração nos PATCHS 4A.2+
- Narrative Planner e verbalização semântica final não implementados

---

## 22. Responsabilidades dos próximos PATCHS

| PATCH | Responsabilidade |
|-------|------------------|
| 4A.2 | Decision Facts com implicações estruturadas |
| 4A.5 | Verbalizador consome contrato, não strings |
| 4A.6 | Remoção de `compactByFamily` como transporte principal |
| 4A.8 | Priorização contextual completa |
| 4A.10 | Substituição de testes que congelam frases literais |

---

## 23. Critérios de evolução

Evoluções futuras devem:

1. Preservar separação evidência/implicação/prioridade/ressalva
2. Manter agnosticidade de categoria
3. Versionar apenas quando necessário para migração real
4. Nunca marcar texto legado como fonte principal
5. Nunca delegar cognição ao LLM
6. Adicionar campos tipados, não blobs genéricos (`text` + `metadata`)

---

*PATCH 4A.1 — Contrato Semântico Oficial · 2026-07-26*
