# Runs tools/balance.html in headless Edge and prints a summary (or every stage with -Detail).
#   pwsh -File tools/balance.ps1 -Query "diff=1&runs=3"
#   pwsh -File tools/balance.ps1 -Query "lords=liubei&stages=15-15&diff=2&runs=3&dump=1" -Detail
# Several difficulties in parallel (each run takes ~5-8 minutes):
#   'diff=0&runs=3','diff=1&runs=3','diff=2&runs=3','diff=3&runs=3' | % { Start-Job { param($q) & C:\gm2\tools\balance.ps1 -Query $q -Name ($q -replace '\W','') } -ArgumentList $_ } | Wait-Job | Receive-Job
param([string]$Query = "diff=1&runs=2", [string]$Name = "bal", [int]$Budget = 2000000, [switch]$Detail)
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$tmp = Join-Path $env:TEMP "samguk-td"
New-Item -ItemType Directory -Force $tmp | Out-Null
$a = @('--headless=new','--disable-gpu','--no-first-run','--mute-audio',"--user-data-dir=$tmp\edge-$Name",'--enable-logging=stderr','--v=0',"--virtual-time-budget=$Budget",'--dump-dom',"`"http://localhost:8000/tools/balance.html?$Query`"")
Start-Process -FilePath $edge -ArgumentList $a -Wait -NoNewWindow -RedirectStandardOutput "$tmp\$Name.txt" -RedirectStandardError "$tmp\$Name.err" | Out-Null
$dom = Get-Content "$tmp\$Name.txt" -Raw
$m = [regex]::Match($dom, '<pre id="out">([\s\S]*?)</pre>')
if (-not $m.Success) { "NO OUTPUT"; return }
$rows = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) | ConvertFrom-Json
if ($Detail) {
  foreach ($r in $rows) {
    "{0,-8} {1,2} {2,-12} win {3,4} gate {4,4} t {5,4}s lost {6,4} leak {7,4} bossLoss {8} peak {9}" -f $r.lord, $r.n, $r.title, $r.win, $r.gate, $r.time, $r.lost, $r.leaked, $r.boss, $r.peak
    if ($r.stalls) { $r.stalls | Select-Object -First 12 | ForEach-Object { "    $_" } }
  }
}
$bands = foreach ($b in @(@(1,5),@(6,10),@(11,15),@(16,20))) {
  $x = $rows | Where-Object { $_.n -ge $b[0] -and $_.n -le $b[1] }
  if ($x) { "{0}-{1}: win {2:N2} gate {3:N1} t {4:N0}s (march {5:N0}s, {6:N1} waves)" -f $b[0], $b[1], ($x | Measure-Object win -Average).Average, ($x | Measure-Object gate -Average).Average, ($x | Measure-Object time -Average).Average, ($x | Measure-Object march -Average).Average, ($x | Measure-Object waves -Average).Average }
}
"[$Name] $Query"
"  ALL: win {0:N2} gate {1:N1} time {3:N0}s | {2}" -f ($rows | Measure-Object win -Average).Average, ($rows | Measure-Object gate -Average).Average, ($bands -join ' | '), ($rows | Measure-Object time -Average).Average
"  boss losses: {0} | losses: " -f ($rows | Measure-Object boss -Sum).Sum + (($rows | Where-Object { $_.win -lt 1 } | ForEach-Object { "{0}{1}({2:N1}/{3})" -f $_.lord.Substring(0,2), $_.n, $_.win, $_.gate }) -join ' ')
