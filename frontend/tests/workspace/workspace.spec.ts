import { test, expect, type Page } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fixture, french } from './fixtures'

async function replay(page: Page, snapshot = fixture()) {
  const data = structuredClone(snapshot)
  const reviews: any[] = []
  await page.addInitScript(() => localStorage.setItem('user_id', 'local-ui-replay'))
  await page.route(url => url.pathname === '/api/workspaces' || url.pathname.startsWith('/api/workspaces/'), async route => {
    const url = new URL(route.request().url())
    const tail = url.pathname.replace(/^\/api\/workspaces\/?/, '').split('/').filter(Boolean)
    if (route.request().method() === 'POST' && tail.at(-1) === 'review') {
      const body = route.request().postDataJSON(); reviews.push(body)
      data.run.status = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'queued'
      return route.fulfill({ json: { id: data.run.id, status: 'queued' } })
    }
    let body: any
    if (!tail.length) body = [{ id: data.workspace.id, name: data.workspace.name, role: data.workspace.role }]
    else if (tail.length === 1) body = data.workspace
    else if (tail[1] === 'knowledge') body = { sources: [], documents: data.run.state.product?.sources?.map((s: any) => ({ id: s.document_id, title: s.title, source_url: s.url, sync_status: 'ready', chunk_count: 2 })) || [] }
    else if (tail[1] === 'agents') body = data.agents
    else if (tail[1] === 'workflows') body = tail.length === 2 ? data.runs : data.run
    else if (tail[1] === 'conversations') body = tail.length === 2 ? data.conversations : { id: 'chat-1', messages: [{ id: 'message-1', role: 'assistant', agent_handle: data.agents[0].handle, agent_version: 2, content: french, status: 'ok', steps: [], sources: data.run.state.product.sources, created_at: '2026-11-18T10:00:00Z' }] }
    else return route.fulfill({ status: 404, json: { detail: 'Unknown replay route' } })
    return route.fulfill({ json: body })
  })
  await page.goto(`/demo?workspace=${data.workspace.id}&view=workflow&run=${data.run.id}`)
  await expect(page.getByRole('tabpanel')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  return { data, reviews }
}

for (const width of [1920, 1280, 1024]) {
  test(`saved run layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 })
    const snapshot = process.env.DEMO_SAVED_RUN_PATH ? JSON.parse(readFileSync(process.env.DEMO_SAVED_RUN_PATH, 'utf8')) : fixture()
    await replay(page, snapshot)
    await expect(page.getByRole('tabpanel')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Review run', exact: true })).toBeInViewport()
    await expect(page.getByRole('heading', { name: 'Agent handoff', exact: true })).toBeInViewport()
    await expect(page.locator('.demo-request')).toBeInViewport()
    await expect(page.locator('.demo-activity')).not.toHaveAttribute('open')
    const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, main: getComputedStyle(document.querySelector('.demo-main')!).backgroundColor, sidebar: getComputedStyle(document.querySelector('.demo-sidebar')!).backgroundColor, bar: getComputedStyle(document.querySelector('.demo-topbar')!).backgroundColor, type: getComputedStyle(document.querySelector('.demo-output')!).fontSize, font: getComputedStyle(document.querySelector('.demo-output')!).fontFamily }))
    expect(geometry).toMatchObject({ overflow: false, main: 'rgb(255, 255, 255)', sidebar: 'rgb(245, 241, 234)', bar: 'rgb(245, 241, 234)', type: '16px' })
    expect(geometry.font).toContain('Inter Variable')
    const folder = process.env.DEMO_SCREENSHOT_DIR || resolve(process.cwd(), '../reports')
    mkdirSync(folder, { recursive: true })
    await page.screenshot({ path: resolve(folder, `demo-workspace-${width}.png`) })
  })
}

test('French Markdown, nested lists, genuine code and partial emphasis render cleanly', async ({ page }) => {
  await replay(page)
  const output = page.getByRole('tabpanel').locator('.demo-output').first()
  await expect(output.getByRole('heading', { name: 'Synthèse de la recherche' })).toBeVisible()
  await expect(output.locator('strong').first()).toHaveText('rendre les décisions compréhensibles')
  await expect(output.locator('ol > li > ul > li > ul')).toHaveCount(1)
  await expect(output.locator('pre code')).toContainText("const value = '**conserver**';")
  await expect(output.locator('pre code')).toContainText('// Ce commentaire appartient au code.')
  await expect(output).toContainText('C:\\équipe\\recherche\\notes.md')
  await expect(output).toContainText('/workspace/**/notes.md')
  await expect(output.locator('blockquote')).toContainText('https://example.org/a__b?q=a*b#section')
  await expect(output).toContainText('Conclusion en cours')
  expect(await output.locator('p').last().innerText()).not.toContain('**')
  await expect(output.locator('hr')).toHaveCount(0)
  await expect(output.getByRole('link', { name: 'document de recherche' })).toHaveAttribute('href', 'https://example.org/recherche/a__b?q=un_deux&mode=full#r%C3%A9sum%C3%A9')
  const prose = await output.locator('p').allTextContents()
  expect(prose.some(p => /^\s*(?:\/\/|---|##|```)/.test(p))).toBe(false)
})

