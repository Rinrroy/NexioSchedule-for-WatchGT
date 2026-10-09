<#
.SYNOPSIS
  NexioWatch Lite per-file size gate (real device hard limit: 49,152 B per .js file).
.DESCRIPTION
  Threshold source: frameworks/src/core/base/js_fwk_common.h:89
    constexpr uint16_t FILE_CONTENT_LENGTH_MAX = 1024 * 48;
  The comparison is a strict '>', so exactly 49,152 B is legal. On a real device an
  oversized file is rejected outright (scriptBuffer stays null) -> that file never runs
  and the screen stays black. The simulator only prints a WARN, so 'it works in the
  simulator' proves nothing: always measure the produced artifact bytes with this script.
  Note: a debug build is never minified (hvigor decides hapMode from isDebug()),
  so if a debug artifact fails here, package with a release build:
    hvigorw --mode module -p product=default assembleHap --no-daemon              # debug
    hvigorw --mode module -p product=default -p buildMode=release assembleHap --no-daemon
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/check-lite-size.ps1
#>
$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$base  = Join-Path $root 'entry\build\default\intermediates\loader_out_lite\default\js\MainAbility'
$limit = 49152
$targets = @('app.js', 'pages\index\index.js')
$bad = 0
foreach ($t in $targets) {
  $p = Join-Path $base $t
  if (-not (Test-Path $p)) {
    Write-Host ("[MISS] {0} - artifact not found, run hvigorw assembleHap first" -f $t)
    $bad++
    continue
  }
  $n = (Get-Item $p).Length
  if ($n -gt $limit) {
    Write-Host ("[FAIL] {0} = {1} B, over the limit by {2} B" -f $t, $n, ($n - $limit))
    $bad++
  } else {
    Write-Host ("[ OK ] {0} = {1} B, {2} B of headroom" -f $t, $n, ($limit - $n))
  }
}
if ($bad -gt 0) {
  Write-Host 'A real Lite Wearable device rejects oversized .js files => use a release build or slim further.'
  exit 1
}
Write-Host 'All .js artifacts are inside the real-device per-file hard limit.'
exit 0
