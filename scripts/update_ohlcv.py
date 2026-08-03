#!/usr/bin/env python3
"""Download/update at least one year of daily OHLCV for the default watchlist.

This script rewrites the one-year CSV snapshot and latest indicator JSON.
It is idempotent and safe for scheduled daily use after market close.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf


def load_symbols(path: Path) -> list[str]:
    data = json.loads(path.read_text())
    symbols: list[str] = []
    seen: set[str] = set()
    for item in data:
        sym = str(item.get("symbol", item) if isinstance(item, dict) else item).strip().upper().replace(".", "-")
        if sym and sym not in seen:
            symbols.append(sym)
            seen.add(sym)
    return symbols


def download(symbols: list[str], period: str) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for i in range(0, len(symbols), 50):
        chunk = symbols[i:i + 50]
        df = yf.download(
            " ".join(chunk),
            period=period,
            interval="1d",
            auto_adjust=False,
            group_by="ticker",
            progress=False,
            threads=True,
            timeout=40,
        )
        for sym in chunk:
            try:
                if isinstance(df.columns, pd.MultiIndex):
                    if sym not in df.columns.get_level_values(0):
                        continue
                    h = df[sym].dropna(how="all").copy()
                else:
                    h = df.dropna(how="all").copy()
                if h.empty:
                    continue
                h = h.reset_index()
                date_col = "Date" if "Date" in h.columns else h.columns[0]
                h["symbol"] = sym
                h["date"] = pd.to_datetime(h[date_col]).dt.date.astype(str)
                rename = {
                    "Open": "open",
                    "High": "high",
                    "Low": "low",
                    "Close": "close",
                    "Adj Close": "adj_close",
                    "Volume": "volume",
                }
                h = h.rename(columns=rename)
                keep = ["symbol", "date", "open", "high", "low", "close", "adj_close", "volume"]
                for col in keep:
                    if col not in h.columns:
                        h[col] = None
                frames.append(h[keep])
            except Exception as exc:
                print(f"WARN {sym}: {exc}")
    if not frames:
        raise SystemExit("No market data downloaded")
    out = pd.concat(frames, ignore_index=True)
    out = out.dropna(subset=["close"]).drop_duplicates(["symbol", "date"], keep="last")
    out = out.sort_values(["symbol", "date"])
    return out


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def add_macd(g: pd.DataFrame, fast: int, slow: int, signal: int, prefix: str) -> pd.DataFrame:
    """Add MACD line/signal/histogram plus recent bullish cross distance."""
    close = g["close"].astype(float)
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    cross = (macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))

    g[f"{prefix}_macd"] = macd_line
    g[f"{prefix}_macd_signal"] = signal_line
    g[f"{prefix}_macd_hist"] = hist
    g[f"{prefix}_macd_crossed_above_signal"] = cross
    return g


def wilder(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = wilder(gain, period)
    avg_loss = wilder(loss, period)
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def latest_touch_bars_ago(g: pd.DataFrame, column: str, lookback: int = 5) -> int | None:
    """Return bars since intraday price range last touched an indicator column."""
    recent = g.tail(lookback).copy()
    touched = recent[(recent["low"].astype(float) <= recent[column].astype(float)) & (recent["high"].astype(float) >= recent[column].astype(float))]
    if touched.empty:
        return None
    return int(len(g) - 1 - g.index.get_loc(touched.index[-1]))


def latest_condition_start_days_ago(g: pd.DataFrame, condition: pd.Series) -> int | None:
    """Return bars since the latest false→true start of a currently true condition."""
    if condition.empty or not bool(condition.iloc[-1]):
        return None
    starts = condition.fillna(False) & ~condition.fillna(False).shift(1, fill_value=False)
    recent_starts = g[starts]
    if recent_starts.empty:
        return int(len(g) - 1)
    return int(len(g) - 1 - g.index.get_loc(recent_starts.index[-1]))


def consecutive_rising_days(series: pd.Series) -> int:
    """Count consecutive latest bars where the series rose versus the prior bar."""
    diffs = series.astype(float).diff()
    count = 0
    for value in reversed(diffs.tolist()):
        if pd.notna(value) and value > 0:
            count += 1
        else:
            break
    return count


def add_adx_dmi(g: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Add ADX + DMI trend-strength columns using Wilder smoothing.

    DMI is a Layer 2/high-priority confirmation after the moving-average
    momentum layer: ADX measures trend strength while DI+ vs DI- confirms the
    bullish direction. A recent DI+ cross above DI- highlights new trend starts.
    """
    high = g["high"].astype(float)
    low = g["low"].astype(float)
    close = g["close"].astype(float)

    prev_high = high.shift(1)
    prev_low = low.shift(1)
    prev_close = close.shift(1)

    up_move = high - prev_high
    down_move = prev_low - low
    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    atr = wilder(tr, period)
    plus_di = 100 * wilder(plus_dm, period) / atr
    minus_di = 100 * wilder(minus_dm, period) / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)

    g["di_plus14"] = plus_di
    g["di_minus14"] = minus_di
    g["adx14"] = wilder(dx, period)
    g["di_plus_crossed_above_di_minus"] = (plus_di > minus_di) & (plus_di.shift(1) <= minus_di.shift(1))
    return g


