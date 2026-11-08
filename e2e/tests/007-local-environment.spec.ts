import { expect, test } from '@playwright/test'
import { mailsTo, waitForLink } from './mailpit.ts'

/**
 * 007 のローカル環境(make up の既定)の確かめ(AC-007-18)。デモモードは無効で、宛先の制限だけが有効。
 * デモモードで起動した環境では飛ばす。デモモードを有効にしたあとは 007-demo-mode.spec.ts が確かめる。
 */
test.beforeEach(async ({ request }) => {
  const demo = await request.get('/api/demo')
  test.skip(demo.status() !== 404, 'DEMO_MODE=false のときだけ動かす')
})

test('AC-007-18 without demo mode the demo API does not exist and the usual login works', async ({ page, request }) => {
  await test.step('AC-007-18 the demo API answers 404', async () => {
    expect((await request.get('/api/demo')).status()).toBe(404)
    expect((await request.post('/api/demo/sessions', { data: { role: 'representative' } })).status()).toBe(404)
  })

  await test.step('AC-007-18 the login page asks for an email address and a .invalid address gets the link', async () => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'デモとしてログイン' })).toHaveCount(0)
    const email = `e2e-local-${Date.now()}@example.invalid`
    await page.getByLabel('メールアドレス').fill(email)
    await page.getByRole('button', { name: 'ログイン用のリンクを送る' }).click()
    await expect(page.getByRole('heading', { name: 'メールを送信しました' })).toBeVisible()
    const { url } = await waitForLink(email, '/login/verify')
    await page.goto(url)
    // 初めてのログインなので、表示名の登録に進む(001 と同じ)
    await expect(page.getByRole('heading', { name: '表示名を登録してください' })).toBeVisible()
  })
})

test('AC-007-18 an address outside .invalid is refused and never reaches the mail catcher', async ({ page }) => {
  const email = `e2e-local-${Date.now()}@example.com`
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'ログイン用のリンクを送る' }).click()

  await expect(page.getByText('この環境では、.invalid で終わるメールアドレスだけ使えます。')).toBeVisible()
  // 配信の経路(アウトボックス → notify-relay → Mailpit)を待ってから、届いていないことを確かめる
  await page.waitForTimeout(5_000)
  expect(await mailsTo(email)).toHaveLength(0)
})
