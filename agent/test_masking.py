"""
masking.py 단위 테스트.
ezdxf·AutoCAD 없이 실행 가능.
실행: python -m pytest test_masking.py -v
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock

import masking


# ---------------------------------------------------------------------------
# mask_result
# ---------------------------------------------------------------------------

class TestMaskResult:
    def test_sensitive_top_level_keys_masked(self):
        raw = {"author": "홍길동", "company": "농협", "opened": "/work/a.dwg"}
        result = masking.mask_result(raw)
        assert result["author"] == masking._MASK
        assert result["company"] == masking._MASK
        assert result["opened"] == "/work/a.dwg"   # 비민감 키는 그대로

    def test_nested_dict_masked(self):
        raw = {"meta": {"company": "비밀회사", "layer": "0"}}
        result = masking.mask_result(raw)
        assert result["meta"]["company"] == masking._MASK
        assert result["meta"]["layer"] == "0"

    def test_list_values_processed(self):
        raw = {"items": [{"author": "김철수"}, {"layer": "1"}]}
        result = masking.mask_result(raw)
        assert result["items"][0]["author"] == masking._MASK
        assert result["items"][1]["layer"] == "1"

    def test_non_sensitive_keys_untouched(self):
        raw = {"opened": "/work/a.dwg", "status": "done"}
        result = masking.mask_result(raw)
        assert result == raw


# ---------------------------------------------------------------------------
# _mask_pii_patterns
# ---------------------------------------------------------------------------

class TestMaskPiiPatterns:
    def test_email_masked(self):
        text = masking._mask_pii_patterns("담당자: test@example.com 에게 보내세요")
        assert "test@example.com" not in text
        assert "***@***.***" in text

    def test_phone_masked(self):
        text = masking._mask_pii_patterns("전화: 010-1234-5678")
        assert "010-1234-5678" not in text

    def test_no_pii_unchanged(self):
        text = masking._mask_pii_patterns("레이어 이름: WALL")
        assert text == "레이어 이름: WALL"


# ---------------------------------------------------------------------------
# prepare_for_transmission
# ---------------------------------------------------------------------------

class TestPrepareForTransmission:
    def _general_job(self) -> dict:
        return {"id": "j1", "project_classification": "general"}

    def _confidential_job(self) -> dict:
        return {"id": "j2", "project_classification": "confidential"}

    def test_general_job_passthrough(self):
        raw = {"author": "홍길동", "opened": "/work/a.dwg"}
        result = masking.prepare_for_transmission(self._general_job(), raw)
        assert result is raw   # 원본 그대로 반환

    def test_confidential_job_masks_sensitive(self):
        raw = {"author": "홍길동", "company": "농협은행", "opened": "/work/a.dwg"}
        with patch.object(masking, "mask_dwg_metadata", return_value={}):
            result = masking.prepare_for_transmission(self._confidential_job(), raw)
        assert result["author"] == masking._MASK
        assert result["company"] == masking._MASK

    def test_confidential_job_calls_dwg_metadata(self):
        raw = {"opened": "/work/test.dwg"}
        mock_meta = {"summary_info": {}, "title_block": {}}
        with patch.object(masking, "mask_dwg_metadata", return_value=mock_meta) as mock_fn:
            result = masking.prepare_for_transmission(self._confidential_job(), raw)
        mock_fn.assert_called_once_with("/work/test.dwg")
        assert result["dwg_metadata"] == mock_meta

    def test_no_dwg_path_skips_dwg_metadata(self):
        raw = {"status": "done"}
        with patch.object(masking, "mask_dwg_metadata") as mock_fn:
            masking.prepare_for_transmission(self._confidential_job(), raw)
        mock_fn.assert_not_called()


# ---------------------------------------------------------------------------
# mask_dwg_metadata (ezdxf 있는 경우)
# ---------------------------------------------------------------------------

class TestMaskDwgMetadata:
    def test_no_ezdxf_returns_empty(self):
        with patch.object(masking, "ezdxf", None, create=True):
            import importlib
            with patch.dict("sys.modules", {"ezdxf": None}):
                result = masking.mask_dwg_metadata("/any/path.dwg")
        assert "summary_info" in result
        assert "title_block" in result

    def test_clean_dwg_metadata_all_masked(self, tmp_path):
        try:
            import ezdxf
        except ImportError:
            pytest.skip("ezdxf 미설치")

        doc = ezdxf.new()
        path = str(tmp_path / "meta.dwg")
        doc.saveas(path)
        result = masking.mask_dwg_metadata(path)
        assert "summary_info" in result
        # 값이 있는 필드는 MASK, 없는 필드는 빈 문자열
        for v in result["summary_info"].values():
            assert v in (masking._MASK, "")
