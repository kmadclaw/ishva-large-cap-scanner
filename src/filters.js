const boundedDays = (value, fallback = 3) => Number.isFinite(value) ? value : fallback

export const FILTERS = [
  {
    id: 'short_momentum',
    label: 'Short-term momentum / EMA stack',
    group: 'Momentum',
    description: 'Close is above EMA8 and EMA21. Settings can either keep the stricter EMA34 stack requirement or scan EMA8/21 only.',
    predicate: (row, options = {}) => {
      const days = boundedDays(options.emaStackDays, 3)
      const mode = options.shortMomentumMode || 'ema34'
      if (mode === 'ema8_21') return row.short_8_21 === true
      return row.short_8_21_34 === true && Number.isFinite(row.ema_bullish_stack_days_ago) && row.ema_bullish_stack_days_ago <= days
    },
  },
  {
    id: 'rsi_rising',
    label: 'RSI rising',
    group: 'Momentum',
    description: 'RSI14 has risen for the configured number of consecutive trading days. Default lookback is 3 trading days.',
    predicate: (row, options = {}) => {
      const days = boundedDays(options.rsiRisingDays, 3)
      return Number.isFinite(row.rsi14_rising_days) && row.rsi14_rising_days >= days
    },
  },
  {
    id: 'long_momentum',
    label: 'Long-term momentum',
    group: 'Momentum',
    description: 'Bullish long-term regime. Choose SMA trend, EMA trend, either trend, or require both in Advanced settings.',
    predicate: (row, options = {}) => {
      const mode = options.longMomentumMode || 'either'
      if (mode === 'sma') return row.long_sma_50_200 === true
      if (mode === 'ema') return row.long_ema_50_200 === true
      if (mode === 'both') return row.long_sma_50_200 === true && row.long_ema_50_200 === true
      return row.long_sma_50_200 === true || row.long_ema_50_200 === true
    },
  },
  {
    id: 'trend_strength',
    label: 'Trend strength',
    group: 'Trend strength',
    description: 'ADX14 must be above the configured minimum and DI+ must be above DI-. Default ADX minimum is 18.',
    predicate: (row, options = {}) => {
      const minAdx = Number.isFinite(options.minAdx) ? options.minAdx : 18
      return row.adx14 >= minAdx && row.di_plus14 > row.di_minus14
    },
  },
  {
    id: 'di_plus_cross',
    label: 'DMI bullish confirmation',
    group: 'Trend strength',
    description: 'DI+ is above DI- and crossed bullish within the configured lookback window. Default lookback is 3 trading days.',
    predicate: (row, options = {}) => {
      const days = boundedDays(options.dmiBullishDays, 3)
      return row.di_plus14 > row.di_minus14 && Number.isFinite(row.di_plus_cross_days_ago) && row.di_plus_cross_days_ago <= days
    },
  },
  {
    id: 'fast_macd_early',
    label: 'MACD bullish reversal',
    group: 'MACD',
    description: 'Fast MACD (5,13,5) crossed above signal within the configured lookback with positive histogram. Default lookback is 3 trading days.',
    predicate: (row, options = {}) => {
      const days = boundedDays(options.macdReversalDays, 3)
      return Number.isFinite(row.fast_macd_cross_days_ago) && row.fast_macd_cross_days_ago <= days && row.fast_macd_hist > 0
    },
  },
  {
    id: 'slow_macd_confirm',
    label: 'Slow MACD trend confirm',
    group: 'MACD',
    description: 'Classic MACD (12,26,9) is above signal and above zero, confirming bullish trend regime.',
    predicate: (row) => row.slow_macd_12_26_9_trend_bull === true,
  },
  {
    id: 'mean_reversion_ema21_rsi',
    label: 'Mean reversion: EMA21 touch + RSI range',
    group: 'Mean reversion',
    description: 'Price touched EMA21 within the last 1–5 bars and RSI14 is inside the adjustable range.',
    predicate: (row, options = {}) => {
      const min = Number.isFinite(options.rsiMin) ? options.rsiMin : 40
      const max = Number.isFinite(options.rsiMax) ? options.rsiMax : 55
      return row.ema21_touched_1_5 === true && row.rsi14 >= min && row.rsi14 <= max
    },
  },
]

