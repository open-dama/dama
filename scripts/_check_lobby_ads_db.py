#!/usr/bin/env python3
"""One-shot local/prod check for Phase A/B/C lobby ads settings. No network writes."""
from __future__ import annotations

import json
import os
import sys

import psycopg


def load_env(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            os.environ[k] = v


def check(label: str, url: str) -> bool:
    if not url:
        print(f"{label}: MISSING_URL")
        return False
    ok = True
    with psycopg.connect(url) as conn:
        c = conn.cursor()
        c.execute(
            """
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
              AND (tablename LIKE '%migrat%' OR tablename IN ('schema_migrations', 'goose_db_version'))
            ORDER BY 1
            """
        )
        print(f"{label} migration_tables={c.fetchall()}")

        # Prefer goose if present
        for table, col in (
            ("goose_db_version", "version_id"),
            ("schema_migrations", "version"),
        ):
            try:
                c.execute(f"SELECT {col} FROM {table} ORDER BY {col} DESC LIMIT 8")
                print(f"{label} {table}_top={[r[0] for r in c.fetchall()]}")
                break
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"{label} {table}_err={e}")

        c.execute("SELECT value FROM platform_settings WHERE key = 'ad_playback'")
        row = c.fetchone()
        if not row:
            print(f"{label} ad_playback=MISSING")
            return False
        pb = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        need_keys = [
            "lobby_rotate_enabled",
            "lobby_rotate_interval_seconds",
            "lobby_soft_interstitial_enabled",
            "lobby_idle_threshold_seconds",
            "freq_cap_campaign_per_hour",
            "freq_cap_campaign_per_day",
            "freq_cap_campaign_per_session",
            "freq_cap_placement_per_hour",
            "freq_cap_placement_per_day",
            "freq_cap_placement_per_session",
            "freq_cap_min_gap_seconds",
        ]
        need = {k: pb.get(k, "MISSING") for k in need_keys}
        for k, v in need.items():
            if v == "MISSING":
                ok = False
        print(f"{label} ad_playback={json.dumps(need, default=str)}")

        c.execute("SELECT value FROM platform_settings WHERE key = 'ad_packages'")
        prow = c.fetchone()
        raw = prow[0] if prow else {}
        if isinstance(raw, str):
            raw = json.loads(raw)
        pkgs = raw.get("packages") if isinstance(raw, dict) else raw
        if isinstance(pkgs, str):
            pkgs = json.loads(pkgs)
        takeover = None
        for p in pkgs or []:
            if isinstance(p, str):
                try:
                    p = json.loads(p)
                except Exception:  # noqa: BLE001
                    continue
            if not isinstance(p, dict):
                continue
            if str(p.get("code", "")).lower() == "lobby_takeover":
                takeover = p
                break
        if not takeover:
            print(f"{label} lobby_takeover=MISSING pkgs_type={type(pkgs).__name__}")
            ok = False
        else:
            placement = takeover.get("placement") or takeover.get("placements")
            print(
                f"{label} lobby_takeover code={takeover.get('code')} "
                f"buying={takeover.get('buying_type')} "
                f"exclusive={takeover.get('exclusive_category')} "
                f"flag={takeover.get('lobby_takeover')} "
                f"placement={placement}"
            )
            if not takeover.get("lobby_takeover"):
                ok = False
            if str(placement).lower() not in ("lobby", "['lobby']", '["lobby"]'):
                # accept list/tuple containing lobby
                if not (
                    isinstance(placement, (list, tuple))
                    and any(str(x).lower() == "lobby" for x in placement)
                ):
                    print(f"{label} lobby_takeover placement unexpected: {placement!r}")
                    ok = False
        # session_key column
        c.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'ad_impression_events' AND column_name = 'session_key'
            """
        )
        if not c.fetchone():
            print(f"{label} session_key_column=MISSING")
            ok = False
        else:
            print(f"{label} session_key_column=OK")
    print(f"{label}: {'OK' if ok else 'FAIL'}")
    return ok


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_env(os.path.join(root, ".env"))
    local_url = os.environ.get("DAMA_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    local_ok = check("LOCAL", local_url)

    # Prod from .env.prod without clobbering local vars permanently for callers
    prod_env = {}
    prod_path = os.path.join(root, ".env.prod")
    if os.path.isfile(prod_path):
        with open(prod_path, encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                prod_env[k.strip()] = v.strip().strip('"').strip("'")
    prod_url = prod_env.get("DAMA_DATABASE_URL") or prod_env.get("DATABASE_URL") or ""
    prod_ok = check("PROD", prod_url)
    print(f"VERDICT LOCAL:{'OK' if local_ok else 'FAIL'} PROD:{'OK' if prod_ok else 'FAIL'}")
    return 0 if local_ok and prod_ok else 1


if __name__ == "__main__":
    sys.exit(main())
