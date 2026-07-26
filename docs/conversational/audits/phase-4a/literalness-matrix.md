# Matriz de perda de significado — PATCH 4A.0B

Referência: [`PHASE_4A_ROOT_CAUSE_AUDIT.md`](../PHASE_4A_ROOT_CAUSE_AUDIT.md)

Legenda: **EXPLÍCITO** · **IMPLÍCITO** · **TEXTUAL** · **ESTRUTURADO** · **PARCIAL** · **AUSENTE** · **PERDIDO** · **IGNORADO**

| Elemento | Data Layer | Consequence Translation | Semantic Family Compaction | Structured Facts | Decision Facts | Tradeoff Layer | First-Answer Contract | Verbalizer 3.5b | Prompt/LLM | Resposta final | Ponto de perda |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Evidência factual | EXPLÍCITO (tokens) | ESTRUTURADO | PERDIDO → TEXTUAL fixo | PARCIAL | TEXTUAL | TEXTUAL | TEXTUAL (bullets) | TEXTUAL (slot `{gain}`) | PARCIAL | TEXTUAL | **Compaction** |
| Significado prático | AUSENTE | EXPLÍCITO (frases longas) | **PERDIDO** | PARCIAL | AUSENTE | PARCIAL | AUSENTE | IGNORADO | INFERIDO (LLM path) | PARCIAL | **Compaction + Contract** |
| Prioridade | IMPLÍCITO (ordem campos) | PARCIAL (eixo) | PARCIAL (family rank) | AUSENTE | TEXTUAL (`primaryAxis`) | PARCIAL | PARCIAL | AUSENTE | PARCIAL | PARCIAL | Facts contract |
| Ganho | TEXTUAL curto | EXPLÍCITO | **CRISTALIZADO** | LISTA textual | LISTA textual | LISTA textual | REPETIDO 4× | embed | PARCIAL | ENUMERAÇÃO | **Compaction + Contract** |
| Concessão | TEXTUAL | EXPLÍCITO | PARCIAL | LISTA | LISTA | LISTA | SEÇÃO fixa | PARCIAL | PARCIAL | REPETIDA | Contract |
| Ressalva | PARCIAL (`avoid_if`) | EXPLÍCITO | PERDIDO se genérico | PARCIAL | AUSENTE | PARCIAL | PARCIAL | AUSENTE | PARCIAL | PARCIAL | Compaction |
| Confiança | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | FLAGS internos | AUSENTE | AUSENTE | PARCIAL | AUSENTE | Sem contrato |
| Relação com contexto | AUSENTE | PARCIAL (token map) | PARCIAL (axis) | query string | session text | PARCIAL | seed only | seed only | PARCIAL | PARCIAL | Sem planner |
| Progressão conversacional | AUSENTE | AUSENTE | AUSENTE | AUSENTE | PARCIAL | AUSENTE | AUSENTE | AUSENTE | PARCIAL | **REPETIÇÃO** | Argument memory parcial |
| Papel na conclusão | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | AUSENTE | PARCIAL | AUSENTE | Sem narrative planner |

## Trace dinâmico (fixture mobile)

Ver [`pipeline-trace-fixture-mobile.json`](./pipeline-trace-fixture-mobile.json):

- Entrada DL: `"tela fluida"`
- Pós-tradução: `"mais sensação de fluidez na navegação..."`
- Pós-compaction: `"tela fluida no cotidiano"` (**regressão semântica comprovada**)
- Resposta final repete a frase compactada **4 vezes** + template `"Na prática, … tende a aparecer no uso real"`.
