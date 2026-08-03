import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { applyFilters, buildTradeGroupSummary, getFilterStackCounts, getMatchedTechnicals, summarize } from '../src/filters.js'

const rows = [
  {
    symbol: 'AAA',
    short_8_21: true,
    short_8_21_34: true,
    ema_bullish_stack_days_ago: 2,
    rsi14_rising_days: 4,
    long_sma_50_200: false,
    long_ema_50_200: true,
    trend_adx20_di_bull: true,
    trend_adx18_di_bull: true,
    di_plus_cross_7d: true,
    fast_macd_5_13_5_bull_cross_3d: true,
    slow_macd_12_26_9_trend_bull: true,
    ema21_touched_1_5: true,
    rsi14: 48,
    company: 'Alpha',
    close: 100,
    ema8: 98,
    ema21: 95,
    ema34: 92,
    ema50: 88,
    ema200: 70,
    sma50: 90,
    sma200: 80,
    adx14: 24,
    di_plus14: 32,
    di_minus14: 17,
    di_plus_cross_days_ago: 3,
    fast_macd_cross_days_ago: 1,
    fast_macd_hist: 0.42,
    slow_macd: 1.25,
    slow_macd_signal: 0.92,
    ema21_touch_bars_ago: 1,
    price_vs_ema8_pct: 2.04,
    price_vs_ema21_pct: 5.26,
    price_vs_sma50_pct: 11.11,
    volume: 1234567,
    sector: 'Technology',
    universeSource: 'NASDAQ > $10B',
  },
  {
    symbol: 'BBB',
    short_8_21: true,
    short_8_21_34: false,
    long_sma_50_200: false,
    long_ema_50_200: false,
    trend_adx20_di_bull: false,
    trend_adx18_di_bull: true,
    di_plus_cross_7d: false,
    fast_macd_5_13_5_bull_cross_3d: true,
    fast_macd_cross_days_ago: 2,
    fast_macd_hist: 0.2,
    slow_macd_12_26_9_trend_bull: false,
    ema21_touched_1_5: true,
    rsi14: 62,
    rsi14_rising_days: 3,
    company: 'Beta',
    adx14: 19,
    di_plus14: 25,
    di_minus14: 20,
  },
  {
    symbol: 'CCC',
    short_8_21: false,
    short_8_21_34: false,
    ema_bullish_stack_days_ago: null,
    rsi14_rising_days: 0,
    long_sma_50_200: true,
    long_ema_50_200: true,
    trend_adx20_di_bull: true,
    trend_adx18_di_bull: true,
    di_plus_cross_7d: false,
    fast_macd_5_13_5_bull_cross_3d: false,
    slow_macd_12_26_9_trend_bull: true,
    ema21_touched_1_5: false,
    rsi14: 45,
    company: 'Gamma',
    adx14: 22,
    di_plus14: 27,
    di_minus14: 16,
  },
]

test('summarize counts merged momentum, trend-strength, DI-cross, and mean-reversion filters', () => {
  assert.deepEqual(summarize(rows), {
    total: 3,
    shortMomentum: 1,
    longMomentum: 2,
    trendStrength: 3,
    diPlusCross: 1,
    fastMacdEarly: 2,
    rsiRising: 2,
    slowMacdConfirm: 2,
    meanReversion: 1,
  })
})

test('filter chip stack counts show results after adding each criterion to active filters', () => {
  assert.deepEqual(getFilterStackCounts(rows, ['short_momentum'], '', { rsiMin: 40, rsiMax: 55 }), {
    short_momentum: 1,
    rsi_rising: 1,
    long_momentum: 1,
    trend_strength: 1,
    di_plus_cross: 1,
    fast_macd_early: 1,
    slow_macd_confirm: 1,
    mean_reversion_ema21_rsi: 1,
  })
})

