# MEpa — AI Manager & Advisor for Content Creators

**Research findings and build plan** · October 2026

> **The idea in one line:** creators connect their social accounts, and an AI manager reads their real data, tells them what to post and when, finds and negotiates brand deals, and is available to chat 24/7. It replaces most of what a human manager does, at software prices.

---

## 1. Research findings

### 1.1 The market

| Fact | Why it matters |
|---|---|
| The creator economy is estimated at **$205B–$323B in 2026**, depending on the source. | The market is large and still growing. |
| About **80% of mid-tier creators (10K–1M followers) have no manager**, which leaves an estimated $8–12B a year in brand-deal revenue unclaimed. | This is the core target: creators too small for an agency but big enough to earn money. |
| Human managers take **10–20%+ commission** and mostly take on creators earning over $50–100K a year. | Smaller creators get no representation at all, which leaves a gap for software. |
| Creators' main complaints about managers: they are **hard to reach** outside office hours, focus **only on brand deals**, ignore **content and growth strategy**, and offer no help with diversifying income. | An AI manager that is always available and also gives content strategy answers all four complaints. |

### 1.2 Competitors (2026)

| Tool | What it does | Price | What it lacks |
|---|---|---|---|
| **Snippet** | Brand discovery, outreach, inbox management, rate negotiation | $50/mo flat | Deals only, no content strategy |
| **Lola (No Logo)** | AI talent agent for small creators | — | Deals only |
| **Ghost AI** | Gmail outreach and follow-ups | $0–49/mo | Outreach only |
| **Marlo** | Scores inbound deals, reviews contracts | — | Inbound only |
| **Pitched** | Brand matching through to invoicing | — | No analytics or content advice |
| **Repfluence** | Deals, content calendar, growth | $49/mo | Closest competitor, but shallow analytics |
| **Beacons / Passionfroot / Collabstr** | Media kits, booking pages, marketplaces | Free + 5–15% fee | Marketplaces, not advisors |
| **Kale** | CRM for brand relationships | Varies | Tracking only |

**Gap:** almost every tool covers the **business side** (deals). None of them covers well the **creative side**: analyzing *your* content performance and telling you *what to post next*, then connecting that to *how your stats attract better deals*. Industry reviews also flag analytics that make a creator more attractive to brands, and long-term relationship management, as uncovered.

**Positioning:** *"The manager who knows your numbers: content strategist + business manager in one chat."*

### 1.3 Technical reality of connecting accounts

| Platform | What we can get | Limits |
|---|---|---|
| **Instagram** (Graph API) | Profile, media, insights, comments, publishing, and demographics at 100+ followers | The account must be **Business/Creator** and **linked to a Facebook Page**. Needs Meta **App Review**. Personal accounts are not supported. |
| **TikTok** (Login Kit + Display API + Content Posting API) | Profile, public videos and their stats, publishing or drafts | The Display API gives **no private analytics** (no watch time or audience data). Publishing needs an **audit**. About 6 posts per minute per user and a daily cap. |
| **YouTube** (Data API v3 + Analytics API) | Full channel analytics with owner OAuth: retention, traffic sources, demographics, revenue | **10,000 quota units a day** by default. More requires an audit that can take weeks to months, and quota cannot be bought. |
| **LinkedIn / X / Twitch / Pinterest / Snapchat** | Varies | Phase 2+ |

**Build vs. buy for integrations:** unified creator-data APIs such as **Phyllo** already wrap these platforms (OAuth, token refresh, normalized data). **Recommendation:** use a unified API for the MVP to launch fast, and move to direct integrations for the main platforms once volume makes the cost worthwhile and the app reviews are approved. **Start the Meta, TikTok and Google app reviews in week 1**, because they are the slowest dependency.

### 1.4 Legal (EU/Germany first)