export function applyFilters(rows, activeIds, search = '', options = {}) {
  const q = search.trim().toLowerCase()
  const active = FILTERS.filter((filter) => activeIds.includes(filter.id))
  return rows.filter((row) => {
    if (q) {
      const haystack = `${row.symbol} ${row.company || ''} ${row.industry || ''} ${row.sector || ''} ${row.exchange || ''} ${row.universeSource || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return active.every((filter) => filter.predicate(row, options))
  })
}

export function summarize(rows, options = {}) {
  const count = (id) => rows.filter((row) => FILTERS.find((filter) => filter.id === id)?.predicate(row, options)).length
  return {
    total: rows.length,
    shortMomentum: count('short_momentum'),
    rsiRising: count('rsi_rising'),
    longMomentum: count('long_momentum'),
    trendStrength: count('trend_strength'),
    diPlusCross: count('di_plus_cross'),
    fastMacdEarly: count('fast_macd_early'),
    slowMacdConfirm: count('slow_macd_confirm'),
    meanReversion: count('mean_reversion_ema21_rsi'),
  }
}

export function getFilterStackCounts(rows, activeIds, search = '', options = {}) {
  return Object.fromEntries(
    FILTERS.map((filter) => {
      const stack = activeIds.includes(filter.id) ? activeIds : [...activeIds, filter.id]
      return [filter.id, applyFilters(rows, stack, search, options).length]
    }),
  )
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: digits })
  return value
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value > 0 ? '+' : ''}${fmt(value)}%`
}

function compactPercent(value) {
  return pct(value).replace('.00%', '%')
}

function barsLabel(value) {
  const bars = fmt(value, 0)
  return `${bars} bar${value === 1 ? '' : 's'}`
}

export function getMatchedTechnicals(row, options = {}) {
  const min = Number.isFinite(options.rsiMin) ? options.rsiMin : 40
  const max = Number.isFinite(options.rsiMax) ? options.rsiMax : 55
  const emaStackDays = boundedDays(options.emaStackDays, 3)
  const rsiRisingDays = boundedDays(options.rsiRisingDays, 3)
  const dmiBullishDays = boundedDays(options.dmiBullishDays, 3)
  const macdReversalDays = boundedDays(options.macdReversalDays, 3)
  const matches = []

  if (row.short_8_21) {
    matches.push({
      label: 'Short-term momentum repair',
      postLabel: 'momentum repair',
      detail: `Close ${fmt(row.close)} is above EMA8 ${fmt(row.ema8)} and EMA21 ${fmt(row.ema21)}; price is ${pct(row.price_vs_ema8_pct)} vs EMA8 and ${pct(row.price_vs_ema21_pct)} vs EMA21.`,
      post: `Momentum repair: close ${fmt(row.close)} above EMA8 ${fmt(row.ema8)} and EMA21 ${fmt(row.ema21)} (${compactPercent(row.price_vs_ema21_pct)} vs EMA21).`,
    })
  }
  if (row.short_8_21_34 && Number.isFinite(row.ema_bullish_stack_days_ago) && row.ema_bullish_stack_days_ago <= emaStackDays) {
    matches.push({
      label: 'EMA bullish stack',
      postLabel: 'EMA bullish stack',
      detail: `Close > EMA8 > EMA21 > EMA34 (${fmt(row.close)} > ${fmt(row.ema8)} > ${fmt(row.ema21)} > ${fmt(row.ema34)}); stack formed ${fmt(row.ema_bullish_stack_days_ago, 0)} trading days ago.`,
      post: `EMA bullish stack: close > EMA8 > EMA21 > EMA34 (${fmt(row.close)} > ${fmt(row.ema8)} > ${fmt(row.ema21)} > ${fmt(row.ema34)}); formed ${fmt(row.ema_bullish_stack_days_ago, 0)}d ago.`,
    })
  }
  if (Number.isFinite(row.rsi14_rising_days) && row.rsi14_rising_days >= rsiRisingDays) {
    matches.push({
      label: 'RSI rising',
      postLabel: 'RSI rising',
      detail: `RSI14 ${fmt(row.rsi14)} has risen for ${fmt(row.rsi14_rising_days, 0)} consecutive trading days.`,
      post: `RSI rising: RSI14 ${fmt(row.rsi14)} has risen for ${fmt(row.rsi14_rising_days, 0)} straight trading days.`,
    })
  }
  if (row.long_sma_50_200) {
    matches.push({
      label: 'Long-term SMA regime',
      postLabel: 'SMA uptrend',
      detail: `Close ${fmt(row.close)} is above SMA50 ${fmt(row.sma50)} and SMA200 ${fmt(row.sma200)}; price is ${pct(row.price_vs_sma50_pct)} vs SMA50.`,
      post: `SMA trend: close above SMA50 ${fmt(row.sma50)} and SMA200 ${fmt(row.sma200)} (${compactPercent(row.price_vs_sma50_pct)} vs SMA50).`,
    })
  }
  if (row.long_ema_50_200) {
    matches.push({
      label: 'Long-term EMA regime',
      postLabel: 'EMA uptrend',
      detail: `Close ${fmt(row.close)} is above EMA50 ${fmt(row.ema50)} and EMA200 ${fmt(row.ema200)}.`,
      post: `EMA trend: close above EMA50 ${fmt(row.ema50)} and EMA200 ${fmt(row.ema200)}.`,
    })
  }
  if (row.trend_adx20_di_bull) {
    matches.push({
      label: 'Trend-strength confirmation',
      postLabel: 'trend strength',
      detail: `ADX14 ${fmt(row.adx14)} is above 20 and DI+ ${fmt(row.di_plus14)} leads DI- ${fmt(row.di_minus14)}.`,
      post: `Trend strength: ADX14 ${fmt(row.adx14)} with DI+ ${fmt(row.di_plus14)} > DI- ${fmt(row.di_minus14)}.`,
    })
  } else if (row.trend_adx18_di_bull) {
    matches.push({
      label: 'Early trend-strength setup',
      postLabel: 'early trend strength',
      detail: `ADX14 ${fmt(row.adx14)} is above 18 and DI+ ${fmt(row.di_plus14)} leads DI- ${fmt(row.di_minus14)}.`,
      post: `Early trend strength: ADX14 ${fmt(row.adx14)} with DI+ ${fmt(row.di_plus14)} > DI- ${fmt(row.di_minus14)}.`,
    })
  }
  if (row.di_plus14 > row.di_minus14 && Number.isFinite(row.di_plus_cross_days_ago) && row.di_plus_cross_days_ago <= dmiBullishDays) {
    matches.push({
      label: 'DMI bullish confirmation',
      postLabel: 'DMI bullish confirmation',
      detail: `DI+ crossed above DI- ${fmt(row.di_plus_cross_days_ago, 0)} trading days ago and DI+ ${fmt(row.di_plus14)} remains above DI- ${fmt(row.di_minus14)}.`,
      post: `DMI bullish confirmation: DI+ crossed above DI- ${fmt(row.di_plus_cross_days_ago, 0)} trading days ago; DI+ ${fmt(row.di_plus14)} > DI- ${fmt(row.di_minus14)}.`,
    })
  }
  if (Number.isFinite(row.fast_macd_cross_days_ago) && row.fast_macd_cross_days_ago <= macdReversalDays && row.fast_macd_hist > 0) {
    matches.push({
      label: 'MACD bullish reversal',
      postLabel: 'MACD bullish reversal',
      detail: `Fast MACD (5,13,5) crossed above signal ${fmt(row.fast_macd_cross_days_ago, 0)} trading days ago; histogram is ${fmt(row.fast_macd_hist)}.`,
      post: `MACD bullish reversal: 5/13/5 bull cross ${fmt(row.fast_macd_cross_days_ago, 0)}d ago; hist ${fmt(row.fast_macd_hist)} > 0.`,
    })
  }
  if (row.slow_macd_12_26_9_trend_bull) {
    matches.push({
      label: 'Slow MACD trend confirmation',
      postLabel: 'slow MACD confirmation',
      detail: `Slow MACD (12,26,9) is above signal and above zero (${fmt(row.slow_macd)} vs signal ${fmt(row.slow_macd_signal)}).`,
      post: `Slow MACD: 12/26/9 above signal and above zero (${fmt(row.slow_macd)} vs ${fmt(row.slow_macd_signal)}).`,
    })
  }
  if (row.ema21_touched_1_5 && row.rsi14 >= min && row.rsi14 <= max) {
    matches.push({
      label: 'Mean-reversion entry zone',
      postLabel: 'pullback zone',
      detail: `Touched EMA21 within the last ${barsLabel((row.ema21_touch_bars_ago ?? 0) + 1)} and RSI14 ${fmt(row.rsi14)} is inside the ${min}–${max} range.`,
      post: `Pullback zone: EMA21 touch ${barsLabel((row.ema21_touch_bars_ago ?? 0) + 1)} ago; RSI14 ${fmt(row.rsi14)} inside ${min}–${max}.`,
    })
  }

  return matches
}

export function buildTradeGroupSummary(row, options = {}) {
  const matches = getMatchedTechnicals(row, options)
  const header = `$${row.symbol} — ${row.company || row.industry || 'trade idea'}`
  const setupLabels = matches.map((match) => match.postLabel || match.label.toLowerCase())
  const lines = [
    header,
    `Setup: ${setupLabels.length ? setupLabels.join(' + ') : 'watchlist only'}`,
    `Close ${fmt(row.close)} | RSI14 ${fmt(row.rsi14)} | ADX14 ${fmt(row.adx14)} | Vol ${fmt(row.volume, 0)}`,
    '',
  ]

  if (matches.length) {
    lines.push('Technicals meeting:')
    matches.forEach((match) => lines.push(`• ${match.post || `${match.label}: ${match.detail}`}`))
  } else {
    lines.push('Technicals meeting: none of the scanner technicals yet; keep on watchlist for confirmation.')
  }

  lines.push('', 'Trade framing: watching for continuation from this technical setup; define risk with recent support/ATR.', 'NFA — confirm chart, earnings, liquidity, and risk before entry.')
  return lines.join('\n')
}
