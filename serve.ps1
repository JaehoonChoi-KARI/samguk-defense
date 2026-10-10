# Local test server: lets an iPad on the same Wi-Fi open the game.
#   pwsh -File serve.ps1            (port 8000)
#   pwsh -File serve.ps1 -Port 8080
# Windows may ask to allow network access the first time — allow "Private networks".
param([int]$Port = 8000)

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.png' = 'image/png'
  '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
}

$handler = {
  param($client, $root, $mime)
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
    $requestLine = $reader.ReadLine()
    while ($true) { $line = $reader.ReadLine(); if ([string]::IsNullOrEmpty($line)) { break } }
    $path = '/'
    if ($requestLine -match '^(GET|HEAD) (\S+)') { $path = [Uri]::UnescapeDataString(($Matches[2] -split '\?')[0]) }
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $path.TrimStart('/')))
    if ($file.StartsWith($root) -and [System.IO.File]::Exists($file)) {
      $body = [System.IO.File]::ReadAllBytes($file)
      $status = '200 OK'
      $type = $mime[[System.IO.Path]::GetExtension($file).ToLower()]
      if (-not $type) { $type = 'application/octet-stream' }
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      $status = '404 Not Found'
      $type = 'text/plain; charset=utf-8'
    }
    $head = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    if ($requestLine -notmatch '^HEAD') { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
  } catch {
  } finally {
    $client.Close()
  }
}

$pool = [runspacefactory]::CreateRunspacePool(1, 16)
$pool.Open()
$jobs = [System.Collections.Generic.List[object]]::new()
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL' } |
  ForEach-Object IPAddress
Write-Host "천하통일 디펜스 테스트 서버 실행 중 (끝내려면 Ctrl+C)"
Write-Host "  이 PC:   http://localhost:$Port"
foreach ($ip in $ips) { Write-Host "  아이패드: http://${ip}:$Port   (같은 Wi-Fi에서 Safari로 열기)" }

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($handler).AddArgument($client).AddArgument($root).AddArgument($mime)
    $jobs.Add([pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() })
    foreach ($j in @($jobs)) {
      if ($j.Handle.IsCompleted) { [void]$j.PS.EndInvoke($j.Handle); $j.PS.Dispose(); [void]$jobs.Remove($j) }
    }
  }
} finally {
  $listener.Stop()
  $pool.Close()
}
