@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe" "%~dp0\.\tools\ribbit-cli.js" %*
) ELSE (
  node "%~dp0\.\tools\ribbit-cli.js" %*
)
