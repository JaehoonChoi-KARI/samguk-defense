# Runs ?autotest=1 in headless Edge and prints the report.
#   pwsh -File tools/autotest.ps1                       (local server on :8000)
#   pwsh -File tools/autotest.ps1 -Url https://jaehoonchoi-kari.github.io/samguk-defense/?autotest=1
#   pwsh -File tools/autotest.ps1 -Size "844,390" -Name phone (a phone held sideways)
param([string]$Url = "http://localhost:8000/?autotest=1", [int]$Budget = 120000, [string]$Name = "test", [string]$Size = "1180,820")
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$tmp = Join-Path $env:TEMP "samguk-td"
New-Item -ItemType Directory -Force $tmp | Out-Null
$a = @('--headless=new','--disable-gpu','--no-first-run','--mute-audio',"--user-data-dir=$tmp\edge-$Name",'--enable-logging=stderr','--v=0',"--window-size=$Size",'--autoplay-policy=no-user-gesture-required',"--virtual-time-budget=$Budget",'--dump-dom',"`"$Url`"")
Start-Process -FilePath $edge -ArgumentList $a -Wait -NoNewWindow -RedirectStandardOutput "$tmp\$Name-dom.txt" -RedirectStandardError "$tmp\$Name-log.txt" | Out-Null
$dom = Get-Content "$tmp\$Name-dom.txt" -Raw
$m = [regex]::Match($dom, '<pre id="test-out"[^>]*>([\s\S]*?)</pre>')
if ($m.Success) { [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) } else { "NO REPORT (dom length $($dom.Length))" }
Select-String -Path "$tmp\$Name-log.txt" -Pattern 'Uncaught|SyntaxError|TypeError|ReferenceError' | Select-Object -First 10 | ForEach-Object { $_.Line }
