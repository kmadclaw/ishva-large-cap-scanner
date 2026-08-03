# Ishva Large Cap Scanner

A compact Vercel scanner cloned from Ishva Momentum Scanner and expanded to scan S&P 500 constituents plus NASDAQ-listed stocks/ADRs with market cap over $10B.

## Data

- Default symbols: `src/watchlist.json` and `public/data/watchlist.json`
- Universe generator: `scripts/build_large_cap_watchlist.py`
- Universe rule: S&P 500 constituents plus NASDAQ-listed stocks/ADRs with market cap over `$10B`
- Last 1 year daily OHLCV: `public/data/ohlcv_1y.csv`
- Latest computed indicators: `public/data/latest_metrics.json`
- Layer 1 momentum filters: EMA8/21, EMA8/21/34, SMA50/200, EMA50/200
- Layer 2 trend-strength filters: `ADX14 > 20 + DI+ > DI-`, softer `ADX14 > 18 + DI+ > DI-`, and `DI+ crossed above DI- within the last 7 trading days`
- Mean-reversion filters: price touched EMA21 within the last 1–5 bars and RSI14 is inside the adjustable range, default `40–55`

Update data locally:

```bash
python3 scripts/update_ohlcv.py
```

Refresh the large-cap universe first when needed:

```bash
python3 scripts/build_large_cap_watchlist.py
```

The GitHub Actions workflow runs after market close on weekdays, refreshes the one-year CSV/JSON, and commits changes when data changed.
