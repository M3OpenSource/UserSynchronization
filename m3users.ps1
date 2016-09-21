<#

PowerShell script to mirror the users from M3 to IPA
Thibaud Lopez Schneider
2016-09-21

DOCUMENTATION:
https://m3ideas.org/2016/09/11/user-synchronization-between-m3-and-ipa-part-2/

HOW TO USE:
0) You will need the PowerShell snapin for SQL Server to be able to run the invoke-sqlcmd
1) Set the conf values to suit your environments
2) Execute this script in the IPA folder, e.g. D:\Infor\LMTST>m3users.ps1
3) It will ask which environment to sync (e.g. DEV, TST)
4) It will ask for the database password
5) It will generate the file m3users.txt for the secadm command
6) It will generate the file m3users.xml for the importPFIdata command
7) It will execute the secadm import
8) It will execute the importPFIdata import
9) If the import fails, try the import manually

#>

# Change these values to suit your environments (M3 database host, M3 database name, IPA data area)
$conf = @{
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
out-file m3users.txt -Encoding ascii
out-file m3users.xml -Encoding ascii


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

    # to IPA Identity, Actor, Actor-Identity, Actor-Role
    $firstname, $lastname = $_.JUTX40 -split " ",2,"simplematch"
    "identity add SSOPV2 $($_.JUUSID) --password null"                                                                | out-file -Append $HOME\m3users.txt -Encoding ascii
    "actor add $($_.JUUSID) --firstname $firstname --lastname ""$lastname"" --ContactInfo.EmailAddress $($_.CBEMAL)"  | out-file -Append $HOME\m3users.txt -Encoding ascii
    "actor assign $($_.JUUSID) SSOPV2 $($_.JUUSID)"                                                                   | out-file -Append $HOME\m3users.txt -Encoding ascii
    "role assign $($_.JUUSID) InbasketUser_ST"                                                                        | out-file -Append $HOME\m3users.txt -Encoding ascii

    # to IPA User Profile
    row $WFUSRPROFL ((column "WF-RM-ID" $_.JUUSID), (column "" "")) | out-null # PENDING: remove the dummy column

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
secadm -f $HOME\m3users.txt -d gen
env\bin\importPFIdata.bat $dataarea -f $HOME\m3users.xml


<#
PENDING:
- If I pass a single column to function row() then the foreach will throw an error; meanwhile, I have to pass a blank column as dummy
- How to avoid console output; meanwhile, I have to pipe to out-null
- How to set out-file encoding default to ascii without having to set each time
- Unfortunately, secadm is ASCII only, whereas M3 is UTF-8, thus we will loose data; if we have UTF8 characters then secadm will throw "Can not encode the string for field FamilyName in character set ISO-8859-1 supported by the RDBMS for business class Actor on GEN [...] FAILED"
#>