def latest_metrics(ohlcv: pd.DataFrame, watchlist_path: Path) -> dict:
    meta = {row["symbol"]: row for row in json.loads(watchlist_path.read_text())}
    rows: list[dict] = []
    for sym, group in ohlcv.groupby("symbol"):
        g = group.sort_values("date").copy()
        close = g["close"].astype(float)
        if len(g) < 35:
            continue
        g["ema8"] = ema(close, 8)
        g["ema21"] = ema(close, 21)
        g["ema34"] = ema(close, 34)
        g["ema50"] = ema(close, 50)
        g["ema200"] = ema(close, 200)
        g["sma50"] = close.rolling(50).mean()
        g["sma200"] = close.rolling(200).mean()
        g["rsi14"] = rsi(close, 14)
        g = add_macd(g, 5, 13, 5, "fast")
        g = add_macd(g, 12, 26, 9, "slow")
        g = add_adx_dmi(g)
        last = g.iloc[-1]
        def val(name: str):
            v = last.get(name)
            return None if pd.isna(v) else round(float(v), 2)
        price = float(last["close"])
        short_8_21_series = (g["close"].astype(float) > g["ema8"].astype(float)) & (g["ema8"].astype(float) > g["ema21"].astype(float))
        short_8_21_34_series = short_8_21_series & (g["ema21"].astype(float) > g["ema34"].astype(float))
        short_8_21 = bool(short_8_21_series.iloc[-1])
        short_8_21_34 = bool(short_8_21_34_series.iloc[-1])
        ema_bullish_stack_days_ago = latest_condition_start_days_ago(g, short_8_21_34_series)
        rsi14_rising_days = consecutive_rising_days(g["rsi14"])
        long_sma = bool(pd.notna(last["sma200"]) and price > float(last["sma50"]) > float(last["sma200"]))
        long_ema = price > float(last["ema50"]) > float(last["ema200"])
        trend_adx20_di_bull = bool(pd.notna(last["adx14"]) and float(last["adx14"]) > 20 and float(last["di_plus14"]) > float(last["di_minus14"]))
        trend_adx18_di_bull = bool(pd.notna(last["adx14"]) and float(last["adx14"]) > 18 and float(last["di_plus14"]) > float(last["di_minus14"]))
        recent_crosses = g[g["di_plus_crossed_above_di_minus"] == True]
        if recent_crosses.empty:
            di_cross_days_ago = None
        else:
            di_cross_days_ago = int(len(g) - 1 - g.index.get_loc(recent_crosses.index[-1]))
        di_plus_cross_7d = bool(di_cross_days_ago is not None and di_cross_days_ago <= 7 and float(last["di_plus14"]) > float(last["di_minus14"]))
        fast_macd_crosses = g[g["fast_macd_crossed_above_signal"] == True]
        if fast_macd_crosses.empty:
            fast_macd_cross_days_ago = None
        else:
            fast_macd_cross_days_ago = int(len(g) - 1 - g.index.get_loc(fast_macd_crosses.index[-1]))
        fast_macd_early_bull = bool(
            fast_macd_cross_days_ago is not None
            and fast_macd_cross_days_ago <= 3
            and pd.notna(last["fast_macd_hist"])
            and float(last["fast_macd_hist"]) > 0
        )
        slow_macd_trend_bull = bool(
            pd.notna(last["slow_macd"])
            and pd.notna(last["slow_macd_signal"])
            and pd.notna(last["slow_macd_hist"])
            and float(last["slow_macd"]) > float(last["slow_macd_signal"])
            and float(last["slow_macd"]) > 0
        )
        ema21_touch_bars_ago = latest_touch_bars_ago(g, "ema21", 5)
        ema21_touched_1_5 = bool(ema21_touch_bars_ago is not None and 0 <= ema21_touch_bars_ago <= 4)
        rsi_40_55 = bool(pd.notna(last["rsi14"]) and 40 <= float(last["rsi14"]) <= 55)
        mean_reversion_ema21_rsi_40_55 = bool(ema21_touched_1_5 and rsi_40_55)
        item = meta.get(sym, {})
        rows.append({
            "symbol": sym,
            "company": item.get("company", ""),
            "industry": item.get("industry", ""),
            "sector": item.get("sector", ""),
            "exchange": item.get("exchange", ""),
            "marketCap": item.get("marketCap"),
            "universeSource": item.get("universeSource", ""),
            "nextEarningsDate": item.get("nextEarningsDate", ""),
            "date": str(last["date"]),
            "close": round(price, 2),
            "volume": int(last["volume"]) if pd.notna(last["volume"]) else None,
            "ema8": val("ema8"),
            "ema21": val("ema21"),
            "ema34": val("ema34"),
            "ema50": val("ema50"),
            "ema200": val("ema200"),
            "sma50": val("sma50"),
            "sma200": val("sma200"),
            "rsi14": val("rsi14"),
            "rsi14_rising_days": int(rsi14_rising_days),
            "ema21_touch_bars_ago": ema21_touch_bars_ago,
            "ema_bullish_stack_days_ago": ema_bullish_stack_days_ago,
            "adx14": val("adx14"),
            "di_plus14": val("di_plus14"),
            "di_minus14": val("di_minus14"),
            "di_plus_cross_days_ago": di_cross_days_ago,
            "fast_macd": val("fast_macd"),
            "fast_macd_signal": val("fast_macd_signal"),
            "fast_macd_hist": val("fast_macd_hist"),
            "fast_macd_cross_days_ago": fast_macd_cross_days_ago,
            "slow_macd": val("slow_macd"),
            "slow_macd_signal": val("slow_macd_signal"),
            "slow_macd_hist": val("slow_macd_hist"),
            "short_8_21": bool(short_8_21),
            "short_8_21_34": bool(short_8_21_34),
            "long_sma_50_200": bool(long_sma),
            "long_ema_50_200": bool(long_ema),
            "trend_adx20_di_bull": bool(trend_adx20_di_bull),
            "trend_adx18_di_bull": bool(trend_adx18_di_bull),
            "di_plus_cross_7d": bool(di_plus_cross_7d),
            "di_plus_cross_3d": bool(di_cross_days_ago is not None and di_cross_days_ago <= 3 and float(last["di_plus14"]) > float(last["di_minus14"])),
            "ema_bullish_stack_3d": bool(ema_bullish_stack_days_ago is not None and ema_bullish_stack_days_ago <= 3),
            "rsi14_rising_3d": bool(rsi14_rising_days >= 3),
            "fast_macd_5_13_5_bull_cross_3d": bool(fast_macd_early_bull),
            "slow_macd_12_26_9_trend_bull": bool(slow_macd_trend_bull),
            "ema21_touched_1_5": bool(ema21_touched_1_5),
            "rsi_40_55": bool(rsi_40_55),
            "mean_reversion_ema21_rsi_40_55": bool(mean_reversion_ema21_rsi_40_55),
            "price_vs_ema8_pct": round((price / float(last["ema8"]) - 1) * 100, 2),
            "price_vs_ema21_pct": round((price / float(last["ema21"]) - 1) * 100, 2),
            "price_vs_sma50_pct": None if pd.isna(last["sma50"]) else round((price / float(last["sma50"]) - 1) * 100, 2),
        })
    rows.sort(key=lambda r: (r["mean_reversion_ema21_rsi_40_55"], r["trend_adx20_di_bull"], r["fast_macd_5_13_5_bull_cross_3d"], r["slow_macd_12_26_9_trend_bull"], r["di_plus_cross_7d"], r["short_8_21_34"], r["short_8_21"], r["long_ema_50_200"], r["symbol"]), reverse=True)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": "Universe: S&P 500 constituents plus NASDAQ-listed stocks/ADRs with market cap over $10B. One year of daily OHLCV is stored so SMA200/EMA200 momentum, ADX14/DMI trend-strength, MACD, and RSI14/EMA21 mean-reversion filters have enough history.",
        "count": len(rows),
        "rows": rows,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--watchlist", default="src/watchlist.json")
    ap.add_argument("--period", default="1y")
    ap.add_argument("--csv", default="public/data/ohlcv_1y.csv")
    ap.add_argument("--json", default="public/data/latest_metrics.json")
    args = ap.parse_args()
    watchlist = Path(args.watchlist)
    symbols = load_symbols(watchlist)
    ohlcv = download(symbols, args.period)
    Path(args.csv).parent.mkdir(parents=True, exist_ok=True)
    ohlcv.to_csv(args.csv, index=False)
    metrics = latest_metrics(ohlcv, watchlist)
    Path(args.json).write_text(json.dumps(metrics, indent=2))
    print(json.dumps({"symbols": len(symbols), "rows": len(ohlcv), "csv": args.csv, "json": args.json}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
