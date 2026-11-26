#!/usr/bin/env python3
"""Daily Biome synchronization. Only Python's standard library is required."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
from biome_screentime import devices, events, to_datetime
from biome_screentime.infocus import stream_files

DEFAULT_STATE = Path.home() / 'Library/Application Support/DisciplineScreen'
DEFAULT_SOURCE = Path.home() / 'Library/Biome/streams/restricted/App.InFocus'
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
SERVICE = 'com.discipline.screen-sync'


class SyncError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def utcnow():
    return datetime.now(timezone.utc)


def server_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in {'127.0.0.1', 'localhost', '::1'})):
        raise SyncError('configuration', '服务器必须使用HTTPS')
    if not parsed.hostname or parsed.username or parsed.password or parsed.path not in {'', '/'} or parsed.query or parsed.fragment:
        raise SyncError('configuration', '服务器地址必须为不带账号、路径或参数的站点地址')
    return value.rstrip('/')


def read_config(state):
    try:
        config = json.loads((state / 'config.json').read_text())
        config['server'] = server_origin(config['server'])
        if not re.fullmatch(r'[0-9a-f]{32}', config['collector_id']) or not config['account'].strip():
            raise ValueError('account')
        if not 0 <= config.get('hour', 9) <= 23 or not 0 <= config.get('minute', 30) <= 59:
            raise ValueError('schedule')
        ZoneInfo(config.get('timezone', 'Asia/Shanghai'))
        if 'token' in config:
            raise ValueError('plaintext token')
        return config
    except (KeyError, ValueError, TypeError, OSError) as exc:
        raise SyncError('configuration', '采集器尚未正确配置；凭证应存放在钥匙串') from exc


def due(now, last_success, hour=9, minute=30):
    if not last_success:
        return True
    previous = datetime.fromisoformat(last_success).astimezone(now.tzinfo)
    if previous.date() >= now.date():
        return False
    slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now < slot:
        slot -= timedelta(days=1)
    return previous < slot


def fingerprint(event):
    value = datetime.fromisoformat(event['time'].replace('Z', '+00:00')).astimezone(timezone.utc) - EPOCH
    us = (value.days * 86400 + value.seconds) * 1_000_000 + value.microseconds
    identity = json.dumps([event['device'], us, event['app'], event['starting']], separators=(',', ':'))
    return hashlib.sha256(identity.encode()).hexdigest()


def source_devices(source, config):
    # Explicit scandir catches TCC denials that os.walk would otherwise silently suppress.
    list(source.iterdir())
    known = dict(config.get('devices', {}))
    if source == DEFAULT_SOURCE:
        try:
            with sqlite3.connect('file:' + str(source.parents[2] / 'sync/sync.db') + '?mode=ro', uri=True) as db:
                for key, name, platform, me in db.execute('SELECT device_identifier,name,platform,me FROM DevicePeer'):
                    kind = {1: 'ipad', 2: 'iphone', 3: 'mac', 4: 'mac'}.get(platform, 'other')
                    mapped = 'local' if me else key
                    known.setdefault(mapped, {'name': name or {'ipad':'iPad','iphone':'iPhone','mac':'Mac'}.get(kind, '设备-'+key[:8]), 'kind': kind})
        except sqlite3.Error:
            pass  # Configured names and stable stream UUIDs still work without sync metadata.
    result = []
    for device in devices(str(source)):
        list(Path(device.path).iterdir())
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,120}', device.id):
            raise SyncError('source_format', '发现无法识别的设备标识')
        meta = known.get(device.id, {'name': 'Mac' if device.id == 'local' else '设备-'+device.short_id,
                                    'kind': 'mac' if device.id == 'local' else 'other'})
        result.append((device, {'key': device.id, 'name': meta['name'], 'kind': meta['kind']}))
    return result


class Outbox:
    def __init__(self, path, target):
        self.target = target
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE IF NOT EXISTS events(target TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(target,fingerprint))')
        self.db.execute('CREATE TABLE IF NOT EXISTS devices(target TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(target,key))')
        self.db.commit()
        os.chmod(path, 0o600)

    def scan(self, source, config):
        count = added = files = 0
        with self.db:
            for device, metadata in source_devices(source, config):
                self.db.execute('INSERT OR REPLACE INTO devices VALUES (?,?,?)', (self.target, device.id, json.dumps(metadata)))
                for file in stream_files(device):
                    with open(file, 'rb') as stream:
                        header = stream.read(56)
                    if header[:4] != b'SEGB' and header[52:56] != b'SEGB':
                        raise SyncError('source_format', 'Biome格式已变化，暂停上传以免产生错误统计')
                    files += 1
                for event in events(device):
                    item = {'device': device.id, 'time': to_datetime(event.time).isoformat(),
                            'app': event.app, 'starting': event.starting}
                    cur = self.db.execute('INSERT OR IGNORE INTO events(target,fingerprint,payload) VALUES (?,?,?)',
                        (self.target, fingerprint(item), json.dumps(item, separators=(',', ':'))))
                    count += 1
                    added += cur.rowcount
        if not files or not count:
            raise SyncError('no_source', '尚未找到屏幕活动数据，请检查屏幕时间与跨设备共享')
        return {'scanned_events': count, 'new_local_events': added, 'files': files}

    def batch(self, limit=1000):
        rows = self.db.execute('SELECT fingerprint,payload FROM events WHERE target=? AND acknowledged=0 ORDER BY rowid LIMIT ?',
                              (self.target, limit)).fetchall()
        if not rows:
            return None
        values = [json.loads(row[1]) for row in rows]
        keys = {event['device'] for event in values}
        metadata = [json.loads(row[0]) for row in self.db.execute('SELECT payload FROM devices WHERE target=?', (self.target,))]
        return [row[0] for row in rows], {'version': 1, 'source': 'Biome App.InFocus',
            'devices': [value for value in metadata if value['key'] in keys], 'events': values}

    def acknowledge(self, keys):
        with self.db:
            self.db.executemany('UPDATE events SET acknowledged=1 WHERE target=? AND fingerprint=?', [(self.target, key) for key in keys])

    def counts(self):
        total, pending = self.db.execute('SELECT count(*),sum(acknowledged=0) FROM events WHERE target=?', (self.target,)).fetchone()
        return {'cached_events': total, 'pending_events': pending or 0}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise SyncError('redirect', '服务器返回重定向，已停止以保护上传凭证；请检查服务器地址')


class UploadClient:
    def __init__(self, config, token):
        if not token.startswith('dsc_' + config['collector_id'] + '.'):
            raise SyncError('credential', '钥匙串凭证与当前采集配置不匹配')
        self.config, self.token = config, token
        self.opener = build_opener(NoRedirect())

    def request(self, endpoint, body=None):
        payload = json.dumps(body).encode() if body is not None else None
        request = Request(self.config['server'] + '/api/discipline/screen/collector/' + endpoint,
            data=payload, headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'},
            method='POST' if body is not None else 'GET')
        try:
            with self.opener.open(request, timeout=60) as response:
                data = json.loads(response.read(2_000_000))
        except HTTPError as exc:
            message = '上传凭证已失效或账户权限受限' if exc.code in {401,403} else '服务器暂时无法接收记录'
            raise SyncError('http_' + str(exc.code), message) from None
        except (URLError, TimeoutError, OSError):
            raise SyncError('network', '连接服务器失败，待上传记录已保留，下次运行将重试') from None
        except (ValueError, UnicodeError):
            raise SyncError('response', '服务器响应格式不正确，未确认本批记录') from None
        return data

    def verify_account(self):
        identity = self.request('status')
        if identity.get('id') != self.config['collector_id'] or identity.get('username') != self.config['account']:
            raise SyncError('account', '服务器返回的账户与采集配置不一致，已停止上传')

    def upload(self, body):
        data = self.request('imports', body)
        size = len(body['events'])
        if (data.get('received') != size or type(data.get('added')) is not int or type(data.get('duplicates')) is not int
                or data['added'] < 0 or data['duplicates'] < 0 or data['added'] + data['duplicates'] != size):
            raise SyncError('response', '服务器未完整确认此批记录，已保留待重试')
        return data


def read_status(state):
    try:
        return json.loads((state / 'status.json').read_text())
    except (OSError, ValueError):
        return {}


def write_status(state, value):
    path = state / 'status.json'
    temporary = state / 'status.json.new'
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    os.chmod(temporary, 0o600)
    temporary.replace(path)


@contextmanager
def exclusive(state):
    with (state / '.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SyncError('busy', '已有同步任务正在运行')
        yield


def synchronize(state, config, token, force=False, source=None, replay=False):
    previous = read_status(state)
    now = utcnow()
    local = now.astimezone(ZoneInfo(config.get('timezone', 'Asia/Shanghai')))
    if not force and not due(local, previous.get('last_success'), config.get('hour',9), config.get('minute',30)):
        return {'status': 'skipped', 'message': '本日任务已完成或尚未到执行时间'}
    target = config['server'] + '\n' + config['account']
    outbox = Outbox(state / 'outbox.sqlite3', target)
    report = {**previous, 'last_attempt': now.isoformat(), 'status': 'running'}
    write_status(state, report)
    try:
        chosen = Path(source).expanduser() if source else DEFAULT_SOURCE
        report.update(outbox.scan(chosen, config))
        client = UploadClient(config, token)
        client.verify_account()
        if replay:
            with outbox.db:
                outbox.db.execute('UPDATE events SET acknowledged=0 WHERE target=?', (target,))
        added = sent = 0
        while True:
            batch = outbox.batch()
            if batch is None:
                break
            keys, body = batch
            result = client.upload(body)
            outbox.acknowledge(keys)
            added += result['added']
            sent += len(keys)
        report.update(outbox.counts())
        report.update(status='success', last_success=utcnow().isoformat(), uploaded_events=sent,
                      server_added=added, error_code=None, message='同步成功')
        write_status(state, report)
        return report
    except PermissionError:
        error = SyncError('permission', '请为DisciplineScreen开启完全磁盘访问权限，Terminal的授权不代表后台程序已有权限')
    except FileNotFoundError:
        error = SyncError('no_source', '尚未找到Biome屏幕活动数据')
    except SyncError as exc:
        error = exc
    except Exception:
        error = SyncError('source_format', '数据解析未完成，已保留队列；请查看格式兼容性')
    finally:
        outbox.db.close()
    report.update(status='error', error_code=error.code, message=str(error))
    write_status(state, report)
    raise error


def main(argv=None):
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['sync', 'status', 'check-access'])
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--replay', action='store_true')
    args = parser.parse_args(argv)
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.state_dir, 0o700)
    try:
        if args.command == 'check-access':
            root = args.source or DEFAULT_SOURCE
            pairs = source_devices(root, {})
            for device, metadata in pairs:
                for path in stream_files(device):
                    with open(path, 'rb') as stream:
                        stream.read(56)
            result = {'status': 'readable', 'devices': len(pairs)}
        elif args.command == 'status':
            result = read_status(args.state_dir)
            try:
                config = read_config(args.state_dir)
                outbox = Outbox(args.state_dir / 'outbox.sqlite3', config['server'] + '\n' + config['account'])
                result = {**result, **outbox.counts(), 'server': config['server'], 'account': config['account']}
                outbox.db.close()
            except SyncError:
                result['configured'] = False
        else:
            config = read_config(args.state_dir)
            secret = json.loads(sys.stdin.read(8192)).get('token', '')
            with exclusive(args.state_dir):
                result = synchronize(args.state_dir, config, secret, args.force, args.source, args.replay)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (PermissionError, SyncError, ValueError, OSError) as exc:
        error = exc if isinstance(exc, SyncError) else SyncError('permission' if isinstance(exc, PermissionError) else 'configuration',
            '需要开启DisciplineScreen的完全磁盘访问权限' if isinstance(exc, PermissionError) else '采集配置或数据源不可用')
        print(json.dumps({'status':'error', 'error_code':error.code, 'message':str(error)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.exit(main())
