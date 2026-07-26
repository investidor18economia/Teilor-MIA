# PHASE 4A — Root Cause Audit

## 1. Identificação

| Campo | Valor |
|-------|-------|
| **PATCH** | 4A.0B |
| **Tipo** | Auditoria arquitetural end-to-end |
| **Status** | **APROVADA** |
| **Data** | 2026-07-26 |
| **Commit/base auditada** | `d21319b22f668f5f94a15efcbb6cbca9d4fff624` |
| **Branch** | `master` |
| **Ambiente** | Local — Windows, Node v22, repositório Teilor-MIA |

### Documentos mestres lidos (caminhos oficiais)

| Documento | Caminho utilizado |
|-----------|-------------------|
| MIA_ENGINEERING_RULES | [`docs/core/rules/MIA_ENGINEERING_RULES.md`](../core/rules/MIA_ENGINEERING_RULES.md) |
| MIA_ARCHITECTURE | [`docs/core/architecture/MIA_ARCHITECTURE.md`](../core/architecture/MIA_ARCHITECTURE.md) |
| MIA_ROADMAP | [`docs/core/roadmap/MIA_ROADMAP.md`](../core/roadmap/MIA_ROADMAP.md) |
| PHASE_4A_GOVERNANCE | [`docs/conversational/PHASE_4A_GOVERNANCE.md`](./PHASE_4A_GOVERNANCE.md) — **LOCKED v1.0, não alterado** |

---

## 2. Resumo executivo

### O que foi auditado

Pipeline completo de transformação **entrada do usuário → resposta final**, com foco em caminhos comerciais conversacionais (recomendação, produto específico, comparação, refinamento, contestação, continuidade).

### Causa raiz encontrada

A literalidade perceptível surge **pela primeira vez** em `lib/miaSemanticFamilyAllocationEngine.js`, função `compactConsequence()`, que substitui consequências interpretadas (produzidas por `miaConsequenceTranslationLayer`) por **frases fixas por família semântica** (`compactByFamily`), por exemplo `display_smoothness → "tela fluida no cotidiano"`.

Isso **regred semanticamente** o significado já construído e entrega ao verbalizador **texto cristalizado**, não argumento decisório estruturado.

### Principais contribuintes

1. **`miaFirstAnswerResponseContract.js`** — repete o mesmo ganho compactado em opening, parágrafo `"Na prática…"`, bullets e closing (até 4×).
2. **`miaVerbalizerHumanization.js` (PATCH 3.5b)** — varia moldura da frase, mas **embarca `{gain}` verbatim** sem reinterpretação.
3. **`miaDecisionFactsNarrative.js`** — transporta campos textuais (`advantages`, `mainConsequence`) **sem contrato semântico** de implicação/prioridade/ressalva.
4. **Testes de contrato** (`miaConversationPolish.matchesPolishedFirstAnswerOpening`) — congelam estrutura `"Eu iria no X porque Y"`.

### Impacto

Respostas comerciais determinísticas (primeira recomendação, refinamentos follow-up) leem como **ficha técnica / enumeração de campos**, violando critérios de percepção da [`PHASE_4A_GOVERNANCE.md`](./PHASE_4A_GOVERNANCE.md) §Comunicação — mesmo quando ranking e decisão estão corretos.

### Nível de confiança

**Alto (85–90%)** — triangulação código estático + trace dinâmico local + evidências de produção commitadas.

### Roadmap pode avançar?

**SIM** — diagnóstico suficiente para PATCH 4A.1. Causa raiz localizada; arquitetura de decisão preservável.

---

## 3. Escopo e metodologia

### Escopo

- Mapeamento do pipeline real em `pages/api/chat-gpt4o.js` e ~40 módulos `lib/mia*`.
- Inventário técnico de camadas cognitivas vs linguísticas.
- Análise de contratos intermediários (Decision Facts, StructuredExplanationFacts, narrativeBlocks).
- Auditoria de textos cristalizados (grep + revisão manual).
- Avaliação de hipóteses H1–H14.
- Matriz de perda de significado e mapa de propriedade cognitiva.
- Trace dinâmico read-only (`scripts/patch-4a0b-diagnostic-trace.mjs`).

### Metodologia

