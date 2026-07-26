# Evidências de causalidade — PATCH 4A.0B

## E1 — Evidência estática (código)

### Cristalização primária

```282:295:lib/miaSemanticFamilyAllocationEngine.js
  const compactByFamily = {
    camera_video_confidence: "câmera confiável para fotos e vídeos",
    performance_longevity: "bom desempenho para o dia a dia",
    battery_autonomy: "autonomia prática no uso real",
    ecosystem_software: "ecossistema integrado e previsível",
    display_smoothness: "tela fluida no cotidiano",
    charging_speed: "carregamento mais lento que rivais recentes",
    ...
  };
```

### Repetição estrutural

```321:347:lib/miaFirstAnswerResponseContract.js
  const primaryGain = pickPrimaryGain(safeGains, winner);
  const opening = buildFirstAnswerOpening({ winner, gainPhrase: openingGain, ... });
  const consequence = pickConsequenceParagraph(safeGains, query);
  ...
  const closing = `Mesmo com ${pickTradeoffSummary(safeSacrifices)}, eu manteria o ${winner} porque ${pickDominantReason(...)}.`;
```

Template fixo:

```273:273:lib/miaFirstAnswerResponseContract.js
  return `Na prática, ${gain...} tende a aparecer no uso real — não só no anúncio.`;
```

### Verbalizer não reinterpreta ganho

```315:330:lib/miaVerbalizerHumanization.js
export function buildHumanizedFirstAnswerOpening({ winner, gainPhrase = "", ... }) {
  ...
  return pickHumanizedVariant([
    `Eu iria no ${w} porque ${normalizedGain}.`,
    ...
  ], seed);
}
```

## E2 — Evidência dinâmica

Harness: `scripts/patch-4a0b-diagnostic-trace.mjs` (diagnóstico, não produção)

Saída: [`pipeline-trace-fixture-mobile.json`](./pipeline-trace-fixture-mobile.json)

| Estágio | Conteúdo do ganho principal |
|---------|----------------------------|
| Data Layer bruto | `"tela fluida"` |
| Após `translateDataLayerFieldsToConsequences` | `"mais sensação de fluidez na navegação e nas interações do dia a dia"` |
| Após `selectTradeoffGains` / `compactConsequence` | `"tela fluida no cotidiano"` |
| Resposta `buildFirstAnswerStructuredReply` | frase compactada repetida 4× + template Na prática |

## E3 — Comparação controlada

| Caminho | LLM envolvido? | Estrutura de entrada | Literalidade observada |
|---------|----------------|---------------------|------------------------|
| First-answer determinístico | **Não** | Lista textual de gains compactados | **Alta** (trace E2) |
| `renderMiaSearchReplyFromBlocks` | **Não** | `narrativeBlocks` pré-montados | Média-alta |
| `verbalizeCommercialExplanation` | **Não** | `StructuredExplanationFacts` | Média |
| `runMiaBrainTask` (comparison/behavior) | **Sim** | Behavior payload + enforcement | Média (pós-processada) |
| Social/governed flow | **Sim** | Behavior contract | Baixa para comercial |

Conclusão comparativa: a literalidade **não depende do LLM** no caminho dominante de primeira recomendação comercial; surge **antes** do provider.

## E4 — Evidência de produção (artefatos commitados)

| Artefato | Ocorrências `"tela fluida no cotidiano"` |
|----------|------------------------------------------|
| `docs/analytics/PATCH_12_6_PRODUCTION_VALIDATION_EVIDENCE.json` | 16 |
| `docs/conversational/PATCH_3_7_PRODUCTION_EVIDENCE.json` | 12 |
| `docs/conversational/PATCH_3_6_PRODUCTION_EVIDENCE.json` | 5 |

Padrão estrutural congelado em produção: opening `"Eu iria no … porque tela fluida no cotidiano"` + blocos ganha/abre mão.
