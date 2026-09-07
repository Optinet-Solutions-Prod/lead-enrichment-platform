"""
Maltapark classifieds search worker (SaaS line).

Called as a subprocess by vm/worker.py for jobs where
scrape_queue.search_engine = 'maltapark'. Mirrors youtube_search.py's CLI
shape (arg names, [RESULT] marker, output JSON) so the worker dispatch path
stays uniform.

PLAIN HTTP — no GoLogin, no Chromium, no API key. Maltapark is a classic
server-rendered classifieds site:

  GET https://www.maltapark.com/search/?c=s1&search=<keyword>&page=<n>

Each result card is
  <div class="item ..." data-itemid="10057445"> ...
    <a class="header" href="/item/details/10057445">TITLE</a>
    <span class="price"><span>€ 25.00</span></span>
    <img src="/asset/itemthumbs/...">

(Verified 2026-09-07.) Seller contact details sit behind a reCAPTCHA-gated
popup on the detail page, so Phase 1 captures the listing cards only.

Flow:
  1. fetch pages 1..N (stop early when a page adds no new listing ids)
  2. parse cards → listing_id, title, url, price_text, thumbnail_url
  3. upsert into public.maltapark_listings (on_conflict=listing_id) — re-scrapes
     refresh title/price/last_seen_at and re-stamp scrape_job_id
  4. write summary JSON for worker.py
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests
from supabase import create_client

BASE_URL = "https://www.maltapark.com"
SEARCH_URL = BASE_URL + "/search/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
PAGE_DELAY_SECONDS = 1.5
REQUEST_TIMEOUT_S = 30
MAX_PAGES_HARD_CAP = 20

CARD_RE = re.compile(r'<div class="item[^"]*"\s+data-itemid="(\d+)"', re.I)
TITLE_RE = re.compile(r'<a class="header"\s+href="/item/details/\d+">(.*?)</a>', re.S | re.I)
PRICE_RE = re.compile(r'<span class="price">\s*<span>([^<]*)</span>', re.I)
THUMB_RE = re.compile(r'src="(/asset/itemthumbs/[^"]+)"', re.I)


def fetch_page(session: requests.Session, keyword: str, page: int) -> str:
    resp = session.get(
        SEARCH_URL,
        params={"c": "s1", "search": keyword, "page": page},
        timeout=REQUEST_TIMEOUT_S,
    )
    resp.raise_for_status()
    return resp.text


def parse_cards(page_html: str) -> dict[int, dict[str, Any]]:
    """One entry per unique listing id on the page (cards can render twice —
    desktop + tablet variants share the same data-itemid)."""
    cards: dict[int, dict[str, Any]] = {}
    matches = list(CARD_RE.finditer(page_html))
    for i, m in enumerate(matches):
        listing_id = int(m.group(1))
        if listing_id in cards:
            continue
        block = page_html[m.start() : matches[i + 1].start() if i + 1 < len(matches) else m.start() + 4000]
        title_m = TITLE_RE.search(block)
        price_m = PRICE_RE.search(block)
        thumb_m = THUMB_RE.search(block)
        title = html_lib.unescape(re.sub(r"<[^>]+>", "", title_m.group(1)).strip()) if title_m else None
        price = html_lib.unescape(price_m.group(1).strip()) if price_m else None
        cards[listing_id] = {
            "listing_id": listing_id,
            "title": title,
            "url": f"{BASE_URL}/item/details/{listing_id}",
            "price_text": price or None,
            "thumbnail_url": (BASE_URL + thumb_m.group(1)) if thumb_m else None,
        }
    return cards


def main() -> None:
    parser = argparse.ArgumentParser(description="Maltapark search → maltapark_listings")
    parser.add_argument("-k", "--keyword", required=True)
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--worker-id", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    sb_url = os.environ.get("SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not sb_url or not sb_key:
        print("[ERROR] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set", file=sys.stderr)
        print("[RESULT] FAILED")
        sys.exit(1)

    pages = max(1, min(args.pages, MAX_PAGES_HARD_CAP))
    print(f"[INFO] Maltapark search | keyword={args.keyword!r} pages={pages} job={args.job_id[:8]}")

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en"})

    all_cards: dict[int, dict[str, Any]] = {}
    pages_scraped = 0
    for page in range(1, pages + 1):
        try:
            page_html = fetch_page(session, args.keyword, page)
        except Exception as exc:  # noqa: BLE001
            # First page failing is a job failure; later pages are best-effort.
            if page == 1:
                print(f"[ERROR] Maltapark page 1 fetch failed: {exc}", file=sys.stderr)
                print("[RESULT] FAILED")
                sys.exit(2)
            print(f"[WARN] page {page} fetch failed: {exc} — stopping pagination", file=sys.stderr)
            break

        page_cards = parse_cards(page_html)
        new_ids = set(page_cards) - set(all_cards)
        all_cards.update(page_cards)
        pages_scraped = page
        print(f"[INFO] page {page}: {len(page_cards)} cards, {len(new_ids)} new (total {len(all_cards)})")
        if not new_ids:
            break  # past the last page — Maltapark repeats/empties beyond it
        if page < pages:
            time.sleep(PAGE_DELAY_SECONDS)

    now_iso = datetime.now(timezone.utc).isoformat()
    if all_cards:
        rows = [
            {
                **card,
                "scrape_job_id": args.job_id,
                "keyword": args.keyword,
                "last_seen_at": now_iso,
            }
            for card in all_cards.values()
        ]
        try:
            sb = create_client(sb_url, sb_key)
            sb.table("maltapark_listings").upsert(rows, on_conflict="listing_id").execute()
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] Supabase upsert failed: {exc}", file=sys.stderr)
            print("[RESULT] FAILED")
            sys.exit(3)

    payload = {
        "engine": "maltapark",
        "keyword": args.keyword,
        "total_results": len(all_cards),
        "pages_scraped": pages_scraped,
        "timestamp": now_iso,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(f"[DONE] MALTAPARK | Total: {len(all_cards)} listings across {pages_scraped} page(s)")
    print("[RESULT] SUCCESS")


if __name__ == "__main__":
    main()