1. Leitura integral dos documentos mestres (§1).
2. Exploração estática do repositório (pipeline map + phrase audit).
3. Leitura de código crítico com citações de linha.
4. Execução de harness diagnóstico **sem alterar runtime de produção**.
5. Correlação com evidências JSON de produção (PATCH 3.6/3.7, PATCH 12.6).
6. Execução de testes conversacionais existentes (baseline).

### Fora de escopo (conforme PATCH)

- Correções comportamentais.
- Novos contratos, planners ou prompts definitivos.
- Alteração de `PHASE_4A_GOVERNANCE.md`.

---

## 4. Arquitetura real encontrada

### Diagrama textual do pipeline (comercial — caminho dominante)

```txt
MIAChat.jsx
  POST /api/mia-chat
    pages/api/mia-chat.js (perimeter)
      lib/miaPerimeterChatProxy.js → /api/chat-gpt4o
        pages/api/chat-gpt4o.js :: miaChatCoreHandler
          ├─ lib/miaCognitiveRouter.js :: classifyMiaTurn
          ├─ lib/miaIntentRecognitionLayer.js :: recognizeMiaIntent
          ├─ lib/miaIntentAuthority.js
          ├─ lib/miaRoutingDecisionContract.js
          ├─ lib/miaCommercialEntryGate.js
          ├─ searchUniversalDataLayer() [inline chat-gpt4o]
          │    Supabase product_specs → trustedSpecs
          ├─ rankProductsUnderContract / decideByTrustedSpecs [inline]
          ├─ buildMiaSearchRecommendationCognition() [inline]
          │    buildMiaSearchConsequenceChain → narrativeBlocks
          ├─ lib/miaProductExplanationBuilder.js :: buildStructuredExplanationFacts
          │    lib/miaConsequenceTranslationLayer.js :: translateDataLayerFieldsToConsequences
          ├─ lib/miaSemanticFamilyAllocationEngine.js :: selectTradeoffGains
          │    compactConsequence()  ← CAUSA RAIZ
          ├─ lib/miaTradeoffCommunicationLayer.js :: buildTradeoffCommunicationBlock
          ├─ lib/miaFirstAnswerResponseContract.js :: buildFirstAnswerStructuredReply
          │    lib/miaVerbalizerHumanization.js :: buildHumanizedFirstAnswerOpening
          ├─ [alternativa LLM] runMiaBrainTask → lib/miaPrompt.js → lib/openai.js
          ├─ applyMiaBehaviorEnforcementPostProcessing [inline]
          ├─ finalizeReplyWith* (6+ camadas language)
          └─ sendRuntimeResponse → session_context
```

### Caminhos alternativos identificados

| Rota | Gatilho | Diferença material |
|------|---------|-------------------|
| Social governado | intent SOCIAL/EMOTIONAL | LLM + behavior contract; sem Data Layer |
| Mixed intent | `miaMixedIntentSegmentation` | Merge human + commercial; `miaMixedVerbalization` |
| Follow-up refinamento | PATCH 3.5a/3.7 | `miaDecisionFactsNarrative` + deterministic reply |
| Comparação | comparison intent | `decideComparison` + LLM behavioral verbalization |
| Provider fallback | DL vazio | `fetchCommercialProductsFromProviders`; facts mode `governed_fallback` |
| Product-specific | lock produto | Explanation builder + specialist layer |

**Conclusão:** rotas **não são idênticas**. Literalidade crítica concentra-se em caminhos **determinísticos pós-decisão** (first-answer + tradeoff block), não em todo o pipeline.

---

## 5. Inventário técnico

*(Amostra representativa — inventário completo no pipeline map da auditoria)*