test('MACD filters separate early signals from trend confirmation', () => {
  assert.deepEqual(applyFilters(rows, ['fast_macd_early']).map((row) => row.symbol), ['AAA', 'BBB'])
  assert.deepEqual(applyFilters(rows, ['slow_macd_confirm']).map((row) => row.symbol), ['AAA', 'CCC'])
  assert.deepEqual(applyFilters(rows, ['fast_macd_early', 'slow_macd_confirm']).map((row) => row.symbol), ['AAA'])
})

test('applyFilters requires all active merged filters across layers', () => {
  assert.deepEqual(applyFilters(rows, ['short_momentum', 'long_momentum', 'trend_strength']).map((row) => row.symbol), ['AAA'])
})

test('momentum filters support configurable freshness and long-term criteria modes', () => {
  assert.deepEqual(applyFilters(rows, ['short_momentum']).map((row) => row.symbol), ['AAA'])
  assert.deepEqual(applyFilters(rows, ['short_momentum'], '', { emaStackDays: 1 }).map((row) => row.symbol), [])
  assert.deepEqual(applyFilters(rows, ['short_momentum'], '', { shortMomentumMode: 'ema8_21' }).map((row) => row.symbol), ['AAA', 'BBB'])
  assert.deepEqual(applyFilters(rows, ['short_momentum'], '', { shortMomentumMode: 'ema34' }).map((row) => row.symbol), ['AAA'])
  assert.deepEqual(applyFilters(rows, ['rsi_rising']).map((row) => row.symbol), ['AAA', 'BBB'])
  assert.deepEqual(applyFilters(rows, ['rsi_rising'], '', { rsiRisingDays: 4 }).map((row) => row.symbol), ['AAA'])
  assert.deepEqual(applyFilters(rows, ['long_momentum'], '', { longMomentumMode: 'sma' }).map((row) => row.symbol), ['CCC'])
  assert.deepEqual(applyFilters(rows, ['long_momentum'], '', { longMomentumMode: 'ema' }).map((row) => row.symbol), ['AAA', 'CCC'])
  assert.deepEqual(applyFilters(rows, ['long_momentum'], '', { longMomentumMode: 'both' }).map((row) => row.symbol), ['CCC'])
})

test('trend strength and DMI confirmation filters use advanced settings defaults and overrides', () => {
  assert.deepEqual(applyFilters(rows, ['trend_strength']).map((row) => row.symbol), ['AAA', 'BBB', 'CCC'])
  assert.deepEqual(applyFilters(rows, ['trend_strength'], '', { minAdx: 20 }).map((row) => row.symbol), ['AAA', 'CCC'])
  assert.deepEqual(applyFilters(rows, ['di_plus_cross']).map((row) => row.symbol), ['AAA'])
  assert.deepEqual(applyFilters(rows, ['di_plus_cross'], '', { dmiBullishDays: 2 }).map((row) => row.symbol), [])
})

test('mean reversion filter uses adjustable RSI range', () => {
  assert.deepEqual(applyFilters(rows, ['mean_reversion_ema21_rsi'], '', { rsiMin: 40, rsiMax: 55 }).map((row) => row.symbol), ['AAA'])
  assert.deepEqual(applyFilters(rows, ['mean_reversion_ema21_rsi'], '', { rsiMin: 55, rsiMax: 65 }).map((row) => row.symbol), ['BBB'])
})

test('applyFilters searches symbol and company', () => {
  assert.deepEqual(applyFilters(rows, [], 'bet').map((row) => row.symbol), ['BBB'])
  assert.deepEqual(applyFilters(rows, [], 'nasdaq').map((row) => row.symbol), ['AAA'])
})

