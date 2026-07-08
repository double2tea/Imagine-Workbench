#!/usr/bin/env bash
# P5 ego-browser UI regression for creation tabs, density, theme sync, mobile filters.
# Requires: dev server at http://127.0.0.1:3000, ego-browser CLI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT_DIR="${ROOT}/.ego-audit"

ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('iw-p5-ego-regression-v2')
const auditDir = '/Users/chacha/Documents/Projects/Imagine-Workbench/.ego-audit'

async function auditDesktop() {
  return await js(String.raw`(() => {
    const cs = (el) => el ? getComputedStyle(el) : null
    const panel = document.querySelector('.imagine-creation-sidebar > .imagine-control-surface.hidden')
    const scroll = document.querySelector('.imagine-creator-scroll')
    const filters = document.querySelector('.imagine-gallery-filters')
    const tabbar = document.querySelector('.imagine-creator-scroll .imagine-creation-mode-tabs')
    const active = tabbar?.querySelector('[data-active="true"]')
    const tabColor = (mode) => {
      const btn = tabbar?.querySelector('[data-mode="' + mode + '"]')
      return btn ? { id: btn.id, color: cs(btn).color, active: btn.getAttribute('data-active') === 'true' } : null
    }
    const paramField = document.querySelector('.imagine-creation-sidebar .imagine-parameter-field')
    const footer = document.querySelector('.imagine-creator-generate-footer')
    const ids = [...document.querySelectorAll('[id^="creation-tab-"]')].map((el) => el.id)
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    return {
      theme: document.documentElement.getAttribute('data-imagine-theme'),
      shellTheme: document.querySelector('.imagine-workbench-shell')?.className.match(/imagine-theme-\w+/)?.[0] ?? null,
      activeMode: active?.getAttribute('data-mode') ?? null,
      activeTabId: active?.id ?? null,
      viewport: { w: innerWidth, h: innerHeight },
      tabIds: ids,
      duplicateTabIds: [...new Set(duplicateIds)],
      tabs: { image: tabColor('image'), video: tabColor('video'), audio: tabColor('audio') },
      panel: panel ? { padding: cs(panel).padding, gap: cs(panel).gap, minHeight: cs(panel).minHeight } : null,
      scroll: scroll ? { gap: cs(scroll).gap } : null,
      paramField: paramField ? { rows: cs(paramField).gridTemplateRows } : null,
      footerPad: footer ? cs(footer).paddingTop : null,
      filters: filters ? { h: Math.round(filters.getBoundingClientRect().height) } : null,
    }
  })()`)
}

async function probeTabColor(mode) {
  return await js(`(() => {
    const tabbar = document.querySelector('.imagine-creator-scroll .imagine-creation-mode-tabs')
    const buttons = [...tabbar.querySelectorAll('[data-mode]')]
    const saved = buttons.map((b) => ({ el: b, active: b.getAttribute('data-active') }))
    buttons.forEach((b) => b.setAttribute('data-active', 'false'))
    const target = tabbar.querySelector('[data-mode="${mode}"]')
    target.setAttribute('data-active', 'true')
    const color = getComputedStyle(target).color
    for (const item of saved) item.el.setAttribute('data-active', item.active)
    return { id: target.id, color }
  })()`)
}

async function setTheme(mode) {
  await js(`(() => {
    localStorage.setItem('imagine_theme_mode', '${mode}')
    const isLight = ${mode === 'light' ? 'true' : 'false'}
    document.documentElement.classList.toggle('imagine-theme-light', isLight)
    document.documentElement.classList.toggle('imagine-theme-dark', !isLight)
    document.documentElement.setAttribute('data-imagine-theme', '${mode}')
    const shell = document.querySelector('.imagine-workbench-shell')
    if (shell) {
      shell.classList.toggle('imagine-theme-light', isLight)
      shell.classList.toggle('imagine-theme-dark', !isLight)
    }
  })()`)
  await wait(0.8)
}

async function switchDesktopTab(mode) {
  const selector = '#creation-tab-desktop-' + mode
  await click(selector, { label: 'desktop tab ' + mode })
  await wait(2)
  const active = await js(`document.querySelector('.imagine-creator-scroll .imagine-creation-mode-tabs [data-active="true"]')?.getAttribute('data-mode')`)
  return active === mode
}

async function shotTabWithProbe(theme, mode, filename) {
  await js(`(() => {
    const tabbar = document.querySelector('.imagine-creator-scroll .imagine-creation-mode-tabs')
    const buttons = [...tabbar.querySelectorAll('[data-mode]')]
    buttons.forEach((b) => b.setAttribute('data-active', 'false'))
    tabbar.querySelector('[data-mode="${mode}"]').setAttribute('data-active', 'true')
  })()`)
  await wait(0.3)
  await captureScreenshot(auditDir + '/' + filename)
}

await cdp('Emulation.clearDeviceMetricsOverride')
await openOrReuseTab('http://127.0.0.1:3000/', { wait: true, timeout: 45 })
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitForNetworkIdle({ timeout: 30 }).catch(() => {})
await wait(2)

const results = { check: {}, colors: {}, interaction: {}, pass: {} }

await setTheme('dark')
for (const mode of ['image', 'video', 'audio']) {
  results.interaction['dark-' + mode] = await switchDesktopTab(mode)
  results.check['dark-' + mode] = await auditDesktop()
  results.colors['dark-' + mode] = await probeTabColor(mode)
  await shotTabWithProbe('dark', mode, 'p5-dark-' + mode + '.png')
}

