"""report.py の数え方と判定のテスト(spec 009)。python3 -m unittest discover chaos で動かす。"""

import unittest

from report import Recipient, Summary, judge


def summary(rows: list[Recipient], expected: int | None = None) -> Summary:
    return Summary(expected=len(rows) if expected is None else expected, recipients=dict(enumerate(rows, start=1)))


def ok(checks) -> bool:
    return all(passed for _, passed in checks)


DELIVERED = Recipient(received=1, api="delivered", relay="delivered", attempts=1)


class ReportTest(unittest.TestCase):
    def test_AC_009_02_lines_up_each_recipient_by_received_count_and_both_statuses(self):
        s = summary([DELIVERED, DELIVERED, Recipient(received=0, api="failed", api_error="invalid_address", relay="failed", attempts=1),
                     Recipient(received=2, api="delivered", relay="delivered", attempts=1)])

        self.assertEqual(s.table(), [("0回", "failed", "failed", 1), ("1回", "delivered", "delivered", 2), ("2回以上", "delivered", "delivered", 1)])
        self.assertEqual((s.twice, s.extra, s.lost, s.mismatch), (1, 1, 0, 0))

    def test_AC_009_02_a_lost_recipient_and_a_failed_but_received_one_do_not_cancel_out(self):
        # 差し引きで数えると、どちらも0に見える組み合わせ
        s = summary([Recipient(received=0, api="delivered", relay="delivered", attempts=1),
                     Recipient(received=1, api="failed", relay="failed", attempts=1)])

        self.assertEqual((s.lost, s.failed_but_received), (1, 1))
        self.assertFalse(ok(judge("smtp-perm", s, {"teams": "1"})))

    def test_AC_009_03_a_fault_that_hit_nothing_is_not_as_expected(self):
        s = summary([DELIVERED] * 3)  # 誰も再送していない

        checks = dict(judge("smtp-temp", s, {"teams": "1"}))
        self.assertFalse(checks["当たった:一時エラーで再送した宛先がある"])
        self.assertTrue(ok(judge("smtp-temp", summary([DELIVERED, Recipient(received=1, api="delivered", relay="delivered", attempts=2)]), {"teams": "1"})))

    def test_AC_009_04_a_failed_recipient_that_was_retried_is_not_as_expected(self):
        retried = Recipient(received=0, api="failed", api_error="invalid_address", relay="failed", attempts=2)

        self.assertFalse(ok(judge("smtp-perm", summary([DELIVERED, retried]), {"teams": "1"})))
        once = Recipient(received=0, api="failed", api_error="invalid_address", relay="failed", attempts=1)
        self.assertTrue(ok(judge("smtp-perm", summary([DELIVERED, once]), {"teams": "1"})))

    def test_AC_009_05_the_outbox_must_have_held_every_notice_while_relay_was_down(self):
        s = summary([DELIVERED] * 2)

        self.assertTrue(ok(judge("relay-stop", s, {"teams": "2", "unsent_outbox_while_down": "2", "mails_while_down": "0"})))
        self.assertFalse(ok(judge("relay-stop", s, {"teams": "2", "unsent_outbox_while_down": "0", "mails_while_down": "2"})))

    def test_AC_009_06_duplicates_up_to_the_send_concurrency_are_as_designed_but_a_kill_after_the_end_is_not(self):
        rows = [Recipient(received=2, api="delivered", relay="delivered", attempts=1)] * 50 + [DELIVERED] * 50

        self.assertTrue(ok(judge("relay-kill", summary(rows), {"teams": "1", "mails_at_kill": "60"})))
        self.assertFalse(ok(judge("relay-kill", summary(rows), {"teams": "1", "mails_at_kill": "100"})))
        rows51 = [Recipient(received=2, api="delivered", relay="delivered", attempts=1)] * 51 + [DELIVERED] * 49
        self.assertFalse(ok(judge("relay-kill", summary(rows51), {"teams": "1", "mails_at_kill": "60"})))

    def test_AC_009_07_results_must_have_been_held_back_while_the_api_was_down(self):
        s = summary([DELIVERED] * 2)

        self.assertTrue(ok(judge("api-down", s, {"teams": "1", "pending_while_down": "2"})))
        self.assertFalse(ok(judge("api-down", s, {"teams": "1", "pending_while_down": "0"})))

    def test_AC_009_02_recipients_missing_on_one_side_are_not_as_expected(self):
        s = summary([DELIVERED, Recipient(received=1, api="delivered", relay="-", attempts=0)])

        self.assertFalse(ok(judge("api-down", s, {"teams": "1", "pending_while_down": "2"})))


if __name__ == "__main__":
    unittest.main()
