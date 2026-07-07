"""
validator.py 단위 테스트.
Supabase 클라이언트를 Mock으로 대체하므로 AutoCAD/네트워크 없이 실행 가능.
실행: python -m pytest test_validator.py -v
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from validator import Validator, ValidationError, _is_under, _extract_paths


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------

def _make_client(rows: list[dict]) -> MagicMock:
    """allowed_programs 쿼리에서 rows를 반환하는 Mock Supabase 클라이언트."""
    client = MagicMock()
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .limit.return_value
        .execute.return_value
    ) = MagicMock(data=rows)
    return client


def _program(
    command_name: str = "open_dwg",
    exe_path: str = r"C:\Program Files\AutoCAD\acad.exe",
    allowed_input_roots: list[str] | None = None,
    risk_tier: str = "safe",
) -> dict:
    return {
        "command_name": command_name,
        "exe_path": exe_path,
        "arg_template": [],
        "allowed_input_roots": allowed_input_roots or [r"C:\NH-AI-HUB-workspace"],
        "risk_tier": risk_tier,
        "enabled": True,
    }


# ---------------------------------------------------------------------------
# _is_under
# ---------------------------------------------------------------------------

class TestIsUnder:
    def test_direct_child(self):
        assert _is_under(r"C:\work\a.dwg", [r"C:\work"]) is True

    def test_nested_child(self):
        assert _is_under(r"C:\work\sub\a.dwg", [r"C:\work"]) is True

    def test_outside_root(self):
        assert _is_under(r"C:\secret\a.dwg", [r"C:\work"]) is False

    def test_path_traversal(self):
        # ../ 로 탈출 시도
        assert _is_under(r"C:\work\..\secret\a.dwg", [r"C:\work"]) is False

    def test_multiple_roots(self):
        roots = [r"C:\work", r"D:\shared"]
        assert _is_under(r"D:\shared\plan.dwg", roots) is True
        assert _is_under(r"E:\other\plan.dwg", roots) is False


# ---------------------------------------------------------------------------
# _extract_paths
# ---------------------------------------------------------------------------

class TestExtractPaths:
    def test_dwg_extension(self):
        paths = _extract_paths({"path": r"C:\work\a.dwg"})
        assert r"C:\work\a.dwg" in paths

    def test_nested_dict(self):
        paths = _extract_paths({"file": {"path": r"C:\work\b.dwg"}})
        assert r"C:\work\b.dwg" in paths

    def test_non_path_string(self):
        paths = _extract_paths({"name": "hello world"})
        assert paths == []


# ---------------------------------------------------------------------------
# Validator.validate
# ---------------------------------------------------------------------------

class TestValidatorValidate:
    def test_unknown_command_raises(self):
        client = _make_client([])
        v = Validator(client)
        with pytest.raises(ValidationError, match="허용되지 않은 명령"):
            v.validate({"command": "unknown_cmd", "params": {}, "risk_tier": "safe"})

    def test_valid_job_passes(self):
        prog = _program()
        client = _make_client([prog])
        v = Validator(client)
        result = v.validate({
            "command": "open_dwg",
            "params": {"path": r"C:\NH-AI-HUB-workspace\test.dwg"},
            "risk_tier": "safe",
        })
        assert result["command_name"] == "open_dwg"

    def test_destructive_job_tier_from_job(self):
        prog = _program(risk_tier="safe")
        client = _make_client([prog])
        v = Validator(client)
        with pytest.raises(ValidationError) as exc:
            v.validate({
                "command": "open_dwg",
                "params": {},
                "risk_tier": "destructive",
            })
        assert exc.value.should_approve is True

    def test_destructive_job_tier_from_program(self):
        prog = _program(risk_tier="destructive")
        client = _make_client([prog])
        v = Validator(client)
        with pytest.raises(ValidationError) as exc:
            v.validate({
                "command": "open_dwg",
                "params": {},
                "risk_tier": "safe",
            })
        assert exc.value.should_approve is True

    def test_path_outside_root_raises(self):
        prog = _program(allowed_input_roots=[r"C:\NH-AI-HUB-workspace"])
        client = _make_client([prog])
        v = Validator(client)
        with pytest.raises(ValidationError, match="허용된 입력 경로 밖"):
            v.validate({
                "command": "open_dwg",
                "params": {"path": r"C:\Users\secret\private.dwg"},
                "risk_tier": "safe",
            })

    def test_path_traversal_blocked(self):
        prog = _program(allowed_input_roots=[r"C:\NH-AI-HUB-workspace"])
        client = _make_client([prog])
        v = Validator(client)
        with pytest.raises(ValidationError, match="허용된 입력 경로 밖"):
            v.validate({
                "command": "open_dwg",
                "params": {"path": r"C:\NH-AI-HUB-workspace\..\secret\a.dwg"},
                "risk_tier": "safe",
            })

    def test_cache_reuse(self):
        prog = _program()
        client = _make_client([prog])
        v = Validator(client)
        job = {"command": "open_dwg", "params": {"path": r"C:\NH-AI-HUB-workspace\a.dwg"}, "risk_tier": "safe"}
        v.validate(job)
        v.validate(job)
        # DB 호출은 1회만
        assert client.table.call_count == 1
