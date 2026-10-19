// End-to-end check of the engine against the local mock model (no API key needed).
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: '3911' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  try {
    const E = await import('../public/engine.mjs');
    const origin = 'http://localhost:3911';
    const llm = E.makeLLM({ baseUrl: origin + '/mock/v1', apiKey: 'test', model: 'mock', endpoint: origin + '/api/chat', concurrency: 4 });
    const stages = [];
    const out = await E.runAll(llm, { docs: 'Demo product document.', scenario: 'How will buyers react?', outreach: 'Hello', params: { agents: 8, rounds: 3, population: 50000 } }, { onStage: (s) => stages.push(s) });
    const md = out.report.markdown;
    const checks = [
      ['stages in order', stages.join() === 'world,agents,simulate,interview,report,done'],
      ['8 agents', out.agents.length === 8],
      ['3 rounds of history', out.stats.rounds.length === 3],
      ['feed has posts', out.sim.feed.length > 0],
      ['interviews exist', out.interviews.length > 0],
      ['segments cover shares', Math.abs(out.world.segments.reduce((s, x) => s + x.share, 0) - 1) < 1e-6],
      ['projection scales to 50,000', out.projection.population === 50000 && out.projection.rows.reduce((s, r) => s + r.people, 0) > 49000],
      ['projection in report', md.includes('## Projection to 50,000 people')],
      ['report has 5 chapters', (md.match(/^## Chapter \d/gm) || []).length === 5],
      ['report has data + limits', md.includes('## At a glance') && md.includes('## The numbers') && md.includes('## Appendix A') && md.includes('## How to read this report') && md.includes('## Method and limits')],
    ];
    let bad = 0;
    for (const [n, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) bad++; }
    process.exitCode = bad ? 1 : 0;
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.kill(); }
})();
