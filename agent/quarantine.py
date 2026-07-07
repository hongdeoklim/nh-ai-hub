"""
Phase 4 — 외부 DWG 격리 및 정적 스캔.
스펙 4번 표 5번 항목 구현.

흐름:
  1. 외부에서 받은 dwg → incoming_quarantine/ 에만 저장
  2. ezdxf로 열어 임베디드 LISP·매크로·프록시 객체 1차 스캔
  3. 의심 요소 발견 → pending_approval 전환 (AutoCAD로 오픈 금지)
  4. 이상 없음 → 정상 작업 폴더(dwg_workspace)로 이동
"""
from __future__ import annotations

import logging
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ezdxf 없는 환경에서도 import가 통과되도록
try:
    import ezdxf  # type: ignore[import]
    from ezdxf.document import Drawing  # type: ignore[import]
    _HAS_EZDXF = True
except ImportError:
    _HAS_EZDXF = False
    logger.warning("ezdxf가 설치되지 않았습니다. 격리 스캔이 비활성화됩니다.")


# ---------------------------------------------------------------------------
# 스캔 결과
# ---------------------------------------------------------------------------

@dataclass
class ScanResult:
    safe: bool
    findings: list[str] = field(default_factory=list)
    scanned_path: str = ""

    def summary(self) -> str:
        if self.safe:
            return f"안전 — {self.scanned_path}"
        return f"위험 요소 발견 — {', '.join(self.findings)}"


# ---------------------------------------------------------------------------
# 정적 스캐너
# ---------------------------------------------------------------------------

_SUSPICIOUS_ENTITY_TYPES = {
    "ACDBPLACEHOLDER",   # 프록시 객체
    "ACAD_PROXY_ENTITY", # 프록시 엔터티
}

_SUSPICIOUS_APPID_PATTERNS = [
    "lisp", "vlide", "diesel", "script", "macro", "virus",
]


def _scan_doc(doc: Any) -> list[str]:
    """ezdxf Document 객체에서 의심 요소를 찾아 문자열 목록으로 반환한다."""
    findings: list[str] = []

    # 1) 프록시/알 수 없는 엔터티 검사
    for layout in doc.layouts:
        for entity in layout:
            dxftype = entity.dxftype()
            if dxftype in _SUSPICIOUS_ENTITY_TYPES:
                findings.append(f"프록시 객체: {dxftype}")
            # ACDBDICTIONARYWDFLT 등 알 수 없는 타입도 기록
            if dxftype.startswith("ACDB") and dxftype not in _SUSPICIOUS_ENTITY_TYPES:
                findings.append(f"알 수 없는 엔터티 타입: {dxftype}")

    # 2) 앱 ID(APPID 테이블)에 LISP·매크로 흔적 검사
    try:
        appid_table = doc.appids
        for entry in appid_table:
            name = entry.dxf.name.lower()
            if any(pat in name for pat in _SUSPICIOUS_APPID_PATTERNS):
                findings.append(f"의심 APPID: {entry.dxf.name}")
    except Exception as exc:
        logger.debug("APPID 검사 실패: %s", exc)

    # 3) 오브젝트 섹션의 ACAD_XREC·딕셔너리에 임베디드 스크립트 흔적 검사
    try:
        objects = doc.objects
        for obj in objects:
            dxftype = obj.dxftype()
            if dxftype == "XRECORD":
                # XRECORD 안의 문자열 값에 위험 키워드 포함 여부 확인
                for tag in obj.tags:
                    if tag.code in (1, 3, 300) and isinstance(tag.value, str):
                        lower_val = tag.value.lower()
                        if any(pat in lower_val for pat in _SUSPICIOUS_APPID_PATTERNS):
                            findings.append(f"XRECORD 내 의심 문자열: {tag.value[:80]}")
    except Exception as exc:
        logger.debug("XRECORD 검사 실패: %s", exc)

    return findings


def scan_file(dwg_path: str) -> ScanResult:
    """
    단일 dwg 파일을 정적 스캔한다.
    ezdxf가 없으면 스캔을 건너뛰고 safe=False(보수적)로 반환한다.
    """
    if not _HAS_EZDXF:
        return ScanResult(safe=False, findings=["ezdxf 미설치 — 스캔 불가"], scanned_path=dwg_path)

    if not os.path.exists(dwg_path):
        return ScanResult(safe=False, findings=["파일이 존재하지 않음"], scanned_path=dwg_path)

    try:
        doc = ezdxf.readfile(dwg_path)
    except Exception as exc:
        return ScanResult(safe=False, findings=[f"파일 읽기 실패: {exc}"], scanned_path=dwg_path)

    findings = _scan_doc(doc)
    return ScanResult(safe=len(findings) == 0, findings=findings, scanned_path=dwg_path)


# ---------------------------------------------------------------------------
# 격리 관리자
# ---------------------------------------------------------------------------

class QuarantineManager:
    """
    외부 dwg 파일을 격리 폴더로 받아 스캔하고 안전할 때만 작업 폴더로 이동한다.
    """

    def __init__(self, quarantine_dir: str, workspace_dir: str, queue: Any) -> None:
        self._quarantine = Path(quarantine_dir)
        self._workspace = Path(workspace_dir)
        self._queue = queue
        self._quarantine.mkdir(parents=True, exist_ok=True)
        self._workspace.mkdir(parents=True, exist_ok=True)

    def receive(self, source_path: str, job_id: str) -> str:
        """
        외부 파일을 격리 폴더로 복사한 뒤 스캔한다.
        안전하면 작업 폴더 경로를 반환, 의심스러우면 pending_approval로 전환 후 빈 문자열 반환.
        """
        filename = Path(source_path).name
        quarantine_path = str(self._quarantine / filename)

        # 격리 폴더로 복사 (원본 유지)
        try:
            shutil.copy2(source_path, quarantine_path)
            logger.info("격리 폴더로 복사: %s → %s", source_path, quarantine_path)
        except Exception as exc:
            logger.error("격리 복사 실패: %s", exc)
            self._queue.set_failed(job_id, f"격리 복사 실패: {exc}")
            return ""

        # 정적 스캔
        result = scan_file(quarantine_path)
        logger.info("스캔 결과: %s", result.summary())

        if not result.safe:
            logger.warning(
                "의심 파일 감지 — pending_approval 전환 job_id=%s findings=%s",
                job_id, result.findings,
            )
            self._queue.set_pending_approval(job_id)
            # 격리 파일은 그대로 보존 (사람이 검토 후 판단)
            return ""

        # 안전 → 작업 폴더로 이동
        dest_path = str(self._workspace / filename)
        try:
            shutil.move(quarantine_path, dest_path)
            logger.info("스캔 통과 — 작업 폴더로 이동: %s", dest_path)
        except Exception as exc:
            logger.error("작업 폴더 이동 실패: %s", exc)
            self._queue.set_failed(job_id, f"파일 이동 실패: {exc}")
            return ""

        return dest_path

    def list_quarantined(self) -> list[str]:
        """현재 격리 폴더에 남아있는 파일 목록."""
        return [str(p) for p in self._quarantine.glob("*.dwg")]
