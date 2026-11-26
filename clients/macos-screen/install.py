#!/usr/bin/env python3
"""Build/install the user-level collector. No credentials are stored by this installer."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from uuid import uuid4
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
    prepare_agent(hour, minute)
    print(json.dumps({'status':'installed','application':str(APP),'agent':str(AGENT),'schedule':f'{hour:02}:{minute:02}',
                      'message':'完成钥匙串配置和权限验证后运行 enable，启用每日任务'},ensure_ascii=False))


def agent_arguments():
    # Keep only this bounded task awake. Do not change global sleep/display settings.
    return ['/usr/bin/caffeinate', '-i', '-s', '/usr/bin/python3', '-I', str(SUPPORT / 'daily.py')]


def prepare_agent(hour, minute):
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError('invalid schedule')
    SUPPORT.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(SUPPORT, 0o700)
    config_path = SUPPORT / 'config.json'
    if config_path.exists():
        config = json.loads(config_path.read_text())
        config.update(hour=hour, minute=minute)
        temporary = SUPPORT / 'config.json.new'
        temporary.write_text(json.dumps(config, ensure_ascii=False, indent=2))
        os.chmod(temporary, 0o600)
        temporary.replace(config_path)
    shutil.copy2(HERE / 'daily.py', SUPPORT / 'daily.py')
    os.chmod(SUPPORT / 'daily.py', 0o600)
    LOGS.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(LOGS, 0o700)
    AGENT.parent.mkdir(parents=True, exist_ok=True)
    value = {'Label':LABEL, 'ProgramArguments':agent_arguments(),
        'RunAtLoad':True, 'StartCalendarInterval':{'Hour':hour,'Minute':minute},
        'ProcessType':'Background', 'LowPriorityIO':True, 'Nice':10,
        'StandardOutPath':str(LOGS / 'sync.log'), 'StandardErrorPath':str(LOGS / 'error.log'), 'Umask':0o077}
    AGENT.write_bytes(plistlib.dumps(value))
    os.chmod(AGENT, 0o600)


def loaded():
    return subprocess.run(['/bin/launchctl','print','gui/'+str(os.getuid())+'/'+LABEL],capture_output=True).returncode == 0


def run_background():
    """Validate with launchd's actual privacy identity, not the invoking terminal's."""
    probes = SUPPORT / 'probes'
    probes.mkdir(parents=True, exist_ok=True, mode=0o700)
    label = LABEL + '.validation.' + uuid4().hex
    job = probes / (label + '.plist')
    out, err = probes / (label + '.log'), probes / (label + '.error.log')
    for path in (out, err):
        path.touch(mode=0o600)
    job.write_bytes(plistlib.dumps({'Label':label, 'ProgramArguments':agent_arguments()+['--force'],
        'RunAtLoad':True, 'StandardOutPath':str(out), 'StandardErrorPath':str(err), 'Umask':0o077}))
    os.chmod(job,0o600)
    domain = 'gui/'+str(os.getuid())
    try:
        subprocess.run(['/bin/launchctl','bootstrap',domain,str(job)],check=True)
        deadline = time.monotonic()+450
        while time.monotonic()<deadline:
            if out.stat().st_size:
                try:
                    result=json.loads(out.read_text().splitlines()[-1])
                except (ValueError, IndexError):
                    time.sleep(.25)
                    continue
                print(json.dumps({'background_validation':result},ensure_ascii=False),flush=True)
                if result.get('status') != 'success':
                    raise RuntimeError('后台采集尚未成功；查看上方错误，现有任务未宣称验证通过')
                return result
            time.sleep(.25)
        raise RuntimeError('后台验证超时；检查私有 probes 日志')
    finally:
        subprocess.run(['/bin/launchctl','bootout',domain+'/'+label],capture_output=True)


def warn_wake():
    # User-level disable cannot silently remove a root-managed wake event.
    print('如已启用定时唤醒，请另用 sudo /usr/bin/python3 clients/macos-screen/power.py disable 移除本采集器的唤醒计划')


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['install','enable','upgrade-agent','run-now','disable','status','uninstall','build'])
    parser.add_argument('--hour',type=int,default=8)
    parser.add_argument('--minute',type=int,default=0)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('此安装器仅适用于macOS')
    if args.command=='install': install(args.hour,args.minute)
    elif args.command=='enable':
        prepare_agent(args.hour,args.minute)
        run_background()
        stop()
        subprocess.run(['/bin/launchctl','bootstrap','gui/'+str(os.getuid()),str(AGENT)],check=True)
        print('每日任务已启用')
    elif args.command=='upgrade-agent':
        was_loaded=loaded()
        prepare_agent(args.hour,args.minute)
        run_background()
        if was_loaded:
            stop()
            subprocess.run(['/bin/launchctl','bootstrap','gui/'+str(os.getuid()),str(AGENT)],check=True)
        print('任务已升级；原生应用和钥匙串身份保持不变')
    elif args.command=='run-now':
        run_background()
    elif args.command=='disable':
        stop(); print('每日任务已停用，历史记录与凭证保留'); warn_wake()
    elif args.command=='status':
        if executable().exists(): subprocess.run([str(executable()),'status'],check=False)
        result=subprocess.run(['/bin/launchctl','print','gui/'+str(os.getuid())+'/'+LABEL],capture_output=True,text=True)
        print(json.dumps({'scheduled':result.returncode==0,'agent':str(AGENT)}))
        import power
        print(json.dumps({'wake':power.status()},ensure_ascii=False))
    elif args.command=='uninstall':
        stop()
        if AGENT.exists(): AGENT.unlink()
        if APP.exists():
            backup=SUPPORT/'backups'/datetime.now(timezone.utc).strftime('uninstalled-%Y%m%dT%H%M%S%f')
            backup.parent.mkdir(parents=True,exist_ok=True)
            shutil.move(str(APP),str(backup))
        print('任务已卸载；本地队列、配置和钥匙串凭证保留，可自行撤销凭证')
        warn_wake()
    else:
        if not args.output: parser.error('build需要--output路径')
        build(args.output)


if __name__=='__main__': main()
