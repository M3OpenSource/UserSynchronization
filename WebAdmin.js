/*
Synchronize users between Infor M3 and Infor Process Automation (IPA)
https://m3ideas.org/2016/12/30/user-synchronization-between-m3-and-ipa-part-4
Thibaud Lopez Schneider, 2016-12-30

NOTES:
- Replace the data area with yours (lmprdlpa in my case)
- Add more fields if needed; currently firstname, lastname, and email address only
- Add more roles if needed; currently InbasketUser_ST only

PENDING:
- Generate the list of users with SQL or M3 API (from MNS150 and CRS111)
- The Promises below will execute concurrently and will fail; I need to order them sequentially in nested .then() ; meanwhile, run the code one block at a time
- Create the Tasks (from MNS405)
- Create User-Tasks (from MNS410)
- Make loop for multiple data areas (e.g. DEV, EDU, TST, PRD)
*/

// USID, firstname, lastname, email address
var users = [
	["THIBAUD0", "Thibaud0", "Lopez Schneider 0", "tlopezschneider0@ciber.com"],
	["THIBAUD1", "Thibaud1", "Lopez Schneider 1", "tlopezschneider1@ciber.com"],
	["THIBAUD2", "Thibaud2", "Lopez Schneider 2", "tlopezschneider2@ciber.com"],
	["THIBAUD3", "Thibaud3", "Lopez Schneider 3", "tlopezschneider3@ciber.com"],
	["THIBAUD4", "Thibaud4", "Lopez Schneider 4", "tlopezschneider4@ciber.com"],
	["THIBAUD5", "Thibaud5", "Lopez Schneider 5", "tlopezschneider5@ciber.com"],
	["THIBAUD6", "Thibaud6", "Lopez Schneider 6", "tlopezschneider6@ciber.com"],
	["THIBAUD7", "Thibaud7", "Lopez Schneider 7", "tlopezschneider7@ciber.com"],
	["THIBAUD8", "Thibaud8", "Lopez Schneider 8", "tlopezschneider8@ciber.com"],
	["THIBAUD9", "Thibaud9", "Lopez Schneider 9", "tlopezschneider9@ciber.com"]
];

// Identities
users.forEach(user => fetch("/UserManagement/action/Identity._execute?csk.gen=true", {
	credentials : "same-origin",
	method : "POST",
	headers : {
		"Content-Type" : "application/json; charset=UTF-8"
	},
	body : JSON.stringify({
		"actionRequestArray" : [{
				"dataView" : {
					"fields" : {
						"Service" : {
							"value" : "SSOPV2"
						},
						"FormBasedIdentityProperties_prd_User" : {
							"value" : user[0]
						}
					}
				},
				"actionSpec" : {
					"type" : "CREATE",
					"name" : "CreateFormBasedIdentity"
				}
			}
		],
		"form" : "Identity().CreateFormBasedIdentity"
	})
}));

// Actors
users.forEach(user => fetch("/UserManagement/action/Actor._execute?csk.gen=true", {
	credentials : "same-origin",
	method : "POST",
	headers : {
		"Content-Type" : "application/json; charset=UTF-8"
	},
	body : JSON.stringify({
		"actionRequestArray" : [{
				"dataView" : {
					"fields" : {
						"Actor" : {
							"value" : user[0]
						},
						"PersonName_prd_GivenName" : {
							"value" : user[1]
						},
						"PersonName_prd_FamilyName" : {
							"value" : user[2]
						},
						"ContactInfo_prd_EmailAddress" : {
							"value" : user[3]
						}
					}
				},
				"actionSpec" : {
					"type" : "CREATE",
					"name" : "Create"
				}
			}
		],
		"form" : "Actor.DefaultActorForm"
	})
}));

// Actor-Identities
users.forEach(user => fetch("/UserManagement/action/IdentityActor._execute?csk.gen=true", {
	credentials : "same-origin",
	method : "POST",
	headers : {
		"Content-Type" : "application/json; charset=UTF-8"
	},
	body : JSON.stringify({
		"actionRequestArray" : [{
				"dataView" : {
					"fields" : {
						"Actor" : {
							"value" : user[0]
						},
						"Service" : {
							"value" : "SSOPV2"
						},
						"Identity" : {
							"value" : "User:" + user[0]
						}
					}
				},
				"actionSpec" : {
					"type" : "CREATE",
					"name" : "AssignExistingIdentityToActor"
				}
			}
		],
		"form" : "IdentityActor[ByActSvcIdent]().SecondaryIdentityActorForm"
	})
}));

// Actor-Roles
users.forEach(user => fetch("/UserManagement/action/ActorRole._execute?csk.gen=true", {
	credentials : "same-origin",
	method : "POST",
	headers : {
		"Content-Type" : "application/json; charset=UTF-8"
	},
	body : JSON.stringify({
		"actionRequestArray" : [{
				"dataView" : {
					"fields" : {
						"Actor" : {
							"value" : user[0]
						},
						"ActorRole_prd_Role" : {
							"value" : "InbasketUser_ST"
						}
					},
				},
				"actionSpec" : {
					"type" : "CREATE",
					"name" : "AssignExistingRoleToActor"
				}
			}
		],
		"form" : "ActorRole().DefaultActorRoleForm"
	})
}));

// Users
users.forEach(user => fetch("/lmprdlpa/LpaAdmin/lm?service=form&action=Create&dataarea=lmprdlpa", {
	credentials : "same-origin",
	method : "POST",
	headers : {
		"Content-Type" : "application/x-www-form-urlencoded"
	},
	body : "bto=PfiUserProfile&PfiUserProfile=" + encodeURIComponent(user[0])
}));
