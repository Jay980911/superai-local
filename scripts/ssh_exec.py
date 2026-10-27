#!/usr/bin/env python3
"""SSH 执行命令小工具（paramiko，密码登录）。
用法: python ssh_exec.py "<命令>" [more commands...]
"""
import sys
import paramiko

HOST = "124.222.130.62"
USER = "root"
PWD = "Zjh18271092956!"

def main(cmds):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PWD, timeout=15, look_for_keys=False, allow_agent=False)
    for cmd in cmds:
        print(f"\n===== $ {cmd} =====", flush=True)
        stdin, stdout, stderr = c.exec_command(cmd, timeout=120, get_pty=False)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        rc = stdout.channel.recv_exit_status()
        if out:
            print(out, end="")
        if err:
            print("-- stderr --", flush=True)
            print(err, end="", file=sys.stderr)
        print(f"[exit {rc}]")
    c.close()

if __name__ == "__main__":
    main(sys.argv[1:])
