# Development Scripts

## Run Commands

```powershell
# Backend
venv\Scripts\uvicorn backend.main:app --reload

# Frontend
cd frontend && npm run dev

# Migrations
venv\Scripts\alembic upgrade head
```

## AI Pipeline — Terminal Testing (no UI, no server needed)

```powershell
# Interactive — type your prompt when asked
venv\Scripts\python test_ai.py

# Inline prompt
venv\Scripts\python test_ai.py "What is LinkedIn's algorithm?"
venv\Scripts\python test_ai.py "What have I written about machine learning?"
venv\Scripts\python test_ai.py "Write a post about Python in my style"
venv\Scripts\python test_ai.py "What topics should I write about next?"
venv\Scripts\python test_ai.py "When is the best time for me to post?"

# With a real user_id from the DB
venv\Scripts\python test_ai.py --user <uuid> "Write a post about Python in my style"
```

Default user: `00000000-0000-0000-0000-000000000001` (stub seeded in migration 0003).
For write tasks the script detects the HITL pause and prompts Approve / Edit / Reject in the terminal.

---

## DB Wipe (dev only — destroys all data)

```powershell
venv\Scripts\python -c "
from sqlalchemy import create_engine, text
from dotenv import load_dotenv; import os; load_dotenv()
engine = create_engine(os.getenv('DATABASE_URL'))
with engine.connect() as conn:
    conn.execute(text('TRUNCATE post_embeddings, post_publish_log, post_tags, post_versions, posts, folders, users CASCADE'))
    conn.commit()
"
```
