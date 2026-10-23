$ErrorActionPreference = 'Stop'
# 加载压缩程序集
Add-Type -AssemblyName System.IO.Compression.FileSystem

$src = 'D:\chainqa-app'
$out = 'C:\Users\qweqw\Coze\Drive\编程专家\chainqa-app-交接包.zip'

if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }

Write-Output '收集文件，排除 node_modules / .git / __pycache__ / *.zip'
$files = Get-ChildItem -LiteralPath $src -Recurse -File -Force | Where-Object {
  $_.FullName -notmatch '\\node_modules\\' -and
  $_.FullName -notmatch '\\\.git\\' -and
  $_.FullName -notmatch '__pycache__' -and
  $_.Extension -ne '.zip'
}
Write-Output ('文件数: ' + $files.Count)

# 用完整限定类型名 + 显式 Add-Type，避免类型解析失败
$mode = [System.IO.Compression.ZipArchiveMode]::Create
$comp = [System.IO.Compression.CompressionLevel]::Optimal
$fs = [System.IO.File]::Open($out, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, $mode)
try {
  $base = $src.TrimEnd('\')
  foreach ($f in $files) {
    $rel = 'chainqa-app/' + $f.FullName.Substring($base.Length + 1).Replace('\', '/')
    $entry = $zip.CreateEntry($rel, $comp)
    $es = $entry.Open()
    try {
      $fs2 = [System.IO.File]::OpenRead($f.FullName)
      try { $fs2.CopyTo($es) } finally { $fs2.Dispose() }
    } finally { $es.Dispose() }
  }
} finally {
  $zip.Dispose()
  $fs.Dispose()
}

Write-Output ('打包完成: ' + $out)
Write-Output ('大小 MB: ' + [math]::Round((Get-Item -LiteralPath $out).Length/1MB,1))