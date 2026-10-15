# 어울을 이 PC에서 켜고, 휴대폰에서 열 https 주소를 만들어요(혼자 시험용, Windows).
#   powershell -ExecutionPolicy Bypass -File deploy\try-local.ps1          # 휴대폰까지 (Cloudflare 임시 터널)
#   powershell -ExecutionPolicy Bypass -File deploy\try-local.ps1 -Local   # 이 PC에서만 (http://localhost:8787)
# 시험 데이터는 server\data-try\에 따로 저장돼요. 끝내려면 Ctrl+C.
param([switch]$Local, [int]$Port = 8787)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$data = Join-Path (Get-Location) 'server\data-try'
New-Item -ItemType Directory -Force -Path $data | Out-Null

function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Test-Node {
  try {
    $parts = (node -p 'process.versions.node').Split('.')
    return ([int]$parts[0] -gt 22) -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 13)
  } catch { return $false }
}
function Test-Health {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/v1/health" | Out-Null; return $true } catch { return $false }
}

if (-not (Test-Node)) {
  if ((Read-Host 'Node.js 22.13 이상이 필요해요. winget으로 설치할까요? (y/N)') -eq 'y') {
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    Update-Path
  }
  if (-not (Test-Node)) { Write-Host 'https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행해 주세요.'; exit 1 }
}
if (-not $Local -and -not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  if ((Read-Host '휴대폰용 https 주소를 만드는 cloudflared를 winget으로 설치할까요? (y/N)') -eq 'y') {
    winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
    Update-Path
  }
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host '설치한 뒤 새 창에서 다시 실행하거나, 이 PC에서만 열려면 -Local 을 붙여 주세요.'
    exit 1
  }
}
if (Test-Health) { Write-Host "포트 $Port 에서 이미 서버가 돌고 있어요. 그 창을 닫거나 -Port 8788 처럼 바꿔 주세요."; exit 1 }

$invite = 'test-' + (-join (1..6 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }))
$env:EOUL_DATA_DIR = $data
$env:EOUL_PORT = "$Port"
$env:EOUL_INVITE_CODE = $invite
$env:EOUL_TRUST_PROXY = 'cloudflare'
$env:EOUL_COMMUNITY = 'on'
$env:EOUL_COMMUNITY_CONTACT = 'test@example.com'

$server = $null; $tunnel = $null
try {
  Write-Host '앱을 만들고 서버를 켜는 중이에요…'
  node app/tools/build.mjs | Out-Null
  $server = Start-Process node -ArgumentList 'server/index.mjs' -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $data 'server.log') -RedirectStandardError (Join-Path $data 'server-error.log')
  for ($i = 0; $i -lt 40 -and -not (Test-Health); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Health)) { Write-Host "서버가 켜지지 않았어요. 기록: $data"; Get-Content (Join-Path $data 'server-error.log') -Tail 20; exit 1 }

  $url = $null
  if (-not $Local) {
    Write-Host '휴대폰용 주소를 만드는 중이에요…'
    $tunnelLog = Join-Path $data 'tunnel.log'
    $tunnel = Start-Process cloudflared -ArgumentList "tunnel --no-autoupdate --url http://localhost:$Port" -NoNewWindow -PassThru `
      -RedirectStandardOutput (Join-Path $data 'tunnel-out.log') -RedirectStandardError $tunnelLog
    for ($i = 0; $i -lt 60 -and -not $url; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-Path $tunnelLog) { $url = (Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches.Value }
    }
    if (-not $url) { Write-Host "주소를 만들지 못했어요. 기록: $tunnelLog"; exit 1 }
  }

  Write-Host ''
  Write-Host '=================================================================='
  if ($url) { Write-Host "  휴대폰에서 여세요:  $url" }
  Write-Host "  이 PC에서 여세요:   http://localhost:$Port"
  Write-Host "  가입할 때 초대 코드: $invite"
  Write-Host '------------------------------------------------------------------'
  if ($url) {
    Write-Host "  · 주소는 켤 때마다 바뀌어요. 휴대폰에서 '계정에 저장'으로 가입해 두면"
    Write-Host '    다음에 새 주소에서 로그인해 옷장을 다시 받을 수 있어요.'
    Write-Host '  · 주소를 아는 사람은 열 수 있어요. 시험이 끝나면 꺼 주세요.'
  }
  Write-Host '  · 끝내려면 이 창에서 Ctrl+C'
  Write-Host '=================================================================='
  Wait-Process -Id $server.Id
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
