# Content Coach

**Git for writing.** A version-controlled content workspace for LinkedIn creators who want to stop losing their best drafts.

---

## The Problem

Every LinkedIn creator has been here:

> *"I had a much better version of this post last week. Where did it go?"*

Your best writing gets overwritten, buried in Google Docs, or lost in Notion pages no one visits. Content Coach gives your writing the same discipline that code gets — every edit saved, every version named, everything searchable.

---

## What You Can Do

**Organise** your posts into folders — by topic, campaign, or content series.

**Write** in a focused, distraction-free editor. Collapse the sidebar panels when you need to think.

**Version** every draft that matters. Name them: *"tighter hook"*, *"shorter CTA"*, *"viral rewrite"*. Switch back to any version instantly.

**Pin** your best posts to your dashboard so they're always one click away.

**Search** your full post history by keyword — across titles and content — instantly.

**Ask your AI assistant** questions about your own writing. It reads your vault and answers in context.

---

## What's Live

| Area | Status |
|---|---|
| Landing page + auth (register / login) | Live |
| Dashboard with pinned posts, drafts, and calendar | Live |
| 3-column vault workspace (folder → post → editor) | Live |
| Version control — save named versions, switch between them | Live |
| Pin posts to dashboard | Live |
| Folder and post context menus (rename, delete, pin) | Live |
| Keyword search across post history | Live |
| AI assistant (powered by Gemini + your own post vault) | Live (beta) |

---

## What's Next

| Feature | Description |
|---|---|
| Post quality scoring | Hook strength, CTA presence, readability — scored per version |
| Engagement predictor | Trained on your own metrics, not generic benchmarks |
| LinkedIn draft import | Chrome extension that reads your draft directly from LinkedIn |
| Scheduling calendar | Plan and visualise your content pipeline |
| Team workspaces | Shared vaults for founders with a ghostwriter or content team |

---

## Getting Started (Self-Hosted)

**Prerequisites:** Python 3.11+, Node 18+, PostgreSQL

```bash
# 1. Clone and configure
git clone <repo>
cp .env.example .env          # fill in DATABASE_URL and GEMINI_API_KEY

# 2. Backend
python -m venv venv
venv\Scripts\activate          # Windows — or: source venv/bin/activate
pip install -r requirements.txt
venv\Scripts\alembic upgrade head
venv\Scripts\uvicorn backend.main:app --reload

# 3. Frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and register an account.

---

Built by Akash Balamurugan · v0.2 · 2026
