"""
Supabase 클라이언트 래퍼.
cad_jobs 테이블 polling 및 상태 업데이트를 담당한다.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def make_client(url: str, key: str) -> Any:
    """supabase-py 클라이언트를 생성한다."""
    from supabase import create_client  # type: ignore[import]
    return create_client(url, key)


class JobQueue:
    def __init__(self, client: Any) -> None:
        self._db = client

    def fetch_pending(self) -> list[dict]:
        """status='pending'인 작업을 오래된 순으로 최대 10개 반환."""
        res = (
            self._db.table("cad_jobs")
            .select("*")
            .eq("status", "pending")
            .order("created_at")
            .limit(10)
            .execute()
        )
        return res.data or []

    def set_status(self, job_id: str, status: str, **extras: Any) -> None:
        payload = {"status": status, **extras}
        self._db.table("cad_jobs").update(payload).eq("id", job_id).execute()

    def set_running(self, job_id: str) -> None:
        self.set_status(job_id, "running")

    def set_completed(self, job_id: str, result: dict) -> None:
        self.set_status(job_id, "completed", result=result)

    def set_failed(self, job_id: str, error: str) -> None:
        self.set_status(job_id, "failed", error=error)

    def set_pending_approval(self, job_id: str) -> None:
        self.set_status(job_id, "pending_approval")

    def log_step(
        self,
        job_id: str,
        step_no: int,
        status: str,
        snapshot_path: str = "",
        env_info: dict | None = None,
    ) -> None:
        self._db.table("cad_job_logs").insert({
            "job_id": job_id,
            "step_no": step_no,
            "status": status,
            "snapshot_path": snapshot_path,
            "env_info": env_info or {},
        }).execute()
