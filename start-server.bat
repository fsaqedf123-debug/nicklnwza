@echo off
chcp 65001 >nul
title ระบบประเมินผลรายวิชา 640-394 ปฏิบัติการพยาบาลเด็ก
cd /d "%~dp0"

echo ================================================================
echo   ระบบประเมินผลรายวิชา 640-394 ปฏิบัติการพยาบาลเด็ก
echo   คณะพยาบาลศาสตร์ มหาวิทยาลัยสงขลานครินทร์
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=%PATH%;C:\Program Files\nodejs"
    ) else (
        echo [ข้อผิดพลาด] ไม่พบ Node.js ในระบบ กรุณาติดตั้ง Node.js จาก https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

if not exist node_modules (
    echo กำลังติดตั้งแพ็กเกจที่จำเป็น...
    call npm.cmd install
    if %errorlevel% neq 0 (
        echo.
        echo [ข้อผิดพลาด] ติดตั้งแพ็กเกจไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต
        pause
        exit /b 1
    )
)

echo กำลังเริ่มต้นระบบเซิร์ฟเวอร์และเปิดหน้าโปรแกรม...
echo.

:: เปิดหน้าเว็บโปรแกรมบน Browser อัตโนมัติ
start http://localhost:3000

node server.js

echo.
echo เซิร์ฟเวอร์หยุดทำงานแล้ว
pause