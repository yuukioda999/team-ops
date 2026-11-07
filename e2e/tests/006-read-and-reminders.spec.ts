import { expect, test } from '@playwright/test'
import { issueInvitation, joinAsParent, newPage, representativeWithTeam, unique } from './flows.ts'
import { subjectsTo, waitForSubject } from './mailpit.ts'

/**
 * 006 既読・配信状況・再通知を、全サービスを起動した環境でブラウザから通しで確かめる(T18)。
 * 全員に送る → notify-relay の結果が webhook で届き「送信済み」になる → 1人が読む →
 * 未読の人にだけ【再通知】が届き、読んだ人には届かない。
 * 照合(AC-006-09)と、メールが届かないアドレス(AC-006-14・16・17)は、存在しないアドレスへの失敗を
 * Mailpit で作れないため、API の Feature テストで確かめる。
 */
test('AC-006-01 AC-006-03 AC-006-04 AC-006-05 AC-006-08 AC-006-11 AC-006-12 results arrive, a member reads, and only unread members get the reminder', async ({ browser }) => {
  const teamName = `E2E 既読FC ${Date.now() % 100000}`
  const representative = await newPage(browser)
  const repEmail = unique('rep')
  const readerEmail = unique('reader')
  const lateEmail = unique('late')

  await representativeWithTeam(representative, repEmail, teamName)
  const inviteUrl = await issueInvitation(representative)
  const reader = await joinAsParent(browser, representative, inviteUrl, readerEmail, 'E2E 読む保護者')
  await joinAsParent(browser, representative, inviteUrl, lateEmail, 'E2E 読まない保護者')

  const title = `試合の連絡 ${Date.now() % 100000}`
  const subject = `【${teamName}】${title}`
  await test.step('the representative sends to everyone', async () => {
    await representative.goto('/')
    await representative.getByRole('link', { name: 'お知らせを書く' }).click()
    await representative.getByLabel('タイトル').fill(title)
    await representative.getByLabel('本文').fill('日曜は9時集合です。')
    await expect(representative.getByText('3人に届きます(あなたを含む。同じ人には1通だけ)')).toBeVisible()
    await representative.getByRole('button', { name: '3人に送信する' }).click()
    await expect(representative.getByRole('article', { name: '本文' })).toBeVisible()
    await waitForSubject(readerEmail, subject)
  })

  await test.step('AC-006-08 the results come back from notify-relay and the mail is shown as sent', async () => {
    await representative.getByRole('link', { name: '既読・配信状況を見る' }).click()
    await expect
      .poll(
        async () => {
          await representative.reload()
          return expect(representative.getByText('メールの送信は終わりました'))
            .toBeVisible({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false)
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBe(true)
    // 送った本人は本文を開いたので既読。保護者2人が未読
    await expect(representative.getByLabel('宛先3人のうち、既読1人、未読2人')).toBeVisible()
  })

  await test.step('AC-006-03 AC-006-01 the reader sees the unread mark, opens the notice and it becomes read', async () => {
    await reader.goto('/')
    await reader.getByRole('link', { name: 'お知らせを見る' }).click()
    const item = reader.getByRole('listitem').filter({ hasText: title })
    await expect(item.getByText('未読')).toBeVisible()
    await item.getByRole('link').click()
    await expect(reader.getByRole('article', { name: '本文' })).toContainText('日曜は9時集合です。')
    await reader.goBack()
    // 一覧を読み込み直してから確かめる(読み込み中は項目がないので、数えるだけでは通ってしまう)
    await expect(reader.getByRole('listitem').filter({ hasText: title })).toBeVisible()
    await expect(reader.getByRole('listitem').filter({ hasText: title }).getByText('未読')).toHaveCount(0)
  })

  await test.step('AC-006-05 AC-006-11 only the member who has not read gets the reminder', async () => {
    await representative.reload()
    await expect(representative.getByLabel('宛先3人のうち、既読2人、未読1人')).toBeVisible()
    await expect(representative.getByRole('list', { name: '未読の人(1人)' })).toContainText('E2E 読まない保護者')
    await representative.getByRole('button', { name: '未読の1人に再通知する' }).click()
    await expect(representative.getByText('1人に再通知しました。')).toBeVisible()

    await waitForSubject(lateEmail, `【再通知】${subject}`)
    expect(await subjectsTo(readerEmail)).not.toContain(`【再通知】${subject}`)
    expect(await subjectsTo(repEmail)).not.toContain(`【再通知】${subject}`)
  })

  await test.step('AC-006-12 a second reminder within the hour cannot be sent', async () => {
    await expect(representative.getByText(/次に再通知できるのは .* からです。/)).toBeVisible()
    await expect(representative.getByRole('button', { name: /再通知する/ })).toBeDisabled()
  })
})
