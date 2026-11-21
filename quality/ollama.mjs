#!/usr/bin/env node
const model = process.env.RELAY_OLLAMA_MODEL;
if (!model) throw new Error('Set RELAY_OLLAMA_MODEL to an installed local model.');

process.stdin.setEncoding('utf8');
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;

const result = await fetch('http://127.0.0.1:11434/api/generate', {
  method: 'POST',
  redirect: 'error',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 512 } }),
});
if (!result.ok) throw new Error('Ollama returned HTTP ' + result.status);
const data = await result.json();
if (typeof data.response !== 'string' || !data.response.trim()) {
  throw new Error('Ollama returned no analysis.');
}
process.stdout.write(data.response);
