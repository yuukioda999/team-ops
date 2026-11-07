import { expect, type Browser, type Page } from '@playwright/test'
import { waitForLink, waitForSubject } from './mailpit.ts'

/** Shared steps of the E2E tests. Each person uses a separate browser context (separate cookies). */

export const unique = (who: string) => `e2e-${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`

export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

/** 代表としてログインし、表示名を登録してチームを作る */
export async function representativeWithTeam(page: Page, email: string, teamName: string): Promise<void> {
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

/** 代表が招待リンクを発行し、その URL を返す */
export async function issueInvitation(representative: Page): Promise<string> {
  await representative.goto('/')
  await representative.getByRole('link', { name: 'メンバーを招待する' }).click()
  await representative.getByRole('button', { name: '招待リンクを発行する' }).click()
  const urlText = representative.getByText(/\/join\?token=[0-9a-f]{64}$/)
  await expect(urlText).toBeVisible()
  return (await urlText.textContent()) ?? ''
}

/** 招待リンクから参加を申請し、代表が保護者として承認する。参加した人のページを返す */
export async function joinAsParent(browser: Browser, representative: Page, inviteUrl: string, email: string, displayName: string): Promise<Page> {
  const page = await newPage(browser)
  await page.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search)
  await page.getByRole('button', { name: 'ログインして参加を申請する' }).click()
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'ログイン用のリンクを送る' }).click()
  const { url } = await waitForLink(email, '/login/verify')
  await page.goto(new URL(url).pathname + new URL(url).search)
  await page.getByRole('button', { name: 'ログインする' }).click()
  await page.getByLabel('表示名').fill(displayName)
  await page.getByRole('button', { name: '参加を申請する' }).click()
  await expect(page.getByRole('heading', { name: '承認待ちです' })).toBeVisible()

  await representative.goto('/')
  await representative.getByRole('link', { name: '承認待ちの申請を見る' }).click()
  await representative.getByRole('region', { name: displayName }).getByRole('button', { name: '承認する' }).click()
  await expect(representative.getByText(`${displayName}さんを承認しました。`)).toBeVisible()
  await waitForSubject(email, '【チーム運営】参加が承認されました')
  return page
}
