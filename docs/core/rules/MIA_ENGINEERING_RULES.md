# MIA\_ENGINEERING\_RULES.md

# MIA / EconomIA — Official Engineering Rules

# Purpose Of This Document

This document defines:

* mandatory engineering principles
* architectural protection rules
* cognitive governance rules
* implementation standards
* anti-pattern restrictions
* development philosophy
* AI-assisted engineering constraints

This document exists to protect:

```txt
MIA's proprietary intelligence architecture.
```

This is NOT:

* a generic coding guideline
* a style guide only
* a prompt engineering guide

This document defines:

```txt
what MUST NEVER be violated.
```

\---

# THE MOST IMPORTANT RULE IN THE ENTIRE PROJECT

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

This is the foundational engineering rule.

Every implementation must preserve this.

If any implementation:

* moves cognition into prompts
* depends on the LLM for reasoning
* lets the LLM decide winners
* lets the LLM invent tradeoffs
* uses prompt tricks as architecture
* creates hidden provider dependency

then the architecture is being violated.

\---

# PRODUCTION UI VALIDATION GATE (FASE 5+)

```txt
The visible response at /app-mia is the final quality gate.
```

From PATCH 5.4V onward, every patch that changes user-perceived conversational behavior MUST include, in the SAME patch:

1. implementation
2. unit tests
3. integration tests
4. regressions
5. build (×2 when code changes)
6. local validation
7. commit
8. push
9. deploy
10. published build confirmation via `/api/health`
11. production API validation
12. production UI validation at `https://economia-ai.vercel.app/app-mia`
13. API × UI parity proof
14. versioned evidence under `docs/conversational/audits/`
15. documentation / closure report
16. Git sync (local == remote, clean working tree)

API probes, internal contracts, and pipeline traces are complementary evidence.
They do NOT replace real interface validation.

No functional conversational patch may be marked approved while UI validation is deferred to a later prompt.

\---

# ENGINEERING PHILOSOPHY

MIA is being engineered as:

* proprietary AI infrastructure
* contextual reasoning architecture
* cognitive commerce engine
* vertical decision system

NOT:

* a chatbot
* a GPT wrapper
* a prompt collection
* a template engine
* a benchmark explainer

\---

# GLOBAL ENGINEERING PRINCIPLES

# Principle 1 — Architecture First

Architecture has priority over:

* speed
* shortcuts
* hacks
* quick fixes
* prompt tricks

If a solution works but breaks architecture:

```txt
it is NOT an acceptable solution.
```

\---

# Principle 2 — Cognition Must Be Proprietary

All cognition must live inside:

* MIA engines
* governance systems
* contextual systems
* structured reasoning layers
* proprietary algorithms

NOT inside:

* prompts
* LLM creativity
* hidden instructions
* provider behavior

\---

# Principle 3 — LLM-Agnostic Architecture

The system must remain:

* provider-independent
* model-independent
* portable
* transferable

MIA must continue working with:

* OpenAI
* Claude
* Gemini
* local models
* future providers

without architectural rewrites.

\---

# Principle 4 — Reasoning Before Language

The architecture must always prioritize:

```txt
reasoning generation
before
language generation
```

Meaning:

1. MIA calculates
2. MIA reasons
3. MIA governs
4. LLM verbalizes

NEVER:

1. LLM improvises
2. MIA tries to control after

\---

# Principle 5 — Structured Intelligence

The system must prefer:

* structured reasoning
* explicit governance
* deterministic cognition
* modular engines

instead of:

* hidden prompt logic
* magical prompting
* vague AI behavior
* provider-specific tricks

\---

# CRITICAL ARCHITECTURAL PROTECTIONS

# RULE — The LLM Cannot Decide Winners

The LLM MUST NEVER:

* select products
* rank candidates
* override recommendations
* invent superior products
* change contextual dominance

Winner selection belongs ONLY to:

```txt
Decision Engine
```

\---

# RULE — The LLM Cannot Invent Reasoning

The LLM MUST NEVER:

* invent tradeoffs
* invent priorities
* invent contextual fears
* invent performance gaps
* invent user psychology

Reasoning belongs ONLY to:

```txt
Proprietary Reasoning Engine
```

\---

# RULE — Prompts Are NOT Architecture

Prompts may:

* guide formatting
* guide verbalization
* guide communication style

Prompts may NOT:

* own cognition
* replace reasoning systems
* replace governance
* replace contextual logic

If a system only works because:

```txt
"the prompt is smart"
```

then the architecture is wrong.

\---

