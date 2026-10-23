$ErrorActionPreference = 'SilentlyContinue'
Write-Output '=== server.mjs 开头 ==='
Get-Content -LiteralPath 'D:\chainqa-app\server.mjs' -TotalCount 45
Write-Output ''
Write-Output '=== web/package.json ==='
Get-Content -LiteralPath 'D:\chainqa-app\web\package.json'
Write-Output ''
Write-Output '=== .env 是否存在 ==='
$e = Get-Item -LiteralPath 'D:\chainqa-app\.env'
if ($e) { Write-Output ('存在，大小=' + $e.Length + ' 字节，含密钥(不打印值)') } else { Write-Output '不存在' }
Write-Output ''
Write-Output '=== 各 .mjs 模块职责签名 ==='
foreach ($m in @('server.mjs','variant.mjs','rag.mjs','admin.mjs','agent.mjs','quiz.mjs','scanner.mjs')) {
  $p = 'D:\chainqa-app\' + $m
  if (Test-Path -LiteralPath $p) {
    Write-Output ('--- ' + $m + ' ---')
    Select-String -LiteralPath $p -Pattern '^export (async )?function|^const [a-zA-Z]+ ?=|^async function' | Select-Object -First 8 | ForEach-Object { $_.Line }
  }
}
Write-Output ''
Write-Output '=== db 文件 ==='
Get-ChildItem -LiteralPath 'D:\chainqa-app' -Filter '*.db' | Select-Object Name,Length