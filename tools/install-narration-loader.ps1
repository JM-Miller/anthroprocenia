param(
    [string]$GameRoot = "C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VII",
    [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA 'AnthroproceniaNarrator\backups'),
    [switch]$Restore
)

$ErrorActionPreference = 'Stop'
if (@(Get-Process | Where-Object { $_.ProcessName -match '^Civ7_Win64_.*_FinalRelease$' }).Count -gt 0) {
    throw 'Close Civilization VII before installing or restoring the narration loader.'
}
$rootFile = Join-Path $GameRoot 'Base\modules\base-standard\ui\root-game.html'
$encoding = [System.Text.UTF8Encoding]::new($false, $true)
$original = [System.IO.File]::ReadAllBytes($rootFile)
$text = $encoding.GetString($original)
$anchor = '<script src="/core/ui/component-support.js"></script>'
$tag = '<script id="anthroprocenia-narration-loader" type="module" src="fs://game/anthroprocenia/ui/narration/anthroprocenia-early-loader.js"></script>'
$insertion = "`r`n`t`t" + $tag

if ($Restore) {
    if (!$text.Contains($tag)) {
        Write-Host 'The narration loader is not installed.'
        return
    }
    if (!$text.Contains($insertion) -or $text.IndexOf($tag) -ne $text.LastIndexOf($tag)) {
        throw 'The loader line has changed; refusing to overwrite other game-UI changes.'
    }
    [System.IO.File]::WriteAllBytes($rootFile, $encoding.GetBytes($text.Replace($insertion, '')))
    Write-Host 'Removed only the Anthroprocenia early-loader line.'
    return
}

if ($text.Contains($tag)) {
    Write-Host 'The narration loader is already installed.'
    return
}
if ($text.IndexOf($anchor) -lt 0 -or $text.IndexOf($anchor) -ne $text.LastIndexOf($anchor)) {
    throw 'Unsupported game UI: expected exactly one component-support script. No files were changed.'
}
$hash = (Get-FileHash -LiteralPath $rootFile -Algorithm SHA256).Hash
$backup = Join-Path $BackupDirectory ("root-game-" + $hash + '.html')
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
if (!(Test-Path -LiteralPath $backup)) {
    [System.IO.File]::WriteAllBytes($backup, $original)
}
if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $hash) {
    throw 'The original game-UI backup failed verification. No game files were changed.'
}
[System.IO.File]::WriteAllBytes($rootFile, $encoding.GetBytes($text.Replace($anchor, $anchor + $insertion)))
Write-Host "Installed the early narrator loader. Verified original backup: $backup"