# RULE — Never Depend On Hidden LLM Behavior

Forbidden:

* relying on provider quirks
* relying on model personality
* relying on hidden chain-of-thought assumptions
* relying on unstable LLM behavior

Every important system must be:

* explicit
* inspectable
* governable
* reproducible

\---



\# RULE — Semantic Intent Generalization Validation



\## Purpose



This rule ensures that MIA learns to recognize the \*\*meaning and intent behind user language\*\*, instead of being adjusted only to recognize isolated phrases used during development.



MIA must generalize through:



```txt

intent

\+

semantic family

\+

context

```



MIA must NEVER depend on:



```txt

one specific phrase

\+

one specific keyword

\+

one test example

```



A conversational problem is not considered solved merely because the original phrase that exposed the problem now passes.



The underlying intent must be recognized consistently across multiple natural ways a real user may express the same meaning.



\---



\## Core Principle



```txt

MIA must understand the intention.

MIA must not memorize the sentence.

```



Every implementation involving:



\* Intent Detection

\* Intent Authority

\* Cognitive Router

\* Routing

\* Context Resolution

\* Clarification Gates

\* Constraint Refinement

\* Commercial Follow-Up

\* Conversational Continuity

\* Mixed Intent Handling

\* Semantic Families

\* Conversational Families

\* Response Path Selection



must be designed and validated around the semantic intention represented by the user message.



The implementation must solve the \*\*semantic behavior\*\*, not only the original wording that revealed the bug.



\---



\## Mandatory Generalization Standard



Whenever a patch creates, adjusts, repairs or expands an intent or semantic family, the Composer must test multiple semantically equivalent formulations.



Testing only the exact sentence used in the bug report, screenshot, production failure or development example is strictly insufficient.



The validation set must include, whenever applicable:



\* short sentences;

\* long sentences;

\* direct sentences;

\* indirect sentences;

\* informal language;

\* more formal language;

\* common synonyms;

\* equivalent verbs;

\* equivalent nouns;

\* changes in word order;

\* omitted words that are understandable through context;

\* implicit expressions;

\* natural conversational variations;

\* common spelling mistakes;

\* missing accents;

\* punctuation differences;

\* abbreviated language;

\* colloquial Brazilian Portuguese;

\* follow-up messages that depend on session context;

\* mixed messages containing more than one signal;

\* negative formulations;

\* confirmation formulations;

\* correction formulations;

\* hesitation or uncertainty;

\* different ways of expressing the same constraint or priority.



The exact combination depends on the semantic family being tested, but a patch must never be approved with only one wording pattern.



\---



\## Example



Suppose the intended semantic behavior is:



```txt

intent: constraint\_refinement

semantic family: budget\_relaxation

```



Testing only this sentence is not enough:



```txt

"Pode passar um pouco dos 3 mil."

```



The same intent should also be validated through variations such as:



```txt

"Consigo aumentar um pouco o orçamento."



"Não precisa ficar preso exatamente nos 3 mil."



"Se passar um pouco desse valor, tudo bem."



"Até uns 3.300 ainda dá."



"Pode ser um pouco mais caro."



"Não tem problema ultrapassar um pouco."



"Meu limite não é tão rígido."



"Se valer a pena, consigo colocar mais dinheiro."



"Pode passa um pouco dos 3 mil."



"um pouco acima de 3000 ta tranquilo"

```



These phrases are not identical, but they belong to the same semantic meaning.



The system must classify them by intention and semantic family, not by exact sentence matching.



\---



\## Required Validation Dimensions



Every relevant intent patch must cover at least the following dimensions whenever they are meaningful for the family under test.



\### 1. Lexical variation



Different words expressing the same meaning.



Example:



```txt

aumentar

subir

ampliar

esticar

flexibilizar

passar

ultrapassar

```



The system must not depend on a single preferred word.



\---



\### 2. Structural variation



Different sentence structures expressing the same intent.



Example:



```txt

"Posso aumentar o orçamento."



"O orçamento pode ser maior."



"Até um pouco mais caro serve."



"Não precisa ficar dentro daquele valor."

```



Changing sentence structure must not cause the intent to be lost.



\---



\### 3. Length variation



The same intent must be tested through:



\* very short messages;

\* normal conversational messages;

\* longer contextual messages.



Example:



```txt

"Pode passar."



"Pode passar um pouco do orçamento."



"Pensando melhor, se o produto realmente for melhor, não tem problema passar um pouco daquele orçamento que eu falei antes."

```



\---



\### 4. Formality variation



