$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$src = 'D:\chainqa-app'
$out = 'D:\chainqa-app-handover.zip'

# clean old
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }

Write-Host "collecting..."
$files = Get-ChildItem -LiteralPath $src -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch '\\node_modules\\' -and
        $_.FullName -notmatch '\\\.git\\' -and
        $_.FullName -notmatch '\\__pycache__\\' -and
        $_.Name -notlike '*.zip'
    }

Write-Host ("file count: " + $files.Count)

$fs = [System.IO.File]::Open($out, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

$base = (Resolve-Path -LiteralPath $src).Path.TrimEnd('\')
foreach ($f in $files) {
    $rel = $f.FullName.Substring($base.Length + 1)
    # normalize separators
    $rel = $rel.Replace('\', '/')
    $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $es.Write($bytes, 0, $bytes.Length)
    $es.Close()
}

$archive.Dispose()
$fs.Close()

$size = (Get-Item -LiteralPath $out).Length
Write-Host ("DONE size=" + $size)