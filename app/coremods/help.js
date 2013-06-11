/*
 * Toady
 * Copyright 2013 Tom Frost
 */

var objUtil = require('../util/Object'),
	modLoad = require('../modmanager/ModLoader'),
	pkgjson = require('../../package.json'),
	name = pkgjson.name,
	version = pkgjson.version,
	author = pkgjson.author,
	url = pkgjson.homepage;

const PERM_CHARS = ['O', 'S', 'P', '~', '&', '@', '%', '+', '', '0'];

function padStr(str, len) {
	while (str.length < len)
		str += ' ';
	return str;
}

/**
 * Help provides all user commands necessary to display mod and command
 * metadata in a digestible format.
 *
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {

	/**
	 * Gets an object mapping of all Mod IDs to an additional object mapping
	 * of command IDs to command objects.  This result set will be limited to
	 * commands requiring permissions equal to or less than maxPerm, and
	 * mods which contain commands after that filter is applied.
	 *
	 * @param {String} maxPerm The maximum permission char for which to
	 *      return commands
	 * @returns {Object} An object mapping mod IDs to objects mapping command
	 *      IDs to commands, where each command's required permission is equal
	 *      to or less than maxPerm
	 */
	function getModCommands(maxPerm) {
		var mods = modMan.getMods(),
			pMod = modMan.getMod('users'),
			modCommands = {};
		if (!maxPerm && maxPerm != '')
			maxPerm = null;
		mods.forEach(function(mod) {
			objUtil.forEach(mod.commands || {}, function(cmdId, cmd) {
				var hasPerm = cmd.hasOwnProperty('minPermission');
				if (!cmd.hidden && (!hasPerm || (maxPerm !== null && hasPerm &&
						pMod.permEqualOrGreater(maxPerm, cmd.minPermission)))) {
					if (!modCommands[mod.id])
						modCommands[mod.id] = {};
					modCommands[mod.id][cmdId] = cmd;
				}
			});
		});
		return modCommands;
	}

	/**
	 * Gets an object mapping of permission characters to another mapping of
	 * command IDs to command objects, grouping together all the commands
	 * that fall into that permission level for a given mod.  Only commands
	 * with required permissions equal to or less than maxPerm will be
	 * included.  Commands which do not have a required permission will
	 * be grouped under the "0" key.  Commands which only require a user's
	 * presence in a channel will be grouped under the "" key.
	 *
	 * @param {Object} mod A mod object whose commands should be sorted by
	 *      permission
	 * @param {String} maxPerm The permission char by which to limit the
	 *      returned commands
	 * @returns {Object} An object mapping of permission chars to an object
	 *      mapping command IDs to command objects
	 */
	function getCommandsByPerm(mod, maxPerm) {
		var pMod = modMan.getMod('users'),
			cmds = {};
		if (mod.commands) {
			objUtil.forEach(mod.commands, function(cmdId, cmd) {
				var perm = cmd.minPermission == undefined ? '0' :
						cmd.minPermission;
				if (!cmd.hidden && (perm == '0' ||
						pMod.permEqualOrGreater(maxPerm, perm))) {
					if (!cmds[perm])
						cmds[perm] = {};
					cmds[perm][cmdId] = cmd;
				}
			});
		}
		return cmds;
	}

	/**
	 * Sends an array of messages to the given target as irc NOTICEs one at
	 * a time, optionally replacing placeholders with actual values.
	 * Placeholders within the string should be put in curly braces.  For
	 * example:
	 *
	 *      "My name is {nick}"
	 *
	 * The 'replace' object then maps the text inside the braces to what
	 * should be inserted in their place.  For example:
	 *
	 *      {
	 *          nick: "Toady"
	 *      }
	 *
	 * @param {String} target The channel or nick to which the notices should
	 *      be sent
	 * @param {Array} messages An array of strings to be sent to the target
	 *      sequentially
	 * @param {Object} replace An object mapping placeholder text to the
	 *      strings that the braces and placeholders should be replaced with
	 */
	function sendNotices(target, messages, replace) {
		messages.forEach(function(msg) {
			if (replace) {
				objUtil.forEach(replace, function(str, repl) {
					msg = msg.replace('{' + str + '}', repl);
				});
			}
			client.notice(target, msg);
		});
	}

	/**
	 * Offers help for a specific command ID.
	 *
	 * @param {String} nick The nick to which the help notices should be sent
	 * @param {String} cmdId The ID of the command for which the help page
	 *      should be sent
	 */
	function showCommand(nick, cmdId) {
		var pMod = modMan.getMod('users'),
			cmd = modMan.getCommand(cmdId),
			fantasyChar = modMan.getMod('commandrunner').getFantasyChar();
		if (cmd) {
			var messages = [
				'***** {nick} Help *****',
				'COMMAND: {cmd}'
			];
			if (cmd.minPermission) {
				messages.push('REQUIRED PERMISSION: [' + cmd.minPermission +
					']' + pMod.getPermName(cmd.minPermission));
			}
			messages = messages.concat([
				'Provided by {mod} v{version} ({modId})',
				' '
			]);
			messages.push(cmd.desc);
			messages = messages.concat(cmd.help);
			messages.push('***** End of Help *****');
			sendNotices(nick, messages, {
				nick: client.nick,
				"!": fantasyChar,
				cmd: cmdId,
				mod: cmd.mod.name,
				modId: cmd.mod.id,
				version: cmd.mod.version
			});
		}
		else
			client.notice(nick, 'Command ' + cmdId + ' does not exist.');
	}

	/**
	 * Sends the main help page in irc NOTICEs to a given nick.
	 *
	 * @param {String} nick The user to receive the help page
	 * @param {String} maxPerm The highest permission for which to send
	 *      commands.  If this is set to the user's highest permission, they
	 *      will only see commands they have the ability to execute on at
	 *      least one channel
	 */
	function showMain(nick, maxPerm) {
		var fantasyChar = modMan.getMod('commandrunner').getFantasyChar(),
			modCmds = getModCommands(maxPerm),
			modIds = Object.keys(modCmds).sort(function(a, b) {
				return a > b;
			});
		var messages = [
			'***** {nick} Help *****',
			name + ' v' + version + ' written by ' + author,
			'Get yourself a Toady: ' + url,
			' ',
			'To execute any command, you can send it like this:',
			'/msg {nick} COMMAND [other options here]',
			'Or say it in a channel I\'m in:',
			'{!}COMMAND [other options here]',
			'Type /msg {nick} help COMMAND for help on a specific command.',
			' ',
			'Modules with available commands:'
		];
		modIds.forEach(function(modId) {
			var mod = modMan.getMod(modId),
				cmds = modCmds[modId];
			messages.push(mod.name + ' v' + mod.version);
			objUtil.forEach(cmds, function(cmdId, cmd) {
				messages.push('  ' + padStr(cmdId, 15) + ' ' + cmd.desc);
			});
			messages.push(' ');
		});
		messages.push('***** End of Help *****');
		sendNotices(nick, messages, {
			nick: client.nick,
			"!": fantasyChar
		});
	}

	/**
	 * Shows the help page for a given mod, limiting the command listing to
	 * only commands requiring permissions equal to or less than maxPerm.
	 *
	 * @param {String} nick The user to whom the help page should be sent
	 * @param {String} modId The ID of the mod for which to display help
	 * @param {String} maxPerm The highest permission char for which to limit
	 *      the resulting command set
	 */
	function showMod(nick, modId, maxPerm) {
		var pMod = modMan.getMod('users'),
			mod = modMan.getMod(modId);
		if (mod) {
			var permCmds = getCommandsByPerm(mod, maxPerm),
				messages = [
				'***** {nick} Help *****',
				mod.name + ' v' + mod.version + ' (' + modId + ')',
				'Author: ' + mod.author
			];
			if (mod.url)
				messages.push('Website: ' + mod.url);
			messages.push(mod.desc);
			for (var i = 0; i < PERM_CHARS.length; i++) {
				var cmds = permCmds[PERM_CHARS[i]];
				if (cmds) {
					var permStr;
					switch (PERM_CHARS[i]) {
						case '': permStr = 'User'; break;
						case '0': permStr = 'Global'; break;
						default: permStr = '[' + PERM_CHARS[i] + ']' +
							pMod.getPermName(PERM_CHARS[i]);
					}
					messages.push(' ');
					messages.push(permStr + ':');
					objUtil.forEach(cmds, function(cmdId, cmd) {
						messages.push('  ' + padStr(cmdId, 15) + ' ' +
							cmd.desc);
					});
				}
			}
			messages.push('***** End of Help *****');
			sendNotices(nick, messages, {
				nick: client.nick
			});
		}
		else
			client.notice(nick, "Mod '" + modId + "' doesn't exist.");
	}

	/**
	 * Displays a list of all mods, loaded and not.
	 *
	 * @param nick
	 */
	function showModList(nick) {
		var modIds = modMan.getLoadedModIds().sort(function(a, b) {
				return a > b;
			}),
			messages = [
				'***** ' + client.nick + ' Help *****',
				'For more information on any loaded mod, type:',
				'/msg ' + client.nick + ' viewmod MODULE',
				' ',
				'Loaded mods:'
			];
		modIds.forEach(function(modId) {
			var mod = modMan.getMod(modId);
			messages.push('  ' + padStr(modId, 15) + ' ' + mod.desc);
		});
		modLoad.getUserModIds(function(err, ids) {
			if (!err && ids.length) {
				var availIds = [];
				ids.forEach(function(id) {
					if (!modMan.isLoaded(id))
						availIds.push(id);
				});
				availIds = availIds.sort(function(a, b) {
					return a > b;
				});
				messages.push(' ');
				messages.push('Available to be loaded:');
				messages.push(availIds.join(', '));
			}
			messages.push('***** End of Help *****');
			sendNotices(nick, messages);
		});
	}

	return {
		name: 'Help',
		desc: "Provides help for bot commands",
		version: '0.1.0',
		author: 'Tom Frost',
		commands: {
			help: {
				handler: function(from, to, target, args) {
					if (args[1])
						showCommand(from, args[1]);
					else {
						var pMod = modMan.getMod('users');
						pMod.getHighestPermission(from, function(err, perm) {
							showMain(from, perm);
						});
					}
				},
				desc: "Shows the help page for a specific command, or lists \
commands",
				help: [
					"Format: {cmd} [command]",
					"Examples:",
					"  /msg {nick} {cmd}",
					"  {!}{cmd} say"
				],
				pattern: /^(\S+)?$/
			},
			listmods: {
				handler: function(from, to, target, args) {
					showModList(from);
				},
				desc: "Displays a list of all loaded and unloaded mods",
				help: [
					"Format: {cmd}",
					"Example:",
					"  /msg {nick} {cmd}"
				]
			},
			viewmod: {
				handler: function(from, to, target, args) {
					var pMod = modMan.getMod('users');
					pMod.getHighestPermission(from, function(err, perm) {
						showMod(from, args[1], perm);
					});
				},
				desc: "Shows the information associated with a given mod",
				help: [
					"Format: {cmd} [modId]",
					"Examples:",
					"  /msg {nick} {cmd} remote",
					"  {!}{cmd} help"
				],
				pattern: /^(\S+)$/
			}
		}
	};
};