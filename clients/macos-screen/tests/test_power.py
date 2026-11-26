import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

spec = importlib.util.spec_from_file_location('screen_power', Path(__file__).resolve().parents[1] / 'power.py')
power = importlib.util.module_from_spec(spec)
spec.loader.exec_module(power)


class PowerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2030, 12, 31, 9, 30, tzinfo=ZoneInfo('Asia/Shanghai'))
        self.target = self.now + timedelta(days=1)
        self.events = []
        self.commands = []

    def event(self, at, owner=power.OWNER):
        return {'eventtype': 'wake', 'scheduledby': owner, 'time': at.astimezone(timezone.utc).replace(tzinfo=None)}

    def apply(self, args):
        self.commands.append(args)
        at = datetime.strptime(args[-2], '%m/%d/%y %H:%M:%S').astimezone()
        if args[1] == 'cancel':
            self.events[:] = [e for e in self.events if not (power.event_time(e) == at and e['scheduledby'] == args[-1])]
        else:
            self.events.append(self.event(at, args[-1]))

    def ensure(self, apply=None):
        return power.ensure_wake(self.target, get_events=lambda: self.events, apply=apply or self.apply, pause=lambda _: None)

    def test_wake_is_renewed_without_touching_other_owners(self):
        other = self.event(self.now + timedelta(hours=2), 'com.apple.calendar')
        stale = self.event(self.now + timedelta(hours=1))
        self.events.extend([other, stale])
        self.ensure()
        self.assertIn(other, self.events)
        self.assertNotIn(stale, self.events)
        self.assertEqual(len(power.owned(self.events)), 1)
        self.assertEqual(self.commands[0][1], 'wake')  # replacement exists before cancellation
        self.assertTrue(all(command[-1] == power.OWNER for command in self.commands))
        self.commands.clear()
        self.ensure()
        self.assertEqual(self.commands, [])  # idempotent, not a queue of repeated wakeups

    def test_failed_replacement_keeps_previous_wake(self):
        previous = self.event(self.now + timedelta(hours=1))
        self.events.append(previous)
        def fail(args):
            self.commands.append(args)
            raise OSError('scheduling failed')
        with self.assertRaises(OSError):
            self.ensure(fail)
        self.assertEqual(self.events, [previous])
        self.assertEqual(len(self.commands), 1)

    def test_unconfirmed_schedule_is_not_reported_successful(self):
        with self.assertRaises(RuntimeError):
            self.ensure(lambda args: self.commands.append(args))
        self.assertEqual(self.commands[0][-1], power.OWNER)

    def test_disable_cancels_only_owned_future_one_time_events(self):
        other = self.event(self.target, 'someone.else')
        self.events.extend([other, self.event(self.target)])
        power.cancel_owned(get_events=lambda: self.events, apply=self.apply)
        self.assertEqual(self.events, [other])
        self.assertNotIn('cancelall', str(self.commands))
        self.assertNotIn('repeat', str(self.commands))

    def test_repeating_and_other_event_types_are_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'wake.plist'
            repeat = {'RepeatingPowerOn': {'eventtype': 'wake', 'weekdays': 127, 'time': 570},
                      'RepeatingPowerOff': {'eventtype': 'sleep', 'weekdays': 127, 'time': 1200}}
            value = {**repeat, 'wake': [self.event(self.target, 'com.apple.calendar')],
                     'poweron': [{'scheduledby': 'someone.else'}]}
            path.write_bytes(plistlib.dumps(value))
            self.assertEqual(len(power.read_events(path)), 1)
            self.assertEqual(power.owned(power.read_events(path)), [])
            self.assertEqual(plistlib.loads(path.read_bytes())['RepeatingPowerOff'], repeat['RepeatingPowerOff'])

    def test_next_wake_handles_exact_slot_and_year_boundary(self):
        self.assertEqual(power.next_slot(self.now, 9, 30), self.target)
        early = self.now.replace(hour=8)
        self.assertEqual(power.next_slot(early, 9, 30), self.now)
        with self.assertRaises(ValueError):
            power.next_slot(self.now, 25, 0)

    def test_user_cannot_change_power_settings_without_admin(self):
        with patch.object(power.os, 'geteuid', return_value=501), patch.object(power, 'pmset') as apply:
            with self.assertRaises(PermissionError):
                with power.root_lock():
                    apply(['schedule'])
            apply.assert_not_called()


if __name__ == '__main__':
    unittest.main()
