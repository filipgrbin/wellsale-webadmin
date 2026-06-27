@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal

set "REPO=https://github.com/filipgrbin/wellsale-webadmin.git"

echo ============================================
echo   Wellsale Webadmin - commit ^& push
echo ============================================
echo.

REM --- Zeptej se na commit komentar jako prvni ---
set /p commitmsg="Zadej komentar na commit: "
if "%commitmsg%"=="" set "commitmsg=update"

echo.

REM --- Inicializace gitu, pokud jeste neexistuje ---
if not exist ".git" (
    echo [1/5] git init...
    git init
) else (
    echo [1/5] git uz je inicializovan, preskakuji init.
)

REM --- Branch main ---
echo [2/5] Nastavuji branch main...
git branch -M main

REM --- Remote origin ---
echo [3/5] Nastavuji remote origin...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin "%REPO%"
) else (
    git remote set-url origin "%REPO%"
)

REM --- Add + commit ---
echo [4/5] Pridavam soubory a commitanu...
git add .
git commit -m "%commitmsg%"

REM --- Push ---
echo [5/5] Pushuji na origin/main...
git push -u origin main

echo.
echo ============================================
echo   Hotovo.
echo ============================================
pause
endlocal
