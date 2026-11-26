#!/usr/bin/env python3
"""Build/install the user-level collector. No credentials are stored by this installer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import platform
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
LABEL = 'com.discipline.screen-sync'
APP = Path('/Applications/DisciplineScreen.app')
SUPPORT = Path.home() / 'Library/Application Support/DisciplineScreen'
LOGS = Path.home() / 'Library/Logs/DisciplineScreen'
AGENT = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')


def executable(app=APP):
    return app / 'Contents/MacOS/DisciplineScreen'


def build(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='discipline-screen-build-') as temporary:
        bundle = Path(temporary) / 'DisciplineScreen.app'
        contents = bundle / 'Contents'
        (contents / 'MacOS').mkdir(parents=True)
        (contents / 'Resources').mkdir()
        subprocess.run(['/usr/bin/swiftc', '-O', '-target', platform.machine()+'-apple-macosx13.0', str(HERE / 'Launcher.swift'), '-o', str(executable(bundle)),
                        '-framework', 'AppKit', '-framework', 'Security'], check=True)
        shutil.copy2(HERE / 'sync.py', contents / 'Resources/sync.py')
        shutil.copytree(HERE / 'vendor', contents / 'Resources/vendor', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        info = {'CFBundleIdentifier':LABEL, 'CFBundleName':'DisciplineScreen', 'CFBundleDisplayName':'DisciplineScreen',
                'CFBundleExecutable':'DisciplineScreen', 'CFBundlePackageType':'APPL', 'CFBundleVersion':'1',
                'CFBundleShortVersionString':'1.0.0', 'LSUIElement':True, 'LSMinimumSystemVersion':'13.0'}
        (contents / 'Info.plist').write_bytes(plistlib.dumps(info))
        subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', '--identifier', LABEL, str(bundle)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(bundle)], check=True)
        if destination.exists():
            backup = SUPPORT / 'backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(destination), str(backup))
        shutil.copytree(bundle, destination)


def stop():
    subprocess.run(['/bin/launchctl', 'bootout', 'gui/' + str(os.getuid()) + '/' + LABEL],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def install(hour, minute):
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError('invalid schedule')
    SUPPORT.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(SUPPORT, 0o700)
    stop()
    build(APP)
    LOGS.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(LOGS, 0o700)
    AGENT.parent.mkdir(parents=True, exist_ok=True)
    value = {'Label':LABEL, 'ProgramArguments':[str(executable()), 'sync'],
        'RunAtLoad':True, 'StartCalendarInterval':{'Hour':hour,'Minute':minute},
        'ProcessType':'Background', 'LowPriorityIO':True, 'Nice':10,
        'StandardOutPath':str(LOGS / 'sync.log'), 'StandardErrorPath':str(LOGS / 'error.log')}
    AGENT.write_bytes(plistlib.dumps(value))
    os.chmod(AGENT, 0o600)
    print(json.dumps({'status':'installed','application':str(APP),'agent':str(AGENT),'schedule':f'{hour:02}:{minute:02}',
                      'message':'完成钥匙串配置和权限验证后运行 enable，启用每日任务'},ensure_ascii=False))


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['install','enable','disable','status','uninstall','build'])
    parser.add_argument('--hour',type=int,default=9)
    parser.add_argument('--minute',type=int,default=30)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('此安装器仅适用于macOS')
    if args.command=='install': install(args.hour,args.minute)
    elif args.command=='enable':
        subprocess.run([str(executable()),'check-access'],check=True)
        subprocess.run([str(executable()),'sync','--force'],check=True)
        stop()
        subprocess.run(['/bin/launchctl','bootstrap','gui/'+str(os.getuid()),str(AGENT)],check=True)
        print('每日任务已启用')
    elif args.command=='disable': stop(); print('每日任务已停用，历史记录与凭证保留')
    elif args.command=='status':
        if executable().exists(): subprocess.run([str(executable()),'status'],check=False)
        result=subprocess.run(['/bin/launchctl','print','gui/'+str(os.getuid())+'/'+LABEL],capture_output=True,text=True)
        print(json.dumps({'scheduled':result.returncode==0,'agent':str(AGENT)}))
    elif args.command=='uninstall':
        stop()
        if AGENT.exists(): AGENT.unlink()
        if APP.exists():
            backup=SUPPORT/'backups'/datetime.now(timezone.utc).strftime('uninstalled-%Y%m%dT%H%M%S%f')
            backup.parent.mkdir(parents=True,exist_ok=True)
            shutil.move(str(APP),str(backup))
        print('任务已卸载；本地队列、配置和钥匙串凭证保留，可自行撤销凭证')
    else:
        if not args.output: parser.error('build需要--output路径')
        build(args.output)


if __name__=='__main__': main()
