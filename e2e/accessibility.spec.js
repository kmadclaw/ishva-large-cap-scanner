import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('filter chip settings popovers are editable and accessible', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('0 active · Choose filters to reveal setups')).toBeVisible()
  await page.getByRole('button', { name: /Short-term momentum/i }).click()
  await expect(page.getByText('37 setups · Click a row for copy-ready technicals.')).toBeVisible()
  await page.getByRole('button', { name: /Short-term momentum/i }).dblclick()

  const shortMomentumRule = page.getByLabel('Short-term EMA rule')
  const emaStackDays = page.getByLabel('EMA stack days')

  await expect(page.getByRole('region', { name: /Short-term momentum/i })).toBeVisible()
  await expect(shortMomentumRule).toHaveValue('ema34')

  await emaStackDays.fill('5')
  await expect(emaStackDays).toHaveValue('5')
  await expect(page.getByText('69 setups · Click a row for copy-ready technicals.')).toBeVisible()

  await emaStackDays.fill('7')
  await expect(page.getByText('74 setups · Click a row for copy-ready technicals.')).toBeVisible()

  await shortMomentumRule.selectOption('ema8_21')
  await expect(shortMomentumRule).toHaveValue('ema8_21')
  await expect(page.getByText('95 setups · Click a row for copy-ready technicals.')).toBeVisible()

  await page.getByRole('button', { name: /Close/i }).click()
  await expect(page.getByRole('region', { name: /Short-term momentum/i })).toBeHidden()

  const accessibilityScanResults = await new AxeBuilder({ page })
    .analyze()

  expect(accessibilityScanResults.violations).toEqual([])

  await page.getByRole('button', { name: /Short-term momentum/i }).click()
  await expect(page.getByText('0 active · Choose filters to reveal setups')).toBeVisible()
})

test('active filter result counts react to each chip setting', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /RSI rising/i }).click()
  await expect(page.getByText('13 setups · Click a row for copy-ready technicals.')).toBeVisible()
  await page.getByRole('button', { name: /RSI rising/i }).dblclick()
  await page.getByLabel('RSI rising days').fill('7')
  await expect(page.getByText('2 setups · Click a row for copy-ready technicals.')).toBeVisible()

  await page.getByRole('button', { name: /Remove filter/i }).click()
  await page.getByRole('button', { name: /DMI bullish confirmation/i }).click()
  await expect(page.getByText('24 setups · Click a row for copy-ready technicals.')).toBeVisible()
  await page.getByRole('button', { name: /DMI bullish confirmation/i }).dblclick()
  await page.getByLabel('DMI bullish days').fill('7')
  await expect(page.getByText('68 setups · Click a row for copy-ready technicals.')).toBeVisible()

  await page.getByRole('button', { name: /Remove filter/i }).click()
  await page.getByRole('button', { name: /MACD bullish reversal/i }).click()
  await expect(page.getByText('66 setups · Click a row for copy-ready technicals.')).toBeVisible()
  await page.getByRole('button', { name: /MACD bullish reversal/i }).dblclick()
  await page.getByLabel('MACD reversal days').fill('7')
  await expect(page.getByText('125 setups · Click a row for copy-ready technicals.')).toBeVisible()

  await page.getByRole('button', { name: /Remove filter/i }).click()
  await page.getByRole('button', { name: /Mean reversion/i }).click()
  await expect(page.getByText('104 setups · Click a row for copy-ready technicals.')).toBeVisible()
  await page.getByRole('button', { name: /Mean reversion/i }).dblclick()
  await page.getByLabel('Min RSI').fill('55')
  await page.getByLabel('Max RSI').fill('65')
  await expect(page.getByText('23 setups · Click a row for copy-ready technicals.')).toBeVisible()
})

test('keyboard users can reach controls and select a result', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expect(page.getByText('Learn the system')).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Search symbol, company, or industry')).toBeFocused()

  await page.getByRole('button', { name: /Short-term momentum/i }).click()
  await expect(page.getByText('37 setups · Click a row for copy-ready technicals.')).toBeVisible()
  await page.getByRole('button', { name: /Short-term momentum/i }).dblclick()
  await expect(page.getByRole('region', { name: /Short-term momentum/i })).toBeVisible()
  const firstSymbol = page.locator('.symbolButton').first()
  await expect(firstSymbol).toBeVisible()
  await firstSymbol.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Trade idea summary')).toBeVisible()
  await expect(page.getByText('Copy-ready post preview')).toBeVisible()
  await expect(page.getByText('Why it matched')).toBeVisible()
  await expect(page.getByLabel('Copy-ready trade idea text')).toContainText('Technicals meeting:')
  await expect(page.getByRole('button', { name: /Copy post text/i })).toBeEnabled()
})
