#!/usr/bin/env python3
"""Bounded retries for the user LaunchAgent; never reads the upload credential."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import time

APP = '/Applications/DisciplineScreen.app/Contents/MacOS/DisciplineScreen'
STATE = Path.home() / 'Library/Application Support/DisciplineScreen'
RETRY_DELAYS = (15, 45)
RETRY_CODES = {'network', 'http_408', 'http_429', 'http_500', 'http_502', 'http_503', 'http_504', 'timeout'}


def invoke(arguments, timeout=120):
    try:
        process = subprocess.Popen([APP] + arguments, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   text=True, start_new_session=True)
    except OSError:
        return {'status': 'error', 'error_code': 'process', 'message': '未能启动采集器，请检查应用安装'}
    try:
        output, _ = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        return {'status': 'error', 'error_code': 'timeout', 'message': '采集超时，未确认记录会在下次重试'}
    try:
        result = json.loads(output.strip().splitlines()[-1])
        if not isinstance(result, dict):
            raise ValueError('result')
    except (ValueError, IndexError):
        return {'status': 'error', 'error_code': 'response', 'message': '采集器未返回有效状态'}
    if process.returncode and result.get('status') != 'error':
        return {'status': 'error', 'error_code': 'process', 'message': '采集器未正常结束'}
    return result


def run(force=False, execute=invoke, pause=time.sleep):
    for attempt in range(3):
        result = execute(['sync'] + (['--force'] if force else []))
        result = {**result, 'attempts': attempt + 1}
        if result.get('status') != 'error' or result.get('error_code') not in RETRY_CODES or attempt == 2:
            return result
        pause(RETRY_DELAYS[attempt])


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / 'daily.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'status': 'skipped', 'message': '已有每日采集任务运行中'}))
            return 0
        result = run(args.force)
        report = {**result, 'finished_at': datetime.now(timezone.utc).isoformat()}
        temporary = STATE / 'daily-status.json.new'
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        temporary.replace(STATE / 'daily-status.json')
        print(json.dumps(report, ensure_ascii=False), flush=True)
        return 2 if result.get('status') == 'error' else 0


if __name__ == '__main__':
    raise SystemExit(main())
