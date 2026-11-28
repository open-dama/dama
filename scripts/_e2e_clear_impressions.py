"""Clear e2e-* ad_impression_events so freq caps from prior runs do not fail closed."""
from __future__ import annotations

import os
import sys

import psycopg


def main() -> None:
    url = os.environ.get("DAMA_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        print("NO_URL", file=sys.stderr)
        raise SystemExit(1)
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ad_impression_events WHERE viewer_key LIKE %s",
                ("e2e-%",),
            )
            print("deleted", cur.rowcount)
        conn.commit()


if __name__ == "__main__":
    main()
