# R1-S §9 — apply a DENY read ACE for the WORKER'S CAPABILITY SID.
#
# HISTORY, because each attempt is evidence:
#   1. `icacls /deny *S-1-4-...`      → cannot map a capability SID to an account name.
#   2. `AddAccessRule($sid, ...)`     → "some or all identity references could not be translated".
#   3. `SetSecurityDescriptorSddlForm` with a prepended deny ACE → the ACE was SILENTLY DROPPED
#      (the resulting SDDL showed only the inherited grants), which is the worst failure mode: it looks
#      like success.
#
# The route that works is the raw `DirectorySecurity` binary form: build the deny rule with a
# `SecurityIdentifier` object (not a string, so translation is never attempted), then write the DACL
# through `Set-Acl`. If the write does not round-trip, this script says so instead of reporting success.
#
# Arguments: -Sid <S-1-4-...> -Paths <d1>,<d2>
param(
  [Parameter(Mandatory=$true)][string]$Sid,
  [Parameter(Mandatory=$true)][string]$Paths
)
$ErrorActionPreference = 'Stop'
$sidObj = New-Object System.Security.Principal.SecurityIdentifier($Sid)
$rights = [System.Security.AccessControl.FileSystemRights]131209   # 0x20089: read data/attrs/perms
$inherit = [System.Security.AccessControl.InheritanceFlags]3       # ContainerInherit | ObjectInherit
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  $sidObj, $rights, $inherit,
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Deny
)
foreach ($p in $Paths.Split(',')) {
  if (-not (Test-Path -LiteralPath $p)) { Write-Output "missing:$p"; continue }
  try {
    $acl = Get-Acl -LiteralPath $p
    [void]$acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $p -AclObject $acl
    # VERIFY, because attempt 3 above reported success while writing nothing.
    $check = (Get-Acl -LiteralPath $p).Access | Where-Object { $_.IdentityReference.Value -eq $Sid }
    if ($check -and ($check | Where-Object { $_.AccessControlType -eq 'Deny' })) {
      Write-Output "denied-verified:$p"
    } else {
      Write-Output "denied-but-not-persisted:$p"
    }
  } catch {
    Write-Output ("failed:" + $p + ":" + $_.Exception.Message)
  }
}
