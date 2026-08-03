import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, Check, Copy, RefreshCcw, Search, SlidersHorizontal } from 'lucide-react'
import { FILTERS, applyFilters, buildTradeGroupSummary, getFilterStackCounts, getMatchedTechnicals } from './filters.js'
import './styles.css'

const DATA_URL = '/data/latest_metrics.json'

function format(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: digits })
  return value
}

function formatMarketCap(value) {
  if (!value || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))
}

function PassPill({ pass }) {
  return <span className={pass ? 'pill pass' : 'pill fail'}>{pass ? 'pass' : '—'}</span>
}

function parseBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function App() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState('loading')
  const [active, setActive] = useState([])
  const [search, setSearch] = useState('')
  const [openFilterId, setOpenFilterId] = useState(null)
  const [shortMomentumMode, setShortMomentumMode] = useState('ema34')
  const [longMomentumMode, setLongMomentumMode] = useState('either')
  const [minAdxInput, setMinAdxInput] = useState('18')
  const [emaStackDaysInput, setEmaStackDaysInput] = useState('3')
  const [rsiRisingDaysInput, setRsiRisingDaysInput] = useState('3')
  const [dmiBullishDaysInput, setDmiBullishDaysInput] = useState('3')
  const [macdReversalDaysInput, setMacdReversalDaysInput] = useState('3')
  const [rsiMinInput, setRsiMinInput] = useState('40')
  const [rsiMaxInput, setRsiMaxInput] = useState('55')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [copied, setCopied] = useState(false)
  const filterClickTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (filterClickTimerRef.current) window.clearTimeout(filterClickTimerRef.current)
    }
  }, [])

  useEffect(() => {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        setRows(data.rows || [])
        setMeta(data)
        setStatus('ready')
      })
      .catch((error) => {
        console.error(error)
        setStatus('error')
      })
  }, [])

  const minAdx = useMemo(() => parseBoundedInt(minAdxInput, 18, 1, 99), [minAdxInput])
  const emaStackDays = useMemo(() => parseBoundedInt(emaStackDaysInput, 3, 1, 60), [emaStackDaysInput])
  const rsiRisingDays = useMemo(() => parseBoundedInt(rsiRisingDaysInput, 3, 1, 60), [rsiRisingDaysInput])
  const dmiBullishDays = useMemo(() => parseBoundedInt(dmiBullishDaysInput, 3, 1, 60), [dmiBullishDaysInput])
  const macdReversalDays = useMemo(() => parseBoundedInt(macdReversalDaysInput, 3, 1, 60), [macdReversalDaysInput])
  const parsedRsiMin = useMemo(() => parseBoundedInt(rsiMinInput, 40, 1, 99), [rsiMinInput])
  const parsedRsiMax = useMemo(() => parseBoundedInt(rsiMaxInput, 55, 1, 99), [rsiMaxInput])
  const rsiMin = Math.min(parsedRsiMin, parsedRsiMax)
  const rsiMax = Math.max(parsedRsiMin, parsedRsiMax)
  const normalizeNumberInput = (setter, fallback, min, max) => (event) => {
    setter(String(parseBoundedInt(event.target.value, fallback, min, max)))
  }

  const filterOptions = useMemo(() => ({ shortMomentumMode, longMomentumMode, minAdx, emaStackDays, rsiRisingDays, dmiBullishDays, macdReversalDays, rsiMin, rsiMax }), [shortMomentumMode, longMomentumMode, minAdx, emaStackDays, rsiRisingDays, dmiBullishDays, macdReversalDays, rsiMin, rsiMax])
  const hasActiveFilters = active.length > 0
  const filtered = useMemo(() => applyFilters(rows, active, search, filterOptions), [rows, active, search, filterOptions])
  const visibleRows = hasActiveFilters ? filtered : []
  const filterStackCounts = useMemo(() => getFilterStackCounts(rows, active, search, filterOptions), [rows, active, search, filterOptions])
  const resultCountLabel = hasActiveFilters ? `${filtered.length} setup${filtered.length === 1 ? '' : 's'}` : 'Choose filters to reveal setups'
  const openFilter = useMemo(() => FILTERS.find((filter) => filter.id === openFilterId) || null, [openFilterId])
  const selectedRow = useMemo(() => {
    if (!hasActiveFilters) return null
    if (!selectedSymbol) return visibleRows[0] || null
    return visibleRows.find((row) => row.symbol === selectedSymbol) || visibleRows[0] || null
  }, [hasActiveFilters, visibleRows, selectedSymbol])
  const selectedTechnicals = useMemo(() => selectedRow ? getMatchedTechnicals(selectedRow, filterOptions) : [], [selectedRow, filterOptions])
  const tradeGroupSummary = useMemo(() => selectedRow ? buildTradeGroupSummary(selectedRow, filterOptions) : '', [selectedRow, filterOptions])

  const clearPendingFilterClick = () => {
    if (!filterClickTimerRef.current) return
    window.clearTimeout(filterClickTimerRef.current)
    filterClickTimerRef.current = null
  }

  const toggleFilter = (id) => {
    setActive((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
    setOpenFilterId((current) => current === id ? null : current)
  }

  const handleFilterClick = (event, id) => {
    if (event.detail !== 1) return
    clearPendingFilterClick()
    filterClickTimerRef.current = window.setTimeout(() => {
      toggleFilter(id)
      filterClickTimerRef.current = null
    }, 220)
  }

  const openFilterSettings = (id) => {
    clearPendingFilterClick()
    setOpenFilterId(id)
  }

  const removeOpenFilter = () => {
    if (!openFilterId) return
    setActive((prev) => prev.filter((item) => item !== openFilterId))
  }

  const closeFilterSettings = () => setOpenFilterId(null)

  const renderFilterSettings = () => {
    if (!openFilter) return null

    return (
      <div className="filterPopover" role="region" aria-label={`${openFilter.label} settings`}>
        <div className="filterPopoverHeader">
          <div>
            <span>{openFilter.group}</span>
            <strong>{openFilter.label}</strong>
            <p>{openFilter.description}</p>
          </div>
          <div className="filterPopoverActions">
            <button className="miniCopyButton" type="button" onClick={removeOpenFilter} disabled={!active.includes(openFilter.id)}>Remove filter</button>
            <button className="miniCopyButton" type="button" onClick={closeFilterSettings}>Close</button>
          </div>
        </div>
        <div className="filterSettingsGrid">
          {openFilter.id === 'short_momentum' && (
            <>
              <label htmlFor="shortMomentumMode"><span>Short-term EMA rule</span>
                <select id="shortMomentumMode" value={shortMomentumMode} onChange={(event) => setShortMomentumMode(event.target.value)}>
                  <option value="ema34">Keep EMA34: close &gt; EMA8 &gt; EMA21 &gt; EMA34</option>
                  <option value="ema8_21">EMA8/21 only: close &gt; EMA8 and EMA21</option>
                </select>
              </label>
              <label htmlFor="emaStackDays"><span>EMA stack days</span><input id="emaStackDays" type="number" inputMode="numeric" min="1" max="60" value={emaStackDaysInput} onChange={(event) => setEmaStackDaysInput(event.target.value)} onBlur={normalizeNumberInput(setEmaStackDaysInput, 3, 1, 60)} /></label>
            </>
          )}
          {openFilter.id === 'rsi_rising' && (
            <label htmlFor="rsiRisingDays"><span>RSI rising days</span><input id="rsiRisingDays" type="number" inputMode="numeric" min="1" max="60" value={rsiRisingDaysInput} onChange={(event) => setRsiRisingDaysInput(event.target.value)} onBlur={normalizeNumberInput(setRsiRisingDaysInput, 3, 1, 60)} /></label>
          )}
          {openFilter.id === 'long_momentum' && (
            <label htmlFor="longMomentumMode"><span>Long-term rule</span>
              <select id="longMomentumMode" value={longMomentumMode} onChange={(event) => setLongMomentumMode(event.target.value)}>
                <option value="either">SMA or EMA trend</option>
                <option value="sma">SMA50 &gt; SMA200</option>
                <option value="ema">EMA50 &gt; EMA200</option>
                <option value="both">SMA and EMA trend</option>
              </select>
            </label>
          )}
          {openFilter.id === 'trend_strength' && (
            <label htmlFor="minAdx"><span>Min ADX14</span><input id="minAdx" type="number" inputMode="numeric" min="1" max="99" value={minAdxInput} onChange={(event) => setMinAdxInput(event.target.value)} onBlur={normalizeNumberInput(setMinAdxInput, 18, 1, 99)} /></label>
          )}
          {openFilter.id === 'di_plus_cross' && (
            <label htmlFor="dmiBullishDays"><span>DMI bullish days</span><input id="dmiBullishDays" type="number" inputMode="numeric" min="1" max="60" value={dmiBullishDaysInput} onChange={(event) => setDmiBullishDaysInput(event.target.value)} onBlur={normalizeNumberInput(setDmiBullishDaysInput, 3, 1, 60)} /></label>
          )}
          {openFilter.id === 'fast_macd_early' && (
            <label htmlFor="macdReversalDays"><span>MACD reversal days</span><input id="macdReversalDays" type="number" inputMode="numeric" min="1" max="60" value={macdReversalDaysInput} onChange={(event) => setMacdReversalDaysInput(event.target.value)} onBlur={normalizeNumberInput(setMacdReversalDaysInput, 3, 1, 60)} /></label>
          )}
          {openFilter.id === 'mean_reversion_ema21_rsi' && (
            <>
              <label htmlFor="rsiMin"><span>Min RSI</span><input id="rsiMin" type="number" inputMode="numeric" min="1" max="99" value={rsiMinInput} onChange={(event) => setRsiMinInput(event.target.value)} onBlur={normalizeNumberInput(setRsiMinInput, 40, 1, 99)} /></label>
              <label htmlFor="rsiMax"><span>Max RSI</span><input id="rsiMax" type="number" inputMode="numeric" min="1" max="99" value={rsiMaxInput} onChange={(event) => setRsiMaxInput(event.target.value)} onBlur={normalizeNumberInput(setRsiMaxInput, 55, 1, 99)} /></label>
              <button className="button secondary" type="button" onClick={() => { setRsiMinInput('40'); setRsiMaxInput('55') }}>Reset RSI</button>
            </>
          )}
          {openFilter.id === 'slow_macd_confirm' && <p>This filter has no tuning knobs yet; it checks classic MACD above signal and above zero.</p>}
        </div>
      </div>
    )
  }

  const copySummary = async () => {
    if (!tradeGroupSummary) return
    try {
      await navigator.clipboard.writeText(tradeGroupSummary)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <main className="shell">
      <header className="appHeader">
        <div className="brandBlock">
          <div className="brandMark"><Activity size={18} /></div>
          <div>
            <h1 className="appName">Ishva Large Cap Scanner</h1>
            <p>S&amp;P 500 plus NASDAQ-listed stocks/ADRs over $10B market cap, scanned for momentum, trend strength, and pullback entries.</p>
          </div>
        </div>
        <div className="marketMeta">
          <span>{meta?.generatedAt ? `Updated ${new Date(meta.generatedAt).toLocaleDateString()}` : status}</span>
          <details className="learnPanel topLearn">
            <summary>Learn the system</summary>
            <div className="learnGrid">
              {FILTERS.map((filter) => (
                <div key={filter.id} className="learnItem">
                  <span>{filter.group}</span>
                  <strong>{filter.label}</strong>
                  <p>{filter.description}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </header>

      <section className="panel controls">
        <div className="controlsHeader">
          <div>
            <div className="sectionTitle"><SlidersHorizontal size={18} /> Scanner command bar</div>
            <p>Universe: S&amp;P 500 constituents plus NASDAQ-listed stocks/ADRs over $10B market cap. Single-click a chip to filter; double-click to tune settings.</p>
          </div>
          <div className="activeCount">{active.length} active · {resultCountLabel}</div>
        </div>
        <div className="toolbar commandToolbar">
          <label className="search"><Search size={16} aria-hidden="true" /><span className="srOnly">Search symbol, company, or industry</span><input aria-label="Search symbol, company, or industry" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol, company, industry" /></label>
          <button className="button secondary" onClick={() => { setActive([]); setOpenFilterId(null) }}><RefreshCcw size={16} /> Reset</button>
        </div>
        <div className="filterGrid compact">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              className={`filterCard ${active.includes(filter.id) ? 'active' : ''}`}
              onClick={(event) => handleFilterClick(event, filter.id)}
              onDoubleClick={() => openFilterSettings(filter.id)}
              title={`${filter.description} Double-click to tune settings.`}
              aria-pressed={active.includes(filter.id)}
              aria-label={`${filter.label}. ${filterStackCounts[filter.id] ?? 0} matching setups if selected. Single-click to toggle; double-click to tune settings.`}
            >
              <span>{filter.group}</span>
              <strong>{filter.label.replace('Mean reversion: ', 'MR: ')}</strong>
              <b>{filterStackCounts[filter.id] ?? 0}</b>
            </button>
          ))}
        </div>
        {renderFilterSettings()}

      </section>

      <section className="panel tablePanel">
        <div className="tableHeader">
          <div>
            <div className="sectionTitle">Scanner results</div>
            <p>{resultCountLabel} · Click a row for copy-ready technicals.</p>
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Source</th>
                <th>Mkt cap</th>
                <th>Close</th>
                <th>EMA8</th>
                <th>EMA21</th>
                <th>RSI14</th>
                <th>EMA21 touch</th>
                <th>EMA34</th>
                <th>SMA50</th>
                <th>SMA200</th>
                <th>EMA50</th>
                <th>EMA200</th>
                <th>ADX14</th>
                <th>DI+</th>
                <th>DI-</th>
                <th>Short mom.</th>
                <th>Long mom.</th>
                <th>Trend</th>
                <th>DI Cross</th>
                <th>Fast MACD</th>
                <th>Slow MACD</th>
                <th>Vol</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.symbol}
                  className={selectedRow?.symbol === row.symbol ? 'selectedRow' : ''}
                  onClick={() => setSelectedSymbol(row.symbol)}
                >
                  <td><button className="symbolButton" onClick={(event) => { event.stopPropagation(); setSelectedSymbol(row.symbol) }}><strong>{row.symbol}</strong><small>{row.company}</small></button></td>
                  <td>{row.universeSource || row.exchange || '—'}</td>
                  <td>{formatMarketCap(row.marketCap)}</td>
                  <td>{format(row.close)}</td>
                  <td>{format(row.ema8)}</td>
                  <td>{format(row.ema21)}</td>
                  <td>{format(row.rsi14)}</td>
                  <td>{row.ema21_touched_1_5 ? `${row.ema21_touch_bars_ago + 1} bars` : '—'}</td>
                  <td>{format(row.ema34)}</td>
                  <td>{format(row.sma50)}</td>
                  <td>{format(row.sma200)}</td>
                  <td>{format(row.ema50)}</td>
                  <td>{format(row.ema200)}</td>
                  <td>{format(row.adx14)}</td>
                  <td>{format(row.di_plus14)}</td>
                  <td>{format(row.di_minus14)}</td>
                  <td><PassPill pass={FILTERS.find((filter) => filter.id === 'short_momentum')?.predicate(row, filterOptions)} /></td>
                  <td><PassPill pass={FILTERS.find((filter) => filter.id === 'long_momentum')?.predicate(row, filterOptions)} /></td>
                  <td><PassPill pass={FILTERS.find((filter) => filter.id === 'trend_strength')?.predicate(row, filterOptions)} /></td>
                  <td>{FILTERS.find((filter) => filter.id === 'di_plus_cross')?.predicate(row, filterOptions) ? `${row.di_plus_cross_days_ago}d` : '—'}</td>
                  <td>{FILTERS.find((filter) => filter.id === 'fast_macd_early')?.predicate(row, filterOptions) ? `${row.fast_macd_cross_days_ago}d` : '—'}</td>
                  <td><PassPill pass={FILTERS.find((filter) => filter.id === 'slow_macd_confirm')?.predicate(row, filterOptions)} /></td>
                  <td>{format(row.volume, 0)}</td>
                </tr>
              ))}
              {!visibleRows.length && (
                <tr className="emptyRow">
                  <td colSpan="23">
                    {hasActiveFilters ? 'No setups match the selected filters yet.' : 'Select one or more filters to reveal matching setups.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel setupPanel">
        <div className="setupHeader">
          <div>
            <div className="sectionTitle">Trade idea summary</div>
            <p>Clean setup notes and a post preview designed for quick trade-group sharing.</p>
          </div>
          <button className="button secondary" onClick={copySummary} disabled={!tradeGroupSummary}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy post text'}
          </button>
        </div>
        {selectedRow ? (
          <div className="tradeSummaryLayout">
            <div className="summaryHero">
              <div className="selectedCard sleek">
                <span>Selected setup</span>
                <strong>{selectedRow.symbol}</strong>
                <small>{selectedRow.company || selectedRow.industry}</small>
                <div className="miniStats">
                  <b><span>Close</span>{format(selectedRow.close)}</b>
                  <b><span>Mkt cap</span>{formatMarketCap(selectedRow.marketCap)}</b>
                  <b><span>RSI14</span>{format(selectedRow.rsi14)}</b>
                  <b><span>ADX14</span>{format(selectedRow.adx14)}</b>
                  <b><span>DI+</span>{format(selectedRow.di_plus14)}</b>
                </div>
              </div>

              <div className="postPreviewCard">
                <div className="postPreviewHeader">
                  <div>
                    <span>Copy-ready post preview</span>
                    <strong>Paste this into Telegram / WhatsApp groups</strong>
                  </div>
                  <button className="miniCopyButton" onClick={copySummary} disabled={!tradeGroupSummary}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="postCopy" tabIndex="0" aria-label="Copy-ready trade idea text">{tradeGroupSummary}</pre>
              </div>
            </div>

            <div className="technicalList" tabIndex="0" aria-label="Matched technical conditions">
              <div className="technicalListHeader">
                <span>Why it matched</span>
                <strong>{selectedTechnicals.length} technical{selectedTechnicals.length === 1 ? '' : 's'} meeting</strong>
              </div>
              {selectedTechnicals.length ? selectedTechnicals.map((item) => (
                <div key={item.label} className="technicalItem">
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
              )) : <p>No scanner technicals are currently passing for this symbol.</p>}
            </div>
          </div>
        ) : <p>No stock selected yet. Load data or pick a filtered row.</p>}
      </section>

    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)

