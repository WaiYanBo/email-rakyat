@echo off
cd /d "%~dp0\.."
echo ====================================================
echo Starting Weekly Database Backup (Supabase to CSV)
echo ====================================================
node database/backup-tables-to-csv.js
echo.
echo Backup process finished.
exit /b %errorlevel%
