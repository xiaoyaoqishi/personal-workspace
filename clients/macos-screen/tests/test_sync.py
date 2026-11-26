import importlib.util
import json
from datetime import datetime
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib
from zoneinfo import ZoneInfo

spec=importlib.util.spec_from_file_location('screen_sync',Path(__file__).resolve().parents[1]/'sync.py')
sync=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def varint(value):
    result=b''
    while value>127:
        result+=bytes([(value&127)|128]);value>>=7
    return result+bytes([value])


def write_source(root,offsets):
    path=root/'local';path.mkdir(parents=True,exist_ok=True)
    payloads=[]
    for offset in offsets:
        app=b'com.example.notes'
        payloads.append(b'\x18\x01\x21'+struct.pack('<d',815000000+offset)+b'\x32'+varint(len(app))+app)
    body=b'';entries=[]
    for payload in payloads:
        body+=b'\0'*((-len(body))%4)
        body+=struct.pack('<II',zlib.crc32(payload)&0xffffffff,0)+payload
        entries.append(struct.pack('<iid',len(body),1,815000000.0))
    trailer=b''.join(reversed(entries))
    header=b'SEGB'+struct.pack('<id',len(entries),815000000.0)+b'\0'*16
    (path/'12345').write_bytes(header+body+b'\0'*(4096-len(header)-len(body)-len(trailer))+trailer)


class SyncTests(unittest.TestCase):
    def test_daily_schedule_login_makeup_and_one_success_per_day(self):
        zone=ZoneInfo('Asia/Shanghai')
        now=datetime(2026,11,26,8,tzinfo=zone)
        self.assertFalse(sync.due(now,'2026-11-25T09:31:00+08:00'))
        self.assertTrue(sync.due(now,'2026-11-24T09:31:00+08:00'))
        self.assertTrue(sync.due(now.replace(hour=10),'2026-11-25T09:31:00+08:00'))
        self.assertFalse(sync.due(now.replace(hour=10),'2026-11-26T07:00:00+08:00'))

    def test_late_events_are_queued_even_when_file_mtime_does_not_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)/'source'
            write_source(root,[100,200])
            outbox=sync.Outbox(Path(temporary)/'queue.db','target')
            self.assertEqual(outbox.scan(root,{})['new_local_events'],2)
            keys,body=outbox.batch()
            self.assertEqual(len(body['events']),2)
            outbox.acknowledge(keys)
            write_source(root,[50,100,200]) # a historical event arrives after newer events were acknowledged
            self.assertEqual(outbox.scan(root,{})['new_local_events'],1)
            keys,body=outbox.batch()
            self.assertEqual(len(body['events']),1)
            self.assertEqual(outbox.counts()['pending_events'],1)
            # A second scan does not duplicate the pending event.
            self.assertEqual(outbox.scan(root,{})['new_local_events'],0)
            outbox.db.close()

    def test_target_accounts_are_isolated(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)/'source';write_source(root,[100])
            database=Path(temporary)/'queue.db'
            first=sync.Outbox(database,'first');first.scan(root,{})
            first.acknowledge(first.batch()[0]);first.db.close()
            second=sync.Outbox(database,'second');second.scan(root,{})
            self.assertEqual(second.counts()['pending_events'],1)
            second.db.close()

    def test_upload_failure_preserves_queue_and_does_not_mark_success(self):
        class Offline:
            def __init__(self,*args):pass
            def verify_account(self):pass
            def upload(self,body):raise sync.SyncError('network','offline')
        with tempfile.TemporaryDirectory() as temporary:
            state=Path(temporary)/'state';state.mkdir()
            root=Path(temporary)/'source';write_source(root,[100])
            config={'server':'https://example.com','account':'test','collector_id':'0'*32}
            with patch.object(sync,'UploadClient',Offline),self.assertRaises(sync.SyncError):
                sync.synchronize(state,config,'token',force=True,source=root)
            status=sync.read_status(state)
            self.assertNotIn('last_success',status)
            self.assertEqual(status['status'],'error')
            outbox=sync.Outbox(state/'outbox.sqlite3','https://example.com\ntest')
            self.assertEqual(outbox.counts()['pending_events'],1)
            outbox.db.close()

    def test_bad_acknowledgement_and_redirect_are_rejected(self):
        client=sync.UploadClient({'server':'https://example.com','collector_id':'0'*32},'dsc_'+'0'*32+'.secret')
        client.request=lambda *args:{'received':1,'added':0,'duplicates':0}
        with self.assertRaises(sync.SyncError):client.upload({'events':[{}]})
        with self.assertRaises(sync.SyncError):sync.NoRedirect().redirect_request()

    def test_configuration_rejects_non_https_and_embedded_credentials(self):
        for value in ['http://example.com','https://name:password@example.com','https://example.com/redirect','https://example.com?token=x']:
            with self.assertRaises(sync.SyncError):sync.server_origin(value)


if __name__=='__main__':unittest.main()
