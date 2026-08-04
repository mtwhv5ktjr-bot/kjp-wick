@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set NODE="C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64\node.exe"

:menu
cls
echo.
echo  ============================================================
echo   KJP GEAR  -  PulseChain 369
echo  ============================================================
echo   100 pieces  .  1,000,000 PLS each
echo   50%% buys ^& burns KJP   .   50%% buys ^& burns WICK
echo   No withdraw function exists. Both exits are burns.
echo.
echo   The deploying wallet becomes OWNER. Owner can only
echo   open/close the mint, set the price, and hand ownership on.
echo   Owner can NEVER touch funds - no such function exists.
echo.
echo   Your key is typed here, on your machine. It is never
echo   written to disk and never echoed to the screen.
echo  ============================================================
echo.
echo    [1]  DEPLOY          (mint starts CLOSED - safe)
echo    [2]  OPEN THE MINT   (after you have pasted the address in)
echo    [3]  dry run only    (prints the plan, sends nothing)
echo    [4]  quit
echo.
set "CH="
set /p CH="Choose 1-4: "
if "%CH%"=="3" goto dry
if "%CH%"=="1" goto deploy
if "%CH%"=="2" goto openmint
goto :eof

:dry
echo.
%NODE% tools\deploy-gear.mjs
echo.
pause
goto menu

:deploy
echo.
%NODE% tools\deploy-gear.mjs
echo.
echo  Check the plan above. Especially the KJP and WICK addresses.
set "GO="
set /p GO="Type LAUNCH to deploy for real: "
if /I not "%GO%"=="LAUNCH" ( echo. & echo Aborted. Nothing was sent. & pause & goto menu )
call :getkey
if not defined PK ( echo No key entered. & pause & goto menu )
echo.
echo Deploying...
%NODE% tools\deploy-gear.mjs --go
set "PK="
echo.
echo  ------------------------------------------------------------
echo   If an address printed above, paste it into these THREE files
echo   (search each for  GEAR_ADDR ):
echo       js\net.js
echo       mint.html
echo       ..\pepe-zero\index.html
echo   Then come back and choose [2] to open the mint.
echo  ------------------------------------------------------------
pause
goto menu

:openmint
echo.
set "ADDR="
set /p ADDR="Paste the deployed contract address (0x...): "
if "%ADDR%"=="" ( echo No address. & pause & goto menu )
echo.
echo  This makes the mint PUBLIC. People can spend real PLS after this.
set "GO="
set /p GO="Type OPEN to confirm: "
if /I not "%GO%"=="OPEN" ( echo Aborted. & pause & goto menu )
call :getkey
if not defined PK ( echo No key entered. & pause & goto menu )
%NODE% tools\deploy-gear.mjs --open %ADDR%
set "PK="
echo.
pause
goto menu

rem --- secure key read. No temp file: PowerShell here writes UTF-16+BOM,
rem     which silently corrupts a key read back with  set /p .
:getkey
set "PK="
for /f "usebackq delims=" %%K in (`powershell -NoProfile -Command "$s=Read-Host -AsSecureString 'Private key (hidden)'; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try{[Runtime.InteropServices.Marshal]::PtrToStringAuto($b).Trim()}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}"`) do set "PK=%%K"
exit /b
