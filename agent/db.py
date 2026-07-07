"""
Supabase 클라이언트 래퍼.
cad_jobs 테이블 polling 및 상태 업데이트를 담당한다.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def make_client(
    url: str,
    *,
    service_key: str = "",
    anon_key: str = "",
    email: str = "",
    password: str = "",
) -> Any:
    """
    supabase-py 클라이언트를 생성한다. 두 가지 인증 모드를 지원한다.

    - 서비스 키 모드(모델 A · 공용 PC): service_key(service_role) 로 생성 → 모든 작업 접근.
    - 개인 계정 모드(모델 B · 직원 PC): anon_key 로 생성 후 email/password 로 로그인 →
      RLS에 의해 '본인 작업'만 접근. service_role 키를 개인 PC에 두지 않아도 된다.
    """
    from supabase import create_client  # type: ignore[import]

    if service_key:
        return create_client(url, service_key)

    if not (anon_key and email and password):
        raise ValueError(
            "개인 계정 모드에는 anon_key, email, password 가 모두 필요합니다."
        )
    client = create_client(url, anon_key)
    client.auth.sign_in_with_password({"email": email, "password": password})
    return client


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
