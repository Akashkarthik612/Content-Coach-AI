# Guardrails: How Claude Works in This Repo

Behavioral rules for Claude (planning, design, code, communication). Domain knowledge is in [CLAUDE.md](./CLAUDE.md); scope is in [project\_requirements.md](./project_requirements.md). Read all three, plus the attached `Day_N.md`, before planning or coding. Never propose a plan without having read them.

---

## 1\. Planning mode

Every plan has three parts, in this order:

| \# | Part | Content |
| :---- | :---- | :---- |
| 1 | **Goal \+ LLD** | What we're achieving, then the low-level design (see §2). |
| 2 | **Reasoning together** | SOLID considerations, tradeoffs, edge cases, **fallbacks (see §3)**, raised as suggestions, not decisions. |
| 3 | **Second-brain check** | Gaps or edge cases the user may have missed. |

- Be **precise and concise**: tables and bullets, no paragraphs where a table works.  
- Don't restate requirements the user already knows.  
- Don't force a design opinion. Surface concerns and alternatives; the user's call is final unless they ask Claude to decide.

## 2\. LLD order

Design in this order, every time:

1. **Data classes first**: the classes that only hold data (fields, types, invariants).  
2. **Operation classes second**: the classes that do work on that data.  
3. For each, state the **design pattern** used (Strategy, Factory, Repository, etc.) and the **SOLID principle** it serves. If no pattern is needed, say so rather than forcing one.  
4. State the **data structures** used and why.

| Class | Kind (data / operation) | Pattern | SOLID | Data structure |
| :---- | :---- | :---- | :---- | :---- |

## 3\. Fallbacks: never silent

Inefficient or hidden fallback code is hard to track and makes production failures hard to diagnose.

- **Every fallback must be raised in the planning stage**: what triggers it, what it falls back to, what the user sees, what gets logged.  
- **Do not add a fallback that wasn't approved in the plan.** Default behavior on failure is to fail loudly (raise a specific exception), not to substitute a default or retry quietly.  
- No bare `except:` / `except Exception: pass`. Catch specific exceptions only, and only where something meaningful happens.  
- Every fallback or retry **logs at WARNING or above**, with the cause and which path was taken.  
- Retries are bounded and configured (never infinite, never hardcoded).

## 4\. Logging

A production failure must be diagnosable from the logs alone.

- **Structured logs** (key-value), not free-text strings.  
- Include a **correlation id** (request/thread/ingestion-job id), `user_id`, and the entity involved (e.g. document id).  
- Log at boundaries: external calls (Gemini, Google APIs, DB), job start/end, and every error with its full cause.  
- No secrets, tokens, or document contents in logs.  
- Log what failed **and** what state the system is left in.

## 5\. Complexity and cost

For every operation in the plan (low level and high level):

| Operation | Time | Space | External calls | Est. cost |
| :---- | :---- | :---- | :---- | :---- |

- Give **time and space complexity** in terms of the real variables (documents, chunks, tokens, results).  
- Estimate **production cost** (embedding calls, LLM tokens, DB storage/queries) and where it scales badly.  
- Call out efficiency risks (N+1 queries, unbounded memory, re-embedding unchanged data).

## 6\. Code quality

- SOLID and explicit design patterns, as in §2. Adding a connector or an agent should be an addition, not a modification.  
- Prototype scope, but production-grade practice: typed, tested, readable.  
- Don't add infrastructure before it is needed (no abstract base class until a second implementation exists).  
- Follow CLAUDE.md constraints: LLM for judgment only, deterministic Python for mechanics; JSON between machines, prose at the user boundary.  
- Never edit existing migrations. Don't create tables CLAUDE.md marks as not yet designed until the design is agreed.

## 7\. Don'ts

1. Don't be verbose in planning mode.  
2. Don't skip context (CLAUDE.md, project\_requirements.md, this file, `Day_N.md`).  
3. Don't add silent fallbacks, swallowed exceptions, or unlogged retries.  
4. Don't write code before the LLD (§2) is agreed.  
5. Don't invent facts for resume or portfolio material; only documented, real ones.