# Rebuilds Publish\ from the mod source in anthroprocenia\.
# Normally run via "Prepare Publish.bat".
param(
	[switch]$SkipTests,
	[switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$modSrc = Join-Path $root 'anthroprocenia'
$publish = Join-Path $root 'Publish'
$modinfoPath = Join-Path $modSrc 'anthroprocenia.modinfo'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $modinfoPath)) { Fail "Mod manifest not found: $modinfoPath" }

[xml]$modinfo = Get-Content -LiteralPath $modinfoPath -Raw
$modId = $modinfo.Mod.id
$version = $modinfo.Mod.version
$modName = $modinfo.Mod.Properties.Name
if (-not $version) { Fail 'No version attribute on <Mod> in anthroprocenia.modinfo.' }
Step "$modName ($modId) version $version"

# 1. Tests
if (-not $SkipTests) {
	if (Get-Command node -ErrorAction SilentlyContinue) {
		Step 'Running tests (node --test tests/)'
		Push-Location $root
		try { & node --test tests/ 2>&1 | Select-Object -Last 12 | ForEach-Object { Write-Host "    $_" } }
		finally { Pop-Location }
		if ($LASTEXITCODE -ne 0) {
			if ($Force) { Write-Host 'WARNING: tests failed; continuing because -Force was given.' -ForegroundColor Yellow }
			else { Fail 'Tests failed. Fix them, or rerun with -Force (bat: "Prepare Publish.bat" force).' }
		}
	} else {
		Write-Host 'WARNING: node not found; skipping tests.' -ForegroundColor Yellow
	}
}

# 2. Verify every file the manifest references exists
Step 'Checking manifest references'
$missing = @()
foreach ($item in $modinfo.SelectNodes("//*[local-name()='Item']")) {
	$rel = $item.InnerText.Trim()
	if ($rel -and -not (Test-Path (Join-Path $modSrc $rel))) { $missing += $rel }
}
if ($missing.Count) { Fail ("Manifest references missing files:`n  " + ($missing -join "`n  ")) }

# 3. Mirror the mod into the Workshop folder (development-only files excluded)
$wsRoot = Join-Path $publish 'SteamWorkshop'
$wsMod = Join-Path $wsRoot 'anthroprocenia'
Step "Mirroring mod into $wsMod"
New-Item -ItemType Directory -Force -Path $wsMod | Out-Null
& robocopy $modSrc $wsMod /MIR /XD .git node_modules tests .claude /XF deploy.sh *.disabled *.log *.swp *~ .DS_Store /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "robocopy failed with exit code $LASTEXITCODE" }
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $wsMod 'README.md') -Force
Copy-Item -LiteralPath (Join-Path $root 'MODDING_GUIDE.txt') -Destination (Join-Path $wsMod 'MODDING_GUIDE.txt') -Force
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination (Join-Path $wsMod 'LICENSE.txt') -Force

foreach ($ext in 'png', 'jpg') {
	$preview = Join-Path $publish "preview.$ext"
	$dest = Join-Path $wsRoot "preview.$ext"
	if (Test-Path $preview) { Copy-Item -LiteralPath $preview -Destination $dest -Force }
	elseif (Test-Path $dest) { Remove-Item -LiteralPath $dest -Force }
}
if (-not ((Test-Path (Join-Path $publish 'preview.png')) -or (Test-Path (Join-Path $publish 'preview.jpg')))) {
	Write-Host 'NOTE: no Publish\preview.png (or .jpg) found; the Workshop item will need a preview image.' -ForegroundColor Yellow
}

# 4. Build the CivFanatics zip (top-level anthroprocenia\ folder, forward-slash entry names)
$cfRoot = Join-Path $publish 'CivFanatics'
New-Item -ItemType Directory -Force -Path $cfRoot | Out-Null
Get-ChildItem -LiteralPath $cfRoot -Filter '*.zip' | Remove-Item -Force
$zipPath = Join-Path $cfRoot ("{0}_v{1}.zip" -f $modName, $version)
Step "Building $zipPath"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
	$base = (Resolve-Path $wsRoot).Path.TrimEnd('\') + '\'
	foreach ($file in Get-ChildItem -LiteralPath $wsMod -Recurse -File) {
		$entry = $file.FullName.Substring($base.Length).Replace('\', '/')
		[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
	}
} finally { $zip.Dispose() }

# 5. Record what was built
$files = Get-ChildItem -LiteralPath $wsMod -Recurse -File
$manifest = @(
	"$modName version $version ($modId)"
	"Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
	"Files: $($files.Count)"
	''
) + ($files | ForEach-Object { $_.FullName.Substring($wsMod.Length + 1) } | Sort-Object)
Set-Content -LiteralPath (Join-Path $publish 'BUILD_INFO.txt') -Value $manifest -Encoding UTF8

Step "Done. $($files.Count) files; zip: $(Split-Path $zipPath -Leaf) ($([math]::Round((Get-Item $zipPath).Length / 1KB)) KB)"
Write-Host '    Steam Workshop: upload Publish\SteamWorkshop\anthroprocenia (see Publish\PUBLISHING.md)'
Write-Host "    CivFanatics:    upload Publish\CivFanatics\$(Split-Path $zipPath -Leaf)"
exit 0
