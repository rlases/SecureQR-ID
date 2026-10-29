# Prueba de entrega en un runner Windows nuevo. No se ejecuta en equipos de usuarios:
# crea un perfil sintético y no publica el perfil, las bases ni los secretos generados.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
    $env:GITHUB_REPOSITORY -ne 'rlases/SecureQR-ID' -or -not $env:RUNNER_TEMP) {
    throw 'Esta prueba solo se ejecuta en el runner Windows del repositorio.'
}

$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
$installRoot = [IO.Path]::GetFullPath((Join-Path $runnerRoot 'SecureQR prueba'))
$reportRoot = [IO.Path]::GetFullPath((Join-Path $runnerRoot 'secureqr-instalador-informe'))
foreach ($target in @($installRoot, $reportRoot)) {
    if (-not $target.StartsWith($runnerRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'El destino de prueba debe estar dentro del temporal del runner.'
    }
    if (Test-Path -LiteralPath $target) { throw 'La prueba requiere destinos nuevos.' }
}
$profiles = @('registro-qr', 'Registro QR') | ForEach-Object { Join-Path $env:APPDATA $_ }
foreach ($candidateProfile in $profiles) {
    if (Test-Path -LiteralPath $candidateProfile) { throw 'Existe un perfil previo; no se utiliza ni se modifica.' }
}
if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) {
    throw 'El puerto 4000 está ocupado antes del ensayo.'
}
$installers = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../dist') -Filter '*.exe' -File)
if ($installers.Count -ne 1) { throw 'Se esperaba un único instalador NSIS.' }
New-Item -ItemType Directory -Path $reportRoot | Out-Null
$report = [ordered]@{
    commit = $env:GITHUB_SHA
    run = $env:GITHUB_RUN_ID
    windows = [Environment]::OSVersion.VersionString
    arquitectura = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    instalador = $installers[0].Name
    sha256 = (Get-FileHash -LiteralPath $installers[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    comprobaciones = [ordered]@{}
    resultado = 'en_curso'
    alcance = 'Runner nuevo, perfil nuevo, API HTTPS; no evalúa cámara, lectores físicos ni instalación del CCAV.'
}

# El callback de .NET fija el certificado generado por ESTA instalación. No se usa
# -SkipCertificateCheck ni una excepción global para cualquier certificado.
Add-Type @'
using System;
using System.Net.Http;
using System.Security.Cryptography;
public static class SecureQrPinnedClient {
    public static HttpClient Create(string expected) {
        var handler = new HttpClientHandler();
        handler.ServerCertificateCustomValidationCallback = (request, cert, chain, errors) =>
            request.RequestUri.Host == "localhost" && cert != null &&
            cert.GetCertHashString(HashAlgorithmName.SHA256) == expected;
        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };
    }
}
'@

function JsonRequest($Client, [string]$Method, [string]$Route, $Body, [int]$Expected = 200) {
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), "https://localhost:4000$Route")
    if ($null -ne $Body) {
        $request.Content = [Net.Http.StringContent]::new(($Body | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
    }
    $response = $null
    try {
        $response = $Client.SendAsync($request).GetAwaiter().GetResult()
        if ([int]$response.StatusCode -ne $Expected) { throw "HTTP inesperado en $Route (sin cuerpo ni credenciales en el informe)." }
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ($text) { return $text | ConvertFrom-Json }
    } finally {
        if ($response) { $response.Dispose() }
        $request.Dispose()
    }
}

$script:appProcess = $null
$script:client = $null
$script:userProfile = $null
function StartTestApp([string]$Executable) {
    $originalPath = $env:PATH
    $nodeDirectory = Split-Path -Parent (Get-Command node).Source
    try {
        # El servidor empaquetado debe utilizar el Node de Electron, no el del build.
        $env:PATH = (($originalPath -split ';') | Where-Object { $_.TrimEnd('\') -ine $nodeDirectory.TrimEnd('\') }) -join ';'
        $script:appProcess = Start-Process -FilePath $Executable -ArgumentList '--disable-gpu' -WindowStyle Hidden -PassThru
    } finally { $env:PATH = $originalPath }
    $deadline = [DateTime]::UtcNow.AddSeconds(70)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not $script:userProfile) {
            $script:userProfile = $profiles | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'tls/cert.pem') } | Select-Object -First 1
        }
        if ($script:userProfile -and -not $script:client) {
            $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPemFile((Join-Path $script:userProfile 'tls/cert.pem'))
            try { $script:client = [SecureQrPinnedClient]::Create($cert.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256)) }
            finally { $cert.Dispose() }
        }
        if ($script:client) {
            try {
                $health = JsonRequest $script:client GET '/api/health' $null
                if ($health.status -eq 'ok') { return }
            } catch { }
        }
        Start-Sleep -Seconds 1
    }
    throw 'La aplicación instalada no alcanzó un estado HTTPS sano.'
}
function StopTestApp {
    if ($script:client) { $script:client.Dispose(); $script:client = $null }
    if ($script:appProcess -and -not $script:appProcess.HasExited) {
        & taskkill.exe /PID $script:appProcess.Id /T /F *> $null
    }
    $script:appProcess = $null
    Start-Sleep -Seconds 2
}

