"""Custom-agent errors. Each carries the `code` the API returns, so the UI can
attach it to the right field (handle_taken / reserved → Name)."""


class AgentError(Exception):
    code: str = "agent_error"


class AgentNotFoundError(AgentError):
    """No active agent with this id for this user: never existed, archived,
    or someone else's. All three look the same, so ids don't leak."""

    code = "agent_not_found"


class HandleTakenError(AgentError):
    """The user already has an active agent with this handle."""

    code = "handle_taken"


class ReservedHandleError(AgentError):
    code = "reserved"


class AgentLimitReachedError(AgentError):
    """The user has MAX_CUSTOM_AGENTS_PER_USER active agents."""

    code = "agent_limit_reached"
