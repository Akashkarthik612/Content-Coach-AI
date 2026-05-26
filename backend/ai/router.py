from fastapi import APIRouter, Depends
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from backend.ai.graph import assistant
from backend.auth.models import User
from backend.core.dependencies import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])


class QueryRequest(BaseModel):
    prompt: str


class QueryResponse(BaseModel):
    answer: str


@router.post("/query", response_model=QueryResponse)
async def query(body: QueryRequest, user: User = Depends(get_current_user)):
    # Initialise state — user's prompt enters as a HumanMessage
    initial_state = {
        "query":        body.prompt,
        "user_id":      str(user.id),
        "messages":     [HumanMessage(content=body.prompt)],
        "task_type":    "",
        "route":        "direct",
        "post_context": "",
        "draft":        "",
        "answer":       "",
    }

    # Graph runs → supervisor writes into state → state returned here
    state = await assistant.ainvoke(initial_state)

    # FastAPI reads answer from state and sends it back to UI
    return QueryResponse(answer=state["answer"])
