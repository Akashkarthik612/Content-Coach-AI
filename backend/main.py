# This file contains the backbne of teh application which is the API skeleton for various services.
# so completely if there is a problem in routing or data flow between various services this is the place to be checkeed.


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.vault.router import router as vault_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vault_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}