try {
    $installerProcess = Start-Process -FilePath $installers[0].FullName -ArgumentList @('/S', "/D=$installRoot") -WindowStyle Hidden -Wait -PassThru
    if ($installerProcess.ExitCode -ne 0) { throw 'El instalador no terminó correctamente.' }
    $executable = Join-Path $installRoot 'Registro QR.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw 'No apareció el ejecutable instalado.' }
    $report.comprobaciones.instalacion_nsis = $true
    StartTestApp $executable
    $report.comprobaciones.arranque_https_sin_node_en_path = $true
    $secretsPath = Join-Path $script:userProfile 'server-secrets.json'
    $secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
    $keyBefore = $secrets.asignacionesKey
    $certBefore = (Get-FileHash -LiteralPath (Join-Path $script:userProfile 'tls/cert.pem')).Hash
    $session = JsonRequest $script:client POST '/api/auth/login' @{ username = $secrets.adminUsername; password = $secrets.adminPassword }
    if ($session.user.role -ne 'admin') { throw 'La cuenta inicial no pudo autenticarse.' }
    $created = JsonRequest $script:client POST '/api/registros' @{ nombre = 'Ensayo Sintetico'; documento = '9000001234'; rol = 'Prueba'; tipo = 'entrada' } 201
    $recordId = $created.registro.id
    $records = JsonRequest $script:client GET '/api/registros' $null
    if ($recordId -notin @($records.registros.id)) { throw 'No se recuperó el registro sintético.' }
    $report.comprobaciones.autenticacion_y_registro = $true
    $null = JsonRequest $script:client POST '/api/auth/logout' $null
    $null = JsonRequest $script:client GET '/api/auth/me' $null 401
    $report.comprobaciones.cierre_de_sesion = $true
    StopTestApp
    StartTestApp $executable
    $after = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
    if ($after.asignacionesKey -cne $keyBefore) { throw 'Cambió la clave HMAC tras reiniciar.' }
    if ((Get-FileHash -LiteralPath (Join-Path $script:userProfile 'tls/cert.pem')).Hash -ne $certBefore) { throw 'Cambió el certificado sin cambio de instalación.' }
    $null = JsonRequest $script:client POST '/api/auth/login' @{ username = $after.adminUsername; password = $after.adminPassword }
    $records = JsonRequest $script:client GET '/api/registros' $null
    if ($recordId -notin @($records.registros.id)) { throw 'El registro no persistió tras reiniciar.' }
    $report.comprobaciones.persistencia_datos_certificado_y_hmac = $true
    StopTestApp
    $uninstaller = Join-Path $installRoot 'Uninstall Registro QR.exe'
    if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'No apareció el desinstalador.' }
    $removed = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    if ($removed.ExitCode -ne 0) { throw 'El desinstalador falló.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Test-Path -LiteralPath $executable) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Seconds 1 }
    if (Test-Path -LiteralPath $executable) { throw 'El ejecutable sigue instalado.' }
    $report.comprobaciones.desinstalacion = $true
    $report.comprobaciones.perfil_conservado_al_desinstalar = Test-Path -LiteralPath $script:userProfile
    $report.resultado = 'correcto'
} catch {
    $report.resultado = 'fallo'
    throw
} finally {
    StopTestApp
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reportRoot 'resultado.json') -Encoding utf8
    # Ningún campo del informe contiene el contenido de secrets, respuestas con
    # contraseñas ni datos de sesión. El perfil queda solo en el runner desechable.
}