test('switch drafts, inspect actual received facts, and preserve full source URLs', async ({ page }) => {
  await replay(page)
  await page.getByRole('tab', { name: 'Rédaction' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Proposition de Rédaction')
  await expect(page.getByRole('tabpanel')).not.toContainText('Synthèse de la recherche')
  await page.getByRole('button', { name: 'Agent handoff', exact: true }).click()
  const handoff = page.getByRole('dialog', { name: 'Recorded agent handoff' })
  await expect(handoff).toContainText('Context received by Rédaction')
  await expect(handoff.locator('strong')).toContainText(['Observation :'])
  await handoff.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Sources', exact: true }).click()
  const sources = page.getByRole('dialog')
  await expect(sources.getByRole('link', { name: 'Entretiens utilisateurs · synthèse de recherche' })).toHaveAttribute('href', 'https://example.org/docs/a__b?q=un_deux&mode=full#résumé')
  await sources.getByText('Full source address', { exact: true }).first().click()
  await expect(sources.getByRole('link').filter({ hasText: 'https://example.org/docs' })).toBeVisible()
  await expect(sources.locator('blockquote')).toHaveText('**Texte source** // conserver exactement `ce passage`.')
  expect(await sources.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

for (const action of ['approve', 'request_changes', 'reject']) {
  test(`review preserves the ${action} endpoint contract and expected revision`, async ({ page }) => {
    const { reviews } = await replay(page)
    await page.getByRole('button', { name: 'Review run', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.demo-issues strong')).toHaveText('À vérifier :')
    if (action === 'request_changes') {
      await expect(dialog.getByRole('button', { name: 'Request changes', exact: true })).toBeDisabled()
      await dialog.getByRole('textbox', { name: 'Feedback' }).fill('Préciser les sources de cette recommandation.')
    }
    const label = { approve: 'Approve', request_changes: 'Request changes', reject: 'Reject' }[action]!
    await dialog.getByRole('button', { name: label, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(reviews).toEqual([{ action, expected_revision: 1, feedback: action === 'request_changes' ? 'Préciser les sources de cette recommandation.' : '' }])
  })
}

test('unsafe Markdown stays inert and unfinished streaming syntax stays readable', async ({ page }) => {
  const snapshot = fixture()
  snapshot.run.status = 'running'
  snapshot.run.state.product.content = '##Titre en cours\n\n**Texte incomplet\n\n<script>window.compromised=true</script>\n\n[lien dangereux](javascript:alert(1))\n\n[**référence incomplète](https://example.org)\n\n```js\nconst path = "C:\\\\team\\\\file";\n// code conservé'
  const { data } = await replay(page, snapshot)
  const output = page.getByRole('tabpanel').locator('.demo-output').first()
  await expect(output.getByRole('heading', { name: 'Titre en cours' })).toBeVisible()
  await expect(output.locator('p').first()).toHaveText('Texte incomplet')
  await expect(output.locator('script')).toHaveCount(0)
  await expect(output.locator('a[href^="javascript:"]')).toHaveCount(0)
  await expect(output.getByRole('link', { name: 'référence incomplète', exact: true })).toBeVisible()
  await expect(output.locator('pre code')).toContainText('// code conservé')
  data.run.state.product.content = '## Titre complet\n\n**Texte terminé** avec une [référence](https://example.org/a__b).'
  await expect(output.locator('strong')).toHaveText('Texte terminé', { timeout: 6000 })
  await expect(output.getByRole('link')).toHaveAttribute('href', 'https://example.org/a__b')
})

test('run presentation accepts another agent role without fixed team names', async ({ page }) => {
  const snapshot = fixture()
  snapshot.run.agents.engineering = { id: 'agent-4', name: 'Architecture', handle: 'architecture', version: 1 }
  snapshot.run.state.engineering = { revision: 1, title: 'Analyse technique', handle: 'architecture', content: '## Architecture\n\nVérifier les dépendances.', sources: [] }
  await replay(page, snapshot)
  await expect(page.getByRole('tab')).toHaveCount(4)
  await page.getByRole('tab', { name: 'Analyse technique' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Vérifier les dépendances.')
})

test('conversation replies use the same clean renderer', async ({ page }) => {
  await replay(page)
  await page.getByRole('button', { name: 'Questions sur les entretiens', exact: true }).click()
  await expect(page.locator('.demo-message .demo-output strong').first()).toHaveText('rendre les décisions compréhensibles')
  await expect(page.locator('.demo-message pre code')).toContainText('// Ce commentaire appartient au code.')
})

test('authentication gate remains in place', async ({ page }) => {
  await page.goto('/demo')
  await expect(page).toHaveURL('/')
})
