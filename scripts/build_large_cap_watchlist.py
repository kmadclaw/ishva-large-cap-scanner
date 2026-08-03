#!/usr/bin/env python3
"""Build the Ishva Large Cap watchlist.

Universe rule:
- S&P 500 constituents with market cap >= threshold.
- NASDAQ-listed stocks/ADRs with market cap >= threshold.

Market cap and exchange metadata come from Nasdaq's public screener endpoint.
S&P 500 constituents come from the public datasets/s-and-p-500-companies CSV.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.request
from dataclasses import dataclass
from io import StringIO
from pathlib import Path

NASDAQ_SCREENER = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true"
NASDAQ_EXCHANGE_SCREENER = NASDAQ_SCREENER + "&exchange=NASDAQ"
SP500_CSV = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
DEFAULT_THRESHOLD = 10_000_000_000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Accept": "application/json,text/csv,*/*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/market-activity/stocks/screener",
}

EXCLUDE_NAME_RE = re.compile(r"\b(warrant|right|unit|preferred|preference|notes due|bond|debenture)\b", re.I)


@dataclass
class NasdaqRow:
    symbol: str
    company: str
    market_cap: int
    sector: str
    industry: str
    country: str
    exchange: str | None = None


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8", errors="replace")


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace(".", "-").replace("/", "-")


def parse_market_cap(value: str | int | float | None) -> int:
    if value is None:
        return 0
    cleaned = str(value).replace("$", "").replace(",", "").strip()
    if not cleaned or cleaned.lower() in {"nan", "none", "n/a"}:
        return 0
    try:
        return int(float(cleaned))
    except ValueError:
        return 0


def load_nasdaq_rows(url: str, exchange: str | None = None) -> dict[str, NasdaqRow]:
    payload = json.loads(fetch_text(url))
    rows = payload.get("data", {}).get("rows") or []
    out: dict[str, NasdaqRow] = {}
    for row in rows:
        symbol = normalize_symbol(row.get("symbol", ""))
        company = str(row.get("name", "")).strip()
        if not symbol or not company or EXCLUDE_NAME_RE.search(company):
            continue
        market_cap = parse_market_cap(row.get("marketCap"))
        out[symbol] = NasdaqRow(
            symbol=symbol,
            company=company,
            market_cap=market_cap,
            sector=str(row.get("sector", "")).strip(),
            industry=str(row.get("industry", "")).strip(),
            country=str(row.get("country", "")).strip(),
            exchange=exchange,
        )
    return out


def load_sp500_symbols() -> dict[str, dict[str, str]]:
    text = fetch_text(SP500_CSV)
    out: dict[str, dict[str, str]] = {}
    for row in csv.DictReader(StringIO(text)):
        symbol = normalize_symbol(row.get("Symbol", ""))
        if symbol:
            out[symbol] = {
                "company": row.get("Name", "").strip(),
                "sector": row.get("Sector", "").strip(),
            }
    return out


def build_watchlist(threshold: int) -> list[dict]:
    all_rows = load_nasdaq_rows(NASDAQ_SCREENER)
    nasdaq_rows = load_nasdaq_rows(NASDAQ_EXCHANGE_SCREENER, exchange="NASDAQ")
    sp500 = load_sp500_symbols()

    selected: dict[str, dict] = {}

    for symbol, meta in sp500.items():
        row = all_rows.get(symbol) or nasdaq_rows.get(symbol)
        market_cap = row.market_cap if row else 0
        if market_cap < threshold:
            continue
        selected[symbol] = {
            "symbol": symbol,
            "company": row.company if row else meta.get("company", symbol),
            "industry": row.industry if row else meta.get("sector", "S&P 500"),
            "sector": row.sector if row else meta.get("sector", ""),
            "country": row.country if row else "United States",
            "exchange": (row.exchange if row else None) or "S&P 500 constituent",
            "marketCap": market_cap,
            "universeSource": "S&P 500",
            "nextEarningsDate": "",
        }

    for symbol, row in nasdaq_rows.items():
        if row.market_cap < threshold:
            continue
        source = "S&P 500 + NASDAQ" if symbol in selected else "NASDAQ > $10B"
        selected[symbol] = {
            "symbol": symbol,
            "company": row.company,
            "industry": row.industry,
            "sector": row.sector,
            "country": row.country,
            "exchange": "NASDAQ",
            "marketCap": row.market_cap,
            "universeSource": source,
            "nextEarningsDate": "",
        }

    return sorted(selected.values(), key=lambda item: (-int(item.get("marketCap") or 0), item["symbol"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD)
    parser.add_argument("--src", default="src/watchlist.json")
    parser.add_argument("--public", default="public/data/watchlist.json")
    args = parser.parse_args()

    watchlist = build_watchlist(args.threshold)
    for output in [Path(args.src), Path(args.public)]:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(watchlist, indent=2) + "\n")

    counts: dict[str, int] = {}
    for row in watchlist:
        counts[row["universeSource"]] = counts.get(row["universeSource"], 0) + 1
    print(json.dumps({
        "count": len(watchlist),
        "threshold": args.threshold,
        "sources": counts,
        "src": args.src,
        "public": args.public,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
