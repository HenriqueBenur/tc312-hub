# Captura USB do software oficial (MK1 Elite) conversando com o Warrior TC312.
# - Captura SOMENTE o endereco USB do Warrior (nunca o Logitech).
# - Nao envia nada ao teclado: apenas observa o trafego.
# - Precisa de administrador (o USBPcap exige). O script se reabre elevado.
param([string]$Sessao = (Get-Date -Format 'yyyyMMdd_HHmmss'), [switch]$SoDetectar)

$ErrorActionPreference = 'Stop'
$cmd    = 'C:\Program Files\USBPcap\USBPcapCMD.exe'
$tshark = 'C:\Program Files\Wireshark\tshark.exe'
$base   = Join-Path $PSScriptRoot "captures\$Sessao"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $extra = if ($SoDetectar) { ' -SoDetectar' } else { '' }
  $keep  = if ($SoDetectar) { '' } else { '-NoExit ' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass $keep-File `"$PSCommandPath`" -Sessao $Sessao$extra"
  return
}

New-Item -ItemType Directory -Force $base | Out-Null
Start-Transcript -Path (Join-Path $base 'log.txt') -Force | Out-Null
Write-Host "`n=== Captura TC312 - sessao $Sessao ===" -ForegroundColor Cyan

# O USBPcapCMD so escreve a saida quando redirecionada para arquivo (nao para pipe do PowerShell)
function Invoke-USBPcap([string]$argumentos) {
  $tmp = [IO.Path]::GetTempFileName()
  Start-Process -FilePath $cmd -ArgumentList $argumentos -NoNewWindow -Wait -RedirectStandardOutput $tmp | Out-Null
  $r = Get-Content $tmp; Remove-Item $tmp -Force; return $r
}

# 1) Localiza o Warrior: para cada root hub, uma sondagem de ~1,5 s que so injeta os
#    descritores dos aparelhos conectados; o tshark acha o endereco do VID 320F / PID 5078.
#    O arquivo da sondagem e apagado na hora (nao fica nada de outros aparelhos salvo).
$interfaces = Invoke-USBPcap '--extcap-interfaces' | Select-String -Pattern 'value=(\\\\\.\\USBPcap\d+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }
Write-Host "Root hubs: $($interfaces -join ', ')"
$alvo = $null
foreach ($if in $interfaces) {
  Invoke-USBPcap "--extcap-config --extcap-interface $if" | Out-File (Join-Path $base "extcap_$($if -replace '[\\.]','')_config.txt") -Encoding utf8
  $probe = Join-Path $env:TEMP "tc312_probe_$([guid]::NewGuid().ToString('N')).pcap"
  $p = Start-Process -FilePath $cmd -ArgumentList "-d $if -A --inject-descriptors -o `"$probe`"" -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 1500
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Start-Sleep -Milliseconds 300
  if (Test-Path $probe) {
    $addr = & $tshark -r $probe -Y 'usb.idVendor == 0x320f && usb.idProduct == 0x5078' -T fields -e usb.device_address 2>$null | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1
    Remove-Item $probe -Force
    if ($addr) { $alvo = [pscustomobject]@{ Interface = $if; Endereco = [int]$addr } ; break }
  }
}
if (-not $alvo) {
  Write-Host "Nao identifiquei o Warrior. Detalhes em $base. Avise o Claude." -ForegroundColor Yellow
  Stop-Transcript | Out-Null; return
}
Write-Host ("Warrior: {0}  endereco {1}" -f $alvo.Interface, $alvo.Endereco) -ForegroundColor Green
$alvo | ConvertTo-Json | Out-File (Join-Path $base 'alvo.json') -Encoding utf8
if ($SoDetectar) { Stop-Transcript | Out-Null; return }

# 2) Inicia a captura continua, filtrada pelo endereco do Warrior
$pcap = Join-Path $base 'tc312.pcap'
$proc = Start-Process -FilePath $cmd -ArgumentList "-d $($alvo.Interface) --devices $($alvo.Endereco) --inject-descriptors -o `"$pcap`"" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
if ($proc.HasExited) { Write-Host "USBPcapCMD encerrou sozinho (codigo $($proc.ExitCode)). Talvez falte reiniciar o Windows." -ForegroundColor Red; return }

# 3) Roteiro: cada acao ganha marcas de inicio/fim (UTC) para fatiar a captura depois
$acoes = @(
  @{ id='00_abrir';           txt='Abra o MK1 Elite e espere ele carregar por completo (nao mexa em nada).' },
  @{ id='01_estatico_verm';   txt='Iluminacao: modo ESTATICO (Normally on), cor VERMELHA pura, aplique.' },
  @{ id='02_estatico_azul';   txt='Mesmo modo, troque para AZUL puro, aplique.' },
  @{ id='03_brilho';          txt='Diminua o BRILHO um nivel, aplique.' },
  @{ id='04_respiracao';      txt='Troque o efeito para RESPIRACAO (Breathing), aplique.' },
  @{ id='05_velocidade';      txt='Aumente a VELOCIDADE do efeito um nivel, aplique.' },
  @{ id='06_custom_tecla';    txt='Modo personalizado/custom: pinte SO a tecla Esc de verde, aplique.' },
  @{ id='07_remap_caps_f13';  txt='Teclas: remapeie CAPS LOCK para a letra B (ou F13, se houver), aplique.' },
  @{ id='08_remap_restaura';  txt='Restaure o CAPS LOCK para o padrao, aplique.' },
  @{ id='09_macro_criar';     txt='Macros: grave uma macro digitando "abc", atribua a tecla F12, aplique.' },
  @{ id='10_macro_remover';   txt='Remova a macro da F12 (volte ao padrao), aplique.' },
  @{ id='11_winlock';         txt='Se existir opcao de bloquear a tecla Windows / modo jogo: ligue, aplique; depois desligue, aplique. Se nao existir, so aperte Enter.' },
  @{ id='12_fechar';          txt='Feche o MK1 Elite.' }
)
$marcas = @()
foreach ($a in $acoes) {
  Write-Host "`n[$($a.id)] $($a.txt)" -ForegroundColor White
  Read-Host '  Pressione ENTER para COMECAR esta acao' | Out-Null
  $ini = [DateTime]::UtcNow
  Read-Host '  Faca a acao no MK1 Elite e pressione ENTER quando TERMINAR' | Out-Null
  $fim = [DateTime]::UtcNow
  $obs = Read-Host '  (opcional) Algo diferente aconteceu? Digite ou so ENTER'
  $marcas += [pscustomobject]@{ acao = $a.id; inicio_utc = $ini.ToString('o'); fim_utc = $fim.ToString('o'); obs = $obs }
  $marcas | Export-Csv (Join-Path $base 'marcas.csv') -NoTypeInformation -Encoding UTF8
}

Start-Sleep -Seconds 2
Stop-Process -Id $proc.Id -Force
Write-Host "`nCaptura salva em $base" -ForegroundColor Green
Write-Host 'Pode fechar esta janela e avisar o Claude.'
Stop-Transcript | Out-Null