await setTheme('light')
for (const mode of ['image', 'video', 'audio']) {
  results.interaction['light-' + mode] = await switchDesktopTab(mode)
  results.check['light-' + mode] = await auditDesktop()
  results.colors['light-' + mode] = await probeTabColor(mode)
  await shotTabWithProbe('light', mode, 'p5-light-' + mode + '.png')
}

const dImg = results.check['dark-image']
const dVid = results.check['dark-video']
const dAud = results.check['dark-audio']
const lImg = results.check['light-image']
const lVid = results.check['light-video']
const lAud = results.check['light-audio']

const pass = {
  uniqueTabIds: (dImg?.duplicateTabIds?.length ?? 1) === 0,
  desktopTabIdPrefix: (dImg?.tabIds ?? []).every((id) => id.startsWith('creation-tab-desktop-')),
  darkImageTabBlue: results.colors['dark-image'].color === 'rgb(147, 197, 253)',
  darkVideoTabViolet: results.colors['dark-video'].color === 'rgb(221, 214, 254)',
  darkAudioTabAmber: results.colors['dark-audio'].color === 'rgb(251, 191, 36)',
  lightImageTabBlue: results.colors['light-image'].color === 'rgb(29, 78, 216)',
  lightVideoTabViolet: results.colors['light-video'].color === 'rgb(109, 40, 217)',
  lightAudioTabAmber: results.colors['light-audio'].color === 'rgb(180, 83, 9)',
  panelPadding12: dImg?.panel?.padding === '12px',
  panelGap10: dImg?.panel?.gap === '10px',
  scrollGap10: dImg?.scroll?.gap === '10px',
  paramRows24: dImg?.paramField?.rows?.startsWith('24px'),
  footerPad8: dImg?.footerPad === '8px',
  noMin500: dImg?.panel?.minHeight === '0px',
  filtersHeightLe45: (dImg?.filters?.h ?? 0) <= 45 && (dImg?.filters?.h ?? 0) >= 30,
  themeSyncDark: dImg?.theme === 'dark' && dImg?.shellTheme === 'imagine-theme-dark',
  themeSyncLight: lImg?.theme === 'light' && lImg?.shellTheme === 'imagine-theme-light',
}

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await js(`(() => { matchMedia('(min-width: 1024px)').dispatchEvent(new Event('change')); dispatchEvent(new Event('resize')) })()`)
await wait(2)

const mobileIds = await js(String.raw`(() => {
  const ids = [...document.querySelectorAll('[id^="creation-tab-"]')].map((el) => el.id)
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  const mobileIds = ids.filter((id) => id.startsWith('creation-tab-mobile-'))
  return {
    tabIds: ids,
    mobileTabIds: mobileIds,
    duplicateTabIds: [...new Set(duplicateIds)],
    mobileWorkflowMounted: !!document.querySelector('.imagine-mobile-workflow'),
  }
})()`)
results.check.mobileIds = mobileIds

await click('.imagine-mobile-workbench-tab:nth-child(2)', { label: 'gallery' }).catch(() => {})
await wait(2)

const mobile = await js(String.raw`(() => {
  const filters = document.querySelector('.imagine-mobile-asset-stream .imagine-gallery-filters') || document.querySelector('.imagine-gallery-filters')
  if (!filters) return { error: 'no filters' }
  const saved = []
  let node = filters
  while (node && node !== document.body) {
    saved.push({ el: node, display: node.style.display })
    node.style.setProperty('display', node === filters ? 'flex' : 'block', 'important')
    node = node.parentElement
  }
  const cs = getComputedStyle(filters)
  const r = filters.getBoundingClientRect()
  const segments = [...filters.querySelectorAll('.imagine-filter-segment')]
  const tops = [...new Set(segments.map((s) => Math.round(s.getBoundingClientRect().top)))]
  const out = { viewport: { w: innerWidth, h: innerHeight }, filters: { w: Math.round(r.width), h: Math.round(r.height), flexWrap: cs.flexWrap, segmentRows: tops.length }, chipH: [...new Set([...filters.querySelectorAll('.imagine-filter-chip')].map((c) => Math.round(c.getBoundingClientRect().height)))] }
  for (const item of saved) item.el.style.display = item.display
  return out
})()`)
results.check.mobile390 = mobile
await captureScreenshot(auditDir + '/p5-mobile-filters.png')

pass.mobileUniqueTabIds = (mobileIds?.duplicateTabIds?.length ?? 1) === 0
pass.mobileTabIdPrefix = !mobileIds?.mobileWorkflowMounted
  || ((mobileIds?.mobileTabIds?.length ?? 0) === 3
    && (mobileIds?.mobileTabIds ?? []).every((id) => id.startsWith('creation-tab-mobile-')))
pass.mobileWrap = mobile?.filters?.flexWrap === 'wrap' && mobile?.filters?.segmentRows >= 2
pass.mobileChipLe30 = (mobile?.chipH ?? []).every((h) => h <= 30)

const interaction = {
  darkImageClick: results.interaction['dark-image'] === true,
  darkVideoClick: results.interaction['dark-video'] === true,
  darkAudioClick: results.interaction['dark-audio'] === true,
  lightImageClick: results.interaction['light-image'] === true,
  lightVideoClick: results.interaction['light-video'] === true,
  lightAudioClick: results.interaction['light-audio'] === true,
}
results.interactionSummary = interaction
results.interactionPass = Object.values(interaction).every(Boolean)

results.pass = pass
results.overallPass = Object.values(pass).every(Boolean)

cliLog('=== P5 EGO REGRESSION (updated script) ===')
cliLog(JSON.stringify(results, null, 2))
cliLog('overallPass: ' + results.overallPass)
EOF