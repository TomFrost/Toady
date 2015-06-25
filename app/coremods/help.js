/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

var _ = require('lodash');
var log = require('../../lib/log');
var modLoad = require('../modmanager/ModLoader');
var pkgjson = require('../../package.json');
var name = pkgjson.name;
var version = pkgjson.version;
var author = pkgjson.author;
var url = pkgjson.homepage;

const PERM_CHARS = ['O', 'S', 'P', '~', '&', '@', '%', '+', '', '0'];

function strSort(a, b) {
  if (a > b) return 1;
  if (a === b) return 0;
  return -1;
}

/**
 * Help provides all user commands necessary to display mod and command
 * metadata in a digestible format.
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
   * @param {string} maxPerm The maximum permission char for which to
   *    return commands
   * @returns {Object} An object mapping mod IDs to objects mapping command
   *    IDs to commands, where each command's required permission is equal
   *    to or less than maxPerm
   */
  function getModCommands(maxPerm) {
    var mods = modMan.getMods();
    var pMod = modMan.getMod('users');
    var modCommands = {};
    if (!maxPerm && maxPerm !== '') {
      maxPerm = null;
    }
    mods.forEach(function(mod) {
      _.forOwn(mod.commands || {}, function(cmd, cmdId) {
        var hasPerm = cmd.hasOwnProperty('minPermission');
        if (!cmd.hidden && (!hasPerm || (maxPerm !== null && hasPerm &&
            pMod.permEqualOrGreater(maxPerm, cmd.minPermission)))) {
          if (!modCommands[mod.id]) {
            modCommands[mod.id] = {};
          }
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
   * @param {Object} mod A mod object whose commands should be sorted by
   *    permission
   * @param {string} maxPerm The permission char by which to limit the
   *    returned commands
   * @returns {Object} An object mapping of permission chars to an object
   *    mapping command IDs to command objects
   */
  function getCommandsByPerm(mod, maxPerm) {
    var pMod = modMan.getMod('users');
    var cmds = {};
    if (mod.commands) {
      _.forOwn(mod.commands, function(cmd, cmdId) {
        var perm = cmd.minPermission === undefined ? '0' : cmd.minPermission;
        if (!cmd.hidden && (perm === '0' ||
            pMod.permEqualOrGreater(maxPerm, perm))) {
          if (!cmds[perm]) {
            cmds[perm] = {};
          }
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
   *        nick: "Toady"
   *      }
   *
   * @param {string} target The channel or nick to which the notices should
   *    be sent
   * @param {Array<string>} messages An array of strings to be sent to the
   *    target sequentially
   * @param {Object} replace An object mapping placeholder text to the
   *    strings that the braces and placeholders should be replaced with
   */
  function sendHelp(target, messages, replace) {
    messages.forEach(function(msg) {
      if (replace) {
        _.forOwn(replace, function(repl, str) {
          msg = msg.replace('{' + str + '}', repl);
        });
      }
      client.notice(target, msg);
    });
  }

  /**
   * Offers help for a specific command ID.
   * @param {string} nick The nick to which the help notices should be sent
   * @param {string} cmdId The ID of the command for which the help page
   *      should be sent
   */
  function showCommand(nick, cmdId) {
    var pMod = modMan.getMod('users');
    var cmd = modMan.getCommand(cmdId);
    var fantasyChar = modMan.getMod('commandrunner').getFantasyChar();
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
      sendHelp(nick, messages, {
        nick: client.nick,
        '!': fantasyChar,
        cmd: cmdId,
        mod: cmd.mod.name,
        modId: cmd.mod.id,
        version: cmd.mod.version
      });
    } else {
      client.notice(nick, 'Command ' + cmdId + ' does not exist.');
    }
  }

  /**
   * Sends the main help page in irc NOTICEs to a given nick.
   * @param {string} nick The user to receive the help page
   * @param {string} maxPerm The highest permission for which to send
   *    commands.  If this is set to the user's highest permission, they
   *    will only see commands they have the ability to execute on at
   *    least one channel
   */
  function showMain(nick, maxPerm) {
    var fantasyChar = modMan.getMod('commandrunner').getFantasyChar();
    var modCmds = getModCommands(maxPerm);
    var modIds = Object.keys(modCmds).sort(strSort);
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
      var mod = modMan.getMod(modId);
      var cmds = modCmds[modId];
      messages.push(mod.name + ' v' + mod.version);
      _.forOwn(cmds, function(cmd, cmdId) {
        messages.push('  ' + _.padRight(cmdId, 15) + ' ' + cmd.desc);
      });
      messages.push(' ');
    });
    messages.push('***** End of Help *****');
    sendHelp(nick, messages, {
      nick: client.nick,
      '!': fantasyChar
    });
  }

  /**
   * Shows the help page for a given mod, limiting the command listing to
   * only commands requiring permissions equal to or less than maxPerm.
   * If maxPerm is S or O, the config options for the mod will be also be
   * shown (if applicable).
   * @param {string} nick The user to whom the help page should be sent
   * @param {string} modId The ID of the mod for which to display help
   * @param {string} maxPerm The highest permission char for which to limit
   *    the resulting command set
   */
  function showMod(nick, modId, maxPerm) {
    var pMod = modMan.getMod('users');
    var mod = modMan.getMod(modId);
    if (mod) {
      var permCmds = getCommandsByPerm(mod, maxPerm);
      var messages = [
        '***** {nick} Help *****',
        mod.name + ' v' + mod.version + ' (' + modId + ')',
        'Author: ' + mod.author
      ];
      if (mod.url) {
        messages.push('Website: ' + mod.url);
      }
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
          _.forOwn(cmds, function(cmd, cmdId) {
            messages.push('  ' + _.padRight(cmdId, 15) + ' ' + cmd.desc);
          });
        }
      }
      if (mod.configItems && pMod.permEqualOrGreater(maxPerm, 'S')) {
        messages.push(' ');
        messages.push('Config Items (To set: !viewmod config):');
        _.forOwn(mod.configItems, function(def, key) {
          var val;
          switch (def.type) {
            case 'boolean':
              val = mod.config[key] ? 'true' : 'false';
              break;
            case 'number':
              val = mod.config[key] || 0;
              break;
            default:
              val = mod.config[key] || '';
          }
          messages.push('  ' + _.padRight(key, 15) + ' ' +
            (def.desc || '') + ' (' + val + ')');
        });
      }
      messages.push('***** End of Help *****');
      sendHelp(nick, messages, {
        nick: client.nick
      });
    } else {
      client.notice(nick, "Mod '" + modId + "' doesn't exist.");
    }
  }

  /**
   * Displays a list of all mods, loaded and not.
   * @param {string} nick The nick of the user to whom the mod list should be
   *    sent
   */
  function showModList(nick) {
    var modIds = modMan.getLoadedModIds().sort(strSort);
    var messages = [
      '***** ' + client.nick + ' Help *****',
      'For more information on any loaded mod, type:',
      '/msg ' + client.nick + ' viewmod MODULE',
      ' ',
      'Loaded mods:'
    ];
    modIds.forEach(function(modId) {
      var mod = modMan.getMod(modId);
      messages.push('  ' + _.padRight(modId, 15) + ' ' + mod.desc);
    });
    modLoad.getUserModIds().then(function(ids) {
      if (ids.length) {
        var availIds = [];
        ids.forEach(function(id) {
          if (!modMan.isLoaded(id)) {
            availIds.push(id);
          }
        });
        availIds = availIds.sort(strSort);
        messages.push(' ');
        messages.push('Available to be loaded:');
        messages.push(availIds.join(', '));
      }
      messages.push('***** End of Help *****');
      sendHelp(nick, messages);
    }).catch(log.error);
  }

  return {
    name: 'Help',
    desc: 'Provides help for bot commands',
    author: 'Tom Shawver',
    commands: {
      help: {
        handler: function(from, to, target, args) {
          if (args[1]) {
            showCommand(from, args[1]);
          } else {
            var pMod = modMan.getMod('users');
            pMod.getHighestPermission(from).then(function(perm) {
              showMain(from, perm);
            }).catch(log.error);
          }
        },
        desc: 'Shows the help page for a specific command, or lists commands',
        help: [
          'Format: {cmd} [command]',
          'Examples:',
          '  /msg {nick} {cmd}',
          '  {!}{cmd} say'
        ],
        pattern: /^(\S+)?$/
      },
      listmods: {
        handler: function(from) {
          showModList(from);
        },
        desc: 'Displays a list of all loaded and unloaded mods',
        help: [
          'Format: {cmd}',
          'Example:',
          '  /msg {nick} {cmd}'
        ]
      },
      viewmod: {
        handler: function(from, to, target, args) {
          var pMod = modMan.getMod('users');
          pMod.getHighestPermission(from).then(function(perm) {
            showMod(from, args[1], perm);
          }).catch(log.error);
        },
        desc: 'Shows the information associated with a given mod',
        help: [
          'Format: {cmd} [modId]',
          'Examples:',
          '  /msg {nick} {cmd} remote',
          '  {!}{cmd} help'
        ],
        pattern: /^(\S+)$/
      }
    },
    sendHelp: sendHelp
  };
};
