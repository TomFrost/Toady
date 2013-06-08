@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe" "%~dp0\.\tools\ribbit.js" %*
) ELSE (
  node "%~dp0\.\tools\ribbit.js" %*
)
