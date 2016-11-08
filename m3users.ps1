<#

PowerShell script to mirror the users from M3 to IPA
Thibaud Lopez Schneider
2016-11-07

DOCUMENTATION:
https://m3ideas.org/2016/09/11/user-synchronization-between-m3-and-ipa-part-2/

INSTALLATION:
1) To use Get-Credential, you will need to install Windows Management Framework 4.0
2) To use invoke-sqlcmd, you will need to:
    a) Install PowerShell Extensions for SQL Server from the SQL Server 2016 Feature Pack > PowerShellTools.msi
    b) Execute this command in PowerShell as administrator: Set-ExecutionPolicy RemoteSigned
    c) Execute this command to install the PowerShell snapin for SQL Server: Import-Module SQLPS
3) To use Active Directory in PowerShell, you need to install the module with these PowerShell commands:
    Import-Module ServerManager
    Add-WindowsFeature RSAT-AD-PowerShell

HOW TO USE:
1) Set the $conf values below to match your environments
2) Execute this script in the IPA folder, e.g. D:\Infor\LMTST>m3users.ps1
3) It will ask which environment to sync (e.g. DEV, TST)
4) It will ask for the database password
5) It will generate the files m3users_add.txt and m3users_delete.txt for the secadm command
6) It will generate the file m3users.xml for the importPFIdata command
7) It will execute the secadm import; if it fails, try the import manually
8) It will execute the importPFIdata import; if it fails, try the import manually
9) Optionally, execute the secadm command with the delete file

#>

Import-Module SQLPS
Import-Module ActiveDirectory

# Change these values to matcCh your environments
$conf = @{
               # M3 DB host, M3 DB name, IPA data area
    "DEV"      = ("host", "M3DBDEV", "lmdevipa")
    "TST"      = ("host", "M3DBTST", "lmtstipa")
}

# Ask which environment to sync
$conf.Keys
$env = Read-Host "Select environment (e.g. DEV)"
$ServerInstance = $conf[$env][0]
$Database = $conf[$env][1]
$dataarea = $conf[$env][2]

# Ask the database credentials
$c = Get-Credential -UserName MDBUSR -Message "Database $ServerInstance\$Database"
$Username = $c.UserName
$Password = $c.GetNetworkCredential().password

# Prepare the output files
out-file m3users_add.txt    -Encoding ascii
out-file m3users_delete.txt -Encoding ascii
out-file m3users.xml        -Encoding ascii


# XML stub for importPFIdata
$x = [xml] @'
<ImpExpData Version="1">
    <Tables>
        <Table Name="WFUSRPROFL">
            <Rows/>
        </Table>
        <Table Name="WFTASK">
            <Rows/>
        </Table>
        <Table Name="WFUSERTASK">
            <Rows/>
        </Table>
    </Tables>
</ImpExpData>
'@
$WFUSRPROFL = $x.SelectSingleNode("/ImpExpData/Tables/Table[@Name='WFUSRPROFL']")
$WFTASK     = $x.SelectSingleNode("/ImpExpData/Tables/Table[@Name='WFTASK']")
$WFUSERTASK = $x.SelectSingleNode("/ImpExpData/Tables/Table[@Name='WFUSERTASK']")

function sql($Query) {
    return invoke-sqlcmd -ServerInstance $ServerInstance -Database $Database -Username $Username -Password $Password -Query $Query
}

function column($name, $value) {
    $c = $x.CreateElement("Column")
    $c.SetAttribute("Name", $name)
    $v = $x.CreateElement("Value")
    $v.InnerText = $value
    $c.AppendChild($v)
    return $c
}

function row($table, $columns) {
    $r = $x.CreateElement("Row")
    foreach($c in $columns) {
        $r.AppendChild($c[1]) # PENDING: error if single column
    }
    $table.ChildNodes[0].AppendChild($r)
}

