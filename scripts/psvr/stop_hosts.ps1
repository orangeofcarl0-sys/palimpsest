param([string]$Marker = "PSVR_PRINCIPAL")
# Stop only the DSH host NODE processes whose command line carries this scenario's principal marker.
# Filtering by process NAME matters: matching on CommandLine alone also matches the shell or
# PowerShell that carries the pattern as an argument, which once killed the scenario itself.
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*$Marker*" -and $_.CommandLine -like "*dsh*bin.js*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
