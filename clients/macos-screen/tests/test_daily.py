import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('screen_daily', Path(__file__).resolve().parents[1] / 'daily.py')
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)


class DailyTests(unittest.TestCase):
    def test_network_recovery_retries_without_turning_a_failure_into_success(self):
        replies = iter([{'status': 'error', 'error_code': 'network'}, {'status': 'success', 'pending_events': 0}])
        calls, pauses = [], []
        def execute(arguments):
            calls.append(arguments)
            return next(replies)
        result = daily.run(execute=execute, pause=pauses.append)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['attempts'], 2)
        self.assertEqual(pauses, [15])
        self.assertEqual(calls, [['sync'], ['sync']])

    def test_offline_attempts_are_bounded(self):
        pauses = []
        result = daily.run(execute=lambda _: {'status': 'error', 'error_code': 'network'}, pause=pauses.append)
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['attempts'], 3)
        self.assertEqual(pauses, [15, 45])

    def test_permissions_and_revoked_credentials_do_not_retry_or_hide_errors(self):
        for code in ['permission', 'keychain', 'http_401', 'http_403', 'source_format']:
            with self.subTest(code=code):
                result = daily.run(execute=lambda _: {'status': 'error', 'error_code': code},
                                   pause=lambda _: self.fail('should not retry'))
                self.assertEqual(result['attempts'], 1)
                self.assertEqual(result['error_code'], code)

    def test_same_day_skip_stays_a_skip_and_manual_force_is_explicit(self):
        seen = []
        def execute(arguments):
            seen.append(arguments)
            return {'status': 'skipped'}
        self.assertEqual(daily.run(execute=execute)['status'], 'skipped')
        daily.run(True, execute=execute)
        self.assertEqual(seen, [['sync'], ['sync', '--force']])

    def test_timeout_terminates_the_entire_collector_process_group(self):
        import subprocess
        with patch.object(daily.subprocess, 'Popen') as spawn, patch.object(daily.os, 'killpg') as kill:
            process = spawn.return_value
            process.pid = 4321
            process.communicate.side_effect = [subprocess.TimeoutExpired('collector', 120), ('', '')]
            self.assertEqual(daily.invoke(['sync'])['error_code'], 'timeout')
            kill.assert_called_once_with(4321, daily.signal.SIGKILL)
            self.assertTrue(spawn.call_args.kwargs['start_new_session'])


if __name__ == '__main__':
    unittest.main()
