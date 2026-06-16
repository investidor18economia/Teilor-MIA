const API = 'http://localhost:3000/api/chat-gpt4o';
const convId = 'diag-ps-' + Date.now();

const t1 = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': 'minha_chave_181199' },
  body: JSON.stringify({ text: 'celular ate 2500', image_base64: '', user_id: 'diag', conversation_id: convId, messages: [], session_context: {} }),
  signal: AbortSignal.timeout(30000)
});
const r1 = await t1.json();
const s1 = r1.session_context || {};
console.log('T1 session.lastAxis:', s1.lastAxis);
console.log('T1 session.lastMainConsequence:', s1.lastMainConsequence);
console.log('T1 session.lastTradeoff:', s1.lastTradeoff);
console.log('T1 winner:', s1.lastBestProduct?.product_name);

const msgs = [
  { role: 'user', content: 'celular ate 2500' },
  { role: 'assistant', content: r1.reply || '' }
];
const t2 = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': 'minha_chave_181199' },
  body: JSON.stringify({ text: 'qual da menos dor de cabeca', image_base64: '', user_id: 'diag', conversation_id: convId, messages: msgs, session_context: s1 }),
  signal: AbortSignal.timeout(30000)
});
const r2 = await t2.json();
const trace = r2.mia_debug?.pipelineTrace || {};
console.log('\nT2 turnType:', trace.cognitive_turn_early?.turnType);
console.log('T2 contextMode:', trace.rich_explanation_audit?.contextModeSelected);
console.log('T2 bridgeApplied:', !!trace.cognitive_intent_authority_bridge?.active);
console.log('T2 full reply:', r2.reply);
