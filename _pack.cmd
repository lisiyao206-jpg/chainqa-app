@echo off
chcp 65001 >nul
echo ===== ZIP 文件占用 =====
FOR /R "D:\chainqa-app\knowledge" %%F IN (*.zip) DO echo %%~zF bytes  %%F
echo ===== 打包开始 =====
set OUT=C:\Users\qweqw\Coze\Drive\编程专家\chainqa-app-交接包.zip
if exist "%OUT%" del "%OUT%"
cd /d D:\chainqa-app
tar -a -c -f "%OUT%" --exclude="node_modules" --exclude=".git" --exclude="__pycache__" --exclude="*.zip" .
echo ===== 打包完成 =====
FOR %%F IN ("%OUT%") DO echo 压缩包大小: %%~zF bytes ( %%~zF / 1MB approx )