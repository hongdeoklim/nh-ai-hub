"""
Phase 5 — 기밀 메타데이터 마스킹.
project_classification='confidential' 인 job의 결과를
NH-AI-HUB 서버로 전송하기 전에 민감 필드를 마스킹한다.

마스킹 대상:
  - 타이틀블록 속성 (ATTRIB 엔터티): 회사명·프로젝트명·작성자·날짜 등
  - DWG 파일 메타데이터: SummaryInfo (Author, Company, Title, Subject, Comments)
  - 결과 dict 안의 민감 키 값
"""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 민감 키워드 — 타이틀블록 속성 태그명에서 감지
# ---------------------------------------------------------------------------
_SENSITIVE_ATTR_TAGS = {
    # 한글
    "회사", "회사명", "발주처", "설계사", "작성자", "담당자",
    "프로젝트", "과제명", "사업명", "도면명", "지역", "주소",
    # 영문
    "company", "client", "author", "engineer", "designer",
    "project", "title", "subject", "address", "location",
    "drawn", "checked", "approved",
}

# 결과 dict에서 마스킹할 최상위 키
_SENSITIVE_RESULT_KEYS = {
    "author", "company", "title", "subject", "comments",
    "drawing_title", "project_name", "client_name",
}

_MASK = "***MASKED***"


# ---------------------------------------------------------------------------
# ezdxf 기반 DWG 메타데이터 마스킹
# ---------------------------------------------------------------------------

def mask_dwg_metadata(dwg_path: str) -> dict[str, Any]:
    """
    dwg 파일의 SummaryInfo(메타데이터)와 타이틀블록 ATTRIB를 읽어
    민감 항목을 마스킹한 dict를 반환한다.
    실제 파일은 수정하지 않는다 — 전송용 요약본만 생성한다.
    """
    result: dict[str, Any] = {
        "summary_info": {},
        "title_block": {},
    }

    try:
        import ezdxf  # type: ignore[import]
    except ImportError:
        logger.warning("ezdxf 없음 — DWG 메타데이터 마스킹 건너뜀")
        return result

    try:
        doc = ezdxf.readfile(dwg_path)
    except Exception as exc:
        logger.warning("DWG 읽기 실패: %s", exc)
        return result

    # SummaryInfo 마스킹 — ezdxf에서 DWG SummaryInfo는 doc.summary_info로 접근
    try:
        si = doc.summary_info
        # ezdxf SummaryInfo 속성명 → 출력 키 매핑
        _SI_FIELDS = {
            "title": "Title", "subject": "Subject", "author": "Author",
            "keywords": "Keywords", "comments": "Comments",
            "last_saved_by": "LastSavedBy", "hyperlink_base": "HyperlinkBase",
        }
        for attr, label in _SI_FIELDS.items():
            raw = getattr(si, attr, "") or ""
            result["summary_info"][label] = _MASK if raw.strip() else ""
    except Exception as exc:
        logger.debug("SummaryInfo 접근 실패: %s", exc)

    # 타이틀블록 ATTRIB 마스킹
    title_block: dict[str, str] = {}
    try:
        for layout in doc.layouts:
            for entity in layout:
                if entity.dxftype() == "INSERT":
                    # ATTRIB 자식 엔터티 순회
                    try:
                        for attrib in entity.attribs:  # type: ignore[attr-defined]
                            tag = attrib.dxf.tag.lower()
                            value = attrib.dxf.text
                            if any(kw in tag for kw in _SENSITIVE_ATTR_TAGS):
                                title_block[attrib.dxf.tag] = _MASK
                            else:
                                title_block[attrib.dxf.tag] = value
                    except AttributeError:
                        pass
    except Exception as exc:
        logger.debug("ATTRIB 순회 실패: %s", exc)

    result["title_block"] = title_block
    return result


# ---------------------------------------------------------------------------
# 결과 dict 마스킹
# ---------------------------------------------------------------------------

def mask_result(result: dict[str, Any]) -> dict[str, Any]:
    """
    job result dict에서 민감 최상위 키 값을 마스킹한 복사본을 반환한다.
    중첩 dict는 재귀 처리한다.
    """
    return _mask_recursive(result)


def _mask_recursive(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: (_MASK if k.lower() in _SENSITIVE_RESULT_KEYS else _mask_recursive(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_mask_recursive(item) for item in obj]
    if isinstance(obj, str):
        return _mask_pii_patterns(obj)
    return obj


# 이메일·전화번호 등 PII 패턴 추가 마스킹
_PII_PATTERNS = [
    (re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"), "***@***.***"),
    (re.compile(r"\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b"), "***-****-****"),
]


def _mask_pii_patterns(text: str) -> str:
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ---------------------------------------------------------------------------
# 전송 전 통합 마스킹 진입점
# ---------------------------------------------------------------------------

def prepare_for_transmission(
    job: dict[str, Any],
    raw_result: dict[str, Any],
) -> dict[str, Any]:
    """
    기밀 프로젝트 job의 결과를 서버 전송 전에 마스킹한다.
    일반 프로젝트는 원본 그대로 반환한다.
    """
    if job.get("project_classification") != "confidential":
        return raw_result

    logger.info("기밀 프로젝트 — 전송 전 메타데이터 마스킹 적용 job_id=%s", job.get("id"))

    masked = mask_result(raw_result)

    # DWG 경로가 결과에 포함된 경우 파일 메타데이터도 마스킹
    dwg_path = raw_result.get("opened") or raw_result.get("saved")
    if dwg_path and isinstance(dwg_path, str) and dwg_path.endswith(".dwg"):
        masked["dwg_metadata"] = mask_dwg_metadata(dwg_path)

    return masked
