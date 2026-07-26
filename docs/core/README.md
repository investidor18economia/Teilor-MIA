# Documentação Core — MIA / EconomIA

Esta pasta concentra os **documentos mestres oficiais** do projeto: arquitetura proprietária, regras permanentes de engenharia, roadmap de evolução e operações (Git, backup, recuperação).

Use esta pasta como **fonte de verdade** para decisões estruturais. Documentos complementares (Bloco 12, Analytics, Conversational, Auth) vivem em pastas irmãs e referenciam estes mestres quando necessário.

---

## Fontes de verdade

| Assunto | Documento oficial |
|---|---|
| Arquitetura proprietária | [`architecture/MIA_ARCHITECTURE.md`](architecture/MIA_ARCHITECTURE.md) |
| Regras permanentes de engenharia | [`rules/MIA_ENGINEERING_RULES.md`](rules/MIA_ENGINEERING_RULES.md) |
| Roadmap oficial de desenvolvimento | [`roadmap/MIA_ROADMAP.md`](roadmap/MIA_ROADMAP.md) |
| Git, backup e recuperação do projeto | [`operations/PROJECT_RECOVERY.md`](operations/PROJECT_RECOVERY.md) |

---

## Estrutura

| Pasta | Finalidade |
|---|---|
| [`architecture/`](architecture/) | Visão arquitetural, princípios cognitivos, camadas e fluxos proprietários |
| [`rules/`](rules/) | Regras obrigatórias, anti-padrões e governança de implementação |
| [`roadmap/`](roadmap/) | Evolução planejada por fases e patches |
| [`operations/`](operations/) | Localização oficial, política de Git, backup e procedimentos de recuperação |

---

## Documentos complementares (fora desta pasta)

| Escopo | Localização |
|---|---|
| Arquitetura MVP / Bloco 12 (perímetro, lifecycle, segurança) | [`docs/architecture/`](../architecture/) |
| Analytics (schema, contratos, fases) | [`docs/analytics/`](../analytics/) |
| Conversational (baseline, evidências) | [`docs/conversational/`](../conversational/) |
| Auth e identidade | [`docs/auth/`](../auth/) |
| Evidências e auditorias de fase | Pastas `docs/analytics/`, `docs/conversational/`, `docs/evidence/` |

Documentos históricos, relatórios de patch e evidências de auditoria **não** substituem os mestres acima — servem como registro de fase.

---

## Governança

1. **Um assunto, um documento mestre** — não duplicar arquitetura, regras ou roadmap em outros arquivos como fonte paralela.
2. **Atualizações intencionais** — alterações nos mestres exigem revisão consciente; registrar mudanças relevantes no changelog interno quando aplicável.
3. **Links relativos** — ao mover ou renomear, atualizar referências cruzadas nesta pasta e nos documentos que apontam para ela.
4. **Histórico preservado** — versões antigas ou relatórios de fase permanecem em suas pastas de evidência; não misturar roadmap histórico com roadmap atual.

---

## Princípio central

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

Todo documento nesta pasta reforça este princípio.
