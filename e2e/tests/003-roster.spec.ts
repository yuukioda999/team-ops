import { expect, test } from '@playwright/test'
import { issueInvitation, joinAsParent, newPage, representativeWithTeam, unique } from './flows.ts'

/**
 * 003 名簿を、全サービスを起動した環境でブラウザから通しで確かめる(T14)。
 * 代表が CSV で取り込み → 保護者を紐づける → 保護者は自分の子どもだけを見られる。
 */

const CSV = ['表示名,学年,背番号', 'E2E 太郎,小3,10', 'E2E 次郎,小1,', '=E2E 三郎,中1,7', ''].join('\r\n')

test('AC-003-14 AC-003-05 AC-003-08 AC-003-09 AC-003-10 import a roster, link a parent, and the parent sees only their child', async ({ browser }) => {
  const teamName = `E2E 名簿FC ${Date.now() % 100000}`
  const representative = await newPage(browser)
  const repEmail = unique('rep')

  await representativeWithTeam(representative, repEmail, teamName)
  const inviteUrl = await issueInvitation(representative)
  const parent = await joinAsParent(browser, representative, inviteUrl, unique('parent'), 'E2E 太郎の母')

  await test.step('AC-003-14 AC-003-18 the representative previews the CSV, then imports it', async () => {
    await representative.goto('/')
    await representative.getByRole('link', { name: '名簿を見る' }).click()
    await representative.getByRole('link', { name: 'CSVで一括登録する' }).click()
    await representative.getByLabel('CSVファイル').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') })
    await representative.getByRole('button', { name: '内容を確認する' }).click()
    await expect(representative.getByText('人を取り込みます。まだ登録はしていません。', { exact: false })).toContainText('3人')
    await expect(representative.getByRole('table', { name: '先頭3行' }).getByText('=E2E 三郎')).toBeVisible()
    await representative.getByRole('button', { name: '3人を取り込む' }).click()
    await expect(representative.getByText('3人を名簿に取り込みました。')).toBeVisible()
    await expect(representative.getByRole('list', { name: '選手' }).getByRole('listitem')).toHaveCount(3)
  })

  await test.step('AC-003-05 the representative links the parent to one child', async () => {
    await representative.getByRole('link', { name: 'E2E 太郎' }).click()
    await representative.getByRole('checkbox', { name: 'E2E 太郎の母' }).check()
    await representative.getByRole('button', { name: '保護者の紐づけを保存する' }).click()
    await expect(representative.getByText('保護者の紐づけを保存しました。')).toBeVisible()
    await representative.getByRole('link', { name: '名簿に戻る' }).click()
    await expect(representative.getByRole('listitem').filter({ hasText: 'E2E 太郎' })).toContainText('保護者:E2E 太郎の母')
  })

  await test.step('AC-003-09 the parent sees only their own child', async () => {
    await parent.goto('/')
    await parent.getByRole('link', { name: 'お子さんの情報を見る' }).click()
    await expect(parent.getByRole('heading', { name: 'あなたのお子さん' })).toBeVisible()
    const items = parent.getByRole('list', { name: '選手' }).getByRole('listitem')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText('E2E 太郎')
    await expect(parent.getByText('E2E 次郎')).toHaveCount(0)
    await expect(parent.getByRole('link', { name: 'CSVで一括登録する' })).toHaveCount(0)
  })

  await test.step('AC-003-10 the parent gets 404 for a child of another family, and cannot open the edit pages', async () => {
    const hrefOf = async (name: string) => (await representative.getByRole('link', { name }).getAttribute('href')) ?? ''
    await representative.goto(representative.url())
    const own = await hrefOf('E2E 太郎')
    const other = await hrefOf('E2E 次郎')
    // 保護者の画面の中から、画面と同じように API を直接呼ぶ(保護者のログインの Cookie で)
    const status = (path: string) => parent.evaluate(async (url) => (await fetch(url, { headers: { Accept: 'application/json' } })).status, `/api${path}`)
    expect(await status(own)).toBe(200)
    expect(await status(other)).toBe(404)

    await parent.goto(other)
    await expect(parent.getByRole('heading', { name: 'この画面を開く権限がありません' })).toBeVisible()
  })
})
