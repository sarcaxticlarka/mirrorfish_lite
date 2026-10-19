# MiroFish Lite

A light, fast, bring-your-own-key version of MiroFish. A user opens the site, pastes their own LLM API key, uploads product documents, and gets a simulated-market report in a few minutes. Nothing heavy to install: no graph database, no simulation engine, no accounts.

## How it works

1. **World**: reads the documents, extracts product, claims, segments, competitors, tensions, and one event per round.
2. **Agents**: creates N simulated people across the segments (champions, blockers, deciders).
3. **Simulation**: runs R rounds. Each round, agents react to an event and to the shared feed (post, reply, ignore) and move their stance (-2..+2), intent and objection.
4. **Interviews**: asks the most extreme and most influential agents three follow-up questions.
5. **Statistics**: stance trend, segment stance, objection tallies, intent mix. These are **computed in code**, not written by the model.
6. **Report**: five chapters written in parallel from the feed, interviews and statistics, with persona quotes and tables.

A typical run is roughly 25-35 small parallel calls, so it finishes in minutes instead of the hours the full pipeline needs.

## Audience size and learning

- **Population (20 to 100,000):** the user picks how many people the report covers. The model only simulates an **AI panel** (12 to 96 personas, chosen by depth, so it fits the user's API limits). Seats are split across audience segments by share, and results are scaled up with a range. Segment shares are assumptions from the documents. Populations at or below the panel size are simulated one by one.
- **Calibration (the "learning"):** every run is saved in the browser. The user enters what really happened (percent who showed interest). The tool compares it with the prediction and adjusts later projections for the same product, shrinking toward 1.0 while data is scarce. Real results can also be pasted as evidence. This is calibration against reality, not retraining the model.

## How this compares with full MiroFish

| | Full MiroFish | MiroFish Lite |
|---|---|---|
| Idea | Simulate a population reacting to a scenario, then report on what happened | Same |
| Knowledge | Zep knowledge graph built from documents | One structured "world" extracted from documents |
| Agents | Dozens to hundreds, profiles from the graph | 6-30 generated personas |
| Simulation | OASIS engine on simulated Twitter and Reddit, many rounds | Shared feed, 2-5 rounds, batched LLM calls |
| Report | Report agent with tools: searches memory, interviews agents | Chaptered report from feed, interviews and counted statistics |
| Setup | Python backend, Zep account, Node frontend | Static site + one serverless function, user brings a key |
| Time | Tens of minutes to hours | About 2-5 minutes |

It follows the same method but is **not** the same system or scale. Use it for fast first-pass insight; use full MiroFish for large, deep runs.

## Deploy on Vercel

```bash
npm i -g vercel
cd MiroFish-Lite
vercel          # first deploy (preview)
vercel --prod   # production
```

No build step and no environment variables. `public/` is served statically and `api/chat.js` runs as a serverless function (60 s max per call, set in `vercel.json`).

## Run locally (no key needed)

```bash
npm run dev     # http://localhost:3000
npm test        # end-to-end check against a built-in mock model
```

In the app choose provider **Custom**, base URL `http://localhost:3000/mock/v1`, any model and key, to try the full flow with the mock model.

## Privacy and safety

- The key lives in the browser (session only unless "Remember" is ticked) and is sent only to `/api/chat`, which forwards it to the provider and keeps nothing. Do not add logging of request bodies.
- The proxy only accepts `https` base URLs and rejects localhost and private IP ranges (blocks using it to reach internal services). Local http is allowed only when `ALLOW_LOCAL=1`, which only `dev/server.js` sets.
- Report HTML is sanitised with DOMPurify; feed text is inserted as plain text.

## Tested against a real provider

`dev/real-test.js` runs the full pipeline against any live OpenAI-compatible API:

```bash
LLM_KEY=sk-... LLM_BASE=https://api.openai.com/v1 LLM_MODEL=gpt-4o-mini node dev/real-test.js path/to/doc.md 12 3
```

It was run against Groq (`openai/gpt-oss-20b`, free tier with an 8k tokens/minute cap): both runs completed, producing reports from real model output. Real-provider testing found and fixed: Groq's strict JSON mode rejecting valid-looking output (proxy now retries without it), wait times parsed from rate-limit messages, and quota errors now stop the run with a clear message instead of producing empty results.

## Honest limits

- Personas are AI-generated. Output is a set of scenarios to test, not market data. The report says so.
- The prompts forbid invented figures, and the statistics come from the simulated panel only.
- Quality depends on the model. Small models give flatter personas; use a capable one for important decisions.
- Free tiers with strict per-minute token limits make runs slow (a 6-agent, 2-round run took 3-5 minutes on an 8k tokens/minute key). The app waits and retries on 429 automatically; set "Parallel calls" to 1-2. A normal paid key finishes in about a minute or two.
- A daily/billing quota stops the run with a clear message rather than retrying.

## Files

| Path | Purpose |
|---|---|
| `public/index.html`, `style.css`, `app.js` | UI: connect, documents, run, live feed, report, exports |
| `public/engine.mjs` | The whole simulation pipeline (browser and Node) |
| `api/chat.js` | Stateless OpenAI-compatible proxy |
| `dev/` | Local server, mock model, end-to-end test |
