"""Module-level singleton holding the compiled LangGraph assistant, same
pattern as the module-level `_llm` singletons used throughout backend/ai/agents/.

Exists so tools.py (a plain function, no FastAPI Depends/Request access) can
call assistant.aget_state() for get_session_context without a circular import
— tools.py never imports graph.py/main.py; main.py imports this tiny module
only to call set_assistant() once at startup.
"""
_assistant = None


def set_assistant(assistant) -> None:
    global _assistant
    _assistant = assistant


def get_assistant_instance():
    if _assistant is None:
        raise RuntimeError("Assistant not set — set_assistant() must be called during app startup (see main.py's lifespan).")
    return _assistant
