param(
    [string]$Source = (Join-Path $PSScriptRoot 'Publish\SteamWorkshop\anthroprocenia'),
    [string]$Destination = (Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII\Mods\anthroprocenia")
)

$ErrorActionPreference = 'Stop'
$Source = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
$Destination = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')
if ($Source -eq $Destination -or $Source.StartsWith($Destination + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
    $Destination.StartsWith($Source + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release source and installation must be separate, non-nested directories.'
}
[xml]$manifest = Get-Content -LiteralPath (Join-Path $Source 'anthroprocenia.modinfo') -Raw
if ($manifest.Mod.id -ne 'anthroprocenia_map_history') { throw 'Unexpected release mod identity.' }
foreach ($item in $manifest.SelectNodes("//*[local-name()='Item']")) {
    if (-not (Test-Path -LiteralPath (Join-Path $Source $item.InnerText.Trim()) -PathType Leaf)) {
        throw "Release references a missing file: $($item.InnerText)"
    }
}
$mods = Split-Path -Parent $Destination
$activeManifest = Join-Path $Destination 'anthroprocenia.modinfo'
$duplicates = @()
if (Test-Path -LiteralPath $mods) {
    foreach ($file in Get-ChildItem -LiteralPath $mods -Recurse -File -Filter '*.modinfo') {
        [xml]$other = Get-Content -LiteralPath $file.FullName -Raw
        if ($other.Mod.id -ne $manifest.Mod.id) { continue }
        if ([int]$other.Mod.version -gt [int]$manifest.Mod.version) {
            throw "Refusing to replace or disable a newer installation: $($file.FullName)"
        }
        if ($file.FullName -eq $activeManifest) { continue }
        $duplicates += $file.FullName
    }
}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
& robocopy $Source $Destination /E /XD .git /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Release installation failed: robocopy exit $LASTEXITCODE" }
$files = @(Get-ChildItem -LiteralPath $Source -Recurse -File)
foreach ($file in $files) {
    $relative = $file.FullName.Substring($Source.Length + 1)
    if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath (Join-Path $Destination $relative) -Algorithm SHA256).Hash) {
        throw "Installed file differs from release: $relative"
    }
}
foreach ($duplicate in $duplicates) {
    $backup = $duplicate + '.disabled'
    $suffix = 1
    while (Test-Path -LiteralPath $backup) { $backup = $duplicate + ".disabled.$suffix"; $suffix++ }
    Move-Item -LiteralPath $duplicate -Destination $backup
    Write-Output "Disabled duplicate manifest (files preserved): $backup"
}
$remaining = @(Get-ChildItem -LiteralPath $mods -Recurse -File -Filter '*.modinfo' | Where-Object {
    [xml]$candidate = Get-Content -LiteralPath $_.FullName -Raw
    $candidate.Mod.id -eq $manifest.Mod.id
})
if ($remaining.Count -ne 1 -or $remaining[0].FullName -ne $activeManifest) {
    throw 'Installation verification failed: expected exactly one active Anthroprocenia manifest.'
}
Write-Output "Installed v$($manifest.Mod.version); SHA256 verified $($files.Count) files and exactly one active mod identity. Fully restart Civ VII."
exit 0