The same intent may appear formally or informally.



Example:



```txt

"Posso flexibilizar o limite estabelecido."



"Pode passar um pouco."



"Se for melhor pode ir acima mesmo."

```



\---



\### 5. Noise tolerance



The system should remain robust to normal user imperfections, including:



\* typos;

\* missing accents;

\* missing punctuation;

\* capitalization changes;

\* abbreviated words;

\* informal writing.



Example:



```txt

"pode passa um pouco"



"nao precisa fica nos 3 mil"



"se for melhor pd ser mais caro"



"ATE 3300 TA BOM"

```



The purpose is not to accept every incomprehensible message.



The purpose is to avoid treating ordinary writing imperfections as a different intention.



\---



\### 6. Context-dependent variation



Some messages only make sense when interpreted together with the session context.



Example:



Previous context:



```txt

User budget: R$ 3.000

```



Follow-up:



```txt

"Pode passar um pouco."

```



The system must understand that the user is likely relaxing the previously established budget constraint.



It must not require the user to restate the complete context in every message.



\---



\### 7. Implicit variation



Users may express an intention without naming it directly.



Example:



```txt

"Se realmente fizer diferença, consigo ir até 3.300."

```



The user did not explicitly say:



```txt

"Quero aumentar meu orçamento."

```



However, the semantic meaning is still a budget relaxation or budget increase.



The system must use the available context and semantic signals instead of depending only on explicit keywords.



\---



\### 8. Negative and contrastive variation



Intent recognition must also support negation and correction.



Example:



```txt

"Não precisa mais ficar só na Samsung."



"Na verdade não vou usar para jogos."



"Não quero aumentar muito, só um pouco."



"Não é que eu queira o mais barato; quero o que vale mais a pena."

```



Negation must not be ignored or interpreted as the opposite intent.



\---



\### 9. Conversational correction variation



Users frequently change or correct previous information.



Example:



```txt

"Na verdade vou usar para faculdade."



"Pensando melhor, câmera não é tão importante."



"Esquece o que falei sobre jogos."



"Corrigindo: meu limite é 2.500, não 2.000."

```



These must be handled as semantic updates to the existing context, not as unrelated new searches unless architecture rules explicitly require that behavior.



\---



\### 10. Mixed-intent variation



When appropriate, the intent must also be tested inside messages containing multiple signals.



Example:



```txt

"Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola."

```



Possible signals:



```txt

budget relaxation

\+

brand constraint preservation

```



The system must not solve one clause while silently losing the other.



Existing mixed-intent architecture and authority rules must be respected.



\---



\## Patch Approval Rule



A patch involving intent recognition or semantic families may only be considered robust when:



1\. The original failing example is corrected.

2\. Multiple semantically equivalent variations also pass.

3\. Recognition does not depend on exact phrase matching.

4\. Recognition does not depend on a single keyword.

5\. Natural informal language is supported.

6\. Common writing errors do not unnecessarily break the intent.

7\. Context-dependent variations are validated when relevant.

8\. Negative and corrective formulations are validated when relevant.

9\. Mixed-intent regressions are checked when relevant.

10\. Neighboring semantic families are not incorrectly absorbed.

11\. Existing routing, contracts and commercial guards remain preserved.

12\. The final user-facing response remains coherent with the detected intent.

13\. Local regressions remain green.

14\. Production behavior is validated when required by the official project flow.

15\. Evidence records the variations tested and their results.



A patch must not receive final approval merely because:



```txt

the exact screenshot phrase now works

```



or:



```txt

the newly created unit test passes

```



The patch must demonstrate that the semantic capability itself was corrected.



\---



\## Negative Control Requirement



Generalization testing must not only confirm what should match.



It must also verify what should \*\*not\*\* match.



For each adjusted semantic family, include neighboring or ambiguous examples to ensure the implementation does not become excessively broad.



Example:



Target family:



```txt

budget\_relaxation

```



Positive example:



```txt

"Pode passar um pouco dos 3 mil."

```



Negative controls:



```txt

"Não pode passar dos 3 mil."



"Quero gastar menos de 3 mil."



"Os 3 mil continuam sendo meu limite."



"Quanto custa esse produto?"

```



The first group should activate budget relaxation.



The negative controls must not.



A solution that recognizes every sentence containing:



```txt

"3 mil"

```



is not semantic understanding.



It is keyword overfitting.



\---



\## Anti-Overfitting Protection



Forbidden implementations include:



\* matching only the exact reported phrase;

\* adding a phrase-specific `if`;

