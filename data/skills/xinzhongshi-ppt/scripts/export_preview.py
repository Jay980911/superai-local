# -*- coding: utf-8 -*-
"""可选：PowerPoint COM 导出幻灯片 PNG（仅 Windows + 已装 PowerPoint）。
无 Office 时跳过，直接交 pptx 即可。
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

PS_EXPORT = r"""
param($pptx, $outDir)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Open($pptx, $true, $false, $false)
  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $png = Join-Path $outDir ("slide-{0}.png" -f $i)
    $pres.Slides.Item($i).Export($png, "PNG", 1600, 900)
    Write-Output "OK $png"
  }
  $pres.Close()
} finally {
  $ppt.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx")
    ap.add_argument("--out", default="qa")
    args = ap.parse_args()

    if sys.platform != "win32":
        print("skip: PowerPoint COM 仅 Windows 可用")
        return

    pptx = str(Path(args.pptx).resolve())
    out = str(Path(args.out).resolve())
    ps1 = Path(out) / "_export.ps1"
    ps1.parent.mkdir(parents=True, exist_ok=True)
    ps1.write_text(PS_EXPORT, encoding="utf-8")

    r = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
         "-File", str(ps1), "-pptx", pptx, "-outDir", out],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        print("提示：未装 PowerPoint 或 COM 失败，可跳过预览直接交 pptx")
        sys.exit(1)


if __name__ == "__main__":
    main()