test('selected-stock technical summary lists all matched scanner conditions and post copy', () => {
  const technicals = getMatchedTechnicals(rows[0], { rsiMin: 40, rsiMax: 55 })
  assert.deepEqual(technicals.map((item) => item.label), [
    'Short-term momentum repair',
    'EMA bullish stack',
    'RSI rising',
    'Long-term EMA regime',
    'Trend-strength confirmation',
    'DMI bullish confirmation',
    'MACD bullish reversal',
    'Slow MACD trend confirmation',
    'Mean-reversion entry zone',
  ])

  const post = buildTradeGroupSummary(rows[0], { rsiMin: 40, rsiMax: 55 })
  assert.match(post, /\$AAA — Alpha/)
  assert.match(post, /Setup: momentum repair \+ EMA bullish stack \+ RSI rising/)
  assert.match(post, /Close 100 \| RSI14 48 \| ADX14 24 \| Vol 1,234,567/)
  assert.match(post, /Technicals meeting:/)
  assert.match(post, /Momentum repair: close 100 above EMA8 98 and EMA21 95/)
  assert.match(post, /MACD bullish reversal: 5\/13\/5 bull cross 1d ago; hist 0.42 > 0/)
  assert.match(post, /Slow MACD: 12\/26\/9 above signal and above zero \(1.25 vs 0.92\)/)
  assert.match(post, /Pullback zone: EMA21 touch 2 bars ago; RSI14 48 inside 40–55/)
  assert.match(post, /Trade framing:/)
})

test('one-year data file exists and produces SMA200 plus ADX/DMI and mean-reversion values', () => {
  assert.equal(existsSync('public/data/ohlcv_1y.csv'), true)
  assert.equal(existsSync('public/data/ohlcv_3mo.csv'), false)
  const watchlist = JSON.parse(readFileSync('src/watchlist.json', 'utf8'))
  assert.ok(watchlist.length >= 600, 'large-cap universe should include S&P 500 plus NASDAQ >$10B stocks')
  assert.ok(watchlist.every((row) => row.marketCap >= 10000000000), 'every watchlist row should meet $10B market-cap floor')
  assert.ok(watchlist.some((row) => row.universeSource === 'S&P 500'), 'watchlist should include S&P 500-only names')
  assert.ok(watchlist.some((row) => row.universeSource === 'NASDAQ > $10B'), 'watchlist should include NASDAQ >$10B-only names')
  const metrics = JSON.parse(readFileSync('public/data/latest_metrics.json', 'utf8'))
  assert.ok(metrics.count >= 600, 'latest metrics should cover the expanded large-cap universe')
  assert.match(metrics.note, /S&P 500 constituents plus NASDAQ-listed stocks\/ADRs/)
  assert.ok(metrics.rows.some((row) => row.symbol === 'NVDA' && row.marketCap >= 10000000000), 'metrics should preserve market cap metadata')
  const sma200Ready = metrics.rows.filter((row) => row.sma200 !== null).length
  assert.ok(sma200Ready / metrics.rows.length > 0.95, 'most symbols should have SMA200 after 1y history; recent IPOs/spinoffs may be null')
  assert.ok(metrics.rows.every((row) => row.adx14 !== undefined), 'all symbols should include ADX14')
  assert.ok(metrics.rows.every((row) => row.di_plus14 !== undefined && row.di_minus14 !== undefined), 'all symbols should include DI+/DI-')
  assert.ok(metrics.rows.every((row) => row.rsi14 !== undefined), 'all symbols should include RSI14')
  assert.ok(metrics.rows.every((row) => row.rsi14_rising_days !== undefined), 'all symbols should include RSI rising streak')
  assert.ok(metrics.rows.every((row) => row.ema_bullish_stack_days_ago !== undefined), 'all symbols should include EMA stack recency')
  assert.ok(metrics.rows.every((row) => row.fast_macd !== undefined && row.fast_macd_signal !== undefined && row.fast_macd_hist !== undefined), 'all symbols should include fast MACD values')
  assert.ok(metrics.rows.every((row) => row.slow_macd !== undefined && row.slow_macd_signal !== undefined && row.slow_macd_hist !== undefined), 'all symbols should include slow MACD values')
  assert.ok(metrics.rows.every((row) => row.ema21_touch_bars_ago !== undefined), 'all symbols should include EMA21 touch distance')
})
