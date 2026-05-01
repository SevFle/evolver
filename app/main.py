from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db
from app.router import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="TaskPilot", version="0.1.0", lifespan=lifespan)
app.include_router(router)
