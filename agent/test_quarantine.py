"""
quarantine.py 단위 테스트.
실제 dwg 파일·ezdxf 없이도 동작하도록 Mock 처리.
실행: python -m pytest test_quarantine.py -v
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import quarantine as quar


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------

def _make_queue() -> MagicMock:
    q = MagicMock()
    q.set_pending_approval = MagicMock()
    q.set_failed = MagicMock()
    return q


def _make_manager(tmp: Path) -> tuple[quar.QuarantineManager, MagicMock]:
    q_dir = str(tmp / "quarantine")
    w_dir = str(tmp / "workspace")
    queue = _make_queue()
    mgr = quar.QuarantineManager(q_dir, w_dir, queue)
    return mgr, queue


def _dummy_dwg(tmp: Path, name: str = "test.dwg") -> str:
    p = tmp / name
    p.write_bytes(b"AC1015" + b"\x00" * 100)  # 가짜 dwg 헤더
    return str(p)


# ---------------------------------------------------------------------------
# scan_file
# ---------------------------------------------------------------------------

class TestScanFile:
    def test_missing_file_is_unsafe(self):
        result = quar.scan_file("/nonexistent/path.dwg")
        assert result.safe is False
        assert result.findings

    def test_ezdxf_not_installed_is_unsafe(self):
        with patch.object(quar, "_HAS_EZDXF", False):
            result = quar.scan_file("/any/path.dwg")
        assert result.safe is False
        assert "ezdxf 미설치" in result.findings[0]

    def test_unreadable_file_is_unsafe(self, tmp_path):
        bad = _dummy_dwg(tmp_path, "bad.dwg")
        # ezdxf가 있더라도 가짜 바이너리면 readfile이 실패해야 함
        if quar._HAS_EZDXF:
            result = quar.scan_file(bad)
            assert result.safe is False
        else:
            pytest.skip("ezdxf 미설치")

    def test_clean_file_is_safe(self, tmp_path):
        if not quar._HAS_EZDXF:
            pytest.skip("ezdxf 미설치")
        import ezdxf
        doc = ezdxf.new()
        path = str(tmp_path / "clean.dwg")
        doc.saveas(path)
        result = quar.scan_file(path)
        assert result.safe is True
        assert result.findings == []


# ---------------------------------------------------------------------------
# QuarantineManager.receive
# ---------------------------------------------------------------------------

class TestQuarantineManagerReceive:
    def test_safe_file_moves_to_workspace(self, tmp_path):
        mgr, queue = _make_manager(tmp_path)
        src = _dummy_dwg(tmp_path, "input.dwg")

        with patch.object(quar, "scan_file", return_value=quar.ScanResult(safe=True)):
            dest = mgr.receive(src, "job-001")

        assert dest != ""
        assert Path(dest).exists()
        assert "workspace" in dest
        queue.set_pending_approval.assert_not_called()
        queue.set_failed.assert_not_called()

    def test_unsafe_file_sets_pending_approval(self, tmp_path):
        mgr, queue = _make_manager(tmp_path)
        src = _dummy_dwg(tmp_path, "evil.dwg")

        findings = ["프록시 객체: ACAD_PROXY_ENTITY"]
        with patch.object(quar, "scan_file", return_value=quar.ScanResult(safe=False, findings=findings)):
            dest = mgr.receive(src, "job-002")

        assert dest == ""
        queue.set_pending_approval.assert_called_once_with("job-002")

    def test_quarantine_copy_fails_sets_failed(self, tmp_path):
        mgr, queue = _make_manager(tmp_path)

        with patch("shutil.copy2", side_effect=OSError("디스크 꽉 참")):
            dest = mgr.receive("/nonexistent/file.dwg", "job-003")

        assert dest == ""
        queue.set_failed.assert_called_once()

    def test_unsafe_file_kept_in_quarantine(self, tmp_path):
        mgr, queue = _make_manager(tmp_path)
        src = _dummy_dwg(tmp_path, "suspicious.dwg")

        with patch.object(quar, "scan_file", return_value=quar.ScanResult(safe=False, findings=["위험"])):
            mgr.receive(src, "job-004")

        # 격리 폴더에 파일이 남아있어야 함
        quarantined = mgr.list_quarantined()
        assert any("suspicious.dwg" in p for p in quarantined)

    def test_list_quarantined(self, tmp_path):
        mgr, queue = _make_manager(tmp_path)
        src = _dummy_dwg(tmp_path, "another.dwg")

        with patch.object(quar, "scan_file", return_value=quar.ScanResult(safe=False, findings=["위험"])):
            mgr.receive(src, "job-005")

        listed = mgr.list_quarantined()
        assert len(listed) >= 1
