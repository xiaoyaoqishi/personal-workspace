import importlib.util
from datetime import datetime, timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
spec = importlib.util.spec_from_file_location('screen_sleep_test', Path(__file__).resolve().parents[1] / 'sleep_test.py')
sleep_test = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sleep_test)


class SleepEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime.fromisoformat('2026-11-26T10:00:00+08:00')
        self.target = self.start + timedelta(minutes=2)
        self.owner = 'com.discipline.screen-sync.test.' + 'a' * 32
        self.events = [{'at': self.start.isoformat(), 'detail': 'Entering Sleep state due to Software Sleep'},
                       {'at': self.target.isoformat(), 'detail': 'DarkWake from Normal Sleep due to RTC/Maintenance'},
                       {'at': self.start.isoformat(), 'detail': 'Wake Requests [process=powerd request=UserWake wakeAt=2026-11-26 10:02:00 info="' + self.owner + ',123"]'},
                       {'at': self.target.isoformat(), 'detail': 'PID 334(powerd) Created UserIsActive "com.apple.powermanagement.wakeschedule"'}]
        self.success = {'status': 'success', 'pending_events': 0, 'finished_at': (self.target + timedelta(seconds=30)).isoformat()}

    def assess(self, result=None, events=None, owner=None):
        return sleep_test.assess(self.start, self.target, result or self.success,
                                 self.events if events is None else events, owner or self.owner)

    def test_requires_actual_sleep_scheduled_wake_and_confirmed_upload(self):
        self.assertTrue(self.assess()['verified'])
        for events in [[], self.events[:1], self.events[1:], self.events[:2], self.events[:3]]:
            self.assertFalse(self.assess(events=events)['verified'])
        self.assertFalse(self.assess(result={'status': 'error'})['verified'])

    def test_manual_wake_or_wrong_time_cannot_be_reported_as_scheduled_success(self):
        for reason, at in [('UserActivity', self.target), ('RTC/Maintenance', self.target - timedelta(minutes=1))]:
            events = [self.events[0], {'at': at.isoformat(), 'detail': 'Wake from Normal Sleep due to ' + reason}] + self.events[2:]
            self.assertFalse(self.assess(events=events)['verified'])

    def test_apple_silicon_lowercase_rtc_with_hid_requires_owned_request_and_system_activation(self):
        events = [dict(event) for event in self.events]
        events[1]['detail'] = 'Wake from Deep Idle : due to NUB.SPMI0.SW3 rtc/HID Activity Using BATT'
        self.assertTrue(self.assess(events=events)['verified'])
        self.assertFalse(self.assess(events=events, owner=self.owner + 'other')['verified'])
        self.assertFalse(self.assess(events=events[:2])['verified'])
        events[1]['detail'] = 'Wake from Deep Idle : due to HID Activity Using BATT'
        self.assertFalse(self.assess(events=events)['verified'])

    def test_old_sync_result_and_sleep_after_wake_cannot_satisfy_test(self):
        self.assertFalse(self.assess(result={**self.success, 'finished_at': self.start.isoformat()})['verified'])
        events = [dict(event) for event in self.events]
        events[0]['at'] = (self.target + timedelta(seconds=1)).isoformat()
        self.assertFalse(self.assess(events=events)['verified'])

    def test_log_parser_retains_owner_requests_and_activation_but_excludes_older_events(self):
        text = '\n'.join([
            '2026-11-26 09:59:59 +0800 Sleep Entering Sleep state',
            '2026-11-26 10:00:00 +0800 Sleep Entering Sleep state',
            '2026-11-26 10:00:01 +0800 Wake Requests [info="test"]',
            '2026-11-26 10:02:00 +0800 Assertions PID 334(powerd) Created UserIsActive "com.apple.powermanagement.wakeschedule"',
            '2026-11-26 10:02:00 +0800 Wake Wake from Deep Idle rtc/HID Activity',
        ])
        events = sleep_test.parse_power_events(text, self.start)
        self.assertEqual(len(events), 4)
        self.assertIn('Wake Requests', events[1]['detail'])


if __name__ == '__main__':
    unittest.main()
