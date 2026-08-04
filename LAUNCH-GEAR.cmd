@echo off
setlocal
cd /d "%~dp0"
set NODE="C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64\node.exe"

echo.
echo  ============================================================
echo   KJP GEAR  -  MAINNET LAUNCH                (PulseChain 369)
echo  ============================================================
echo   100 pieces  .  1,000,000 PLS each
echo   50%% buys ^& burns KJP   .   50%% buys ^& burns WICK
echo   No withdraw function exists. Both exits are burns.
echo.
echo   Your private key is typed HERE, on your machine, and is
echo   never written to a file or shown on screen.
echo  ============================================================
echo.

%NODE% tools\deploy-gear.mjs
echo.
set /p GO="Type LAUNCH to deploy for real (anything else aborts): "
if /I not "%GO%"=="LAUNCH" (
  echo Aborted. Nothing was sent.
  goto :end
)

echo.
echo Paste the deployer private key (0x...). It will not be echoed.
powershell -NoProfile -Command "$k = Read-Host -AsSecureString 'PK'; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($k); [Runtime.InteropServices.Marshal]::PtrToStringAuto($b)" > "%TEMP%\_kjpk.tmp"
set /p PK=<"%TEMP%\_kjpk.tmp"
del /f /q "%TEMP%\_kjpk.tmp"

echo.
echo Deploying...
%NODE% tools\deploy-gear.mjs --go
set PK=

echo.
echo  ------------------------------------------------------------
echo   If that printed an address, do these three things:
echo     1. paste it into  js\net.js      GEAR_ADDR
echo     2. paste it into  mint.html      GEAR_ADDR
echo     3. paste it into  ..\pepe-zero\index.html   GEAR_ADDR
echo   then re-run this file and choose OPEN to start the mint.
echo  ------------------------------------------------------------
echo.

:end
endlocal
pause
