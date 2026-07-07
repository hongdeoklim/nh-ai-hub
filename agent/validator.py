"""
Phase 2 — 화이트리스트 검증기.
allowed_programs 테이블 기준으로 명령·경로·risk_tier를 검사한다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any


@dataclass
class ValidationError(Exception):
    reason: str
    should_approve: bool = False  # True → pending_approval 로 전환


def _abs(path: str) -> str:
    return os.path.abspath(os.path.normpath(path))


def _is_under(path: str, roots: list[str]) -> bool:
    """path가 roots 중 하나의 하위 경로인지 확인 (경로 탈출 방지)."""
    target = _abs(path)
    for root in roots:
        root_abs = _abs(root)
        # os.path.commonpath로 탈출 여부 판별
        try:
            common = os.path.commonpath([target, root_abs])
        except ValueError:
            # Windows에서 드라이브가 다른 경우
            continue
        if common == root_abs:
            return True
    return False


class Validator:
    def __init__(self, supabase_client: Any) -> None:
        self._db = supabase_client
        self._cache: dict[str, dict] = {}  # command_name → row

    def _fetch_program(self, command_name: str) -> dict | None:
        if command_name in self._cache:
            return self._cache[command_name]
        res = (
            self._db.table("allowed_programs")
            .select("*")
            .eq("command_name", command_name)
            .eq("enabled", True)
            .limit(1)
            .execute()
        )
        row = res.data[0] if res.data else None
        if row:
            self._cache[command_name] = row
        return row

    def invalidate_cache(self) -> None:
        self._cache.clear()

    def validate(self, job: dict) -> dict:
        """
        job dict를 검증하고 통과하면 allowed_programs 행을 반환한다.
        실패 시 ValidationError를 raise한다.
        """
        command: str = job.get("command", "")
        params: dict = job.get("params", {})
        risk_tier: str = job.get("risk_tier", "safe")

        # 1. 화이트리스트에 등록된 명령인지 확인
        program = self._fetch_program(command)
        if program is None:
            raise ValidationError(f"허용되지 않은 명령: '{command}'")

        # 2. risk_tier='destructive' → 즉시 거부, 사람 승인 대기
        if risk_tier == "destructive" or program.get("risk_tier") == "destructive":
            raise ValidationError(
                f"파괴적 명령 '{command}'은 사람 승인이 필요합니다.",
                should_approve=True,
            )

        # 3. 입력 경로가 allowed_input_roots 하위인지 확인
        allowed_roots: list[str] = program.get("allowed_input_roots") or []
        if allowed_roots:
            # params 안의 모든 문자열 값 중 경로처럼 보이는 것을 검사
            paths_to_check = _extract_paths(params)
            for p in paths_to_check:
                if not _is_under(p, allowed_roots):
                    raise ValidationError(
                        f"경로 '{p}'는 허용된 입력 경로 밖입니다: {allowed_roots}"
                    )

        return program


def _extract_paths(params: dict) -> list[str]:
    """params dict에서 경로 값을 재귀적으로 추출한다."""
    results: list[str] = []
    for v in params.values():
        if isinstance(v, str) and (
            v.startswith("C:\\")
            or v.startswith("/")
            or v.startswith("\\\\")
            or os.sep in v
            or v.endswith(".dwg")
            or v.endswith(".dxf")
        ):
            results.append(v)
        elif isinstance(v, dict):
            results.extend(_extract_paths(v))
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, str):
                    results.append(item)
                elif isinstance(item, dict):
                    results.extend(_extract_paths(item))
    return results