| Camada | Arquivo/função | Entrada | Saída | Responsabilidade | Significado? | Linguagem? | Risco literalidade | Evidência |
|--------|----------------|---------|-------|------------------|:------------:|:----------:|:------------------:|-----------|
| Intent | `miaCognitiveRouter.classifyMiaTurn` | query, session | turnType, signals | classificar turno | ✓ | — | Baixo | código |
| Authority | `miaIntentAuthority.applyIntentAuthorityToPipeline` | recognition | permission | governar comércio | ✓ | — | Baixo | código |
| Data Layer | `searchUniversalDataLayer` | query | products+specs | recuperar evidência | ✓ | — | Médio (tokens curtos) | inline |
| Translation | `translateDataLayerFieldsToConsequences` | trustedSpecs | consequências | token→significado | ✓ | parcial | Baixo | E2 trace |
| **Compaction** | **`compactConsequence`** | consequência rica | **frase fixa** | "compactar" por família | **perde** | **cria** | **CRÍTICO** | E1+E2 |
| Facts | `buildStructuredExplanationFacts` | product, specs | listas textuais | empacotar evidência | parcial | textual | Alto | código |
| Decision | `rankProductsUnderContract` | products | winner, ranking | decidir | ✓ | — | Baixo | código |
| Decision Facts | `collectDecisionFactsFromSession` | session | objeto textual | transportar decisão | transporte | textual | Médio | código |
| First Answer | `buildFirstAnswerStructuredReply` | gains[], sacrifices[] | reply multi-seção | montar resposta | — | ✓ | **Alto** | E2 |
| Humanization | `buildHumanizedFirstAnswerOpening` | gainPhrase | opening | variar moldura | — | ✓ | Alto | código |
| Verbalizer LLM | `runMiaBrainTask` | contract | texto | verbalizar decisão | — | ✓ | Médio | inline |
| Post-process | `finalizeReplyWithRepetitionCompression` | reply | reply | comprimir repetição | — | ✓ | Médio | lib |

---

## 6. Cenários e rastreamentos end-to-end

### 6.1 Trace dinâmico — Recomendação genérica (fixture)

**Query:** `"Quero um celular bom para o dia a dia"`

Ver artefato: [`audits/phase-4a/pipeline-trace-fixture-mobile.json`](./audits/phase-4a/pipeline-trace-fixture-mobile.json)

| Estágio | Conteúdo |
|---------|----------|
| DL bruto | `strengths: ["tela fluida", "boa autonomia"]` |
| Tradução | fluidez navegação; menos dependência carregador |
| Compaction | `"tela fluida no cotidiano"` (**substitui tradução**) |
| Resposta final | 4× repetição + template Na prática + seções ganha/abre mão |

### 6.2–6.7 Cenários adicionais (evidência estática + produção)

| Grupo | Evidência | Achado |
|-------|-----------|--------|
| 9.1 Recomendação genérica | Trace E2 + PATCH 12.6 JSON | Enumera ganhos compactados; pouca interpretação de prioridade |
| 9.2 Produto específico | `miaProductExplanationBuilder` + `verbalizeCommercialExplanation` | Lista `strengthConsequences` sequencialmente |
| 9.3 Comparação | `decideComparison` + LLM path | LLM verbaliza; enforcement anti-spec; literalidade média |
| 9.4 Preferência (bateria/câmera) | `resolveSearchPrimaryAxis`, `selectTradeoffGains` ranking | Eixo muda família preferida, mas **mesmo compactByFamily** |
| 9.5 Contestação | `miaCommercialFollowUpContinuity` | Repete facts de sessão; risco reformulação |
| 9.6 Continuidade | `miaArgumentMemoryEngine` | Dedup parcial; não impede repetição cross-seção |
| 9.7 Fallback | `buildGovernedFallbackExplanationFacts` | Frases genéricas aumentam tom de relatório |

### Generalização linguística (§10)

Testes existentes cobrem variações de intenção (`test-mia-patch-37-*`, matriz produção 71 cenários). **Gap auditado:** variações linguísticas preservam **mesmo ganho compactado** quando família semântica coincide — interpretação não muda, apenas detecção de intenção.

---

## 7. Matriz de perda de significado

Ver documento dedicado: [`audits/phase-4a/literalness-matrix.md`](./audits/phase-4a/literalness-matrix.md)

**Ponto de perda primário:** Semantic Family Compaction (`compactConsequence`).

**Ponto de perda secundário:** First-Answer Contract (repetição estrutural).

---

## 8. Mapa de propriedade cognitiva

| Atividade | Arquitetura | LLM | Compartilhada | Não existe | Evidência |
|-----------|:-----------:|:---:|:-------------:|:----------:|-----------|
| Escolher vencedor | ✓ | | | | `rankProductsUnderContract` |
| Definir prioridade | ✓ | | parcial | | `resolveSearchPrimaryAxis`, session constraints |
| Interpretar evidência | ✓ | | | | `translateDataLayerFieldsToConsequences` |
| **Compactar evidência em frase fixa** | ✓ | | | | **`compactConsequence`** |
| Produzir consequência prática estruturada | parcial | | | **lacuna** | perde na compaction |
| Selecionar argumentos | ✓ | | | | `selectTradeoffGains` |
| Ordenar argumentos | ✓ | | | | family rank |
| Definir concessão | ✓ | | | | tradeoff layer |
| Evitar repetição | parcial | | | | memory/compression parcial |
| Adaptar ao contexto | parcial | ✓ | ✓ | | query/session no rank |
| Escolher vocabulário | | ✓ | ✓ | | LLM + humanization variants |
| Construir frase final | ✓ | ✓ | ✓ | | deterministic **ou** LLM |