# M3 Users (MNS150/CRS611)
sql "SELECT DISTINCT JUUSID, JUTX40, CBEMAL FROM MVXJDTA.CMNUSR U LEFT OUTER JOIN MVXJDTA.CEMAIL E ON U.JUUSID=E.CBEMKY AND E.CBEMTP='04'" | ForEach-Object {

    # split, trim, and replace blank spaces
    $usid = $_.JUUSID.ToString().Trim()
    $firstname, $lastname = $_.JUTX40 -split " ",2,"simplematch"
    $firstname = "--firstname $firstname"
    $lastname = if ($lastname) { $lastname.Trim() } else { "" }
    $lastname = if ($lastname -ne '') { "--lastname " + ($lastname -replace " ", "\ ") } else { "--lastname ." <# must set something, otherwise "Field Family Name is required"; PENDING: how to set blank value #> }
    $email = $_.CBEMAL.ToString().Trim()

    # alternatively with Active Directory
    $aduser = Get-ADUser -Filter {(sAMAccountName -eq $usid) -and (ObjectClass -eq "user")} -Properties EmailAddress
    $firstname = $aduser.GivenName
    $lastname = $aduser.Surname
    $email = $aduser.EmailAddress

    $email = if ($email -ne '') { "--ContactInfo.EmailAddress " + ($email -replace " ", "\ ") } else { "" }

    # to IPA Identity, Actor, Actor-Identity, Actor-Role
    "identity add SSOPV2 $usid --password null"    | out-file -Append $HOME\m3users_add.txt -Encoding ascii
    "actor add $usid $firstname $lastname $email"  | out-file -Append $HOME\m3users_add.txt -Encoding ascii
    "actor assign $usid SSOPV2 $usid"              | out-file -Append $HOME\m3users_add.txt -Encoding ascii
    "role assign $usid InbasketUser_ST"            | out-file -Append $HOME\m3users_add.txt -Encoding ascii

    # delete
    if ($usid -ine "lawson" -And $usid -ine "M3ADMIN" -And $usid -ine "M3API" -And $usid -ine "M3SRVADM" -And $usid -ine "MVXSECOFR" -And $usid -ine "SYSTEM") {
        "role remove $usid InbasketUser_ST"  | out-file -Append $HOME\m3users_delete.txt -Encoding ascii
        "actor remove $usid SSOPV2 $usid"    | out-file -Append $HOME\m3users_delete.txt -Encoding ascii
        "actor delete $usid --complete"      | out-file -Append $HOME\m3users_delete.txt -Encoding ascii
        "identity delete SSOPV2 $usid"       | out-file -Append $HOME\m3users_delete.txt -Encoding ascii
    }
    
    # to IPA User Profile
    row $WFUSRPROFL ((column "WF-RM-ID" $usid), (column "" "")) | out-null # PENDING: remove the dummy column

}

# M3 Roles (MNS405) to IPA Tasks
sql "SELECT KRROLL, KRTX40 FROM MVXJDTA.CMNROL" | ForEach-Object {
    row $WFTASK ((column "TASK" $_.KRROLL), (column "WF-DESCRIPTION" $_.KRTX40)) | out-null 
}

# M3 User-Roles (MNS410) to IPA User-Tasks
sql "SELECT KUUSID, KUROLL FROM MVXJDTA.CMNRUS" | ForEach-Object {
    row $WFUSERTASK ((column "WF-RM-ID" $_.KUUSID), (column "TASK" $_.KUROLL), (column "START-DATE" "00000000"), (column "STOP-DATE" "00000000")) | out-null
}

$x.OuterXml | out-file -Append $HOME\m3users.xml -Encoding ascii


# Execute the import
enter.cmd
secadm -f $HOME\m3users_add.txt -d gen
env\bin\importPFIdata.bat $dataarea -f $HOME\m3users.xml


<#
PENDING:
- If I pass a single column to function row() then the foreach will throw an error; meanwhile, I have to pass a blank column as dummy
- How to avoid console output; meanwhile, I have to pipe to out-null
- How to set out-file encoding default to ascii without having to set each time
- Unfortunately, secadm is ASCII only, whereas M3 is UTF-8, thus we will loose data; if we have UTF8 characters then secadm will throw "Can not encode the string for field FamilyName in character set ISO-8859-1 supported by the RDBMS for business class Actor on GEN [...] FAILED"
- How to set blank value for lastname; meanwhile, I have to pass some dummy value
#>
