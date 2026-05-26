'''as of now we are doing this as the main agent doing all tasks later will be aided with subagents'''


# LangChain — LLM calls, prompt templates, output parsing
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# SQLAlchemy — raw DB queries to fetch user's posts from vault
from sqlalchemy import text
from backend.core.database import SessionLocal

# Config — API keys
from backend.core.config import settings

# Shared agent state
from backend.ai.state import AgentState
'''simple this supervisor is going to do belo tasks
1) create an deep agent using langraph
2) this agent will connected with UI now
3) we have vault now users can store it as version access it whenever they want and draft it
4) now this agent can answer general questions powered by gemini pro, can access the DB vault using DB queries as of now base
5) later this agent will have sub agents doing vector search querying DB, researching about topics based on user prompt and alos writing linkedin posts etc..'''


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.2,
    max_output_tokens=2048,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)
def supervisor(state: AgentState) -> AgentState:
    # state["messages"] carries the full conversation so far
    # llm.invoke() reads it and returns an AIMessage
    response = llm.invoke(state["messages"])

    # LangGraph merges this partial dict back into state —
    # add_messages reducer appends the AIMessage to messages
    # FastAPI reads state["answer"] after the graph finishes
    state["messages"] = [response]   # reducer appends, does not replace
    state["answer"]   = response.content
    state["route"]    = "direct"
    
    return state

