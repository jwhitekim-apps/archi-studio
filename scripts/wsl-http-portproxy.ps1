#Requires -RunAsAdministrator
# Archi Studio: forwards Windows TCP 80/443 to the current WSL instance.
# Usage: .\scripts\wsl-http-portproxy.ps1 -ListenAddress <windows-lan-ip> [-RuleName "Archi Studio"]
param(
    [Parameter(Mandatory = $true)]
    [string]$ListenAddress,

    [string]$RuleName = "Archi Studio"
)

$ErrorActionPreference = "Stop"

$WslAddress = (wsl.exe hostname -I).Trim().Split(" ")[0]

if ([string]::IsNullOrWhiteSpace($WslAddress)) {
    throw "WSL IP not found"
}

Set-Service iphlpsvc -StartupType Automatic
Start-Service iphlpsvc

foreach ($Port in @(80, 443)) {
    $FirewallRuleName = "$RuleName TCP $Port"

    if (-not (Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $FirewallRuleName -Direction Inbound `
            -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    }

    netsh interface portproxy delete v4tov4 `
        listenaddress=$ListenAddress listenport=$Port | Out-Null

    netsh interface portproxy add v4tov4 `
        listenaddress=$ListenAddress listenport=$Port `
        connectaddress=$WslAddress connectport=$Port
}

Write-Host "WSL IP: $WslAddress"
netsh interface portproxy show all
Write-Host "Windows network setup complete"
