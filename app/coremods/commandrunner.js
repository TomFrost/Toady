/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

var log = require('../../lib/log');
var util = require('util');

const CHAN_PREFIXES = '#&';
const PERMISSIONS_MOD = 'users';

/**
 * Command Runner handles all execution of commands, including formatting
 * and permissions enforcement.  It exposes no commands of its own.
 *
 * Available config options:
 *    - fantasyChar (default "!"): The character which should precede
 *      commands said in a channel
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
   * @param {boolean} inChan true if the command was said in a channel;
   *    false otherwise.
   * @param {Object} cmd The command object that was triggered
   * @param {string} cmdText The line of text following the command (and
   *    optional target)
   * @returns {Array<string>} Resolves with an array of matches, with
   *    the first element being the full string that matched.
   * @throws {Error} If the command doesn't match the pattern. This Error will
   *    have an additional 'userError' property set to boolean true to denote
   *    that the error message can be reported to the user.
   */
  function applyPattern(inChan, cmd, cmdText) {
    var args = [cmdText];
    if (cmd.pattern) {
      args = cmdText.match(cmd.pattern);
      if (!args) {
        var err = new Error("Sorry, that's the wrong format for '" +
          cmd.id + "'.  Try '" + (inChan ? config.fantasyChar : '')
          + 'help ' + cmd.id + "' for more info.");
        err.userError = true;
        throw err;
      }
    }
    return args;
  }

  /**
   * Asserts that a user has the appropriate permissions to execute a
   * given command, and calls back with an error if not.
   * @param {Object} cmd The command object to be tested against
   * @param {string} nick The nickname of the user whose permissions are to
   *    be checked
   * @param {string} target The command target, if applicable. Set to null
   *    if this command does not require a target.
   * @returns {Promise} Resolves on complete.
   */
  function assertPermission(cmd, nick, target) {
    if (!cmd.minPermission) {
      return Promise.resolve();
    }
    var pMod;
    return Promise.resolve().then(function() {
      pMod = modMan.getMod(PERMISSIONS_MOD);
      if (!pMod) {
        throw new Error('Permissions module not found');
      }
      var channel = cmd.targetChannel ? target : null;
      return pMod.hasPermission(cmd.minPermission, nick, channel);
    }).then(function(allowed) {
      if (!allowed) {
        var errMsg = 'Sorry, you must be %s or higher%s to execute "%s".';
        throw new Error(util.format(errMsg,
          pMod.getPermName(cmd.minPermission),
          target ? ' in ' + target : '',
          cmd.id
        ));
      }
    });
  }

  /**
   * Removes the target from the command text, if the command calls for it,
   * and returns both the target and the updated command args in the
   * callback.
   * @param {boolean} inChan true if the command was triggered in a channel;
   *    false otherwise
   * @param {Object} cmd The command object being executed
   * @param {string} cmdText The text following the command
   * @param {string} context The channel name if the command was said in a
   *    channel, or the bot name otherwise
   * @returns {{target: string, args: string}} an object containing two
   *    properties: The target (target) and the remaining command arguments
   *    (args).
   * @throws {Error} if the given command requires a target, and none was
   *    given. This Error will have an additional 'userError' property set to
   *    true, denoting that its message can be shared with the user.
   */
  function splitTarget(inChan, cmd, cmdText, context) {
    var target = null;
    var args = cmdText;
    if (cmd.targetChannel || cmd.targetNick) {
      var targetRegex = cmd.targetNick ? '(\\S+)' :
          '([' + CHAN_PREFIXES + ']\\S+)?';
      var regex = new RegExp('^' + targetRegex + '\\s?(.*)$');
      var targetArgs = cmdText.match(regex);
      target = targetArgs[1];
      args = targetArgs[2];
      if (cmd.targetChannel && !target) {
        if (inChan) {
          target = context;
        } else {
          var err = new Error("I need a target channel for the '" +
            cmd.id + "' command.  Try \"help " + cmd.id +
            '" for more info.');
          err.userError = true;
          throw err;
        }
      }
    }
    return {
      target: target,
      args: args
    };
  }

  /**
   * Listens for a command to be spoken in a channel, or directly in a
   * private message.  This function is an event listener and should be
   * added to the 'message' event of the IRC client library.
   * @param {string} nick The nick originating the message
   * @param {string} to The channel or nickname to which the message was sent
   * @param {string} text The text of the message
   */
  function handleMessage(nick, to, text) {
    var split = text.match(/^\s*(\S+)?\s*(.*)$/);
    if (!split[1]) {
      split[1] = ' ';
    }
    var fantasy = split[1][0] === config.fantasyChar;
    var cmdId = (fantasy ? split[1].substr(1) : split[1]).toLowerCase();
    var inChan = CHAN_PREFIXES.indexOf(to[0]) !== -1;
    var cmdText = split[2];
    var cmds = modMan.getCommands();
    var cmdSplit;
    var args;
    if (((fantasy && inChan) || !inChan) && cmds[cmdId]) {
      var cmd = cmds[cmdId];
      Promise.resolve().then(function() {
        cmdSplit = splitTarget(inChan, cmd, cmdText, to);
        args = applyPattern(inChan, cmd, cmdSplit.args);
        return assertPermission(cmd, nick, cmdSplit.target);
      }).then(function() {
        var cmdArgs = {
          nick: nick,
          to: to,
          target: cmdSplit.target,
          args: args,
          cmd: cmd
        };
        modMan.emit('command', cmdArgs);
        modMan.emit('command:' + cmdId, cmdArgs);
        cmd.handler(nick, to, cmdSplit.target, args, inChan);
      }).catch(function(err) {
        if (err.userError) {
          client.notice(inChan ? to : nick, err.message);
        } else {
          log.error('Failed running command', {command: cmdId}, err);
        }
      });
    }
  }
  client.on('message', handleMessage);

  return {
    name: 'Command Runner',
    desc: 'Handles the execution of user-triggered commands',
    author: 'Tom Shawver',
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