\* adding a product-specific exception to fix an intent;

\* relying exclusively on one keyword;

\* copying test sentences into production rules;

\* creating large phrase lists without semantic organization;

\* making the family so broad that neighboring intents are swallowed;

\* changing routing only for one screenshot example;

\* treating the LLM prompt as the primary intent detector;

\* marking a patch complete because one hand-selected example passes.



Bad implementation:



```js

if (message.includes("pode passar um pouco dos 3 mil")) {

&#x20; return "budget\_relaxation";

}

```



Still insufficient:



```js

if (

&#x20; message.includes("pode passar") ||

&#x20; message.includes("aumentar orçamento") ||

&#x20; message.includes("mais caro")

) {

&#x20; return "budget\_relaxation";

}

```



These patterns may be used as supporting signals when architecturally appropriate, but they cannot be treated as proof of semantic understanding by themselves.



Correct direction:



```txt

normalized language

\+

conversation context

\+

semantic signals

\+

intent authority

\+

constraint interpretation

\+

family-specific governance

→

semantic classification

```



\---



\## Semantic Family Responsibility



Each semantic family must have:



\* a clearly defined meaning;

\* explicit positive signals;

\* explicit negative signals;

\* neighboring-family boundaries;

\* expected context behavior;

\* expected routing behavior;

\* expected contract behavior;

\* expected final response behavior;

\* generalization tests;

\* negative controls;

\* regression coverage.



The family should answer:



```txt

What semantic action is the user performing?

```



It should not be defined as:



```txt

Which exact sentence did the user type?

```



\---



\## Test Evidence Requirement



For every relevant patch, the final report must record:



\* semantic family tested;

\* original failing phrase;

\* alternative natural formulations;

\* informal formulations;

\* typo or noise variations;

\* context-dependent formulations;

\* negative controls;

\* mixed-intent examples when applicable;

\* classification result;

\* routing result;

\* final response result;

\* regressions executed;

\* production and interface validation when required.



Evidence must make it possible to verify that the patch solved a semantic family rather than a single phrase.



A report stating only:



```txt

"Example X now passes."

```



is insufficient.



A stronger report should demonstrate:



```txt

semantic family: budget\_relaxation



positive variations: 12/12

negative controls: 8/8

context-dependent variations: 5/5

mixed-intent variations: 4/4

neighbor-family regressions: PASS

final response perception: PASS

```



The exact number of cases may vary according to the complexity and risk of the family, but coverage must be broad enough to demonstrate real generalization.



\---



\## Composer Responsibility



Whenever the Composer works on an intent-related patch, it must independently create additional test formulations beyond those explicitly provided in the task.



The Composer must not wait for the user to manually supply every possible variation.



The Composer is responsible for:



\* identifying the semantic family being modified;

\* generating realistic alternative formulations;

\* testing natural Brazilian Portuguese;

\* testing short and incomplete follow-ups;

\* testing informal language;

\* testing common typos;

\* testing synonyms;

\* testing word-order variation;

\* testing implicit context;

\* testing negative controls;

\* testing neighboring families;

\* documenting the results.



The examples provided by the user or prompt represent the observed problem.



They do not represent the complete test universe.



\---



\## Relationship With Existing Architecture



This rule does not authorize the creation of:



\* a second Intent Engine;

\* a parallel Router;

\* duplicated semantic logic;

\* new memory without architectural justification;

\* prompt-owned classification;

\* LLM-owned decision logic;

\* phrase dictionaries acting as the primary intelligence layer.



All improvements must integrate with the existing architecture.



The official flow must remain preserved:



```txt

User Input

↓

Intent Detection

↓

Context Extraction

↓

Semantic Family Resolution

↓

Intent Authority

↓

Cognitive Router

↓

Routing

↓

Contracts

↓

Decision and Reasoning Systems

↓

Verbalization

↓

Final Response

```



When the intent affects commercial decisions, the architecture must continue to preserve:



```txt

MIA owns the intelligence.

The LLM only verbalizes.

```



\---



\## Relationship With Conversational Family Closure



A semantic family is not fully closed merely because the Router recognizes one example.



Closure requires validating the complete path:



```txt

Intent recognition

↓

Semantic family

↓

Routing

↓

Contract

↓

Context preservation

↓

Response builder / verbalizer

↓

Final response perceived by the user

```



Therefore, semantic generalization must be validated both at the classification level and, when relevant, at the final response level.



A family may not be marked fully closed if:



\* only one phrase is recognized;

\* variations fall into generic fallback;

