/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// Dependencies
var Seq = require('seq'),
	objUtil = require('../../util/Object');

const PERMS = {
	'O': {
		name: 'Owner',
		level: 8
	},
	'S': {
		name: 'SuperUser',
		level: 7
	},
	'P': {
		name: 'PowerUser',
		level: 6
	},
	'~': {
		name: 'founder',
		level: 5
	},
	'&': {
		name: 'admin',
		level: 4
	},
	'@': {
		name: 'op',
		level: 3
	},
	'%': {
		name: 'halfop',
		level: 2
	},
	'+': {
		name: 'voice',
		level: 1
	},
	'': {
		name: 'user',
		level: 0
	}
};
const AUTH_METHODS = [
	'NickServ',
];

/**
 * Gets the human-readable name associated with a permission char.
 *
 * @param {String} permChar The permission char to be named
 * @returns {String|null} The name of the permission, or null if no such
 *      permission char exists
 */
function getPermName(permChar) {
	if (PERMS[permChar])
		return PERMS[permChar].name;
	return null;
}

/**
 * Tests to see if a given permission char ranks equal to or greater than
 * another permission char.
 *
 * @param {String} checkPerm The permission char to be tested
 * @param {String} againstPerm The permission char against which checkPerm
 *      should be compared
 * @returns {boolean} true if the checkPerm ranks equal to or greater than
 *      againstPerm; false otherwise
 */
function permEqualOrGreater(checkPerm, againstPerm) {
	return PERMS[checkPerm].level >= PERMS[againstPerm].level;
}

