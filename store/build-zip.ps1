# Builds the Chrome Web Store upload: store/dist/ai-chat-exporter-<version>.zip
# Only what the extension needs at runtime goes in (no tests, docs, store assets or editor folders).
# Entry names use "/" — Windows PowerShell's Compress-Archive writes "\" and the store can't find files then.
#   powershell -ExecutionPolicy Bypass -File store\build-zip.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version

$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path $dist "ai-chat-exporter-$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$files = @()
foreach ($item in @('manifest.json', 'LICENSE', '_locales', 'icons', 'popup', 'src')) {
  $p = Join-Path $root $item
  if (Test-Path $p -PathType Container) { $files += Get-ChildItem $p -Recurse -File } else { $files += Get-Item $p }
}

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in $files) {
    $name = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $name, 'Optimal') | Out-Null
  }
} finally { $zip.Dispose() }
Write-Output "Built $zipPath ($($files.Count) files)"
