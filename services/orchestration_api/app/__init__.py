"""Application factory for the orchestration API service."""

from fastapi import FastAPI

from .api.routes import agents, bots, infrastructure


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="BlackRoad Orchestration API",
        version="1.0.0",
        description=(
            "APIs for managing autonomous agents, bot orchestration, and "
            "infrastructure operations across the BlackRoad platform."
        ),
    )

    app.include_router(agents.router, prefix="/agents", tags=["agents"])
    app.include_router(bots.router, prefix="/bots", tags=["bots"])
    app.include_router(infrastructure.router, prefix="/infra", tags=["infrastructure"])

    return app
