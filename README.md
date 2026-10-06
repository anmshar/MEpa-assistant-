# MEpa: the AI manager for content creators

Creators connect Instagram, YouTube and TikTok. MEpa reads their real performance data and acts as their manager: what is working, what to post next and when, what to charge brands, plus a weekly report and a live media kit. It's available to chat at any time.

See [PLAN.md](./PLAN.md) for the research and the product roadmap. This repository contains the **Phase 1 MVP**.

## What's in the MVP

| Feature | Where |
|---|---|
| Sign-up / login (email + password, signed session cookie) | `src/app/login`, `src/app/signup`, `src/lib/auth.ts` |
| Onboarding: niche, goals, audience, voice, boundaries, time zone | `src/app/(app)/onboarding` |
| Connect **Instagram** (Instagram API with Instagram Login), **YouTube** (Data + Analytics API), **TikTok** (Display API) | `src/lib/connectors/*`, `src/app/api/connect/[platform]` |
| **Demo account** with 4 months of realistic data, so everything works before app reviews are approved | `src/lib/connectors/demo.ts` |
| Data sync: posts, metrics, follower history, audience; OAuth tokens encrypted at rest (AES-256-GCM) | `src/lib/sync.ts`, `src/lib/crypto.ts` |
| Dashboard: KPIs, follower growth, format and hook-style performance, best-time heatmap, top posts | `src/app/(app)/dashboard` |
| **Chat with the AI manager**: streaming, tool use over the creator's real numbers, memory | `src/lib/ai/agent.ts`, `src/lib/ai/tools.ts`, `src/app/api/chat` |
| AI content tagging (topic, hook type, CTA) so performance can be broken down by *what* the post is about | `src/lib/ai/tagging.ts` |
| **Content plan**: AI plans the next 7 days on the best slots | `src/lib/ai/insights.ts`, `src/app/(app)/plan` |
| **Weekly report**: headline, wins, watch-outs, 3 priorities | `src/lib/ai/insights.ts`, `src/app/(app)/reports` |
| **Media kit**: live public page with stats, audience and optional rate ranges | `src/app/(app)/media-kit`, `src/app/kit/[slug]` |
| GDPR basics: consent at sign-up, disconnect deletes synced data, "delete my account" deletes everything | `src/lib/actions.ts` |

### How the AI manager works

- Every number the model quotes comes from a **tool** (`get_overview`, `get_posts`, `get_breakdown`, `compare_periods`, `get_audience`, `get_best_posting_times`, `estimate_rates`, `get_content_plan`, `add_content_ideas`, `remember`, `get_latest_report`). The tools are computed by `src/lib/analytics.ts`, the same code that powers the dashboard.
- The model is Claude (`claude-opus-5-5` by default, overridable with `MEPA_MODEL`). Server-side refusal fallback is enabled.
- The stable system prompt is prompt-cached. Chat history is stored verbatim and replayed append-only.
- MEpa never posts, sends or signs anything. It drafts and advises; the creator decides.

## Running locally

Requirements: Node 20+.

```bash
npm install
cp .env.example .env.local     # optional: add ANTHROPIC_API_KEY for the AI features
npm run dev                    # http://localhost:3000
```

No database setup is needed. Without `DATABASE_URL`, MEpa uses **PGlite** (real Postgres compiled to WASM) stored in `./.data`. Migrations run automatically on first request.

Then sign up, fill in the profile, and click **Use demo account** on the Connected accounts page.

```bash
npm test             # unit + integration tests (in-memory Postgres, scripted fake model)
npm run typecheck
npm run build
```

## Environment

See [.env.example](./.env.example). Summary:

| Variable | Needed for |
|---|---|
| `AUTH_SECRET` | **Required in production.** Signs sessions and derives the token encryption key |
| `DATABASE_URL` | Production Postgres (use an EU region). Empty means embedded PGlite |
| `ANTHROPIC_API_KEY` | Chat, content plans, reports, post tagging |
| `INSTAGRAM_CLIENT_ID` / `_SECRET` | Instagram connection |
| `GOOGLE_CLIENT_ID` / `_SECRET` | YouTube connection |
| `TIKTOK_CLIENT_KEY` / `_SECRET` | TikTok connection |
| `APP_URL` | OAuth redirect URIs: `{APP_URL}/api/connect/{platform}/callback` |
| `CRON_SECRET` | Protects the scheduled-job endpoints |

### Platform app setup (start these early, because reviews take weeks)

- **Instagram:** Meta developer app, add the *Instagram* product (Instagram API with Instagram Login). Scopes: `instagram_business_basic`, `instagram_business_manage_insights`. This works for Business/Creator accounts and no Facebook Page is required. Insights need App Review for other users.
- **YouTube:** Google Cloud project, enable *YouTube Data API v3* and *YouTube Analytics API*, OAuth client (web). Scopes: `youtube.readonly`, `yt-analytics.readonly`. These are sensitive scopes, so Google OAuth verification is needed before public launch.
- **TikTok:** TikTok for Developers app with Login Kit and Display API. Scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`. Needs app review.

Until a platform is configured, its card shows "Awaiting app approval" and the demo account remains available.

### Scheduled jobs

Call these with `Authorization: Bearer $CRON_SECRET` (for example from Vercel Cron, GitHub Actions or any scheduler):

- `POST /api/cron/sync`: re-sync all accounts (daily)
- `POST /api/cron/weekly`: generate weekly reports for all creators (Mondays)

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Drizzle ORM + Postgres / PGlite · Anthropic TypeScript SDK · Zod · Vitest

## Not in the MVP yet (see PLAN.md, Phase 2)

Stripe subscriptions, brand discovery and outreach, Gmail inbox integration, contract review, invoicing, auto-publishing, mobile app, email delivery of weekly reports, password reset.
