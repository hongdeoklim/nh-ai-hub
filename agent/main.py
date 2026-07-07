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

    if not cfg["supabase_url"] or not cfg["supabase_key"]:
        logger.error("SUPABASE_URL / SUPABASE_KEY가 설정되지 않았습니다. 에이전트를 종료합니다.")
        return

    client = db.make_client(cfg["supabase_url"], cfg["supabase_key"])
    queue = db.JobQueue(client)
    acad = autocad_com.connect(cfg["autocad_progid"])
    sketchup = sketchup_exec.make_runner(cfg["sketchup_exe"], cfg["dwg_workspace"])
    validator = val.Validator(client)
    runner = executor.JobExecutor(acad, queue, cfg, validator, sketchup=sketchup)

    logger.info(
        "NH-AI-HUB 에이전트 시작 — AutoCAD: %s / SketchUp: %s / 작업폴더: %s",
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
