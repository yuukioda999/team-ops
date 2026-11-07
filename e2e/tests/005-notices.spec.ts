import { expect, test } from '@playwright/test'
import { issueInvitation, joinAsParent, newPage, representativeWithTeam, unique } from './flows.ts'
import { mailsTo, subjectsTo, waitForSubject } from './mailpit.ts'

/**
 * 005 お知らせを、全サービスを起動した環境でブラウザから通しで確かめる(T16)。
 * 学年宛てに送る → 該当の保護者と代表に1通ずつ届き、該当しない保護者には届かない → 予約して取り消す。
 * notify-relay が止まっている間の送信(AC-005-07)は、API の Feature テストと障害訓練(make chaos-relay-down)で確かめる。
 */

test('AC-005-01 AC-005-02 AC-005-03 AC-005-05 AC-005-09 AC-005-10 AC-005-14 AC-005-16 a grade notice reaches the right families once, and a schedule can be cancelled', async ({ browser }) => {
  const teamName = `E2E お知らせFC ${Date.now() % 100000}`
  const representative = await newPage(browser)
  const repEmail = unique('rep')
  const grade3Email = unique('grade3')
  const grade5Email = unique('grade5')

  await representativeWithTeam(representative, repEmail, teamName)
  const inviteUrl = await issueInvitation(representative)
  const grade3Parent = await joinAsParent(browser, representative, inviteUrl, grade3Email, 'E2E 小3の保護者')
  const grade5Parent = await joinAsParent(browser, representative, inviteUrl, grade5Email, 'E2E 小5の保護者')

  await test.step('the representative registers two players and links their parents', async () => {
    for (const [name, grade, parent] of [
      ['E2E 小3の子', '小3', 'E2E 小3の保護者'],
      ['E2E 小5の子', '小5', 'E2E 小5の保護者'],
    ] as const) {
      await representative.goto('/')
      await representative.getByRole('link', { name: '名簿を見る' }).click()
      await representative.getByRole('link', { name: '選手を登録する' }).click()
      await representative.getByLabel('表示名').fill(name)
      await representative.getByLabel('学年').selectOption(grade)
      await representative.getByRole('button', { name: '登録する' }).click()
      await representative.getByRole('checkbox', { name: parent }).check()
      await representative.getByRole('button', { name: '保護者の紐づけを保存する' }).click()
      await expect(representative.getByText('保護者の紐づけを保存しました。')).toBeVisible()
    }
  })

  const title = `小3の練習 ${Date.now() % 100000}`
  await test.step('AC-005-02 AC-005-01 the representative sends to grade 3 after seeing the count', async () => {
    await representative.goto('/')
    await representative.getByRole('link', { name: 'お知らせを書く' }).click()
    await representative.getByLabel('タイトル').fill(title)
    await representative.getByLabel('本文').fill('明日の練習は9時からです。\n地図: https://example.invalid/map')
    await representative.getByRole('radio', { name: '学年で選ぶ' }).check()
    await representative.getByRole('checkbox', { name: '小3' }).check()
    await expect(representative.getByText('2人に届きます(あなたを含む。同じ人には1通だけ)')).toBeVisible()
    await representative.getByRole('button', { name: '2人に送信する' }).click()
    await expect(representative.getByRole('article', { name: '本文' })).toContainText('明日の練習は9時からです。')
  })

  await test.step('AC-005-03 AC-005-05 the grade 3 parent and the representative get one mail each; the grade 5 parent gets none', async () => {
    const subject = `【${teamName}】${title}`
    await waitForSubject(grade3Email, subject)
    await waitForSubject(repEmail, subject)
    expect((await subjectsTo(grade3Email)).filter((s) => s === subject)).toHaveLength(1)
    expect(await subjectsTo(grade5Email)).not.toContain(subject)

    // 送信者本人にも1通だけ。送信元はログインのメールと同じ共通のアドレス(ADR-0018)
    const repMails = await mailsTo(repEmail)
    const noticeMails = repMails.filter((m) => m.Subject === subject)
    expect(noticeMails).toHaveLength(1)
    const loginMail = repMails.find((m) => m.Subject !== subject)
    expect(loginMail).toBeDefined()
    expect(noticeMails[0].From).toEqual(loginMail!.From)
  })

  await test.step('AC-005-14 AC-005-16 the grade 3 parent reads it in the app with the link; the grade 5 parent does not see it', async () => {
    await grade3Parent.goto('/')
    await grade3Parent.getByRole('link', { name: 'お知らせを見る' }).click()
    await grade3Parent.getByRole('link', { name: new RegExp(title) }).click()
    await expect(grade3Parent.getByRole('article', { name: '本文' }).getByRole('link', { name: 'https://example.invalid/map' })).toBeVisible()

    await grade5Parent.goto('/')
    await grade5Parent.getByRole('link', { name: 'お知らせを見る' }).click()
    await expect(grade5Parent.getByRole('heading', { name: 'まだお知らせはありません' })).toBeVisible()
  })

  await test.step('AC-005-09 AC-005-10 a scheduled notice waits in the scheduled list and can be cancelled', async () => {
    await representative.goto('/')
    await representative.getByRole('link', { name: 'お知らせを書く' }).click()
    await representative.getByLabel('タイトル').fill('翌朝の連絡')
    await representative.getByLabel('本文').fill('7時に届けます')
    await representative.getByRole('radio', { name: '予約して送る' }).check()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    await representative.getByLabel('予約日時').fill(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T07:00`)
    await representative.getByRole('button', { name: '予約する' }).click()
    await expect(representative.getByText('「翌朝の連絡」を予約しました。')).toBeVisible()

    // 公開前なので、宛先の保護者の一覧には出ない(AC-005-09)
    await grade3Parent.goto('/')
    await grade3Parent.getByRole('link', { name: 'お知らせを見る' }).click()
    await expect(grade3Parent.getByRole('list', { name: 'お知らせ' }).getByRole('listitem')).toHaveCount(1)
    await expect(grade3Parent.getByText('翌朝の連絡')).toHaveCount(0)

    const item = representative.getByRole('region', { name: '翌朝の連絡' })
    await item.getByRole('button', { name: '取り消す' }).click()
    await item.getByRole('button', { name: '予約を取り消す' }).click()
    await expect(representative.getByText('「翌朝の連絡」の予約を取り消しました。メールは送られません。')).toBeVisible()
  })
})
