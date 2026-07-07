"""
NH-AI-HUB AutoCAD 로컬 에이전트 진입점.
Supabase cad_jobs 테이블을 polling하여 작업을 순차 실행한다.
"""
from __future__ import annotations

import logging
import time

import config
import autocad_com
import db
import executor
import sketchup_exec
import validator as val

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("nh-agent")


def main() -> None:
    cfg = config.load()

    # 인증 모드 결정: service_role 키가 있으면 서비스 키 모드(모델 A),
    # 없으면 개인 이메일/비번(모델 B). 둘 다 없으면 종료.
    if cfg["supabase_key"]:
        auth_mode = "서비스 키(공용 PC)"
        try:
            client = db.make_client(cfg["supabase_url"], service_key=cfg["supabase_key"])
        except Exception:
            logger.exception("서비스 키로 클라이언트 생성 실패. 에이전트를 종료합니다.")
            return
    elif cfg["supabase_email"] and cfg["supabase_password"]:
        auth_mode = f"개인 계정({cfg['supabase_email']})"
        try:
            client = db.make_client(
                cfg["supabase_url"],
                anon_key=cfg["supabase_anon_key"],
                email=cfg["supabase_email"],
                password=cfg["supabase_password"],
            )
        except Exception:
            logger.exception("개인 계정 로그인 실패. 이메일/비밀번호를 확인하세요. 에이전트를 종료합니다.")
            return
    else:
        logger.error(
            "접속 정보가 없습니다. (공용 PC) SUPABASE_KEY 또는 "
            "(직원 PC) SUPABASE_EMAIL/SUPABASE_PASSWORD 를 설정하세요."
        )
        return

    queue = db.JobQueue(client)
    acad = autocad_com.connect(cfg["autocad_progid"])
    sketchup = sketchup_exec.make_runner(cfg["sketchup_exe"], cfg["dwg_workspace"])
    validator = val.Validator(client)
    runner = executor.JobExecutor(acad, queue, cfg, validator, sketchup=sketchup)

    logger.info(
        "NH-AI-HUB 에이전트 시작 — 인증: %s / AutoCAD: %s / SketchUp: %s / 작업폴더: %s",
        auth_mode,
        acad.Caption,
        "활성" if sketchup else "비활성",
        cfg["dwg_workspace"],
    )

    while True:
        try:
            jobs = queue.fetch_pending()
            for job in jobs:
                runner.run(job)
            time.sleep(cfg["poll_interval_sec"])
        except KeyboardInterrupt:
            logger.info("에이전트 종료 요청.")
            break
        except Exception:
            logger.exception("polling 중 예외 발생 — 재시도합니다.")
            time.sleep(cfg["poll_interval_sec"])


if __name__ == "__main__":
    main()
