/*
Synchronize users between Infor M3 and Infor Process Automation (IPA)
https://m3ideas.org/2016/12/30/user-synchronization-between-m3-and-ipa-part-4
Thibaud Lopez Schneider, 2016-12-31

NOTES:
- Run part 1 and part 2 separately, keeping the result as global variables
- Replace the data area with yours (lmprdlpa in my case)
- Add more fields if needed; currently firstname, lastname, and email address only
- Add more roles if needed; currently InbasketUser_ST only
- To delete, replace action=Create by action=Delete

PENDING:
- Call M3 API REST WS with CORS
*/


// PART 1: run this section on an authenticated Infor Grid web page, and save the serialized result

var users = {};
var roles = {};
var roles_users = {};

(async() => {
	// MNS150
	var response = await fetch("/m3api-rest/execute/MNS150MI/LstUserData;maxrecs=0;returncols=USID,TX40", { credentials: "same-origin", headers: { "Accept": "application/json" }});
	var data = await response.json();
	data.MIRecord.map(r => {
		var USID = r.NameValue[0].Value.trim();
		var TX40 = r.NameValue[1].Value.trim();
		var firstname = TX40.substring(0, TX40.indexOf(" "));
		var lastname = TX40.substring(TX40.indexOf(" ") + 1);
		users[USID] = [firstname, lastname];
	});
	// CRS111
	var response = await fetch("/m3api-rest/execute/CRS111MI/List;maxrecs=0;returncols=EMKY,EMAL?EMTP=04", { credentials: "same-origin", headers: { "Accept": "application/json" }});
	var data = await response.json();
	data.MIRecord.map(r => {
		var EMKY = r.NameValue[0].Value.trim();
		var EMAL = r.NameValue[1].Value.trim();
		users[EMKY].push(EMAL);
	});
	// MNS405
	var response = await fetch("/m3api-rest/execute/MNS410MI/LstRoles;maxrecs=0;returncols=ROLL,TX40", { credentials: "same-origin", headers: { "Accept": "application/json" }});
	var data = await response.json();
	data.MIRecord.map(r => {
		var ROLL = r.NameValue[0].Value.trim();
		var TX40 = r.NameValue[1].Value.trim();
		roles[ROLL] = TX40;
	});
	// MNS410
	for (var ROLL in roles) {
		roles_users[ROLL] = [];
		var response = await fetch("/m3api-rest/execute/MDBREADMI/LstCMNRUS10;maxrecs=0;returncols=USID?ROLL=" + encodeURIComponent(ROLL), { credentials: "same-origin", headers: { "Accept": "application/json" }});
		var data = await response.json();
		data.MIRecord.map(r => {
			var USID = r.NameValue[0].Value.trim();
			roles_users[ROLL].push(USID);
		});
	};
	// DONE
	console.log({
		users: JSON.stringify(users),
		roles: JSON.stringify(roles),
		roles_users: JSON.stringify(roles_users)
	});
})();


// PART 2: run this section on an authenticated IPA web admin page, with users/roles/roles_users previously set as global variables

var actor_roles = ["InbasketUser_ST"];
var dataareas = ["lmtstlpa"];

(async() => {
	// gen
	for (var USID in users) {
		var user = users[USID];
		var firstname = user[0];
		var lastname = user[1];
		var emailaddress = user[2];
		// Identity
		await fetch("/UserManagement/action/Identity._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
			body : JSON.stringify({
				"actionRequestArray" : [{
						"dataView" : {
							"fields" : {
								"Service" : { "value" : "SSOPV2" },
								"FormBasedIdentityProperties_prd_User" : { "value" : USID }
							}
						},
						"actionSpec" : { "type" : "CREATE", "name" : "CreateFormBasedIdentity" }
					}
				],
				"form" : "Identity().CreateFormBasedIdentity" })
		});
		// Actor
		await fetch("/UserManagement/action/Actor._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
			body : JSON.stringify({
				"actionRequestArray" : [{
						"dataView" : {
							"fields" : {
								"Actor" : { "value" : USID },
								"PersonName_prd_GivenName" : { "value" : firstname },
								"PersonName_prd_FamilyName" : { "value" : lastname },
								"ContactInfo_prd_EmailAddress" : { "value" : emailaddress }
							}
						},
						"actionSpec" : { "type" : "CREATE", "name" : "Create" }
					}
				],
				"form" : "Actor.DefaultActorForm" })
		});
		// Actor-Identity
		await fetch("/UserManagement/action/IdentityActor._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
			body : JSON.stringify({
				"actionRequestArray" : [{
						"dataView" : {
							"fields" : {
								"Actor" : { "value" : USID },
								"Service" : { "value" : "SSOPV2" },
								"Identity" : { "value" : "User:" + USID }
							}
						},
						"actionSpec" : { "type" : "CREATE", "name" : "AssignExistingIdentityToActor" }
					}
				],
				"form" : "IdentityActor[ByActSvcIdent]().SecondaryIdentityActorForm" })
		});
		// Actor-Roles
		for (var i in actor_roles) {			
			await fetch("/UserManagement/action/ActorRole._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
				body : JSON.stringify({
					"actionRequestArray" : [{
							"dataView" : {
								"fields" : {
									"Actor" : { "value" : USID },
									"ActorRole_prd_Role" : { "value" : actor_roles[i] }
								}
							},
							"actionSpec" : { "type" : "CREATE", "name" : "AssignExistingRoleToActor" }
						}
					],
					"form" : "ActorRole().DefaultActorRoleForm" })
			});
		}
	}
	// dataarea
	for (var i in dataareas) {
		var dataarea = dataareas[i];
		// Users
		for (var USID in users) {
			await fetch("/" + dataarea + "/LpaAdmin/lm?service=form&action=Create&dataarea=" + dataarea, { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/x-www-form-urlencoded" },
				body : "bto=PfiUserProfile&PfiUserProfile=" + encodeURIComponent(USID)
			});
		}
		// Tasks
		for (var ROLL in roles) {
			var TX40 = roles[ROLL];
			await fetch("/" + dataarea + "/LpaAdmin/lm?service=form&action=Create&dataarea=" + dataarea, { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/x-www-form-urlencoded" },
				body : "bto=PfiTask&PfiTask.TaskName=" + encodeURIComponent(ROLL) + "&Description=" + encodeURIComponent(TX40)
			});
		}
		// User-Tasks
		for (var ROLL in roles_users) {
			var users_ = roles_users[ROLL];
			for (var j in users_) {
				var USID = users_[j];
				await fetch("/" + dataarea + "/LpaAdmin/lm?service=form&action=Create&dataarea=" + dataarea, { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/x-www-form-urlencoded" },
					body : "bto=PfiUserTask&PfiTask.TaskName=" + encodeURIComponent(ROLL) + "&PfiUserProfile=" + encodeURIComponent(USID) + "&PfiTask.TaskType=2"
				});
			}
		}
	}
})();
