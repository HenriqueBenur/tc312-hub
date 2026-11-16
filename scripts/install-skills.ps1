# Reinstala as skills de terceiros usadas no projeto (ficam fora do git por licença/tamanho).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\install-skills.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dst  = Join-Path $root '.claude\skills'
$tmp  = Join-Path $env:TEMP "tc312-skills-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Get-Repo($name, $url) {
  $d = Join-Path $tmp $name
  git -c core.longpaths=true clone --depth 1 --quiet $url $d
  return $d
}

$taste = Get-Repo taste 'https://github.com/Leonxlnx/taste-skill.git'
$emil  = Get-Repo emil 'https://github.com/emilkowalski/skills.git'
$imp   = Get-Repo impeccable 'https://github.com/pbakaus/impeccable.git'
$tauri = Get-Repo tauri 'https://github.com/dchuk/claude-code-tauri-skills.git'
$ctx   = Join-Path $tmp 'ctx'
git -c core.longpaths=true clone --depth 1 --quiet --filter=blob:none --sparse https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering.git $ctx
git -C $ctx sparse-checkout set --no-cone '/SKILL.md' '/LICENSE*' '/README.md' '/skills/'

$map = [ordered]@{
  'design-taste-frontend' = "$taste\skills\taste-skill"
  'emil-design-eng'       = "$emil\skills\emil-design-eng"
  'improve-animations'    = "$emil\skills\improve-animations"
  'review-animations'     = "$emil\skills\review-animations"
  'animation-performance' = "$emil\skills\animation-performance"
  'impeccable'            = "$imp\.claude\skills\impeccable"
}
foreach ($k in $map.Keys) { $t = Join-Path $dst $k; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Copy-Item $map[$k] $t -Recurse }
$ce = Join-Path $dst 'context-engineering'; if (Test-Path $ce) { Remove-Item $ce -Recurse -Force }; New-Item -ItemType Directory $ce | Out-Null
Copy-Item "$ctx\SKILL.md","$ctx\README.md" $ce; Copy-Item "$ctx\skills" (Join-Path $ce 'skills') -Recurse

$tauriSel = 'tauri-project-setup','tauri-architecture','tauri-process-model','tauri-configuration','tauri-calling-rust','tauri-calling-frontend','tauri-ipc','tauri-frontend-events','tauri-frontend-js','tauri-capabilities','tauri-permissions','tauri-plugins','tauri-system-tray','tauri-window-customization','tauri-app-resources','tauri-binary-size','tauri-debugging','tauri-testing','tauri-windows-distribution','tauri-updating-dependencies'
foreach ($s in $tauriSel) { $t = Join-Path $dst $s; New-Item -ItemType Directory -Force $t | Out-Null; Copy-Item "$tauri\tauri\$s\SKILL.md" "$t\SKILL.md" -Force }

Remove-Item $tmp -Recurse -Force
Write-Host "Skills instaladas em $dst"
