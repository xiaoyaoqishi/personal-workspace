#!/usr/bin/env python3
"""Store the official DeepSeek credential privately; never echo it or put it in argv."""
import argparse
import getpass
import json
import os
from pathlib import Path
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'backend/data/discipline-ai.json')
    parser.add_argument('--model', default='deepseek-flash')
    args = parser.parse_args()
    secret = getpass.getpass('DeepSeek API Key（隐藏输入，不会显示）：').strip()
    if not secret or len(secret) > 512 or any(c.isspace() for c in secret):
        raise SystemExit('Key 为空或格式无效，未保存')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=args.output.parent, prefix='.discipline-ai-')
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump({'api_key': secret, 'model': args.model}, stream)
        os.chmod(temporary, 0o600)
        os.replace(temporary, args.output)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
    print('已保存到受保护的本地配置；不会输出 Key。可返回聊天告知“已配置”。')


if __name__ == '__main__':
    main()
