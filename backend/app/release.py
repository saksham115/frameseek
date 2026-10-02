"""Release step run by the migrate job on every deploy: database migrations, then copying
any missing stock music into Blob.

Invoked as `python app/release.py` (no dashed arguments, which `az containerapp job update
--command` would read as its own options). A failed migration fails the job and stops the
rollout; the music sync is best effort and never does.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main() -> None:
    from alembic.config import main as alembic

    alembic(argv=["upgrade", "head"])
    # Alembic's logging config quiets everything below WARNING; show the sync summary.
    import logging

    logging.getLogger().setLevel(logging.INFO)

    from app.workers.worker import sync_stock_music

    asyncio.run(sync_stock_music())


if __name__ == "__main__":
    main()
