# MASTER_CONTEXT.md

Leia este documento antes de responder qualquer coisa.

Este é o contexto oficial do projeto Teilor/MIA. Considere-o como a principal fonte de verdade, juntamente com os demais documentos enviados.

## Sobre o projeto

A Teilor é uma startup brasileira.

O principal produto é a MIA, uma IA especializada em ajudar pessoas a tomar decisões de compra.

A filosofia do projeto é:

- MIA é especialista em compras.
- A inteligência fica na arquitetura.
- A LLM apenas comunica a decisão.
- Prioridade máxima para confiança, transparência e experiência do usuário.
- Nunca inventar informações.
- Sempre preferir respostas consistentes e úteis.

## Arquitetura

A arquitetura já está consolidada.

Ela é baseada principalmente em:

- Data Layer
- Decision Engine
- Cognitive Router
- Intent Recognition
- Commercial Runtime
- Analytics

Não sugerir mudanças arquiteturais sem necessidade.

## Metodologia

Sempre trabalhar na seguinte ordem:

Auditar

↓

Descobrir problemas

↓

Classificar

↓

Priorizar

↓

Criar roadmap

↓

Implementar

↓

Testar

↓

Validar em produção

↓

Aprovar

Não sair implementando soluções antes de entender completamente o problema.

## Estado atual do projeto

As seguintes fases já foram oficialmente concluídas:

✅ Auditoria Arquitetural

✅ Testes Unitários

✅ Testes de Integração

✅ Regressão Completa do MVP

✅ Deploy Release Candidate

✅ Validação em Produção

O MVP possui:

- Release Candidate RC1
- Feature Freeze
- Baselines congeladas
- Nenhum bloqueador P0/P1

Toda a infraestrutura principal já foi validada.

## O foco agora

Neste momento NÃO vamos adicionar funcionalidades.

Também NÃO vamos alterar a arquitetura.

O foco passa a ser exclusivamente melhorar a qualidade das respostas da MIA antes da validação com usuários reais.

Durante os patches anteriores identificamos diversos problemas conversacionais classificados como P2.

Eles não impedem o funcionamento do sistema, mas afetam a experiência do usuário.

Nosso objetivo agora é encontrar todos esses problemas, documentá-los e só depois criar um roadmap de melhorias.

## Como quero trabalhar

Primeiro quero uma matriz completa de testes conversacionais.

Depois executaremos todos os testes.

Todos os problemas encontrados deverão ser documentados.

Somente após conhecer todos os problemas criaremos um roadmap oficial de melhorias.

Não quero corrigir problemas isoladamente sem antes entender o panorama completo.

Antes de responder, confirme que leu este documento e os demais arquivos enviados e que seguirá integralmente as regras e a metodologia do projeto.