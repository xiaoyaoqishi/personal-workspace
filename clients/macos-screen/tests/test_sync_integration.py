"""Synthetic Biome + real loopback HTTP, isolated from the user's server and cache."""
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from test_sync import sync, write_source


class IntegrationTests(unittest.TestCase):
    def test_sleep_makeup_late_arrival_and_lost_response_are_idempotent(self):
        records, posts = set(), []
        drop = [True]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def respond(self, value):
                payload = json.dumps(value).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            def do_GET(self):
                if self.path != '/api/discipline/screen/collector/status':
                    self.send_error(404); return
                self.respond({'id': '0' * 32, 'username': 'synthetic-test'})
            def do_POST(self):
                if self.path != '/api/discipline/screen/collector/imports':
                    self.send_error(404); return
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                posts.append(body)
                fingerprints = {sync.fingerprint(event) for event in body['events']}
                added = len(fingerprints - records)
                records.update(fingerprints)
                if drop[0]:
                    drop[0] = False  # server committed but acknowledgement was lost
                    self.close_connection = True
                    return
                self.respond({'received': len(body['events']), 'added': added,
                              'duplicates': len(body['events']) - added})
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'source'; write_source(root, [100, 200])
                state = Path(directory) / 'state'; state.mkdir()
                config = {'server': f'http://127.0.0.1:{server.server_port}', 'account': 'synthetic-test', 'collector_id': '0' * 32}
                token = 'dsc_' + '0' * 32 + '.synthetic-only'
                sync.write_status(state, {'last_success': '2026-11-25T09:30:01+08:00'})
                awakened = datetime(2026, 11, 26, 11, tzinfo=ZoneInfo('Asia/Shanghai'))
                with patch.object(sync, 'utcnow', return_value=awakened):
                    with self.assertRaises(sync.SyncError):
                        sync.synchronize(state, config, token, source=root)
                    self.assertEqual(sync.read_status(state)['last_success'], '2026-11-25T09:30:01+08:00')
                    recovered = sync.synchronize(state, config, token, source=root)
                    self.assertEqual((recovered['uploaded_events'], recovered['server_added'], recovered['pending_events']), (2, 0, 0))
                    skipped = sync.synchronize(state, config, token, source=root)
                    self.assertEqual(skipped['status'], 'skipped')
                    path = root / 'local/12345'; previous_stat = path.stat()
                    write_source(root, [50, 100, 200])
                    os.utime(path, ns=(previous_stat.st_atime_ns, previous_stat.st_mtime_ns))
                    late = sync.synchronize(state, config, token, force=True, source=root)
                    self.assertEqual((late['new_local_events'], late['server_added'], late['pending_events']), (1, 1, 0))
                    replay = sync.synchronize(state, config, token, force=True, source=root, replay=True)
                    self.assertEqual((replay['uploaded_events'], replay['server_added']), (3, 0))
                self.assertEqual(len(records), 3)
                self.assertEqual(len(posts), 4)
                self.assertTrue(all(event['app'] == 'com.example.notes' for post in posts for event in post['events']))
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
