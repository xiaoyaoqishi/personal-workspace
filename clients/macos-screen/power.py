#!/usr/bin/env python3
"""Own only named one-time wake events; root never reads screen data or credentials."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import tempfile
import time
from uuid import uuid4

LABEL = 'com.discipline.screen-wake'
OWNER = 'com.discipline.screen-sync.wake'
TEST_PREFIX = 'com.discipline.screen-sync.test.'
ROOT = Path('/Library/Application Support/DisciplineScreenWake')
JOB = Path('/Library/LaunchDaemons') / (LABEL + '.plist')
AUTO_WAKE = Path('/Library/Preferences/SystemConfiguration/com.apple.AutoWake.plist')


def clock():
    return datetime.now().astimezone().replace(microsecond=0)


def read_events(path=AUTO_WAKE):
    if not path.exists():
        return []
    with path.open('rb') as stream:
        value = plistlib.load(stream)
    # Repeating schedules and other event types are deliberately outside our scope.
    return [event for event in value.get('wake', []) if isinstance(event, dict)]


def owned(events, owner=OWNER):
    return [event for event in events if event.get('scheduledby') == owner and event.get('eventtype') == 'wake']


def event_time(event):
    value = event['time']
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone()


def next_slot(now, hour, minute):
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError('invalid schedule')
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    # An event in the present/past cannot wake the next sleeping session.
    return target if target > now + timedelta(seconds=5) else target + timedelta(days=1)


def pmset(arguments):
    subprocess.run(['/usr/bin/pmset'] + arguments, check=True, capture_output=True, text=True, timeout=15)


def event_arguments(action, at, owner):
    return ['schedule'] + (['cancel'] if action == 'cancel' else []) + ['wake', at.astimezone().strftime('%m/%d/%y %H:%M:%S'), owner]


def ensure_wake(target, owner=OWNER, get_events=read_events, apply=pmset, pause=time.sleep):
    target = target.replace(microsecond=0)
    current = owned(get_events(), owner)
    if not any(event_time(event) == target for event in current):
        apply(event_arguments('add', target, owner))
        for attempt in range(10):
            if any(event_time(event) == target for event in owned(get_events(), owner)):
                break
            pause(.2)
        else:
            raise RuntimeError('系统尚未确认唤醒计划，不能宣称已启用')
    # Schedule the replacement first; cancel only this exact owner's other events.
    for event in current:
        at = event_time(event)
        if at != target and at > clock():
            apply(event_arguments('cancel', at, owner))
    return target.isoformat()


def cancel_owned(owner=OWNER, get_events=read_events, apply=pmset):
    for event in owned(get_events(), owner):
        at = event_time(event)
        if at > clock():
            apply(event_arguments('cancel', at, owner))


def require_root():
    if os.geteuid() != 0:
        raise PermissionError('设置定时唤醒需要管理员权限，请使用 sudo；无需提供上传凭证')


@contextmanager
def root_lock():
    require_root()
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o755)
    info = ROOT.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise PermissionError('唤醒工具目录必须为 root 所有，且不可由其他用户写入')
    path = ROOT / '.lock'
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def atomic(path, data, mode=0o644):
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix='.screen-wake-')
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_status(value):
    atomic(ROOT / 'wake-status.json', json.dumps({**value, 'updated_at': clock().isoformat()}, ensure_ascii=False, indent=2).encode())


def install(hour, minute):
    with root_lock():
        next_slot(clock(), hour, minute)  # Validate before mutation.
        installed = ROOT / 'power.py'
        atomic(installed, Path(__file__).read_bytes())
        job = {'Label': LABEL, 'ProgramArguments': ['/usr/bin/python3', '-I', str(installed), 'schedule', '--hour', str(hour), '--minute', str(minute)],
               'RunAtLoad': True, 'StartCalendarInterval': {'Hour': hour, 'Minute': minute},
               'ProcessType': 'Background', 'StandardOutPath': str(ROOT / 'scheduler.log'),
               'StandardErrorPath': str(ROOT / 'scheduler-error.log'), 'Umask': 0o077}
        atomic(JOB, plistlib.dumps(job))
        upcoming = ensure_wake(next_slot(clock(), hour, minute))
        subprocess.run(['/bin/launchctl', 'bootout', 'system/' + LABEL], capture_output=True)
        subprocess.run(['/bin/launchctl', 'bootstrap', 'system', str(JOB)], check=True)
        write_status({'status': 'enabled', 'hour': hour, 'minute': minute, 'next_wake': upcoming})
        return {'status': 'enabled', 'next_wake': upcoming, 'owner': OWNER}


def status():
    future = sorted(event_time(event).isoformat() for event in owned(read_events()) if event_time(event) > clock())
    service = subprocess.run(['/bin/launchctl', 'print', 'system/' + LABEL], capture_output=True)
    return {'status': 'enabled' if service.returncode == 0 and future else 'not_ready',
            'scheduler_loaded': service.returncode == 0, 'next_wakes': future, 'owner': OWNER}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['install', 'schedule', 'status', 'disable', 'test-wake', 'cancel-test'])
    parser.add_argument('--hour', type=int, default=8)
    parser.add_argument('--minute', type=int, default=0)
    parser.add_argument('--after', type=int, default=120)
    parser.add_argument('--owner')
    args = parser.parse_args()
    try:
        if args.command == 'status':
            result = status()
        elif args.command == 'install':
            result = install(args.hour, args.minute)
        else:
            with root_lock():
                if args.command == 'schedule':
                    upcoming = ensure_wake(next_slot(clock(), args.hour, args.minute))
                    result = {'status': 'enabled', 'next_wake': upcoming}
                    write_status({**result, 'hour': args.hour, 'minute': args.minute})
                elif args.command == 'disable':
                    subprocess.run(['/bin/launchctl', 'bootout', 'system/' + LABEL], capture_output=True)
                    cancel_owned()
                    if JOB.exists(): JOB.unlink()
                    result = {'status': 'disabled'}
                    write_status(result)
                elif args.command == 'test-wake':
                    if not 60 <= args.after <= 600:
                        raise ValueError('测试唤醒需安排在60至600秒后')
                    owner = TEST_PREFIX + uuid4().hex
                    upcoming = ensure_wake(clock() + timedelta(seconds=args.after), owner)
                    result = {'status': 'test_scheduled', 'owner': owner, 'wake_at': upcoming}
                else:
                    if not args.owner or not re.fullmatch(re.escape(TEST_PREFIX) + r'[0-9a-f]{32}', args.owner):
                        raise ValueError('只能取消本工具创建的测试事件')
                    cancel_owned(args.owner)
                    result = {'status': 'test_cancelled', 'owner': args.owner}
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({'status': 'error', 'message': str(error)}, ensure_ascii=False), flush=True)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