- **GDPR:** creator data plus their audiences' demographic data. Needs a data processing agreement (AVV), EU hosting, deletion on disconnect, and a clear consent flow.
- **EU AI Act:** transparency. Users must know they are talking to an AI, and outreach emails sent on a creator's behalf must be labeled or approved.
- **Platform terms:** no scraping of private data, and every action happens on behalf of the authorized user only.
- **Advertising law (UWG / Kennzeichnungspflicht):** the advisor should remind creators to label sponsored posts ("Werbung/Anzeige").
- **Contract advice:** frame it as "review and flag", not legal advice (German law restricts legal advice to licensed lawyers under the RDG). Offer a hand-off to partner lawyers.

---

## 2. What we build

### 2.1 What the human manager does today, and how we replace it

| Manager task | MEpa feature | Phase |
|---|---|---|
| "How am I doing?" | **Performance dashboard** and weekly AI report in plain language | MVP |
| "What should I post?" | **Content advisor**: ideas based on the creator's top performers, trends and niche, with hooks, captions and hashtags | MVP |
| "When should I post?" | **Smart content calendar** with the best times taken from the creator's own audience data | MVP |
| Always reachable | **24/7 chat** with an AI manager that knows all the creator's data and history | MVP |
| Media kit / rate card | **Auto-generated media kit** with live stats and suggested rates | MVP |
| Find brand deals | **Brand matching and outreach** drafts the creator approves | Phase 2 |
| Negotiate | **Rate negotiation copilot** with market benchmarks | Phase 2 |
| Contracts | **Contract review**: flags exclusivity, usage rights and payment terms | Phase 2 |
| Get paid | **Deal pipeline, invoicing and payment reminders** | Phase 2 |
| Publish | **Scheduling and auto-posting** to IG, TikTok and YouTube | Phase 2 |
| Income strategy | **Revenue diversification advisor** (products, memberships, affiliates) | Phase 3 |
| Burnout / wellbeing | Workload check-ins and posting-cadence health | Phase 3 |
| Team | Multi-creator workspace for small agencies (B2B tier) | Phase 3 |

### 2.2 Core experience

1. **Sign up, then connect accounts** (IG / TikTok / YouTube OAuth).
2. **Onboarding interview** (chat): goals, niche, income targets, values, brands the creator would or would not work with, and the time they have available.
3. **First audit within about 5 minutes:** "Here is what is working, what is not, and your 3 priorities this month."
4. **Daily/weekly loop:** a morning brief, a content plan for the week, chat at any time, and alerts ("This reel is over-performing, post a follow-up within 48h").
5. **Business loop** (Phase 2): inbound and outbound deals, then negotiation, contract, delivery and invoice.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Clients: Web app (Next.js) · Mobile (React Native / Expo)     │
│  Chat UI · Dashboard · Calendar · Deals · Media kit            │
└───────────────┬────────────────────────────────────────────────┘
                │ REST/GraphQL + WebSocket (streaming chat)
┌───────────────▼────────────────────────────────────────────────┐
│  API layer (TypeScript / Node, or Python FastAPI)              │
│  Auth · Billing (Stripe) · Permissions · Rate limiting         │
└──┬─────────────┬──────────────────┬───────────────────┬────────┘
   │             │                  │                   │
┌──▼──────┐ ┌────▼─────────┐ ┌──────▼────────┐ ┌────────▼────────┐
│Connector│ │ AI Agent     │ │ Analytics     │ │ Jobs / Scheduler│
│service  │ │ service      │ │ engine        │ │ (queues, cron)  │
│OAuth,   │ │ LLM + tools  │ │ metrics,      │ │ syncs, reports, │
│token    │ │ memory, RAG  │ │ benchmarks,   │ │ alerts, posting │
│refresh, │ │ guardrails   │ │ best-time,    │ │                 │
│sync     │ │              │ │ top content   │ │                 │
└──┬──────┘ └────┬─────────┘ └──────┬────────┘ └────────┬────────┘
   │             │                  │                   │
┌──▼─────────────▼──────────────────▼───────────────────▼────────┐
│ Postgres (users, posts, metrics, deals) · pgvector (memory)    │
│ Object storage (thumbnails, media kits) · Redis (cache/queue)  │
└────────────────────────────────────────────────────────────────┘
   │
   └─► Platform APIs: Meta Graph · TikTok · YouTube (or a unified API such as Phyllo)
