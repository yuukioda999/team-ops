import { expect, test, type Page } from '@playwright/test'
import { waitForLink, waitForSubject } from './mailpit.ts'

/**
 * 001 アカウントとチーム作成を、全サービスを起動した環境でブラウザから通しで確かめる(T29)。
 * テスト名には受け入れ基準のIDを入れる。
 */

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`

async function requestLink(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'ログイン用のリンクを送る' }).click()
  await expect(page.getByRole('heading', { name: 'メールを送信しました' })).toBeVisible()
}

async function logIn(page: Page, email: string, mailCount = 1) {
  await requestLink(page, email)
  const { url } = await waitForLink(email, '/login/verify', mailCount)
  await page.goto(new URL(url).pathname + new URL(url).search)
  await page.getByRole('button', { name: 'ログインする' }).click()
  return url
}

test('AC-001-01 AC-001-03 AC-001-08 AC-001-11 AC-001-13 AC-001-14 from the login link to two teams', async ({ page }) => {
  const email = unique()

  await test.step('AC-001-01 request a login link; the mail arrives through notify-relay', async () => {
    await requestLink(page, email)
    const { message } = await waitForLink(email, '/login/verify')
    expect(message.Subject).toBe('【チーム運営】ログイン用のリンク')
    expect(message.From.Name).toBe('チーム運営')
  })

  await test.step('AC-001-03 open the link and log in; the token leaves the address bar (D7)', async () => {
    const { url } = await waitForLink(email, '/login/verify')
    await page.goto(new URL(url).pathname + new URL(url).search)
    await expect(page.getByRole('button', { name: 'ログインする' })).toBeVisible()
    expect(page.url()).not.toContain('token=')
    await page.getByRole('button', { name: 'ログインする' }).click()
    await expect(page.getByRole('heading', { name: '表示名を登録してください' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
  })

  await test.step('AC-001-08 enter a display name', async () => {
    await page.getByLabel('表示名').fill('E2E 代表')
    await page.getByRole('button', { name: '登録する' }).click()
  })

  await test.step('AC-001-14 someone in no team sees the two ways in', async () => {
    await expect(page.getByRole('heading', { name: 'チームを用意しましょう' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '招待リンクから参加する' })).toBeVisible()
  })

  await test.step('AC-001-11 create a team and become its representative', async () => {
    await page.getByRole('link', { name: 'チームを作成する' }).click()
    await page.getByLabel('チーム名').fill('E2E FC U-10')
    await page.getByRole('button', { name: 'チームを作成する' }).click()
    await expect(page.getByRole('heading', { name: 'E2E FC U-10', level: 1 })).toBeVisible()
    await expect(page.getByText('あなたの役割:代表')).toBeVisible()
  })

  await test.step('AC-001-13 create a second team and switch between them', async () => {
    await page.goto('/teams/new')
    await page.getByLabel('チーム名').fill('E2E FC U-12')
    await page.getByRole('button', { name: 'チームを作成する' }).click()
    await expect(page.getByRole('heading', { name: 'E2E FC U-12', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'チームを切り替える' }).click()
    await page.getByRole('navigation', { name: '所属しているチーム' }).getByRole('link', { name: /U-10/ }).click()
    await expect(page.getByRole('heading', { name: 'E2E FC U-10', level: 1 })).toBeVisible()
  })

  await test.step('the session survives a reload', async () => {
    await page.reload()
    await expect(page.getByRole('heading', { name: 'E2E FC U-10', level: 1 })).toBeVisible()
  })
})

test('AC-001-04 a login link works only once', async ({ page }) => {
  const email = unique()
  const url = await logIn(page, email)
  await expect(page.getByRole('heading', { name: '表示名を登録してください' })).toBeVisible()

  await page.context().clearCookies()
  await page.goto(new URL(url).pathname + new URL(url).search)
  await page.getByRole('button', { name: 'ログインする' }).click()

  await expect(page.getByRole('heading', { name: 'リンクの有効期限が切れています' })).toBeVisible()
})

test('AC-001-06 after logging out, pages that need login go to the login page', async ({ page }) => {
  const email = unique()
  await logIn(page, email)
  await page.getByLabel('表示名').fill('E2E 保護者')
  await page.getByRole('button', { name: '登録する' }).click()
  await expect(page.getByRole('heading', { name: 'チームを用意しましょう' })).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'ログアウトする' }).click()
  await expect(page.getByRole('heading', { name: 'メールアドレスでログイン' })).toBeVisible()

  await page.goto('/teams/new')
  await expect(page.getByRole('heading', { name: 'メールアドレスでログイン' })).toBeVisible()
})

test('AC-001-09 AC-001-10 D5 change the email address; the link needs the requester logged in', async ({ page }) => {
  const oldEmail = unique()
  const newEmail = unique()
  await logIn(page, oldEmail)
  await page.getByLabel('表示名').fill('E2E 変更')
  await page.getByRole('button', { name: '登録する' }).click()
  await expect(page.getByRole('heading', { name: 'チームを用意しましょう' })).toBeVisible()

  await page.goto('/settings')
  await page.getByLabel('新しいメールアドレス').fill(newEmail)
  await page.getByRole('button', { name: '確認メールを送る' }).click()
  await expect(page.getByText(`${newEmail} に確認メールを送りました`, { exact: false })).toBeVisible()
  const { url: changeUrl } = await waitForLink(newEmail, '/settings/email/verify')

  // D5: open the change link while logged out, log in again, and come back to confirm
  await page.context().clearCookies()
  await page.goto(new URL(changeUrl).pathname + new URL(changeUrl).search)
  await expect(page.getByRole('heading', { name: 'メールアドレスでログイン' })).toBeVisible()
  await logIn(page, oldEmail, 2)
  await page.getByRole('button', { name: 'メールアドレスを変更する' }).click()
  await expect(page.getByRole('heading', { name: 'メールアドレスを変更しました' })).toBeVisible()
  await expect(page.getByText(newEmail).first()).toBeVisible()

  // AC-001-10: the old address is told about the change
  await waitForSubject(oldEmail, '【チーム運営】メールアドレスが変更されました')
})
