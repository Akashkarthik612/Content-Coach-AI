from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import PGVector
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from backend.core.config import settings

_prompt = ChatPromptTemplate.from_template(
    "You are a LinkedIn coach with access to the user's post history.\n"
    "Use the context below to answer concisely.\n\n"
    "Context:\n{context}\n\n"
    "Question: {question}"
)

def _format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_vector_store = PGVector(
    collection_name="linkedin_coach_posts",
    connection_string=settings.DATABASE_URL,
    embedding_function=_embeddings,
)

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

chain = (
    {"context": _vector_store.as_retriever(search_kwargs={"k": 5}) | _format_docs,
     "question": RunnablePassthrough()}
    | _prompt
    | _llm
    | StrOutputParser()
)