```

### 3.1 The AI agent (the "manager brain")

- **Model:** a frontier LLM with tool use (e.g. Claude) for the chat and reasoning, and a smaller, cheaper model for bulk jobs (tagging posts, summaries).
- **Tools the agent can call:**
  - `get_account_overview`, `get_post_performance(range, platform)`, `compare_posts`
  - `get_audience_demographics`, `get_best_posting_times`
  - `get_trends(niche, platform)`, `get_competitor_benchmarks`
  - `create_content_idea`, `add_to_calendar`, `draft_caption`
  - `generate_media_kit`, `suggest_rate`
  - Phase 2: `search_brands`, `draft_outreach_email`, `review_contract`, `create_invoice`, `schedule_post`
- **Memory:** a creator profile (goals, niche, voice, boundaries), past conversations and decisions (vector store), and a structured "facts" table that the agent reads every turn.
- **Guardrails:** human approval before anything is **sent or published**, no invented numbers (every stat comes from a tool call), sponsored-content labeling reminders, and contract review framed as "flags", not legal advice.
- **Proactive mode:** scheduled jobs run the agent in the background to produce the weekly report, anomaly alerts and the morning brief.

### 3.2 Analytics engine (our moat)

- Normalizes metrics across platforms: reach, engagement rate, saves/shares, watch time and follower growth.
- **Content tagging:** an LLM tags each post by format, topic, hook type, length and CTA. This makes "your talking-head reels with a question hook get 3× more saves" possible.
- **Best-time model** from the creator's own audience-activity data.
- **Benchmarks:** anonymized, aggregated comparisons against similar creators (with consent). This improves as more creators join, which is a network effect.

### 3.3 Suggested stack

| Layer | Choice |
|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui; Expo for mobile later |
| Backend | Node/TypeScript (NestJS or Fastify), or Python FastAPI if the team is stronger in Python |
| DB | Postgres (Supabase or Neon) + pgvector; Redis |
| Jobs | BullMQ or Temporal |
| Auth | Clerk / Supabase Auth / Auth.js |
| Payments | Stripe (subscriptions); Stripe Connect later for invoicing |
| AI | Claude API (tool use, streaming, prompt caching) |
| Hosting | EU region (Vercel + Fly.io/Render, or AWS Frankfurt) |
| Observability | Sentry, PostHog (product analytics), LLM tracing |

---

## 4. Roadmap

### Phase 0: Foundations (weeks 1–2)
- [ ] Register developer apps: **Meta, TikTok, Google** (start the reviews and audits now)
- [ ] Decide on a unified API (Phyllo or similar) or direct integrations for the MVP
- [ ] Interview 15–20 creators (10K–500K followers): what they would pay for and what a manager would do for them
- [ ] Repo setup, CI, environments, privacy policy and terms (needed for the app reviews)

### Phase 1: MVP, "AI content manager" (weeks 3–10)
- [ ] Auth, onboarding interview, account connection (IG + YouTube first; TikTok as soon as it is approved)
- [ ] Data sync jobs plus a normalized metrics schema
- [ ] Dashboard: growth, top posts, engagement and best times
- [ ] **Chat with the AI manager** (tool use over the creator's data)
- [ ] Weekly AI report (email + in-app)
- [ ] Content ideas and calendar
- [ ] Auto media kit (shareable link)
- [ ] Stripe subscriptions
- **Goal:** 50 beta creators, with at least 40% using it weekly after 4 weeks

### Phase 2: "AI business manager" (months 3–6)
- [ ] Brand database and matching; outreach drafts the creator approves; inbox integration (Gmail)
- [ ] Deal pipeline (CRM), rate suggestions, negotiation copilot
- [ ] Contract review (flags plus a lawyer hand-off)
- [ ] Invoicing and payment tracking
- [ ] Scheduling and auto-publishing
- [ ] Mobile app
- **Goal:** first deals closed through the platform; paid conversion of at least 5%

### Phase 3: Scale and moat (months 6–12)
- [ ] Cross-creator benchmarks and trend detection
- [ ] Revenue diversification advisor (products, memberships, affiliates)
- [ ] Brand-side marketplace (brands find vetted creators, with take rate)
- [ ] Agency / team tier (one manager running 20–300 creators with AI)
- [ ] More platforms (LinkedIn, X, Twitch, Pinterest)

---

## 5. Business model

| Tier | Price (suggested) | For |
|---|---|---|
| **Free** | €0 | 1 account, basic dashboard, 10 chat messages a month |
| **Creator** | €19–29/mo | All accounts, unlimited chat, content plan, reports, media kit |
| **Pro** | €49–79/mo | Plus brand deals, outreach, negotiation, contracts, invoicing |
| **Agency** | €299+/mo | Multi-creator workspace |
| **Optional** | 3–5% success fee | Only on deals sourced by the platform, as an alternative to Pro |

This is much cheaper than a 15–20% manager, and comparable to Snippet and Repfluence (about $50/mo) while also offering content strategy.

**Unit economics to watch:** LLM cost per active creator a month (aim for under €3 by using prompt caching, a cheap model for bulk jobs, and summarized memory), API quota, and churn.

---

## 6. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| App review / API access delays or rejections | Start on day 1; a unified API as fallback; launch on the platforms that are approved first |
| TikTok gives limited analytics | Use what is public, let creators upload TikTok Studio exports or screenshots (the AI reads them) |
| Platform API or policy changes | Connector layer abstraction; spread across several platforms |
| AI gives bad or made-up advice | Every number comes from tools, confidence notes, feedback buttons, an evaluation set of real creator questions |
| Sending things on the creator's behalf goes wrong | Human approval for every outbound action in v1 |
| Trust: creators are protective of their accounts | Read-only scopes by default; write scopes only when posting is enabled; one-click disconnect and delete |
| Competition (Snippet, Repfluence, Lola) | Differentiate on content intelligence and an all-in-one manager; build the benchmark data moat |

---

## 7. Next steps (this week)

1. **Confirm scope and name:** is "MEpa" the product name? Which platforms come first?
2. **Register the Meta / TikTok / Google developer apps**, and write the privacy policy and terms.
3. **Book 15 creator interviews** to validate pricing and the feature priorities above.
4. **Scaffold the repo:** Next.js app, API, Postgres schema, and a first Instagram connection with the chat agent prototype.

---

### Sources
- [The State of Talent Management in the Creator Economy 2026 – Net Influencer](https://www.netinfluencer.com/the-state-of-talent-management-in-the-creator-economy-2026/)
- [10 Best AI Talent Managers for Content Creators in 2026 – Snippet](https://usesnippet.app/blog/best-ai-talent-managers-2026)
- [What Is an AI Talent Manager? – Snippet](https://usesnippet.app/blog/ai-talent-manager-creators-2026)
- [Creator Economy Market Size 2026 – Presenc](https://presenc.ai/research/creator-economy-market-size-2026)
- [Creator Economy Statistics 2026 – DemandSage](https://www.demandsage.com/creator-economy-statistics/)
- [Instagram API Integration Guide 2026 – Phyllo](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)
- [Instagram Graph API 2026 Guide – WP Social Ninja](https://wpsocialninja.com/instagram-graph-api/)
- [TikTok API Integration Guide 2026 – Phyllo](https://www.getphyllo.com/post/tiktok-api-integration-guide-2026-setup-endpoints-common-pitfalls)
- [TikTok API Rate Limits 2026 – Phyllo](https://www.getphyllo.com/post/tiktok-api-rate-limits-in-2026-quotas-errors-workarounds)
- [Is the YouTube API Free in 2026? – Phyllo](https://www.getphyllo.com/post/is-the-youtube-api-free-in-2026-quota-limits-costs-when-to-pay)
- [YouTube Analytics API Documentation 2026 – KeyAPI](https://www.keyapi.ai/blog/youtube-analytics-api-documentation-2026)
