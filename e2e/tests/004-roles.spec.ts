import { expect, test } from '@playwright/test'
import { issueInvitation, joinAsParent, newPage, representativeWithTeam, unique } from './flows.ts'
import { waitForSubject } from './mailpit.ts'

/**
 * 004 役割と権限を、全サービスを起動した環境でブラウザから通しで確かめる(T15)。
 * 保護者をコーチ兼保護者にする → 役員を任命して代表を交代する → 役員になった元の代表が保護者を除名する。
 */

test('AC-004-03 AC-004-04 AC-004-08 AC-004-12 change roles, hand over the representative, and remove a member', async ({ browser }) => {
  const teamName = `E2E 役割FC ${Date.now() % 100000}`
  const representative = await newPage(browser)
  const repEmail = unique('rep')
  const parentEmail = unique('parent')
  const nextEmail = unique('next')

  await representativeWithTeam(representative, repEmail, teamName)
  const inviteUrl = await issueInvitation(representative)
  const parent = await joinAsParent(browser, representative, inviteUrl, parentEmail, 'E2E 保護者')
  const next = await joinAsParent(browser, representative, inviteUrl, nextEmail, 'E2E 次の代表')

  await test.step('AC-004-03 the representative makes the parent a coach too, and the parent is told by email', async () => {
    await representative.goto('/')
    await representative.getByRole('link', { name: 'メンバー一覧' }).click()
    await representative.getByRole('link', { name: /E2E 保護者/ }).click()
    await representative.getByRole('checkbox', { name: 'コーチ' }).check()
    await representative.getByRole('button', { name: '役割を保存する' }).click()
    await expect(representative.getByText('役割を「コーチ・保護者」にしました。本人にメールで知らせました。')).toBeVisible()
    await waitForSubject(parentEmail, '【チーム運営】役割が変更されました')

    await parent.goto('/')
    await expect(parent.getByText('あなたの役割:コーチ・保護者')).toBeVisible()
  })

  await test.step('AC-004-04 the representative appoints an officer and hands over', async () => {
    await representative.getByRole('link', { name: 'メンバー一覧に戻る' }).click()
    await representative.getByRole('link', { name: /E2E 次の代表/ }).click()
    await expect(representative.getByText('代表にできるのは役員のメンバーだけです。交代するときは、先に役員に任命してください。')).toBeVisible()
    await representative.getByRole('checkbox', { name: '役員' }).check()
    await representative.getByRole('button', { name: '役割を保存する' }).click()
    await expect(representative.getByText(/役割を「役員・保護者」にしました/)).toBeVisible()

    const transfer = representative.getByRole('region', { name: '代表を交代する' })
    await transfer.getByRole('button', { name: '代表を交代する' }).click()
    await transfer.getByRole('button', { name: 'E2E 次の代表さんに代表を交代する' }).click()
    await expect(representative.getByText('あなたの役割:役員')).toBeVisible()
    await waitForSubject(nextEmail, '【チーム運営】代表が交代しました')
    await waitForSubject(repEmail, '【チーム運営】代表が交代しました')

    await next.goto('/')
    await expect(next.getByText('あなたの役割:代表・保護者')).toBeVisible()
    await expect(next.getByRole('link', { name: '監査ログを見る' })).toBeVisible()
  })

  await test.step('AC-004-08 the former representative, now an officer, removes the parent, who then gets 404', async () => {
    await representative.getByRole('link', { name: 'メンバー一覧' }).click()
    await representative.getByRole('link', { name: /E2E 保護者/ }).click()
    const removal = representative.getByRole('region', { name: '除名する' })
    await removal.getByRole('button', { name: '除名する' }).click()
    await removal.getByRole('button', { name: 'E2E 保護者さんを除名する' }).click()
    await expect(representative.getByText('E2E 保護者さんを除名しました。')).toBeVisible()

    const teamPath = new URL(representative.url()).pathname.replace(/\/members$/, '')
    await parent.goto(teamPath)
    await expect(parent.getByRole('heading', { name: 'チームが見つかりません' })).toBeVisible()
  })

  await test.step('AC-004-12 the new representative sees these operations in the audit log', async () => {
    await next.getByRole('link', { name: '監査ログを見る' }).click()
    const log = next.getByRole('list', { name: '記録' })
    await expect(log.getByText('メンバーを除名')).toBeVisible()
    await expect(log.getByText('代表を交代')).toBeVisible()
    await expect(log.getByText('メンバーの役割を変更').first()).toBeVisible()
  })
})