\* context is lost in alternative formulations;

\* routing changes unexpectedly;

\* mixed messages lose one of their intentions;

\* the final response contradicts the detected intention.



\---



\## Severity



This is a mandatory, project-wide engineering rule.



Violation of this rule creates:



\* false confidence in test coverage;

\* phrase-specific patches;

\* fragile intent recognition;

\* recurring production regressions;

\* inconsistent behavior between equivalent user messages;

\* growth of hidden hardcodes;

\* incorrect claims that a semantic family has been solved.



Any patch that violates this rule must be considered:



```txt

NOT ROBUST

```



and cannot receive final approval until semantic generalization is demonstrated.



\---



\## Final Non-Negotiable Rule



```txt

Fix the intention.

Do not fix only the sentence.

```



And:



```txt

Generalize by intent and semantic family.

Never depend on specific phrases.

```



Every intent-related implementation, test suite, audit, regression and production validation must rigorously follow this standard.





# RULE — Never Hardcode Fake Intelligence

Forbidden:

* fake reasoning
* fake contextuality
* fake personalization
* static recommendation templates
* keyword-only cognition

Bad:

```js
if (gaming) {
  return "phone x is best for gaming";
}
```

Good:

```txt
contextual weighting
→ reasoning generation
→ consequence mapping
→ recommendation
```

\---

# RULE — Never Build Generic Chatbot Logic

Forbidden:

* generic assistant behavior
* generic AI phrasing
* generic review structure
* generic recommendation flow

MIA must NEVER sound like:

* ChatGPT
* Gemini generic mode
* review YouTube channels
* benchmark websites
* spec comparison sites

\---

# RULE — Human Consequence Before Technical Evidence

The system must prioritize:

```txt
human consequence
before
technical specification
```

Bad:

```txt
"Snapdragon 778G with 8GB RAM"
```

Good:

```txt
"less sensation of the phone reaching its limit during heavy usage"
```

Specs should appear:

* minimally
* only when useful
* only as supporting evidence

\---

# RULE — Tradeoffs Must Remain Honest

The system must NEVER:

* flatten tradeoffs
* fake ties
* fake neutrality
* exaggerate winners
* distort loser advantages

Tradeoffs must be:

* contextual
* proportional
* honest
* strategically explained

\---

# RULE — No False Balance

A tradeoff does NOT automatically mean:

```txt
"both are equally good"
```

MIA must preserve:

* contextual dominance
* recommendation clarity
* confidence hierarchy

\---

# RULE — Suppressed Axes Must Stay Suppressed

If an axis is contextually irrelevant:

* it should not dominate reasoning
* it should not contaminate recommendation
* it should not appear excessively

Example:

User:

```txt
"I play games a lot"
```

Camera should not suddenly dominate the response.

\---

# RULE — Anti-Spec-Dump Enforcement

Forbidden:

* benchmark dumps
* review-style comparisons
* spec-heavy responses
* repetitive technical jargon

The system must prefer:

* practical impact
* experiential reasoning
* contextual consequence
* emotional realism

\---

# RULE — Anti-Generic Language Enforcement

Forbidden phrases include:

* “better performance”
* “superior experience”
* “great option”
* “ideal choice”
* “offers superior performance”
* “equipped with”
* “stands out in performance”

The system must sound:

* strategic
* contextual
* practical
* proprietary
* human

\---

# RULE — No YouTube Review Tone

MIA must NEVER sound like:

* a tech reviewer
* a benchmark channel
* a spec explainer
* a comparison website

MIA should sound like:

```txt
an intelligent purchasing consultant.
```

\---

# RULE — No Fake Personality

MIA personality must emerge from:

* reasoning style
* communication quality
* strategic thinking
* contextual precision

NOT:

* forced gimmicks
* exaggerated catchphrases
* artificial quirks
* meme behavior

\---

# RULE — Context Must Control Reasoning

Reasoning must adapt to:

* priorities
* fears
* tradeoffs
* usage patterns
* emotional pressure
* contextual risk

Reasoning must NEVER be static.

\---

# RULE — Every Important System Must Be Governable

Every major engine must expose:

* rules
* signals
* flags
* constraints
* logs
* governance states

Avoid:

* black-box logic
* invisible behavior
* hidden cognition

\---

# RULE — Post-Processing Is Governance, Not Intelligence

Post-processing may:

* enforce consistency
* suppress generic language
* compress output
* protect architecture

Post-processing may NOT:

* create reasoning from nothing
* replace cognition
* fabricate logic

\---

