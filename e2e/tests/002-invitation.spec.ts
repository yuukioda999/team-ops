import { expect, test, type Browser, type Page } from '@playwright/test'
import { waitForLink, waitForSubject } from './mailpit.ts'

/**
 * 002 招待と参加承認を、全サービスを起動した環境でブラウザから通しで確かめる(T20)。
 * 代表と保護者を、別々のブラウザ(Cookie を分けたコンテキスト)で動かす。
 */

const unique = (who: string) => `e2e-${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

/** 代表としてログインし、表示名を登録してチームを作る */
async function representativeWithTeam(page: Page, email: string, teamName: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'ログイン用のリンクを送る' }).click()
  const { url } = await waitForLink(email, '/login/verify')
  await page.goto(new URL(url).pathname + new URL(url).search)
  await page.getByRole('button', { name: 'ログインする' }).click()
  await page.getByLabel('表示名').fill('E2E 代表')
  await page.getByRole('button', { name: '登録する' }).click()
  await page.getByRole('link', { name: 'チームを作成する' }).click()
  await page.getByLabel('チーム名').fill(teamName)
  await page.getByRole('button', { name: 'チームを作成する' }).click()
  await expect(page.getByRole('heading', { name: teamName, level: 1 })).toBeVisible()
}

test('AC-002-01 AC-002-05 AC-002-06 AC-002-11 AC-002-12 AC-001-19 from an invitation link to a new member', async ({ browser }) => {
  const teamName = `E2E 招待FC ${Date.now() % 100000}`
  const representative = await newPage(browser)
  const parent = await newPage(browser)
  const repEmail = unique('rep')
  const parentEmail = unique('parent')
  let inviteUrl = ''

  await test.step('AC-002-01 the representative issues a link and sees it with a QR code', async () => {
    await representativeWithTeam(representative, repEmail, teamName)
    await representative.getByRole('link', { name: 'メンバーを招待する' }).click()
    await representative.getByRole('button', { name: '招待リンクを発行する' }).click()
    const urlText = representative.locator('.invite__url')
    await expect(urlText).toHaveText(/\/join\?token=[0-9a-f]{64}$/)
    inviteUrl = (await urlText.textContent()) ?? ''
    await expect(representative.getByRole('img', { name: '招待リンクのQRコード' })).toBeVisible()
  })

  await test.step('AC-002-05 a parent opens the link logged out and sees the team name', async () => {
    await parent.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search)
    await expect(parent.getByRole('heading', { name: teamName })).toBeVisible()
    expect(parent.url()).not.toContain('token=')
    await parent.getByRole('button', { name: 'ログインして参加を申請する' }).click()
    await parent.getByLabel('メールアドレス').fill(parentEmail)
    await parent.getByRole('button', { name: 'ログイン用のリンクを送る' }).click()
    await expect(parent.getByRole('heading', { name: 'メールを送信しました' })).toBeVisible()
  })

  await test.step('AC-001-19 the login mail opened in another tab comes back to the request form', async () => {
    const { url } = await waitForLink(parentEmail, '/login/verify')
    // a new tab in the same browser: nothing is saved in this tab, the way back comes from the API
    const mailTab = await parent.context().newPage()
    await mailTab.goto(new URL(url).pathname + new URL(url).search)
    await mailTab.getByRole('button', { name: 'ログインする' }).click()
    await expect(mailTab.getByRole('heading', { name: teamName })).toBeVisible()
    await expect(mailTab.getByRole('button', { name: '参加を申請する' })).toBeVisible()
    await parent.close()

    await test.step('AC-002-06 the parent applies with a display name and a message', async () => {
      await mailTab.getByLabel('表示名').fill('E2E 保護者')
      await mailTab.getByLabel('ひとこと(任意)').fill('3年 E2Eの母です')
      await mailTab.getByRole('button', { name: '参加を申請する' }).click()
      await expect(mailTab.getByRole('heading', { name: '承認待ちです' })).toBeVisible()
      await waitForSubject(repEmail, '【チーム運営】参加申請が届きました')
    })

    await test.step('AC-002-11 AC-002-12 the representative approves as parent and coach', async () => {
      await representative.goto('/')
      await representative.getByRole('link', { name: '承認待ちの申請を見る' }).click()
      const card = representative.getByRole('region', { name: 'E2E 保護者' })
      await expect(card.getByText('3年 E2Eの母です')).toBeVisible()
      await card.getByRole('checkbox', { name: 'コーチ' }).check()
      await card.getByRole('button', { name: '承認する' }).click()
      await expect(representative.getByText('E2E 保護者さんを承認しました。')).toBeVisible()
      await waitForSubject(parentEmail, '【チーム運営】参加が承認されました')
    })

    await test.step('the new member sees the team with both roles', async () => {
      await mailTab.goto('/')
      await expect(mailTab.getByRole('heading', { name: teamName, level: 1 })).toBeVisible()
      await expect(mailTab.getByText('あなたの役割:コーチ・保護者')).toBeVisible()
      await expect(mailTab.getByRole('link', { name: 'メンバーを招待する' })).toHaveCount(0)
    })
  })
})

test('AC-002-03 AC-002-07 a revoked link cannot be used', async ({ browser }) => {
  const teamName = `E2E 無効FC ${Date.now() % 100000}`
  const representative = await newPage(browser)
  const visitor = await newPage(browser)

  await representativeWithTeam(representative, unique('rep'), teamName)
  await representative.getByRole('link', { name: 'メンバーを招待する' }).click()
  await representative.getByRole('button', { name: '招待リンクを発行する' }).click()
  const inviteUrl = (await representative.locator('.invite__url').textContent()) ?? ''
  await representative.getByRole('button', { name: 'リンクを無効にする' }).click()
  await expect(representative.getByRole('heading', { name: '有効な招待リンクはありません' })).toBeVisible()

  await visitor.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search)
  await expect(visitor.getByRole('heading', { name: 'リンクが無効です' })).toBeVisible()
  await expect(visitor.getByText('チームの役員に新しいリンクを依頼してください')).toBeVisible()
})
