// Real-provider smoke test. Usage:
//   LLM_KEY=... LLM_BASE=https://api.groq.com/openai/v1 LLM_MODEL=... node dev/real-test.js [docfile] [agents] [rounds]
const { spawn } = require('child_process');
const fs = require('fs');
(async () => {
  const { LLM_KEY, LLM_BASE, LLM_MODEL } = process.env;
  if (!LLM_KEY || !LLM_BASE || !LLM_MODEL) { console.error('Set LLM_KEY, LLM_BASE, LLM_MODEL'); process.exit(2); }
  const doc = fs.readFileSync(process.argv[2] || __dirname + '/../../reports/seeds/2-enterprise-gateway.md', 'utf8');
  const agents = +process.argv[3] || 8, rounds = +process.argv[4] || 3;
  const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: '3912' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  try {
    const E = await import('../public/engine.mjs');
    let tokens = 0, retries = 0;
    const llm = E.makeLLM({ baseUrl: LLM_BASE, apiKey: LLM_KEY, model: LLM_MODEL, endpoint: 'http://localhost:3912/api/chat', concurrency: 2,
      onUsage: (u) => (tokens += u.total_tokens || 0), onRetry: (e, ms) => { retries++; console.log(`  retry (${e.message.slice(0, 90)}) in ${Math.round(ms / 1000)}s`); } });
    const t0 = Date.now();
    const out = await E.runAll(llm, { docs: doc, scenario: 'How will buyers react over six months?', params: { agents, rounds } }, { onStage: (s, d) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}: ${d}`) });
    fs.writeFileSync(__dirname + '/real-report.md', out.report.markdown);
    console.log(`DONE in ${out.seconds}s, tokens ${tokens}, retries ${retries}, feed posts ${out.sim.feed.length}, report chars ${out.report.markdown.length}`);
  } catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; } finally { srv.kill(); }
})();
