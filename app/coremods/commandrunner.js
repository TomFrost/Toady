/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// Dependencies
var Seq = require('seq');

const CHAN_PREFIXES = "#&";
const PERMISSIONS_MOD = 'users';

/**
 * Command Runner handles all execution of commands, including formatting
 * and permissions enforcement.  It exposes no commands of its own.
 *
 * Available config options:
 *      - fantasyChar (default "!"): The character which should precede
 *        commands said in a channel
 *
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {

	/**
	 * Applies a regex pattern to the string of arguments following a
	 * command, and returns the matches in the callback.  If the pattern
	 * does not match, a user-appropriate error message will be sent in the
	 * error response.
	 *
	 * @param {boolean} inChan true if the command was said in a channel;
	 *      false otherwise.
	 * @param {Object} cmd The command object that was triggered
	 * @param {String} cmdText The line of text following the command (and
	 *      optional target)
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if the pattern did not match
	 *          - {Array} An array of matches, with the first element being
	 *            the full string that matched
	 */
	function applyPattern(inChan, cmd, cmdText, cb) {
		var args = [cmdText],
			err = null;
		if (cmd.pattern) {
			args = cmdText.match(cmd.pattern);
			if (!args) {
				err = new Error( "Sorry, that's the wrong format for '" +
					cmd.id + "'.  Try \"" + (inChan ? config.fantasyChar : '')
					+ "help " + cmd.id + "\" for more info.");
				err.userError = true;
			}
		}
		cb(err, args);
	}

	/**
	 * Asserts that a user has the appropriate permissions to execute a
	 * given command, and calls back with an error if not.
	 *
	 * @param {Object} cmd The command object to be tested against
	 * @param {String} nick Thenickname of the user whose permissions are to
	 *      be checked
	 * @param {String} target The command target, if applicable.  Set to null
	 *      if this command does not require a target.
	 * @param {function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred or if the user
	 *            does not have the appropriate permissions to run the command
	 */
	function assertPermission(cmd, nick, target, cb) {
		Seq()
			.seq(function checkNeedsPermission() {
				if (cmd.minPermission)
					this();
				else
					cb();
			})
			.seq(function getPermissionsMod() {
				var pMod = modMan.getMod(PERMISSIONS_MOD);
				if (!pMod)
					this(new Error("Permissions module not found"));
				else
					this(null, pMod);
			})
			.seq(function checkPermission(pMod) {
				this.vars.pMod = pMod;
				var channel = cmd.targetChannel ? target : null;
				pMod.hasPermission(cmd.minPermission, nick, channel, this);
			})
			.seq(function complete(allowed) {
				if (allowed)
					cb();
				else {
					var pMod = this.vars.pMod,
						context = target ? ' in ' + target : '',
						permName = pMod.getPermName(cmd.minPermission),
						err = new Error("Sorry, you must be " + permName +
						" or higher" + context + " to execute '" + cmd.id +
						"'.");
					err.userError = true;
					cb(err);
				}
			})
			.catch(function(err) {
				cb(err);
			});
	}

	/**
	 * Removes the target from the command text, if the command calls for it,
	 * and returns both the target and the updated command args in the
	 * callback.
	 *
	 * @param {boolean} inChan true if the command was triggered in a channel;
	 *      false otherwise
	 * @param {Object} cmd The command object being executed
	 * @param {String} cmdText The text following the command
	 * @param {String} context The channel name if the command was said in a
	 *      channel, or the bot name otherwise
	 * @param {Function} cb A callback function to be executed on completion.
	 *      Arguments provided are:
	 *          - {Error} An error object, if an error occurred or if a target
	 *            is required for this command but not included
	 *          - {String} The target (a channel or nick, depending on the
	 *            command)
	 *          - {String} The new argument string for the command, with the
	 *            target split off.
	 */
	function splitTarget(inChan, cmd, cmdText, context, cb) {
		var target = null,
			err = null,
			args = cmdText;
		if (cmd.targetChannel || cmd.targetNick) {
			var targetRegex = cmd.targetNick ? '(\\S+)' :
					'([' + CHAN_PREFIXES + ']\\S+)?',
				regex = new RegExp('^' + targetRegex + '\\s?(.*)$'),
				targetArgs = cmdText.match(regex);
			target = targetArgs[1];
			args = targetArgs[2];
			if (cmd.targetChannel && !target) {
				if (inChan)
					target = context;
				else {
					err = new Error("I need a target channel for the '" +
						cmd.id + "' command.  Try \"help " + cmd.id +
						"\" for more info.");
					err.userError = true;
				}
			}
		}
		cb(err, target, args);
	}

	/**
	 * Listens for a command to be spoken in a channel, or directly in a
	 * private message.  This function is an event listener and should be
	 * added to the 'message' event of the IRC client library.
	 *
	 * @param {String} nick The nick originating the message
	 * @param {String} to The channel or nickname to which the message was sent
	 * @param {String} text The text of the message
	 */
	function handleMessage(nick, to, text) {
		var split = text.match(/^(\S+)\s*(.*)$/),
			fantasy = split[1][0] == config.fantasyChar,
			cmdId = (fantasy ? split[1].substr(1) : split[1]).toLowerCase(),
			inChan = CHAN_PREFIXES.indexOf(to[0]) != -1,
			cmdText = split[2],
			cmds = modMan.getCommands();
		Seq()
			.seq(function getCmd() {
				if (((fantasy && inChan) || !inChan) && cmds[cmdId])
					this(null, cmds[cmdId]);
			})
			.seq(function callSplitTarget(cmd) {
				this.vars.cmd = cmd;
				splitTarget(inChan, cmd, cmdText, to, this);
			})
			.seq(function callApplyPattern(target, args) {
				this.vars.target = target;
				applyPattern(inChan, this.vars.cmd, args, this);
			})
			.seq(function callAssertPermission(args) {
				this.vars.args = args;
				assertPermission(this.vars.cmd, nick, this.vars.target, this);
			})
			.seq(function executeCmd() {
				var cmdArgs = {
					nick: nick,
					to: to,
					target: this.vars.target,
					args: this.vars.args,
					cmd: this.vars.cmd
				};
				modMan.emit('command', cmdArgs);
				modMan.emit('command:' + cmdId, cmdArgs);
				this.vars.cmd.handler(nick, to, this.vars.target,
					this.vars.args);
			})
			.catch(function(err) {
				if (err.userError)
					client.notice(inChan ? to : nick, err.message);
				else {
					console.log("FAILED RUNNING COMMAND '" + cmdId + "'",
						err.stack || err);
				}
			});
	}
	client.on('message', handleMessage);

	return {
		name: 'Command Runner',
		desc: "Handles the execution of user-triggered commands",
		version: '0.1.0',
		author: 'Tom Frost',
		blockUnload: true,
		unload: function() {
			client.removeListener('message', handleMessage);
		},
		getFantasyChar: function() {
			return config.fantasyChar;
		}
	};
};

module.exports.configDefaults = {
	fantasyChar: '!'
};
