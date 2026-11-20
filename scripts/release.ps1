<#
  Gera o instalador assinado do TC312 Hub e, com -Publish, publica o release no GitHub.

  Uso (na raiz do repositório):
    powershell -ExecutionPolicy Bypass -File scripts\release.ps1             # compila e prepara release\vX.Y.Z
    powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -Publish    # compila e publica
    powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -SkipBuild -Publish   # publica o que já foi compilado

  O que sai em release\vX.Y.Z (pasta fora do git):
    TC312-Hub_X.Y.Z_x64-setup.exe      instalador NSIS (instala só para o usuário, sem UAC)
    TC312-Hub_X.Y.Z_x64-setup.exe.sig  assinatura minisign do instalador
    latest.json                        o que o botão "Atualizar" do app consulta
    NOTAS.md                           texto do release (tirado do CHANGELOG.md)

  A chave privada fica em %USERPROFILE%\.tauri\tc312hub.key e NUNCA entra no repositório.
  O app confere a assinatura com a chave pública gravada em app\src-tauri\tauri.conf.json.
#>
param([switch]$Publish, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$app = Join-Path $root 'app'
$conf = Get-Content (Join-Path $app 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ver = $conf.version
$tag = "v$ver"
$repo = 'HenriqueBenur/tc312-hub'
$keyPath = Join-Path $env:USERPROFILE '.tauri\tc312hub.key'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $keyPath)) { throw "Chave de assinatura não encontrada em $keyPath" }

if (-not $SkipBuild) {
  Write-Host "Compilando TC312 Hub $ver (release, assinado)..."
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
  Push-Location $app
  try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "O build falhou (código $LASTEXITCODE)." }
  } finally {
    Pop-Location
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  }
}

$nsis = Join-Path $app 'src-tauri\target\release\bundle\nsis'
$exe = Get-ChildItem $nsis -Filter "*_${ver}_x64-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { throw "Instalador da versão $ver não encontrado em $nsis" }
$sigPath = "$($exe.FullName).sig"
if (-not (Test-Path $sigPath)) { throw "Assinatura $sigPath não encontrada (a chave foi passada ao build?)" }

$out = Join-Path $root "release\$tag"
New-Item -ItemType Directory -Force $out | Out-Null
$name = "TC312-Hub_${ver}_x64-setup.exe"
$dstExe = Join-Path $out $name
$dstSig = Join-Path $out "$name.sig"
Copy-Item $exe.FullName $dstExe -Force
Copy-Item $sigPath $dstSig -Force
$signature = (Get-Content $sigPath -Raw).Trim()
$sha = (Get-FileHash $dstExe -Algorithm SHA256).Hash.ToLower()

# Notas: a seção desta versão no CHANGELOG.md
$changelog = Get-Content (Join-Path $root 'CHANGELOG.md') -Raw -Encoding UTF8
$m = [regex]::Match($changelog, "(?ms)^## \[$([regex]::Escape($ver))\][^\n]*\n(.*?)(?=^## \[|\z)")
$notes = if ($m.Success) { $m.Groups[1].Value.Trim() } else { "TC312 Hub $ver" }

$url = "https://github.com/$repo/releases/download/$tag/$name"
$platform = [ordered]@{ signature = $signature; url = $url }
$latest = [ordered]@{
  version   = $ver
  notes     = $notes
  pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = [ordered]@{ 'windows-x86_64' = $platform; 'windows-x86_64-nsis' = $platform }
}
[IO.File]::WriteAllText((Join-Path $out 'latest.json'), ($latest | ConvertTo-Json -Depth 6), $utf8)

$notesFile = Join-Path $out 'NOTAS.md'
$body = @"
$notes

---
**Instalação:** baixe ``$name`` e execute (instala só para o seu usuário, sem pedir administrador).
Quem já tem a 1.1.0 ou mais nova atualiza pelo botão **Ajustes → Atualizar agora** dentro do app.

SHA-256 do instalador: ``$sha``
"@
[IO.File]::WriteAllText($notesFile, $body, $utf8)

Write-Host ""
Write-Host "Pronto em $out"
Write-Host "  $name  ($([math]::Round($exe.Length / 1MB, 1)) MB)"
Write-Host "  SHA-256 $sha"

if ($Publish) {
  Write-Host "Publicando $tag em github.com/$repo ..."
  gh release create $tag $dstExe $dstSig (Join-Path $out 'latest.json') --repo $repo --title "TC312 Hub $ver" --notes-file $notesFile --target main
  if ($LASTEXITCODE -ne 0) { throw "gh release create falhou (código $LASTEXITCODE)." }
  Write-Host "Release publicado: https://github.com/$repo/releases/tag/$tag"
}
