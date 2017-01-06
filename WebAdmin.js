/*
Synchronize users between Infor M3 and Infor Process Automation (IPA)
https://m3ideas.org/2016/12/30/user-synchronization-between-m3-and-ipa-part-4
Thibaud Lopez Schneider, 2017-01-05

VERSIONS:
V7: 2017-01-05: added actions Update/Delete for all /LpaAdmin (Users, Tasks, User-Tasks) + added DONE at end + corrected ETA
V6: 2017-01-05: added time estimate + non-empty firstname/lastname
V5: 2017-01-05: added loop for multiple actions
V4: 2017-01-05: added the /UserManagement response message to the output console + fixed the UserManagement body + fixed actions Create/Update/Delete
V3: 2017-01-04: added M3 API verification 'if (data.MIRecord)' for when there's no record returned
V2: 2016-12-31: added M3 API to extract MNS150, CRS111, MNS405, MNS410, instead of manual variables
V1: 2016-12-30: added fetch API to /LpaAdmin for Users, Tasks, User-Tasks
V0: 2016-12-30: added fetch API to /UserManagement for Identity, Actor, Actor-Identity, Actor-Roles
	
NOTES:
- Run part 1 and part 2 separately, keeping the result as global variables
- Set the variable actions (e.g. Create|Update|Delete) (it works correctly with: Identity, Actor, Actor-Identity, Actor-Roles, except for Actor-Roles it gives false messages that record doesn't exist or already exists when it's not true)
- Set the variable actor_roles (e.g. InbasketUser_ST)
- Set the variable dataareas (e.g. lmtstlpa)
- Add more fields to the Actor if needed (currently firstname, lastname, and email address only)

PENDING:
- Call M3 API REST WS with CORS (part 1), with host:port and user:password, to be able to execute within context of part 2
- Update/Delete of all /LpaAdmin (Users, Tasks, User-Tasks), haven't tried yet
- Show response of all /LpaAdmin (Users, Tasks, User-Tasks), it's malformed XHTML
*/


// PART 1: run this section on an authenticated Infor Grid web page, and save the serialized result

var users = {};
var roles = {};
var roles_users = {};

