import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('screen_install', Path(__file__).resolve().parents[1] / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallScheduleTests(unittest.TestCase):
    def test_changing_time_keeps_runtime_and_agent_in_sync_without_changing_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            support = root / 'support'; support.mkdir()
            original = {'server': 'https://example.com', 'account': 'synthetic-test',
                        'collector_id': '0' * 32, 'hour': 9, 'minute': 30}
            config = support / 'config.json'; config.write_text(json.dumps(original))
            agent = root / 'agents/screen.plist'
            with patch.object(installer, 'SUPPORT', support), patch.object(installer, 'LOGS', root / 'logs'), patch.object(installer, 'AGENT', agent):
                installer.prepare_agent(8, 0)
                updated = json.loads(config.read_text())
                self.assertEqual(updated, {**original, 'hour': 8, 'minute': 0})
                self.assertEqual(plistlib.loads(agent.read_bytes())['StartCalendarInterval'], {'Hour': 8, 'Minute': 0})
                self.assertEqual(config.stat().st_mode & 0o777, 0o600)
                with self.assertRaises(ValueError):
                    installer.prepare_agent(24, 0)
                self.assertEqual(json.loads(config.read_text()), updated)


if __name__ == '__main__':
    unittest.main()
