# **Day 1 — Honne AI Rebuild Kickoff**

Goal for today: get the skeleton running end-to-end — API up, agents wired, tools and memory stubbed in — testing each piece from the terminal as we go, not all at once at the end.

## **1\. FastAPI**

* Stand up the app, confirm it boots  
* Connect it to the frontend (UI connect)  
* Verify both the main app routes and the auth/base routes work

## **2\. LangGraph — main (supervisor) agent**

* Set up the supervisor agent  
* Set up the sub-agents (researcher, series, angles, writer — per CLAUDE.md §3)  
* Test-run each sub-agent from the terminal as it's added, not all at once at the end

## **3\. Tools**

* Build the RAG pipeline (ingest/cache knowledge sources, no vector search yet)  
* Wire it in as a tool the supervisor can call

## **4\. Memory**

* Set up the memory/checkpointing step (`AsyncPostgresSaver`)

## **Working rule for today**

Test and run each piece from the terminal as it's built, not as one pass at the end.

