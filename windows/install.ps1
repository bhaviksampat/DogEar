# Installs Dog-Ear for the current Windows user (no admin rights needed).
# Run it from the folder that contains DogEar.exe (the published app):
#   powershell -ExecutionPolicy Bypass -File install.ps1              install or update
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall   remove the app
# Books and notes live separately in %LOCALAPPDATA%\DogEar and are never touched by this script.
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$dest  = Join-Path $env:LOCALAPPDATA 'Programs\DogEar'
$links = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Dog-Ear.lnk'),   # Start Menu
    (Join-Path ([Environment]::GetFolderPath('Desktop'))  'Dog-Ear.lnk')
)

# Close a running copy politely so it can save, and so its files can be replaced.
Get-Process DogEar -ErrorAction SilentlyContinue | ForEach-Object {
    $_.CloseMainWindow() | Out-Null
    if (-not $_.WaitForExit(5000)) { $_.Kill() }
}

if ($Uninstall) {
    Remove-Item $links -ErrorAction SilentlyContinue
    Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Dog-Ear removed. Your books and notes are still in $env:LOCALAPPDATA\DogEar."
    return
}

$src = $PSScriptRoot
if (-not (Test-Path (Join-Path $src 'DogEar.exe'))) { throw "Run this script from the folder that contains DogEar.exe." }
if ($src.TrimEnd('\') -eq $dest) { throw "Dog-Ear is already running from the install folder; run install.ps1 from the downloaded copy instead." }

New-Item -ItemType Directory -Force $dest | Out-Null
Remove-Item (Join-Path $dest 'web') -Recurse -Force -ErrorAction SilentlyContinue   # drop files removed in this version
Copy-Item (Join-Path $src 'DogEar.exe'), (Join-Path $src 'install.ps1') $dest -Force
Copy-Item (Join-Path $src 'web') $dest -Recurse -Force

$shell = New-Object -ComObject WScript.Shell
foreach ($path in $links) {
    $lnk = $shell.CreateShortcut($path)
    $lnk.TargetPath       = Join-Path $dest 'DogEar.exe'
    $lnk.WorkingDirectory = $dest
    $lnk.IconLocation     = (Join-Path $dest 'DogEar.exe') + ',0'
    $lnk.Description      = 'Dog-Ear: read, scribble, fold the corner'
    $lnk.Save()
}
Write-Host "Dog-Ear installed to $dest. Open it from the Start Menu or the desktop shortcut."
