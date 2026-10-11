# Runs tools/arena.html (troop against troop on an empty field) in headless Edge and prints its table.
#   pwsh -File tools/arena.ps1 -Query "n=9&mode=one"
#   pwsh -File tools/arena.ps1 -Query "n=9&mode=cost&budget=360&old=1"
param([string]$Query = "n=9", [string]$Name = "arena", [int]$Budget = 2000000)
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$tmp = Join-Path $env:TEMP "samguk-td"
New-Item -ItemType Directory -Force $tmp | Out-Null
$a = @('--headless=new','--disable-gpu','--no-first-run','--mute-audio',"--user-data-dir=$tmp\edge-$Name",'--enable-logging=stderr','--v=0',"--virtual-time-budget=$Budget",'--dump-dom',"`"http://localhost:8000/tools/arena.html?$Query`"")
Start-Process -FilePath $edge -ArgumentList $a -Wait -NoNewWindow -RedirectStandardOutput "$tmp\$Name.txt" -RedirectStandardError "$tmp\$Name.err" | Out-Null
$dom = Get-Content "$tmp\$Name.txt" -Raw
$m = [regex]::Match($dom, '<pre id="out">([\s\S]*?)</pre>')
if (-not $m.Success) { "NO OUTPUT"; return }
[System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
Select-String -Path "$tmp\$Name.err" -Pattern 'Uncaught|SyntaxError|TypeError|ReferenceError' | Select-Object -First 5 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(400, $_.Line.Length)) }
