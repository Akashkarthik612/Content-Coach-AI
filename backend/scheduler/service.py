import logging
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.scheduler.jobs import ScheduledPublishJob

logger = logging.getLogger(__name__)

_JOB_ID = "publish_due_posts"


class SchedulerService:
    """Starts/stops the background scheduler that auto-publishes scheduled
    posts. Static methods only, mirroring LinkedInConnectService's style —
    there's no per-instance state, just start/stop around one recurring job."""

    @staticmethod
    def start(session_factory: Callable[[], Session]) -> BackgroundScheduler:
        """Configures a BackgroundScheduler (its own thread pool — doesn't
        block the app's asyncio event loop, matching that vault/linkedin
        services are plain sync SQLAlchemy) with one interval job on
        ScheduledPublishJob.run_tick. Returns the started scheduler so the
        caller (main.py's lifespan) can stop it on shutdown."""
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            ScheduledPublishJob.run_tick,
            args=[session_factory],
            trigger="interval",
            seconds=settings.SCHEDULER_POLL_INTERVAL_SECONDS,
            id=_JOB_ID,
            max_instances=1,  # a slow tick must finish before the next one starts
            coalesce=True,
        )
        scheduler.start()
        logger.info(
            "Scheduler started: publishing due posts every %ss",
            settings.SCHEDULER_POLL_INTERVAL_SECONDS,
        )
        return scheduler

    @staticmethod
    def stop(scheduler: BackgroundScheduler) -> None:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