**Atividades cognitivas indevidamente dependentes do LLM (quando caminho LLM):** inferência de significado prático ausente no payload → LLM preenche lacuna (H8).

**Caminho determinístico:** LLM **não participa**; literalidade é **100% arquitetura**.

---

## 9. Auditoria do Data Layer

### 14.1 Dados factuais

- Especificações objetivas em Supabase (`product_specs`, detail tables).
- Tokens curtos em `strengths`/`weaknesses` (ex.: `"tela fluida"`).

### 14.2 Evidências interpretativas

- Campos `ideal_for`, `avoid_if`, `notes`, `market_notes` — mistura factual e narrativo.
- `miaConsequenceTranslationLayer` enriquece tokens (`tela_fluida` → frase longa).

### Avaliação

| Pergunta | Resposta |
|----------|----------|
| DL entrega texto quase final? | **Parcial** — tokens curtos sim; tradução enriquece |
| Arquitetura copia direto? | **Sim**, após compaction anula enriquecimento |
| Campos phone-specific universais? | **Não no schema**; frases compactadas são phone-centric |
| Literalidade aumenta em fallback? | **Sim** — `governed_fallback` mais genérico |

**Veredito DL:** **contribuinte**, não causa raiz isolada. Causa raiz é **compactação posterior**.

---

## 10. Auditoria dos Decision Facts e contratos

`collectDecisionFactsFromSession` exporta:

- `winner`, `runnerUp`, `primaryAxis`, `tradeoff`, `advantages[]`, `sacrifices[]` — **majoritariamente strings**.

### Lacunas semânticas (§11 audit)

| Conceito | Existe? | Onde | Estrutural? | Chega ao verbalizador? |
|----------|:-------:|------|:-----------:|:----------------------:|
| Evidência | parcial | specs, facts lists | parcial | textual |
| Significado prático | parcial | translation layer | **perdido** | textual compactado |
| Implicação usuário | **não** | — | — | — |
| Prioridade | parcial | axis fields | textual | parcial |
| Ressalva | parcial | weaknesses | textual | parcial |
| Confiança | parcial | flags internos | não na reply | ausente |
| Progressão conversacional | parcial | argument memory | parcial | parcial |
| Papel na conclusão | **não** | — | — | — |

**H4 PARCIALMENTE CONFIRMADA:** campos misturam evidência + linguagem sem tipagem.

---

## 11. Auditoria do planner, builders e verbalizador

| Componente | Planner? | Observação |
|------------|:--------:|------------|
| `buildMiaSearchNarrativeBlocks` | parcial | blocos fixos (opening, consequence, tradeoff) |
| `buildFirstAnswerStructuredReply` | **layout only** | seções obrigatórias; não planeja argumento |
| `miaHumanDecisionNarrativeEngine` | parcial | tipos narrativos; subutilizado no first-answer |
| `miaCommercialExplanationVerbalizer` | **não** | concatena facts |
| `miaVerbalizerHumanization` | **não** | variantes de moldura |

**H5 CONFIRMADA** (caminho determinístico): não há hierarquia argumentativa estruturada antes da montagem final.

**H6 CONFIRMADA:** verbalizador determinístico recebe **lista de strings** (`gains[]`).

---

## 12. Auditoria do prompt e provider

### Caminho LLM (`runMiaBrainTask`)

- System prompts em `lib/miaPrompt.js` — roles especializados.
- Behavior payloads exigem fidelidade à decisão locked.
- `applyMiaBehaviorEnforcementPostProcessing` remove spec-dump.

### Respostas (§13)

| Pergunta | Resposta |
|----------|----------|
| Recebe fatos ou argumentos? | **Fatos** (+ behavior instructions) |
| Recebe hierarquia? | **Parcial** em comparison; **não** em first-answer determinístico |
| Significado prático estruturado? | **Não** |
| Sabe o que omitir? | **Parcial** via enforcement |
| Restrição induz mecanismo? | **Parcial** (H7) no LLM path |

