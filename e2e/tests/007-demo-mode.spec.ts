import { expect, test } from '@playwright/test'

/**
 * 007 デモモードを、デモモードで起動した環境でブラウザから通しで確かめる(T16)。
 * デモとしてログイン → お知らせを送る → 送信されたメールで届いたメールが見える → 保護者に切り替えると届いている。
 * デモモードでない環境(make up の既定)では飛ばす。CI はデモモードに切り替えてから、このファイルだけを動かす。
 */
test.beforeEach(async ({ request }) => {
  const demo = await request.get('/api/demo')
  test.skip(demo.status() !== 200, 'DEMO_MODE=true のときだけ動かす')
})

test('AC-007-01 AC-007-02 AC-007-04 AC-007-05 AC-007-11 AC-007-12 a visitor logs in as a demo, sends a notice, reads the mail and switches to a parent', async ({ page }) => {
  await test.step('AC-007-01 AC-007-03 the login page offers only the demo login', async () => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'デモとしてログイン' })).toBeVisible()
    await expect(page.getByLabel('メールアドレス')).toHaveCount(0)
  })

  await test.step('AC-007-02 AC-007-04 logging in as the representative opens a fresh demo team', async () => {
    const started = Date.now()
    await page.getByRole('button', { name: 'デモとしてログイン' }).click()
    await expect(page.getByRole('heading', { name: 'みどり台FC U-10(デモ)' })).toBeVisible()
    expect(Date.now() - started).toBeLessThan(10_000)
    await expect(page.getByRole('complementary', { name: 'デモ環境' })).toContainText('デモ環境です。入力したデータは24時間後に削除されます')
  })

  const title = `デモの連絡 ${Date.now() % 100000}`
  await test.step('AC-007-11 a notice to everyone goes to the mail catcher', async () => {
    await page.getByRole('link', { name: 'お知らせを書く' }).click()
    await page.getByLabel('タイトル').fill(title)
    await page.getByLabel('本文').fill('日曜は9時に第二グラウンドに集合です。')
    await expect(page.getByText(/24人に届きます/)).toBeVisible()
    await page.getByRole('button', { name: '24人に送信する' }).click()
    await expect(page.getByRole('article', { name: '本文' })).toBeVisible()
  })

  await test.step('AC-007-12 the sent mail is shown with its recipients and body', async () => {
    await page.getByRole('link', { name: '送信されたメール' }).click()
    const mail = page.getByRole('listitem').filter({ hasText: title })
    await expect
      .poll(
        async () => {
          await page.getByRole('button', { name: '新しいメールを確かめる' }).click()
          return mail.count()
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBeGreaterThan(0)
    await expect(mail.first()).toContainText('日曜は9時に第二グラウンドに集合です。')
    await expect(mail.first()).toContainText('.invalid')
  })

  await test.step('AC-007-05 switching to a parent keeps the same demo team, and the notice is there', async () => {
    await page.getByRole('combobox', { name: '役割' }).selectOption('parent')
    await page.getByRole('button', { name: '切り替える' }).click()
    await expect(page.getByRole('combobox', { name: '役割' })).toHaveValue('parent')
    await page.getByRole('link', { name: 'お知らせを見る' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: title }).getByText('未読')).toBeVisible()
  })
})

test('AC-007-06 two visitors get separate demo teams', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  for (const page of [a, b]) {
    await page.goto('/login')
    await page.getByRole('button', { name: 'デモとしてログイン' }).click()
    await expect(page.getByRole('heading', { name: 'みどり台FC U-10(デモ)' })).toBeVisible()
  }
  const teamOfA = new URL(a.url()).pathname
  expect(new URL(b.url()).pathname).not.toBe(teamOfA)

  // B が A のチームの URL を開いても見えない
  await b.goto(teamOfA)
  await expect(b.getByRole('heading', { name: 'チームが見つかりません' })).toBeVisible()
})
