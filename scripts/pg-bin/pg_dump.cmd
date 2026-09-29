@echo off
node "%~dp0pg-tool.mjs" pg_dump %*