**Nota crítica:** problema principal **não está no prompt**, pois caminho dominante de primeira resposta **não chama LLM**.

---

## 13. Auditoria de pós-processamento

Cadeia `finalizeReplyWith*` + `miaAntiAiLanguageCleanupLayer`:

- **Amplificador secundário:** substitui clichés por outros fixos (`experiência equilibrada` → `conjunto equilibrado`).
- **Proteção:** remove spec-dump, AI clichés, repetição parcial.

Classificação: **amplificador / sintoma**, não causa raiz.

---

## 14. Auditoria de memória e progressão conversacional

- `miaArgumentMemoryEngine` — deduplica argumentos **dentro** da reply.
- `miaConversationContinuity` — transporta session state.
- **Gap:** não informa verbalizador quais **famílias semânticas** já foram explicadas → `compactByFamily` pode repetir em novo turno.

**H10 PARCIALMENTE CONFIRMADA.**

---

## 15. Frases e padrões cristalizados encontrados

| Frase/padrão | Origem | Camada | Fixa? | Frequência repo | Contextos | Sintoma ou causa? |
|--------------|--------|--------|:-----:|:---------------:|-----------|-------------------|
| `tela fluida no cotidiano` | `compactByFamily` | SemanticFamily | **Sim** | 43+ grep | screen/smoothness | **CAUSA** |
| `Na prática, … tende a aparecer no uso real` | `pickConsequenceParagraph` | FirstAnswer | **Sim** | 19+ evidence | first answer | **CAUSA contribuinte** |
| `Eu iria no X porque Y` | verbalizer + polish regex | Humanization | moldura fixa | testes | first answer | **Amplificador** |
| `autonomia prática no uso real` | `compactByFamily` | SemanticFamily | Sim | médio | battery | Causa contribuinte |
| `experiência visual mais confortável no cotidiano` | `AXIS_GAIN_LABELS.screen` | Tradeoff | Sim | baixo | axis fallback | Contribuinte |
| `experiência equilibrada` | DL / LLM | cleanup target | detectada | baixo | vários | Sintoma |

Detalhes: [`audits/phase-4a/root-cause-evidence.md`](./audits/phase-4a/root-cause-evidence.md)

---

## 16. Avaliação das hipóteses H1–H14

| ID | Veredito | Confiança | Impacto | Patch futuro |
|----|----------|:---------:|:-------:|--------------|
| **H1** DL textos próximos da resposta | **PARCIALMENTE CONFIRMADA** | Média | Médio | 4A.3, 4A.7 |
| **H2** Decision Engine sem significado prático | **PARCIALMENTE CONFIRMADA** | Alta | Alto | 4A.2 |
| **H3** Perda na normalização/serialização | **CONFIRMADA** | **Alta** | **Crítico** | 4A.1, 4A.2 |
| **H4** Facts misturam campos | **PARCIALMENTE CONFIRMADA** | Alta | Alto | 4A.1, 4A.2 |
| **H5** Sem hierarquia argumentativa | **CONFIRMADA** | Alta | Alto | 4A.4 |
| **H6** Verbalizador recebe coleções | **CONFIRMADA** | Alta | Alto | 4A.2, 4A.5 |
| **H7** Prompt rígido demais | **PARCIALMENTE CONFIRMADA** | Média | Médio | 4A.5 (LLM path) |
| **H8** LLM infere significado + plano | **PARCIALMENTE CONFIRMADA** | Média | Médio | 4A.4, 4A.5 |
| **H9** Pós-processadores cristalizam | **PARCIALMENTE CONFIRMADA** | Média | Baixo | 4A.6 |
| **H10** Memória insuficiente | **PARCIALMENTE CONFIRMADA** | Média | Médio | 4A.8 |
| **H11** Testes congelam frases | **CONFIRMADA** | Alta | Médio | 4A.10 |
| **H12** Rotas legadas | **INCONCLUSIVA** | Baixa | ? | 4A.11 |
| **H13** Origens diferentes por tipo | **PARCIALMENTE CONFIRMADA** | Alta | Alto | 4A.4, 4A.5 |
| **H14** Acoplamento narrativo celular | **CONFIRMADA** | Alta | Médio | 4A.9 |

---

