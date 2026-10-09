#!/usr/bin/env python
"""RQ worker entry point — enhanced with worker identity logging.

Each worker subprocess gets a WORKER_ID from the environment (set by the
autoscaler or by Docker Compose).  The ID appears in every log line so
concurrent workers can be distinguished in the same log stream.
"""
from __future__ import annotations

import os
import time

from redis import Redis
from rq import Worker

_REDIS_URL = os.environ.get("REDIS_URL", "redis://redis123@redis:6379/0")
_QUEUES    = ["agent_jobs"]
_WORKER_ID = os.environ.get("WORKER_ID", f"worker-pid{os.getpid()}")


class IdentifiedWorker(Worker):
    """RQ Worker subclass — logs worker_id at job start / done / failed."""

    def execute_job(self, job, queue):
        worker_id = os.environ.get("WORKER_ID", self.name)
        t0 = time.time()
        run_id = job.args[0] if job.args else "?"
        print(
            f"[worker {worker_id}] JOB_START"
            f" job_id={job.id}"
            f" run_id={run_id}"
            f" func={job.func_name}",
            flush=True,
        )
        try:
            result = super().execute_job(job, queue)
            elapsed = time.time() - t0
            print(
                f"[worker {worker_id}] JOB_DONE"
                f" job_id={job.id}"
                f" run_id={run_id}"
                f" elapsed={elapsed:.1f}s",
                flush=True,
            )
            return result
        except Exception as exc:
            elapsed = time.time() - t0
            print(
                f"[worker {worker_id}] JOB_FAILED"
                f" job_id={job.id}"
                f" run_id={run_id}"
                f" elapsed={elapsed:.1f}s"
                f" exc_type={type(exc).__name__}",
                flush=True,
            )
            raise


if __name__ == "__main__":
    conn = Redis.from_url(_REDIS_URL)
    w = IdentifiedWorker(_QUEUES, connection=conn, name=_WORKER_ID)
    print(
        f"[worker {_WORKER_ID}] starting"
        f" queues={_QUEUES}"
        f" redis={_REDIS_URL}"
        f" pid={os.getpid()}",
        flush=True,
    )
    w.work(with_scheduler=False)
