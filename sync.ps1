# PENDING: how to remove console output, I have to pipe to out-null


# Change this to your environments
$conf = @{
    "DEV"      = ("host", "M3FDBDEV", "lmdevipa")
    "TST"      = ("host", "M3FDBTST", "lmtstipa")
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


# importPFIdata
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
        $r.AppendChild($c[1])
    }
    $table.ChildNodes[0].AppendChild($r)
}

# M3 Users (MNS150/CRS611)
sql "SELECT DISTINCT JUUSID, JUTX40, CBEMAL FROM MVXJDTA.CMNUSR U LEFT OUTER JOIN MVXJDTA.CEMAIL E ON U.JUUSID=E.CBEMKY AND E.CBEMTP='04'" | ForEach-Object {

    # to IPA Identity, Actor, Actor-Identity, Actor-Role
    $firstname, $lastname = $_.JUTX40 -split " ",2,"simplematch"
    "identity add SSOPV2 $($_.JUUSID) --password null"
    "actor add $($_.JUUSID) --firstname $firstname --lastname ""$lastname"" --ContatInfo.EmailAddress $($_.CBEMAL)"
    "actor assign $($_.JUUSID) SSOPV2 $($_.JUUSID)"
    "role assign $($_.JUUSID) InbasketUser_ST"

    # to IPA User Profile
    row $WFUSRPROFL ((column "WF-RM-ID" $JUUSID), (column "" "")) | out-null # PENDING: if I spectify a single column then PowerShell error

}

# M3 Roles (MNS405) to IPA Tasks
sql "SELECT KRROLL, KRTX40 FROM MVXJDTA.CMNROL" | ForEach-Object {
    row $WFTASK ((column "TASK" $_.KRROLL), (column "WF-DESCRIPTION" $_.KRTX40)) | out-null
    
}

# M3 User-Roles (MNS410) to IPA User-Tasks
sql "SELECT KUUSID, KUROLL FROM MVXJDTA.CMNRUS" | ForEach-Object {
    row $WFUSERTASK ((column "WF-RM-ID" $_.KUUSID), (column "TASK" $_.KUROLL), (column "START-DATE" "00000000"), (column "STOP-DATE" "00000000")) | out-null
}

$x.OuterXml

# PENDING
# cd D:\Infor\LMTST\
# enter.cmd
# secadm -f users.txt -d gen
# env\bin\importPFIdata.bat $dataarea -f users.xml