## 17. Causa raiz comprovada

### Causa raiz (primeira aparição)

**Camada:** Semantic Interpretation Compaction  
**Arquivo:** `lib/miaSemanticFamilyAllocationEngine.js`  
**Função:** `compactConsequence()` / mapa `compactByFamily`  
**Mecanismo:** substitui consequências interpretadas por **strings fixas por família semântica**, revertendo o trabalho de `miaConsequenceTranslationLayer` e entregando ao verbalizador texto pronto em vez de significado decisório estruturado.

### Causas contribuintes

1. `miaFirstAnswerResponseContract.js` — template multi-seção que **reutiliza** o mesmo ganho compactado.
2. `miaVerbalizerHumanization.js` — embed `{gain}` sem camada de significado.
3. `miaTradeoffCommunicationLayer.js` — `AXIS_GAIN_LABELS` com frases cotidianas fixas.
4. Data Layer tokens curtos (`"tela fluida"`) — facilitam mapeamento para famílias genéricas.

### Propagadores

- `miaDecisionFactsNarrative.js` — transporta strings sem reinterpretar.
- `miaProductExplanationBuilder.js` — propaga listas textuais.
- `renderMiaSearchReplyFromBlocks` — concatena blocos pré-formados.

### Amplificadores

- `miaConversationPolish.matchesPolishedFirstAnswerOpening` — valida moldura fixa.
- `miaAntiAiLanguageCleanupLayer` — troca clichés por outros fixos.
- Evidências JSON de produção — normalizam padrão como “aprovado”.

### Sintomas (não causas)

- Resposta parece ficha técnica / review / enumeração.
- Repetição de `"tela fluida no cotidiano"` em produção.
- Usuário percebe leitura, não compreensão.

### Proteções existentes (preservar)

- Decision Engine ranking/winner/runner-up ✓
- Intent authority + commercial entry gate ✓
- Consequence translation layer (pré-compaction) ✓
- Anti-spec-dump / anti-hallucination ✓
- Product lock / stability guard ✓
- Provider agnostic LLM adapter ✓
- Analytics rastreabilidade ✓

---

## 18. Evidências da causalidade

Ver [`audits/phase-4a/root-cause-evidence.md`](./audits/phase-4a/root-cause-evidence.md):

- **E1** estática — código `compactByFamily`, first-answer templates.
- **E2** dinâmica — trace JSON fixture mobile.
- **E3** comparativa — determinístico vs LLM paths.
- **E4** produção — PATCH 12.6 / 3.7 evidence JSON.

---

## 19. Componentes que devem ser preservados

| Domínio | Componentes |
|---------|-------------|
| Decisão | `rankProductsUnderContract`, `decideComparison`, winner/runner-up, stability guard |
| Roteamento | Cognitive router, intent authority, commercial entry gate, clarification gates |
| Data | Supabase DL search, provider fallback, dedup |
| Tradução | `translateDataLayerFieldsToConsequences` (**antes** da compaction) |
| Segurança | Anti-spec-dump, invented spec guard, runtime seal |
| Continuidade | Session transport, constraint refinement (3.7) |
| Analytics | Outcome tracking, decision correlation |

**Não refazer:** Decision Engine core, ranking contracts, perimeter security.

---

## 20. Mapeamento para PATCHS 4A.1–4A.11

| Achado | Patch | Prioridade | Justificativa |
|--------|-------|:----------:|---------------|
| Falta contrato semântico evidência/implicação/prioridade/ressalva | **4A.1** | P0 | Base para toda a fase |
| Decision Facts sem significado prático/hierarquia | **4A.2** | P0 | Depende de 4A.1 |
| Perda na síntese DL+fallback+comercial | **4A.3** | P1 | Integra fontes |
| Ausência de narrative planner | **4A.4** | P0 | Resolve H5/H6 |
| Verbalizer semântico + linguagem natural | **4A.5** | P1 | Após facts+planner |
| Controle literalidade/frases cristalizadas | **4A.6** | P1 | Remove `compactByFamily` |
| Specs → consequências práticas | **4A.7** | P1 | Complementa translation |
| Priorização por intenção/perfil | **4A.8** | P2 | Contexto conversacional |
| Extensões celular sem acoplar arquitetura | **4A.9** | P2 | H14 |
| Regressão multivariada | **4A.10** | P1 | Descongelar testes |
| Auditoria final semântica | **4A.11** | P3 | Fechamento fase |