# RULE — No Architecture Coupling To One Provider

Forbidden:

* OpenAI-specific cognition
* Claude-only workflows
* provider-locked architecture
* provider-dependent reasoning

The architecture must survive:

* provider changes
* model degradation
* API changes
* model replacement

\---

# ENGINEERING STANDARDS

# Standard — Modular Systems

Engines must remain:

* isolated
* modular
* inspectable
* reusable
* composable

Avoid giant monolithic logic.

\---

# Standard — Explicit Naming

Avoid vague names.

Bad:

```js
handleLogic()
processData()
```

Good:

```js
buildMiaImpactComparison()
applyMiaTradeoffIntegrityGuard()
```

\---

# Standard — Governance Over Magic

Prefer:

* explicit flags
* explicit rules
* explicit contracts

instead of:

* hidden assumptions
* magical AI behavior
* unexplained heuristics

\---

# Standard — Logs Matter

Important systems should expose logs.

Logs help:

* debugging
* architecture validation
* reasoning validation
* governance inspection

\---

# Standard — Every Engine Needs Clear Responsibility

Avoid engines doing everything.

Each layer must own:

* one cognitive responsibility
* one governance responsibility
* one communication responsibility

\---

# Standard — Minimize Prompt Dependency

Prompts should become:

```txt
thin verbalization instructions
```

NOT:

```txt
the source of intelligence.
```

\---

# Standard — Prefer Deterministic Reasoning

Where possible:

* explicit logic
* deterministic systems
* structured reasoning

are preferred over:

* random LLM behavior
* emergent guessing
* prompt improvisation

\---

# STANDARD — Human Experience > Technical Detail

Always prioritize:

* consequence
* comfort
* friction
* sensation
* long-term satisfaction

before:

* specs
* benchmarks
* technical jargon

\---

# ENGINEERING ANTI-PATTERNS

# Anti-Pattern — Prompt-As-Brain

Bad:

```txt
Huge prompt trying to make GPT smart.
```

Correct:

```txt
Structured proprietary cognition.
```

\---

# Anti-Pattern — Hidden Hardcodes

Bad:

```js
if (product === "A73") winner = true;
```

Correct:

```txt
contextual reasoning pipeline
→ weighted decision
→ governed recommendation
```

\---

# Anti-Pattern — Generic AI Tone

Bad:

```txt
"This device offers superior performance."
```

Correct:

```txt
"You feel less pressure when the workload gets heavier."
```

\---

# Anti-Pattern — Fake Neutrality

Bad:

```txt
"Both are excellent options."
```

when the contextual dominance is obvious.

\---

# Anti-Pattern — Review-Site Thinking

Bad:

```txt
spec
→ benchmark
→ recommendation
```

Correct:

```txt
context
→ impact
→ consequence
→ recommendation
```

\---

# Anti-Pattern — Provider Worship

Forbidden mentality:

```txt
"GPT will solve this automatically"
```

MIA must own:

* reasoning
* governance
* intelligence
* cognition

\---

# AI-ASSISTED ENGINEERING RULES

# RULE — AI Assistants Must Respect Architecture

When using:

* Cursor
* Claude
* ChatGPT
* Gemini
* Copilot

always remind:

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

\---

# RULE — Never Accept AI Suggestions Blindly

AI-generated code must always be reviewed for:

* architecture violations
* hidden prompt dependency
* fake cognition
* hardcoded reasoning
* provider coupling

\---

# RULE — AI Must Follow Existing Engines

New implementations must integrate with:

* Decision Engine
* Reasoning Engine
* Governance Layers
* Contextual Systems
* Behavior Systems

NOT bypass them.

\---

# RULE — Architecture Consistency Over Fast Shipping

Never sacrifice:

* cognition ownership
* modularity
* governance
* architecture integrity

for:

* speed
* demos
* shortcuts
* temporary hacks

\---

# LONG-TERM ENGINEERING OBJECTIVE

The long-term objective is to build:

```txt
a proprietary cognitive commerce infrastructure.
```

The moat is NOT:

* prompts
* wrappers
* UI
* APIs

The moat is:

* reasoning architecture
* contextual intelligence
* governance systems
* proprietary cognition
* decision quality
* experiential reasoning

\---

# FINAL NON-NEGOTIABLE RULE

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

Every:

* refactor
* engine
* feature
* prompt
* payload
* reasoning layer
* behavioral system
* market system
* memory system

must reinforce this rule.

If a future implementation weakens this principle:

```txt
it is architecturally incorrect.
```