(async() => {
	// MNS150
	var response = await fetch("/m3api-rest/execute/MNS150MI/LstUserData;maxrecs=0;returncols=USID,TX40", { credentials: "same-origin", headers: { "Accept": "application/json" }});
	var data = await response.json();
	if (data.MIRecord) data.MIRecord.map(r => {
		var USID = r.NameValue[0].Value.trim();
		var TX40 = r.NameValue[1].Value.trim();
		var firstname = TX40.substring(0, TX40.indexOf(" ")); firstname = (firstname.length != 0 ? firstname : ".");
		var lastname = TX40.substring(TX40.indexOf(" ") + 1); lastname = (lastname.length != 0 ? lastname : ".");
		users[USID] = [firstname, lastname, ""];
	});
	// CRS111
	var response = await fetch("/m3api-rest/execute/CRS111MI/List;maxrecs=0;returncols=EMKY,EMAL?EMTP=04", { credentials: "same-origin", headers: { "Accept": "application/json" }});
	var data = await response.json();
	if (data.MIRecord) data.MIRecord.map(r => {
		var EMKY = r.NameValue[0].Value.trim();
		var EMAL = r.NameValue[1].Value.trim();
		users[EMKY][2] = EMAL;
	});
	// MNS405
	var response = await fetch("/m3api-rest/execute/MNS410MI/LstRoles;maxrecs=0;returncols=ROLL,TX40", { credentials: "same-origin", headers: { "Accept": "application/json" }});
	var data = await response.json();
	if (data.MIRecord) data.MIRecord.map(r => {
		var ROLL = r.NameValue[0].Value.trim();
		var TX40 = r.NameValue[1].Value.trim();
		roles[ROLL] = TX40;
	});
	// MNS410
	for (var ROLL in roles) {
		roles_users[ROLL] = [];
		var response = await fetch("/m3api-rest/execute/MDBREADMI/LstCMNRUS10;maxrecs=0;returncols=USID?ROLL=" + encodeURIComponent(ROLL), { credentials: "same-origin", headers: { "Accept": "application/json" }});
		var data = await response.json();
		if (data.MIRecord) data.MIRecord.map(r => {
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

var actions = ["Create", "Update"]; // e.g. Create, Update, Delete
var actor_roles = ["InbasketUser_ST"]; // BasicAdminAccess_ST, ConfigConsoleSecurityAdmin_ST, DataAreaAdmin_ST, GlobalUIConfigAccess, InbasketUser_ST, JobQueueServer_ST, LsuserappAccess_ST, ProcessAutomationReporting_ST, ProcessDesigner_ST, ProcessServerAllAccess_ST, ProcessServerReadAccess_ST, SecurityAdministrator_ST, 
var dataareas = ["lmtstlpa"]; // e.g. lmdevlpa, lmtstlpa

// ETA
var u = Object.keys(users).length;
var v = Object.keys(roles).length;
var w = 0; for (var ROLL in roles_users) w += roles_users[ROLL].length; w
var x = actions.length;
var y = actor_roles.length;
var z = dataareas.length;
var n = x*(u*(3+y)+z*(u+v+w));
console.log("Number of requests: " + Number(n).toLocaleString());
console.log("Estimated duration: " + Number(Math.round(n*0.133/60)).toLocaleString() + "mn");

(async() => {
	for (var i in actions) {
		var action = actions[i];
		// gen
		for (var USID in users) {
			var user = users[USID];
			var firstname = user[0];
			var lastname = user[1];
			var emailaddress = user[2];

			// Identity
			var response = await fetch("/UserManagement/action/Identity._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
				body : JSON.stringify({
					"actionRequestArray" : [{
							"dataView" : {
								"fields" : {
									"Service" : { "value" : "SSOPV2" },
									"Identity" : { "value" : "User:" + USID },
									"ServiceType": { "value" : "FormBased" }
								}
							},
							"actionSpec" : { "name" : action }
						}
					],
					"list" : "Identity().IdentityList" })
			});
			var data = await response.json();
			if (data) console.log([data[0].dataView.fields.Service.value, data[0].dataView.fields.Identity.value, data[0].message]);

			// Actor
			var response = await fetch("/UserManagement/action/Actor._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
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
							"actionSpec" : { "name" : action }
						}
					],
					"form" : "Actor.DefaultActorForm" })
			});
			var data = await response.json();
			if (data) console.log([data[0].dataView.fields.Actor.value, data[0].message]);

			// Actor-Identity
			var response = await fetch("/UserManagement/action/IdentityActor._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
				body : JSON.stringify({
					"actionRequestArray" : [{
							"dataView" : {
								"fields" : {
									"Actor" : { "value" : USID },
									"Service" : { "value" : "SSOPV2" },
									"Identity" : { "value" : "User:" + USID }
								}
							},
							"actionSpec" : { "name" : action }
						}
					],
					"list" : "IdentityActor().SecondaryIdentityActorList" })
			});
			var data = await response.json();
			if (data) console.log([data[0].dataView.fields.Actor.value, data[0].dataView.fields.Service.value, data[0].dataView.fields.Identity.value, data[0].message]);

			// Actor-Roles
			for (var j in actor_roles) {			
				var response = await fetch("/UserManagement/action/ActorRole._execute?csk.gen=true", { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/json; charset=UTF-8" },
					body : JSON.stringify({
						"actionRequestArray" : [{
								"dataView" : {
									"fields" : {
										"Actor" : { "value" : USID },
										"ActorRole_prd_Role" : { "value" : actor_roles[j] }
									}
								},
								"actionSpec" : { "name" : action }
							}
						],
						"form" : "ActorRole().DefaultActorRoleForm" })
				});
				var data = await response.json();
				if (data) console.log([data[0].dataView.fields.Actor.value, data[0].dataView.fields.ActorRole_prd_Role.value, data[0].message]);
			}
		}
		// dataarea
		for (var k in dataareas) {
			var dataarea = dataareas[k];
			// Users
			for (var USID in users) {
				var response = await fetch("/" + dataarea + "/LpaAdmin/lm?service=form&action=" + action + "&dataarea=" + dataarea, { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/x-www-form-urlencoded" },
					body : "bto=PfiUserProfile&PfiUserProfile=" + encodeURIComponent(USID)
				});
				var text = await response.text();
			}
			// Tasks
			for (var ROLL in roles) {
				var TX40 = roles[ROLL];
				var response = await fetch("/" + dataarea + "/LpaAdmin/lm?service=form&action=" + action + "&dataarea=" + dataarea, { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/x-www-form-urlencoded" },
					body : "bto=PfiTask&PfiTask.TaskName=" + encodeURIComponent(ROLL) + "&Description=" + encodeURIComponent(TX40)
				});
				var text = await response.text();
			}
			// User-Tasks
			for (var ROLL in roles_users) {
				var users_ = roles_users[ROLL];
				for (var j in users_) {
					var USID = users_[j];
					var response = await fetch("/" + dataarea + "/LpaAdmin/lm?service=form&action=" + action + "&dataarea=" + dataarea, { credentials: "same-origin", method: "POST", headers: { "Content-Type" : "application/x-www-form-urlencoded" },
						body : "bto=PfiUserTask&PfiTask.TaskName=" + encodeURIComponent(ROLL) + "&PfiUserProfile=" + encodeURIComponent(USID) + "&PfiTask.TaskType=2"
					});
					var text = await response.text();
				}
			}
		}
	}
	// DONE
	console.log("DONE");
})();
