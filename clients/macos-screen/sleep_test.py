#!/usr/bin/env python3
"""Run in the user's Terminal: schedule an owned wake and verify a real sleep cycle."""
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import time
from uuid import uuid4

import install
import power


def admin(*arguments):
    # sudo reads the password from the user's terminal; this program never reads it.
    command = ['sudo', '/usr/bin/python3', '-I', str(Path(__file__).with_name('power.py'))] + list(arguments)
    result = subprocess.run(command, stdout=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError(result.stdout.strip() or '管理员步骤未完成，未开始休眠测试')
    return json.loads(result.stdout.strip().splitlines()[-1])


def parse_power_events(text, start):
    events = []
    for line in text.splitlines():
        if not any(label in line for label in ('Entering Sleep', 'Wake from', 'DarkWake from',
                                                'Wake Requests', 'com.apple.powermanagement.wakeschedule')):
            continue
        try:
            at = datetime.strptime(line[:25], '%Y-%m-%d %H:%M:%S %z')
        except ValueError:
            continue
        if at >= start:
            events.append({'at': at.isoformat(), 'detail': line})
    return events


def recent_power_events(start):
    result = subprocess.run(['/usr/bin/pmset', '-g', 'log'], capture_output=True, text=True, timeout=20, check=True)
    return parse_power_events(result.stdout, start)


def assess(start, target, result, events, owner):
    sleeps = [event for event in events if 'Entering Sleep' in event['detail']]
    wakes = [event for event in events if 'Wake from' in event['detail'] or 'DarkWake from' in event['detail']]
    scheduled = [event for event in wakes if re.search(r'\b(?:rtc|maintenance)\b', event['detail'], re.IGNORECASE)
                 and abs((datetime.fromisoformat(event['at']) - target).total_seconds()) <= 20]
    expected = 'wakeAt=' + target.strftime('%Y-%m-%d %H:%M:%S')
    requested = any(expected in segment and re.search(r'info="' + re.escape(owner) + r'(?:,|")', segment)
                    for event in events if 'Wake Requests' in event['detail']
                    for segment in re.findall(r'\[[^\]]+\]', event['detail']))
    activated = any('Created' in event['detail'] and '(powerd)' in event['detail']
                    and 'com.apple.powermanagement.wakeschedule' in event['detail']
                    and abs((datetime.fromisoformat(event['at']) - target).total_seconds()) <= 20
                    for event in events)
    ordered = any(datetime.fromisoformat(sleep['at']) < datetime.fromisoformat(wake['at'])
                  for sleep in sleeps for wake in scheduled)
    synchronized = result.get('status') == 'success' and result.get('pending_events') == 0
    try:
        completed_after_wake = any(datetime.fromisoformat(result['finished_at']) >= datetime.fromisoformat(wake['at'])
                                   for wake in scheduled)
    except (KeyError, ValueError, TypeError):
        completed_after_wake = False
    return {'verified': bool(ordered and requested and activated and synchronized and completed_after_wake), 'sleep_observed': bool(sleeps),
            'wake_observed': bool(wakes), 'scheduled_wake_observed': bool(scheduled),
            'owned_wake_requested': requested, 'system_schedule_activated': activated,
            'upload_confirmed': synchronized, 'sync_after_wake': completed_after_wake,
            'expected_wake': target.isoformat(), 'started_at': start.isoformat(), 'wake_owner': owner}


def main():
    os.umask(0o077)
    if not sys.stdin.isatty():
        raise SystemExit('请在你自己的终端运行此测试，以便 macOS 验证管理员密码；无需把密码交给采集器')
    config = json.loads((install.SUPPORT / 'config.json').read_text())
    hour, minute = config.get('hour', 8), config.get('minute', 0)
    print(f'将启用每日{hour:02}:{minute:02}唤醒，并进行约2分钟的真实休眠测试。测试不会上传模拟记录；唤醒后采集真实数据。', flush=True)
    install.prepare_agent(hour, minute)
    install.run_background()  # Verify privacy, Keychain and network before sleeping.
    install.stop()
    domain = 'gui/' + str(os.getuid())
    subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(install.AGENT)], check=True)
    print(json.dumps({'daily_wake': admin('install', '--hour', str(hour), '--minute', str(minute))}, ensure_ascii=False), flush=True)
    start = datetime.now().astimezone().replace(microsecond=0)
    directory = install.SUPPORT / 'sleep-tests' / uuid4().hex
    directory.mkdir(parents=True, mode=0o700)
    label = install.LABEL + '.sleep-test.' + directory.name
    job, out, err = directory / 'job.plist', directory / 'sync.log', directory / 'error.log'
    for path in (out, err): path.touch(mode=0o600)
    report = {'verified': False, 'message': '测试尚未完成'}
    test = None
    try:
        test = admin('test-wake', '--after', '120')
        target = datetime.fromisoformat(test['wake_at'])
        # This slot falls during sleep; launchd must deliver it on scheduled wake.
        calendar = {'Month': target.month, 'Day': target.day, 'Hour': target.hour, 'Minute': target.minute}
        job.write_bytes(plistlib.dumps({'Label': label, 'ProgramArguments': install.agent_arguments() + ['--force'],
            'StartCalendarInterval': calendar, 'StandardOutPath': str(out), 'StandardErrorPath': str(err), 'Umask': 0o077}))
        subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(job)], check=True)
        print(f'唤醒计划已确认：{target.isoformat()}。现在休眠；若超时未唤醒，请手动唤醒后查看报告。', flush=True)
        subprocess.run(['/usr/bin/pmset', 'sleepnow'], check=True, capture_output=True)
        deadline = target + timedelta(minutes=7)
        while datetime.now().astimezone() < deadline:
            if out.stat().st_size:
                break
            time.sleep(.5)
        result = json.loads(out.read_text().strip().splitlines()[-1]) if out.stat().st_size else {'status': 'error', 'message': '未观察到后台采集结果'}
        events = recent_power_events(start)
        report = {**assess(start, target, result, events, test['owner']), 'sync': result, 'power_events': events}
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        report = {'verified': False, 'message': str(error)}
    finally:
        subprocess.run(['/bin/launchctl', 'bootout', domain + '/' + label], capture_output=True)
        try:
            if test and any(power.event_time(event) > power.clock() for event in power.owned(power.read_events(), test['owner'])):
                admin('cancel-test', '--owner', test['owner'])
        except RuntimeError as error:
            report['cleanup_error'] = str(error)
        (directory / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({**report, 'report_path': str(directory / 'report.json')}, ensure_ascii=False), flush=True)
    return 0 if report.get('verified') else 2


if __name__ == '__main__':
    raise SystemExit(main())
