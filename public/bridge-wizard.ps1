# ============================================================
# ia.rest · Bridge Wizard de impresoras v2
# ============================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$Token,
    [string]$API = "https://www.iarest.es"
)

$ErrorActionPreference = "Stop"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor White
    Write-Host "  $("-" * 50)" -ForegroundColor DarkGray
}
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-ERR($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-INFO($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Write-WARN($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

Clear-Host
Write-Host ""
Write-Host "  ia.rest · Configuracion de impresoras" -ForegroundColor White
Write-Host "  $("=" * 50)" -ForegroundColor DarkRed
Write-Host ""

# ── PASO 1: Verificar token ───────────────────────────────────
Write-Header "PASO 1 · Verificando conexion con ia.rest"

try {
    $body = @{ token = $Token } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$API/api/bridge/verify" `
        -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
    Write-OK "Conectado · Restaurante: $($resp.nombre)"
    $restauranteNombre = $resp.nombre
} catch {
    Write-ERR "Token invalido o sin conexion a internet."
    Write-INFO "Comprueba el token en /owner -> Config -> Impresoras."
    Read-Host "  Pulsa Enter para salir"
    exit 1
}

# ── PASO 2: Detectar subnet ───────────────────────────────────
Write-Header "PASO 2 · Detectando red local"

try {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress
    if (-not $localIP) { throw "No se encontro IP local" }
    $parts  = $localIP.Split(".")
    $subnet = "$($parts[0]).$($parts[1]).$($parts[2])"
    Write-OK "Red detectada: $subnet.0/24"
} catch {
    Write-ERR "No se pudo detectar la red: $_"
    Read-Host "  Pulsa Enter para salir"
    exit 1
}

# ── PASO 3: Escanear puerto 9100 ──────────────────────────────
Write-Header "PASO 3 · Buscando impresoras (puerto 9100)"
Write-INFO "Escaneando $subnet.1 - $subnet.254 ..."
Write-Host ""

$found    = [System.Collections.ArrayList]@()
$total    = 254
$completed = 0

$pool = [RunspaceFactory]::CreateRunspacePool(1, 50)
$pool.Open()
$jobs = @()

1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript({
        param($ip, $port)
        try {
            $tcp  = New-Object System.Net.Sockets.TcpClient
            $conn = $tcp.BeginConnect($ip, $port, $null, $null)
            $wait = $conn.AsyncWaitHandle.WaitOne(400, $false)
            if ($wait -and $tcp.Connected) { $tcp.Close(); return $ip }
            $tcp.Close()
        } catch { }
        return $null
    }).AddArgument($ip).AddArgument(9100)
    $jobs += @{ ps = $ps; handle = $ps.BeginInvoke() }
}

foreach ($job in $jobs) {
    $result = $job.ps.EndInvoke($job.handle)
    $job.ps.Dispose()
    $completed++
    $pct = [int](($completed / $total) * 100)
    Write-Progress -Activity "Escaneando red..." -Status "$pct% completado" -PercentComplete $pct
    if ($result) {
        [void]$found.Add($result)
        Write-OK "Impresora encontrada: $result"
    }
}
$pool.Close()
Write-Progress -Activity "Escaneando red..." -Completed
Write-Host ""

if ($found.Count -eq 0) {
    Write-WARN "No se encontraron impresoras en la red."
    Write-Host ""
    Write-INFO "Posibles causas:"
    Write-INFO "  · La impresora esta apagada o no conectada al WiFi"
    Write-INFO "  · La impresora usa un puerto diferente al 9100"
    Write-INFO "  · Esta en otra red WiFi"
    Write-Host ""
    $manual = Read-Host "  Introducir IP manualmente? (s/n)"
    if ($manual -eq "s" -or $manual -eq "S") {
        $ipManual = Read-Host "  IP de la impresora (ej: 192.168.1.100)"
        if ($ipManual -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
            [void]$found.Add($ipManual)
        } else {
            Write-ERR "IP no valida."
            Read-Host "  Pulsa Enter para salir"; exit 1
        }
    } else {
        Write-INFO "Puedes anadir impresoras manualmente desde /owner -> Hardware."
        Read-Host "  Pulsa Enter para salir"; exit 0
    }
}

# ── PASO 4: Nombrar y registrar ───────────────────────────────
Write-Header "PASO 4 · Dar nombre a las impresoras"
Write-INFO "Solo necesitas poner un nombre a cada impresora."
Write-INFO "Ej: Barra, Cocina caliente, Postres, Bebidas"
Write-Host ""

$registradas = [System.Collections.ArrayList]@()

foreach ($ip in $found) {
    Write-Host "  Impresora en $ip" -ForegroundColor Cyan
    $nombre = Read-Host "  Nombre (Enter para omitir)"
    if ([string]::IsNullOrWhiteSpace($nombre)) {
        Write-INFO "  Omitida."
        Write-Host ""
        continue
    }
    try {
        $regBody = @{
            ip_address      = $ip
            port            = 9100
            nombre          = $nombre.Trim()
            connection_type = "ip_local"
        } | ConvertTo-Json

        $regResp = Invoke-RestMethod `
            -Uri "$API/api/bridge/register-printer" `
            -Method POST `
            -Headers @{ "x-bridge-token" = $Token } `
            -Body $regBody `
            -ContentType "application/json" `
            -TimeoutSec 15

        Write-OK "Registrada: $nombre ($ip)"
        [void]$registradas.Add(@{ id = $regResp.id; nombre = $nombre; ip = $ip })
    } catch {
        Write-ERR "Error al registrar $nombre`: $($_.Exception.Message)"
    }
    Write-Host ""
}

# ── PASO 5: Test de impresion ─────────────────────────────────
if ($registradas.Count -gt 0) {
    Write-Header "PASO 5 · Probando impresoras"
    Write-INFO "Enviando ticket de prueba a cada impresora..."
    Write-Host ""

    foreach ($imp in $registradas) {
        Write-INFO "  Enviando test a $($imp.nombre) ($($imp.ip))..."
        try {
            $testBody = @{
                trigger     = "test"
                impresora_id = $imp.id
            } | ConvertTo-Json

            Invoke-RestMethod `
                -Uri "$API/api/print" `
                -Method POST `
                -Body $testBody `
                -ContentType "application/json" `
                -TimeoutSec 10 | Out-Null

            Write-OK "Test enviado a $($imp.nombre) — comprueba que imprimio"
        } catch {
            Write-WARN "No se pudo enviar test a $($imp.nombre): $($_.Exception.Message)"
        }
        Start-Sleep -Milliseconds 500
    }
}

# ── RESUMEN + ABRIR FLUJOS ────────────────────────────────────
Write-Header "Configuracion completada"

if ($registradas.Count -gt 0) {
    Write-OK "$($registradas.Count) impresora(s) configurada(s) correctamente"
    Write-Host ""
    Write-INFO "Abriendo panel de Flujos de trabajo en el navegador..."
    Write-INFO "Alli asigna cada seccion (Barra, Cocina...) a su impresora."
    Write-Host ""

    $flujoUrl = "$API/owner?tab=flujos&setup=1"
    Start-Process $flujoUrl

    Write-Host "  URL: $flujoUrl" -ForegroundColor DarkGray
} else {
    Write-WARN "No se registro ninguna impresora."
    Write-INFO "Puedes anadirlas manualmente desde /owner -> Hardware."
}

Write-Host ""
Write-Host "  Wizard completado. Esta ventana se cerrara en 5 segundos." -ForegroundColor DarkGray
Start-Sleep -Seconds 5
