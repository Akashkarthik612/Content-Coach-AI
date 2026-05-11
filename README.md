Content Coach
Your personal version control system for LinkedIn content and writing scripts — write, refine, and store every draft in one place, without the chaos.
⚠️ AI-powered assistant coming soon — scoring, feedback, and engagement prediction are on the way.

The Problem
You write a LinkedIn post. You refine it. You refine it again. Now you've got:
post_draft_final.docx
post_draft_final_v2.docx
post_draft_ACTUALLY_FINAL.docx
Or a single google doc containing version 1,2, 3……
A Google Doc buried three folders deep
And zero memory of what changed between any of them
Sound familiar? Content Coach fixes this.

What It Does
Content Coach is a version-controlled post library built specifically for LinkedIn creators. Think of it like Git, but for your writing.
What you need
How Content Coach handles it
Save a new post
Give it a title + topic tag, done
Track rewrites
Every edit becomes a new version (v1 → v2 → v3)
Add context to changes
Leave a note on each version: "tightened the hook"
Find old posts
Search across content, titles, and notes instantly
Log real results
Record likes, comments, and impressions after publishing
Filter by topic
View all your AI posts, career posts, etc. in one click


What's Built (v0.1)
Feature 1 — The Vault ✅
The core post library is live. Everything below works today:
Create a post with a title and topic tag
Add new versions as you refine your draft
Search your full library by keyword
Filter posts by topic
Log real engagement numbers after publishing
Clean REST API with auto-generated docs at /docs
Stack: FastAPI · SQLAlchemy · SQLite (local) → PostgreSQL (SaaS) · Python 3.11+

What's Coming
Feature 2 — AI Scorer (next up) Every post gets a quality score from 0–100, an engagement level (Low / Medium / High), and a breakdown of why — hook strength, CTA presence, readability, and more and also a local AI assistant built just for your own posts.
Feature 3 — Engagement Predictor (later) Trained on your own past posts and real metrics. Not generic AI advice — predictions based on what actually works for your audience.
Phase 2 — SaaS User accounts, PostgreSQL, LLM-powered rewrite suggestions, and a Chrome extension that reads your LinkedIn draft directly.

Run It Locally
# Clone and enter the project
cd linkedin_coach

# Set up environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn backend.main:app --reload --port 8000

URL
What's there
http://localhost:8000/
The Vault UI
http://localhost:8000/docs
API docs (dev only)
http://localhost:8000/health
Health check


Project Layout
linkedin_coach/
├── frontend/          ← UI (HTML, CSS, JS)
├── backend/
│   ├── core/          ← Config, DB connection
│   ├── vault/         ← Feature 2: post versioning (live)
│   ├── analyser/      ← Feature 1: ML scorer (coming soon)
│   └── predictor/     ← Feature 3: engagement model (coming soon)
├── storage/           ← SQLite DB + trained model artifacts
└── notebooks/         ← ML experimentation (not shipped)


Built by Akash Balamurugan · v0.1.0 · April 2025
