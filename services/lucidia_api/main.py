import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.lucidia_api.app.routes import router


def create_app() -> FastAPI:
    app = FastAPI()
    origin = os.getenv("ORIGIN", "")
    if origin:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[origin],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.include_router(router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
