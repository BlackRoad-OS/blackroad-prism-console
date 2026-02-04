from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Optional

from fastapi import Body, Depends, FastAPI, HTTPException

from .approvals import approve, create_request
from .config import ConfigHolder
from .guards import maintenance_guard, oidc_guard, rate_limit_guard, stepup_guard


def create_app(cfg: Optional[ConfigHolder] = None) -> FastAPI:
    config = cfg or ConfigHolder()
    app = FastAPI(title="Autopal Console")

    @app.get("/healthz")
    def healthz() -> Dict[str, str]:
        return {"status": "ok"}

    @app.post(
        "/secrets/materialize",
        dependencies=[
            Depends(maintenance_guard(config)),
            Depends(rate_limit_guard(config)),
            Depends(stepup_guard(config)),
        ],
    )
    def materialize(claims: Dict[str, Any] = Depends(oidc_guard(config))):
        expires_at = dt.datetime.utcnow() + dt.timedelta(minutes=30)
        return {
            "token": "redacted",
            "actor": claims.get("sub"),
            "expires_at": expires_at.replace(microsecond=0).isoformat() + "Z",
        }

    @app.post(
        "/fossil/override",
        dependencies=[
            Depends(maintenance_guard(config)),
            Depends(rate_limit_guard(config)),
            Depends(stepup_guard(config)),
        ],
    )
    def override(
        claims: Dict[str, Any] = Depends(oidc_guard(config)),
        body: Dict[str, Any] = Body(...),
    ):
        dc = getattr(config.current, "dual_control", {}) or {}
        ttl = int(dc.get("ttl_seconds", 900))
        request_state = create_request(
            actor=claims.get("sub", "unknown"),
            payload={"policy": body.get("policy"), "scope": body.get("scope")},
            ttl_seconds=ttl,
        )
        rid = request_state["id"]
        return {
            "granted": "pending_second_approval",
            "request_id": rid,
            "approve_url": f"/approvals/{rid}/approve",
        }

    @app.post(
        "/approvals/{rid}/approve",
        dependencies=[Depends(maintenance_guard(config))],
    )
    def approve_override(
        rid: str,
        claims: Dict[str, Any] = Depends(oidc_guard(config)),
    ):
        dc = getattr(config.current, "dual_control", {}) or {}
        try:
            state = approve(rid, claims.get("sub", "unknown"), dc.get("require_distinct_approvers", True))
        except KeyError:
            raise HTTPException(status_code=404, detail={"code": "not_found"})
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"code": str(exc)}) from exc

        if state["granted"]:
            return {"granted": True, "request_id": rid}
        return {
            "granted": False,
            "request_id": rid,
            "waiting_for": max(0, 2 - len(state["approvers"]))
        }

    return app


app = create_app()

from fastapi.responses import HTMLResponse

@app.get("/", response_class=HTMLResponse)
def home():
    return "<h1>Blackroad API Online ✅</h1><p>Welcome to blackroad.io</p>"
