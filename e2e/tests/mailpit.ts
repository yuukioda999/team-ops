import { expect } from '@playwright/test'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

type Summary = { ID: string; Subject: string; From: { Name: string; Address: string } }

/**
 * Waits until Mailpit has received a mail for the address and returns the link in it.
 * The mail travels web -> API (outbox) -> queue worker -> notify-relay -> SMTP -> Mailpit,
 * so this also checks that the whole delivery path works (ADR-0002).
 */
export async function waitForLink(to: string, path: string, count = 1): Promise<{ url: string; message: Summary }> {
  let found: { url: string; message: Summary } | null = null
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
        const { messages } = (await search.json()) as { messages: Summary[] }
        if (messages.length < count) return false
        const latest = messages[0]
        const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as { Text: string }
        const match = detail.Text.match(new RegExp(`https?://[^\\s]+${path.replace('/', '\\/')}\\?token=[0-9a-f]{64}`))
        if (match === null) return false
        found = { url: match[0], message: latest }
        return true
      },
      { message: `a mail with a ${path} link for ${to}`, timeout: 90_000, intervals: [1_000] },
    )
    .toBe(true)
  return found!
}

/** Waits until a mail with exactly this subject has reached the address. */
export async function waitForSubject(to: string, subject: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
        const { messages } = (await search.json()) as { messages: Summary[] }
        return messages.some((m) => m.Subject === subject)
      },
      { message: `a mail "${subject}" for ${to}`, timeout: 90_000, intervals: [1_000] },
    )
    .toBe(true)
}

/** The subjects of every mail Mailpit has received for the address (newest first). */
export async function subjectsTo(to: string): Promise<string[]> {
  const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
  const { messages } = (await search.json()) as { messages: Summary[] }
  return messages.map((m) => m.Subject)
}
