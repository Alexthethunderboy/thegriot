# TheGriot

An interactive geographic-history prototype for exploring places, time periods and historical narratives with Next.js, React and Deck.gl.

[Explore the prototype](https://thegriot.vercel.app/)

![thegriot — existing portfolio capture](https://raw.githubusercontent.com/Alexthethunderboy/Portfolio/b4c8f605bdb311f2be00d14855b4914a3d662cf9/public/projects/previews/thegriot.webp)

Existing portfolio capture, verified 8 October 2026; not evidence of current uptime or completed validation.

## Prototype and authorization limits

The tracked migration `supabase/migrations/20260613000002_disable_rls.sql` disables row-level security on clusters, epochs, entities, claims, edges and sources for the prototype phase. This is not a production authorization design. Hosted database policies were not inspected or changed. Before public data collection or production use, a separate authorization/security review and tested policies are required. Historical claims and extraction confidence also need source review; generated output is not historical certainty.

## Frontend setup

```bash
git clone https://github.com/Alexthethunderboy/thegriot.git
cd thegriot
npm ci
# Create .env.local with development configuration
npm run dev
```

The client reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The search route optionally reads server-only `GEMINI_API_KEY`. Use an isolated development dataset and do not commit credentials. Inspect the schema and migration dependencies before preparing a database; this guide does not assert a verified clean bootstrap.

The entry page is `src/app/page.tsx`. `npm run lint` and `npm run build` exist, but were not run for this documentation update. A useful manual check is map loading → search → detail/source inspection → contribution authorization boundaries. No first-party automated test suite or Actions workflow is currently tracked.

## Optional ingestion

`pipeline/extract.py` reads `SUPABASE_DB_URL` and imports `psycopg2` and `google.generativeai`. No tracked Python dependency manifest exists. Extraction contains mock/default behavior, and Wikidata ingestion still describes pushing records as future work. Treat the pipeline as experimental/manual work, separate from frontend setup. Do not run it against a hosted database as a preview step.

---

Built by [Thunderboy](https://thunderboy.vercel.app).