### Sobreposições detectadas

- **4A.6** e **4A.2** intersectam na compaction — 4A.6 deve **eliminar** cristalização; 4A.2 **substituir** por facts estruturados.
- **4A.7** e **4A.3** — 4A.7 foca specs; 4A.3 foca merge de fontes.

### Lacuna no roadmap

Nenhuma lacuna bloqueante. Título/escopo dos patches **continua adequado**.

---

## 21. Riscos e bloqueios

| Risco | Severidade | Mitigação |
|-------|:----------:|-----------|
| Refatorar compaction quebra 30+ testes de contrato | Alta | PATCH 4A.10 primeiro paralelo |
| Duas verbalizações (determinístico vs LLM) divergem | Média | Unificar contrato de entrada (4A.5) |
| `chat-gpt4o.js` monolítico dificulta observabilidade | Média | Extrair hooks em patches futuros (fora 4A.0B) |

**Bloqueios:** nenhum bloqueio técnico para iniciar 4A.1.

---

## Hipótese arquitetural validada

A arquitetura atual consegue produzir consequências interpretadas, porém reduz essas consequências a uma representação textual compactada antes da etapa narrativa. Como resultado, as camadas posteriores trabalham sobre frases cristalizadas em vez de receber uma representação semântica rica, estruturada e contextualizável.

**Resolução iniciada em PATCH 4A.1:** contrato semântico oficial documentado em [`PHASE_4A_SEMANTIC_CONTRACT.md`](./PHASE_4A_SEMANTIC_CONTRACT.md), implementado em `lib/miaSemanticDecisionContract.js` com integração mínima via `lib/miaSemanticDecisionBridge.js` e adapter legado temporário `lib/miaSemanticDecisionLegacyAdapter.js`.

---

## 22. Limitações da auditoria

- Cenários 9.1–9.7 **não executados contra API live** nesta sessão (sem servidor instrumentado dedicado); evidência dinâmica via harness local + JSON produção histórico.
- Rota legada H12 **inconclusiva** — requer matriz de `responsePath` exaustiva em sessão instrumentada.
- Teste `test-mia-first-answer-response-contract-audit.js`: **18/19 pass**, 1 falha pré-existente na base (registrada §24).
- Encoding UTF-8 no trace JSON exibiu artefatos Windows (`sensa├º├úo`) — conteúdo semântico preservado.

---

## 23. Veredito

## APROVADA

A causa raiz está **comprovada** com triangulação estática + dinâmica + produção. O roadmap Fase 4A pode avançar para **PATCH 4A.1**.

---

## 24. Validações executadas

| Comando | Resultado |
|---------|-----------|
| `git branch --show-current` | `master` |
| `git rev-parse HEAD` | `d21319b22f668f5f94a15efcbb6cbca9d4fff624` |
| `npm run test:mia:conv:patch-35a:decision-facts-narrative-audit` | **15/15** pass |
| `npm run test:mia:conv:patch-35b:verbalizer-humanization-audit` | **30/30** pass |
| `npm run test:mia:11c:polish` | **22/22** pass |
| `node scripts/test-mia-first-answer-response-contract-audit.js` | **18/19** pass, **1 fail** (pré-existente) |
| `node scripts/patch-4a0b-diagnostic-trace.mjs` | exit 0 — trace gerado |
| `npm run build` | **PASS** (exit 0) |

**Impacto da falha 18/19:** não invalida diagnóstico; indica drift em contrato first-answer já conhecido. Registrada como débito para 4A.10.

---

## Artefatos complementares

| Arquivo | Descrição |
|---------|-----------|
| [`audits/phase-4a/pipeline-trace-fixture-mobile.json`](./audits/phase-4a/pipeline-trace-fixture-mobile.json) | Trace dinâmico fixture mobile |
| [`audits/phase-4a/literalness-matrix.md`](./audits/phase-4a/literalness-matrix.md) | Matriz de perda de significado |
| [`audits/phase-4a/root-cause-evidence.md`](./audits/phase-4a/root-cause-evidence.md) | Evidências E1–E4 |
| `scripts/patch-4a0b-diagnostic-trace.mjs` | Harness diagnóstico (não produção) |

---

*PATCH 4A.0B — Auditoria de causa raiz da literalidade · 2026-07-26 · read-only*