/**
 * Users acts as the central hub for user accounts and permission checks.
 * Other mods can use this module as a way to check or display permissions
 * for a given user.
 *
 * Users recognizes the following permissions, in order from most to least
 * privileged:
 *      O     Owner. Full access to all commands, cannot be revoked.
 *      S     SuperUser. Full access to all commands, except those which may
 *              impact other Owners or SuperUsers.
 *      P     PowerUser. Limited access to global command set.
 *      ~     Channel founder
 *      &     Channel admin
 *      @     Channel op
 *      %     Channel half-op
 *      +     Voice
 *      ""    (Empty string) A user in a channel
 *      null  No permission (sometimes referred to as 0 for convenience)
 *
 * Permissions O, S, and P are Toady-specific permissions.  User accounts can
 * be added to Toady at those permission levels, and that level trumps any
 * other IRC-based permission level.  Only users who need to be set at one
 * of these permission levels need to be added as users in this mod.  Any IRC
 * user can call commands with channel-specific permissions without being
 * added, given that they are at the appropriate level at which to execute
 * them.
 *
 * User accounts added to this mod must be authenticated with a configured
 * auth method.  At the moment, there is only one auth method:
 *      - NickServ: The user's nick must be registered with NickServ,
 *        the user must be logged in, and NickServ must be online.  Toady will
 *        msg NickServ the Atheme ACC command to determine auth status.  If
 *        ACC is not found, it will switch to Anope's STATUS and try again.
 *
 * The auth method for users can be set globally as the default in the
 * config, or set on a per-user basis.
 *
 * The following config options are available:
 *      - defaultAuthMethod: An auth methods outlined above; case sensitive.
 *      - owner: The nickname of the bot owner.  This account will be
 *        automatically created on launch if it does not exist.
 *      - users: A mapping of lowercase nicknames to objects with a 'perm'
 *        property and optionally an 'authMethod' property.  Perm should be
 *        one of O, S, or P, and authMethod should be one of the above
 *        auth methods (only if it should differ from the default).  Generally,
 *        this is not defined in the config file and is instead managed
 *        through the IRC commands exposed by this module.
 *
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {

	// Bootstrap users
	if (config.owner && !config.users[config.owner.toLowerCase()])
		config.users[config.owner.toLowerCase()] = {perm: 'O'};

	// Bootstrap authentication modules
	var authMods = {};
	AUTH_METHODS.forEach(function(authMethod) {
		var modFunc = require('./authmethods/' + authMethod);
		authMods[authMethod] = modFunc(config, client, modMan);
	});

	/**
	 * Deletes a user from the user list.  Will only succeed if the
	 * execNick has the appropriate permissions.
	 *
	 * @param {String} execNick The user calling the delete command
	 * @param {String} targetNick The user to be deleted
	 * @param {String} replyTo The nick or channel to which the result
	 *      message should be sent.
	 */
	function deleteUser(execNick, targetNick, replyTo) {
		var lowNick = targetNick.toLowerCase(),
			perm;
		Seq()
			.seq(function checkExists() {
				if (!config.users[lowNick]) {
					this(new Error("User '" + targetNick +
						"' does not exist."));
				}
				else
					this();
			})
			.seq(function getExecNickPerm() {
				getGlobalPerm(execNick, this);
			})
			.seq(function checkPerm(cPerm) {
				perm = config.users[lowNick].perm;
				if (!cPerm || (cPerm != 'O' && perm != 'P')) {
					this(new Error("Sorry, you can't delete '" + perm +
						"' users."));
				}
				else this();
			})
			.seq(function deleteUser() {
				delete config.users[lowNick];
				config.save(this);
			})
			.seq(function complete() {
				client.notice(replyTo, 'User [' + perm + ']' + targetNick +
					' deleted.');
			})
			.catch(function(err) {
				client.notice(replyTo, err.message);
			})
	}

	/**
	 * Gets a user's global (non-channel-specific) permission: either O, S, P,
	 * or null if the user has no global permission.
	 *
	 * @param {String} nick The nick to be checked
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {String|null} Either S, O, P, or null
	 */
	function getGlobalPerm(nick, cb) {
		var lowNick = nick.toLowerCase();
		if (config.users[lowNick]) {
			var userConfig = config.users[lowNick],
				authMethod = config.defaultAuthMethod || userConfig.authMethod,
				authMod = authMods[authMethod];
			authMod.isAuthorized(nick, userConfig, function(err, authed) {
				if (err || !authed)
					cb(err);
				else
					cb(null, userConfig.perm);
			});
		}
		else
			cb(null, null);
	}

	/**
	 * Gets the highest permission a user has on any channel they are on, or
	 * globally.
	 *
	 * NOTE: When checking to see if a user has an appropriate level of
	 * permission to complete some task, it is far more resource-friendly
	 * to call {@link #hasPermission} instead.  This function will utilize
	 * the authMethod for the given nick every time, if the nick is a
	 * registered user.
	 *
	 * @param {String} nick The nick for whom a permission should be retrieved
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {String} The highest permission char available for this nick
	 */
	function getHighestPermission(nick, cb) {
		Seq()
			.seq(function callGetGlobalPerm() {
				getGlobalPerm(nick, this);
			})
			.seq(function checkGlobalPerm(perm) {
				if (perm != null)
					cb(null, perm);
				else
					this();
			})
			.seq(function findHighestChannelPerm() {
				var highPerm = null;
				objUtil.forEach(client.chans, function(chan, props) {
					if (props.users[nick]) {
						if (highPerm === null || permEqualOrGreater(
								props.users[nick], highPerm)) {
							highPerm = props.users[nick];
						}
					}
				});
				cb(null, highPerm);
			})
			.catch(function(err) {
				cb(err);
			})
	}

	/**
	 * Gets a user's highest permission on a given channel.  The highest
	 * permission may be O, S, or P for registered users, as it would be
	 * on any channel.
	 *
	 * NOTE: When checking to see if a user has an appropriate level of
	 * permission to complete some task, it is far more resource-friendly
	 * to call {@link #hasPermission} instead.  This function will utilize
	 * the authMethod for the given nick every time, if the nick is a
	 * registered user.
	 *
	 * @param {String} nick The nick for whom a permission should be retrieved
	 * @param {String} channel The channel for which permissions should be
	 *      checked
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {String} The highest permission char available for this nick
	 *            on this channel
	 */
	function getPermission(nick, channel, cb) {
		Seq()
			.seq(function callGetGlobalPerm() {
				getGlobalPerm(nick, this);
			})
			.seq(function checkGlobalPerm(perm) {
				if (perm != null)
					cb(null, perm);
				else
					this();
			})
			.seq(function callGetPermOnChannel() {
				getPermOnChannel(nick, channel, cb);
			})
			.catch(function(err) {
				cb(err);
			})
	}

	/**
	 * Gets a user's highest permission on a given channel, EXCLUDING the
	 * registered user permissions (O, S, and P).
	 *
	 * @param {String} nick The nick for whom a permission should be retrieved
	 * @param {String} channel The channel for which permissions should be
	 *      checked
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {String} The highest permission char available for this nick
	 *            on this channel, excluding O, S, and P.
	 */
	function getPermOnChannel(nick, channel, cb) {
		var chanData = null;
		try {
			chanData = client.chanData(channel);
		}
		catch (e) {}
		if (chanData) {
			cb(null, chanData.users[nick] != undefined ? chanData.users[nick]
				: null);
		}
		else
			cb(null, null);
	}

	/**
	 * Checks to see if a user's global permission level (O, S, or P) is
	 * equal to or greater than a given permission level.
	 *
	 * @param {String} permChar The permission char against which to check
	 *      the user
	 * @param {String} nick The nick of the user to be checked
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {boolean} true if the nick's permission matches or exceeds
	 *            the given permChar; false otherwise
	 */
	function hasGlobalPerm(permChar, nick, cb) {
		getGlobalPerm(nick, function(err, perm) {
			if (err)
				cb(err);
			else if (!perm)
				cb(null, false);
			else
				cb(null, permEqualOrGreater(perm, permChar));
		});
	}

	/**
	 * Checks to see if a user's permission level on a given channel (excluding
	 * O, S, and P) is equal to or greater than a given permission level.
	 *
	 * @param {String} permChar The permission char against which to check
	 *      the user
	 * @param {String} nick The nick of the user to be checked
	 * @param {String} channel The channel from which to pull the nick's
	 *      permission
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {boolean} true if the nick's permission matches or exceeds
	 *            the given permChar; false otherwise
	 */
	function hasPermOnChannel(permChar, nick, channel, cb) {
		getPermOnChannel(nick, channel, function(err, perm) {
			if (err)
				cb(err);
			else if (perm)
				cb(null, permEqualOrGreater(perm, permChar));
			else
				cb(null, false);
		});
	}

	/**
	 * Checks to see if a user's permission level, either globally or on a
	 * given channel, is equal to or greater than a given permission level.
	 * This is the be-all-end-all method to determining if a user has the
	 * appropriate permission to carry out a certain task.
	 *
	 * @param {String} permChar The permission char against which to check the
	 *      user
	 * @param {String} nick The nick of the user to be checked
	 * @param {String|null} channel The channel from which to pull the nick's
	 *      permission, or null to only check registered accounts
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred
	 *          - {boolean} true if the nick's permission matches or exceeds
	 *            the given permChar; false otherwise
	 */
	function hasPermission(permChar, nick, channel, cb) {
		Seq()
			.seq(function checkPermChar() {
				if (!PERMS[permChar]) {
					this(new Error("Permission char '" + permChar +
						"' does not exist."));
				}
				else
					this();
			})
			.seq(function callHasPermOnChannel() {
				if (channel)
					hasPermOnChannel(permChar, nick, channel, this);
				else
					this(null, false);
			})
			.seq(function checkPermOnChannel(hasPerm) {
				if (hasPerm)
					cb(null, true);
				else
					this();
			})
			.seq(function callHasGlobalPerm() {
				hasGlobalPerm(permChar, nick, this);
			})
			.seq(function checkGlobalPerm(hasPerm) {
				if (hasPerm)
					cb(null, true);
				else
					this();
			})
			.seq(function notAuthorized() {
				cb(null, false);
			})
			.catch(function(err) {
				cb(err);
			});
	}

	/**
	 * Lists all registered users in a series of NOTICE commands on IRC.
	 *
	 * @param {String} replyTo The nick or channel to which the user list
	 *      should be sent
	 */
	function listUsers(replyTo) {
		var users = Object.keys(config.users).map(function(user) {
			return '[' + config.users[user].perm + ']' + user;
		}).sort(function(a, b) {
			return a > b;
		});
		client.notice(replyTo, 'All global users:');
		client.notice(replyTo, users.join('  '));
	}

	/**
	 * Creates or updates a user's global account, with a new global permission
	 * (O, S, or P) and an optional authMethod.  The account creator must have
	 * the appropriate permissions to create a user at their given permission
	 * level.
	 *
	 * @param {String} creator The nick of the user creating or modifying
	 *      the account
	 * @param {String} replyTo The nick or channel to which responses should
	 *      be sent
	 * @param {String} nick The nick of the user to create or update
	 * @param {String} perm The permission char to assign to this user
	 * @param {String|null} authMethod The auth method to use for this
	 *      user's account, or null to accept the default (recommended)
	 * @param {boolean} existing true if the nick's account is already
	 *      existing, or false if it should be created.  If the status of
	 *      the account does not coincide with this value, an error will be
	 *      reported.
	 */
	function userSetPermission(creator, replyTo, nick, perm, authMethod,
			existing) {
		var lowNick = nick.toLowerCase(),
			isNew = !config.users[lowNick];
		Seq()
			.seq(function checkExists() {
				if (existing != undefined) {
					if (!existing && config.users[lowNick]) {
						this(new Error("User '" + nick +
							"' already exists."));
					}
					else if (existing && !config.users[lowNick])
						this(new Error("User '" + nick + "' not found."));
					else
						this();
				}
				else this();
			})
			.seq(function getCreatorPerm() {
				getGlobalPerm(creator, this);
			})
			.seq(function checkPerm(cPerm) {
				if (!cPerm || (cPerm != 'O' && perm != 'P')) {
					this(new Error("Sorry, you can't make new '" + perm +
						"' users."));
				}
				else this();
			})
			.seq(function checkAuthMethod() {
				if (authMethod && ! AUTH_METHODS[authMethod]) {
					this(new Error("Auth method '" + authMethod +
						"' does not exist."));
				}
				else this();
			})
			.seq(function createUser() {
				config.users[lowNick] = {};
				config.users[lowNick].perm = perm;
				if (authMethod && authMethod != config.defaultAuthMethod)
					config.users[lowNick].authMethod = authMethod;
				config.save(this);
			})
			.seq(function complete() {
				client.notice(replyTo, 'User [' + perm + ']' + nick +
					(isNew ? ' created.' : ' saved.'));
			})
			.catch(function(err) {
				client.notice(replyTo, err.message);
			});
	}

	return {
		name: 'Permissions',
		desc: "Provides user permission checking per channel or globally",
		version: '0.1.0',
		author: 'Tom Frost',
		commands: {
			viewperm: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					getPermission(args[1], args[2], function(err, perm) {
						if (err) {
							console.log(err.stack);
							client.say(replyTo, 'Error checking permission');
						}
						else if (perm === null) {
							client.say(replyTo, 'I know nothing about ' +
								args[1] + (args[2] ? ' on ' + args[2] :
								' outside of a channel'));
						}
						else {
							client.say(replyTo, args[1] + ' is [' +
								perm + ']' + PERMS[perm].name + (args[2] ?
								' on ' + args[2] : '') + '.');
						}
					})
				},
				desc: "View any user's permission level",
				help: [
					"Format: {cmd} <nick> [#channel]",
					"Examples:",
					"  /msg {nick} {cmd} bob",
					"  {!}{cmd} bob #irchelp"
				],
				minPermission: 'P',
				pattern: /^(\S+)(?:\s+([#&]\S+))?$/
			},
			adduser: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					userSetPermission(from, replyTo, args[1], args[2],
						args[3], false);
				},
				desc: "Adds a global user with privileged permissions",
				help: [
					"Format: {cmd} <nick> <perm> [authMethod]",
					"  nick: The nickname of the user to be added",
					"  perm: One of O, S, or P:",
					"    O: Owner. Full access to all commands, cannot be \
revoked.",
					"    S: SuperUser. Full access to all commands, except \
those which may impact other Owners or SuperUsers.",
					"    P: PowerUser. Limited access to global command set.",
					"  authMethod: The method by which this user will be \
authenticated.",
					"    (if not specified, '" + config.defaultAuthMethod +
						"' is configured to be used)",
					" ",
					"Unless being set by an Owner, permission can only be \
set underneath your own level.",
					" ",
					"Example:",
					"  /msg {nick} {cmd} Bob S"
				],
				minPermission: 'S',
				pattern: /^(\S+)\s+([OSP])(?:\s+(\S+))?$/
			},
			updateuser: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					userSetPermission(from, replyTo, args[1], args[2],
						args[3], true);
				},
				desc: "Modifies a global user's permissions",
				help: [
					"Format: {cmd} <nick> <perm> [authMethod]",
					"  nick: The nickname of the user to be added",
					"  perm: One of O, S, or P:",
					"    O: Owner. Full access to all commands, cannot be \
revoked.",
					"    S: SuperUser. Full access to all commands, except \
those which may impact other Owners or SuperUsers.",
					"    P: PowerUser. Limited access to global command set.",
					"  authMethod: The method by which this user will be \
authenticated.",
					"    (if not specified, '" + config.defaultAuthMethod +
						"' is configured to be used)",
					" ",
					"Unless being set by an Owner, permission can only be \
set underneath your own level.",
					" ",
					"Example:",
					"  /msg {nick} {cmd} Bob P"
				],
				minPermission: 'S',
				pattern: /^(\S+)\s+([OSP])(?:\s+(\S+))?$/
			},
			deleteuser: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					deleteUser(from, args[1], replyTo);
				},
				desc: "Deletes a global user",
				help: [
					"Format: {cmd} <nick>",
					"  nick: The user to be deleted",
					" ",
					"Unless deleted by an owner, only users under your \
current permission level can be deleted.",
					" ",
					"Example:",
					"  /msg {nick} {cmd} Bob"
				],
				minPermission: 'S',
				pattern: /^(\S+)$/
			},
			listusers: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					listUsers(replyTo);
				},
				desc: "Lists all global bot users",
				help: [
					"Format: {cmd}",
					" ",
					"Example:",
					"  /msg {nick} {cmd}"
				],
				minPermission: 'P'
			}
		},
		blockUnload: true,
		getPermission: getPermission,
		getHighestPermission: getHighestPermission,
		getPermName: getPermName,
		hasPermission: hasPermission,
		permEqualOrGreater: permEqualOrGreater,
		unload: function() {
			objUtil.forEach(authMods, function(id, authMod) {
				if (authMod.unload)
					authMod.unload();
			});
		}
	};
};

module.exports.configDefaults = {
	defaultAuthMethod: 'NickServ',
	users: {}
};
