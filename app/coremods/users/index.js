/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var _ = require('lodash');
var log = require('../../../lib/log');
var util = require('util');

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
  'NickServ'
];

/**
 * Gets the human-readable name associated with a permission char.
 * @param {string} permChar The permission char to be named
 * @returns {string|null} The name of the permission, or null if no such
 *    permission char exists
 */
function getPermName(permChar) {
  if (PERMS[permChar]) {
    return PERMS[permChar].name;
  }
  return null;
}

/**
 * Tests to see if a given permission char ranks equal to or greater than
 * another permission char.
 * @param {string} checkPerm The permission char to be tested
 * @param {string} againstPerm The permission char against which checkPerm
 *    should be compared
 * @returns {boolean} true if the checkPerm ranks equal to or greater than
 *    againstPerm; false otherwise
 */
function permEqualOrGreater(checkPerm, againstPerm) {
  return (PERMS[checkPerm] || {level: -1}).level >= PERMS[againstPerm].level;
}

/**
 * Users acts as the central hub for user accounts and permission checks.
 * Other mods can use this module as a way to check or display permissions
 * for a given user.
 *
 * Users recognizes the following permissions, in order from most to least
 * privileged:
 *    O     Owner. Full access to all commands, cannot be revoked.
 *    S     SuperUser. Full access to all commands, except those which may
 *            impact other Owners or SuperUsers.
 *    P     PowerUser. Limited access to global command set.
 *    ~     Channel founder
 *    &     Channel admin
 *    @     Channel op
 *    %     Channel half-op
 *    +     Voice
 *    ""    (Empty string) A user in a channel
 *    null  No permission (sometimes referred to as 0 for convenience)
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
 *    - NickServ: The user's nick must be registered with NickServ,
 *      the user must be logged in, and NickServ must be online.  Toady will
 *      msg NickServ the Atheme ACC command to determine auth status.  If
 *      ACC is not found, it will switch to Anope's STATUS and try again.
 *
 * The auth method for users can be set globally as the default in the
 * config, or set on a per-user basis.
 *
 * The following config options are available:
 *    - defaultAuthMethod: An auth methods outlined above; case sensitive.
 *    - owner: The nickname of the bot owner.  This account will be
 *      automatically created on launch if it does not exist.
 *    - users: A mapping of lowercase nicknames to objects with a 'perm'
 *      property and optionally an 'authMethod' property.  Perm should be
 *      one of O, S, or P, and authMethod should be one of the above
 *      auth methods (only if it should differ from the default).  Generally,
 *      this is not defined in the config file and is instead managed
 *      through the IRC commands exposed by this module.
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {
  // Bootstrap users
  var userCache = {};
  if (config.owner && !config.users[config.owner.toLowerCase()]) {
    config.users[config.owner.toLowerCase()] = {perm: 'O'};
  }

  // Bootstrap authentication modules
  var authMods = {};
  AUTH_METHODS.forEach(function(authMethod) {
    var modFunc = require('./authmethods/' + authMethod);
    authMods[authMethod] = modFunc(config, client, modMan);
  });

  /**
   * Deletes a user from the user list.  Will only succeed if the
   * execNick has the appropriate permissions.
   * @param {string} execNick The user calling the delete command
   * @param {string} targetNick The user to be deleted
   * @param {string} replyTo The nick or channel to which the result
   *    message should be sent.
   */
  function deleteUser(execNick, targetNick, replyTo) {
    var lowNick = targetNick.toLowerCase();
    var perm;
    Promise.resolve().then(function() {
      if (!config.users[lowNick]) {
        throw new Error('User "' + targetNick + '" does not exist.');
      }
      return getGlobalPerm(execNick);
    }).then(function(callerPerm) {
      perm = config.users[lowNick].perm;
      if (!callerPerm || (callerPerm !== 'O' && callerPerm !== 'P')) {
        throw new Error('Sorry, you can\'t delete "' + perm + '" users.');
      }
      delete config.users[lowNick];
      return config.save(['users']);
    }).then(function() {
      client.notice(replyTo, 'User [' + perm + ']' + targetNick + ' deleted.');
    }).catch(function(err) {
      client.notice(replyTo, err.message);
    });
  }

  /**
   * Gets an array of all the channels a nick currently shares with the bot.
   * @param {string} nick The nick to be searched
   * @returns {Array<string>} An array of channel names
   */
  function getNickChannels(nick) {
    var channels = [];
    _.forOwn(client.chans, function(props, chan) {
      if (props.users[nick]) {
        channels.push(chan);
      }
    });
    return channels;
  }

  /**
   * Gets a user's global (non-channel-specific) permission: either O, S, P,
   * or null if the user has no global permission.
   * @param {string} nick The nick to be checked
   * @returns {Promise<string|null>} Resolves with the user's permission char,
   *    or null if the user has no permission.
   */
  function getGlobalPerm(nick) {
    var lowNick = nick.toLowerCase();
    var userConfig = config.users[lowNick];
    if (userConfig && userCache[lowNick]) {
      return Promise.resolve(userConfig.perm);
    }
    if (userConfig) {
      var authMethod = config.defaultAuthMethod || userConfig.authMethod;
      var authMod = authMods[authMethod];
      return authMod.isAuthorized(nick, userConfig).then(function(authed) {
        if (authed) {
          userCache[lowNick] = true;
        }
        return authed ? userConfig.perm : null;
      });
    }
    return Promise.resolve(null);
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
   * @param {string} nick The nick for whom a permission should be retrieved
   * @returns {Promise<string>} Resolves with the highest permission char
   *    available for this nick
   */
  function getHighestPermission(nick) {
    return getGlobalPerm(nick).then(function(globalPerm) {
      if (globalPerm) {
        return globalPerm;
      }
      var highPerm = null;
      _.forOwn(client.chans, function(props) {
        if (props.users.hasOwnProperty(nick)) {
          if (highPerm === null || permEqualOrGreater(props.users[nick],
              highPerm)) {
            highPerm = props.users[nick];
          }
        }
      });
      return highPerm;
    });
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
   * @param {string} nick The nick for whom a permission should be retrieved
   * @param {string} channel The channel for which permissions should be
   *    checked
   * @returns {Promise<string>} Resolves with the highest permission char
   *    available for this nick on this channel.
   */
  function getPermission(nick, channel) {
    return getGlobalPerm(nick).then(function(globalPerm) {
      if (globalPerm) {
        return globalPerm;
      }
      return getPermOnChannel(nick, channel);
    });
  }

  /**
   * Gets a user's highest permission on a given channel, EXCLUDING the
   * registered user permissions (O, S, and P).
   * @param {string} nick The nick for whom a permission should be retrieved
   * @param {string} channel The channel for which permissions should be
   *    checked
   * @returns {string} The highest permission char available for this nick on
   *    this channel, excluding O, S, and P.
   */
  function getPermOnChannel(nick, channel) {
    var chanData = null;
    try {
      chanData = client.chanData(channel);
    } catch (e) {
      log.warn(e);
    }
    return chanData && chanData.users[nick] !== undefined ?
      chanData.users[nick] : null;
  }

  /**
   * Checks to see if a user's global permission level (O, S, or P) is
   * equal to or greater than a given permission level.
   * @param {string} permChar The permission char against which to check
   *    the user
   * @param {string} nick The nick of the user to be checked
   * @returns {Promise<boolean>} Resolves to true if the nick's permission
   *    matches or exceeds the given permChar; false otherwise.
   */
  function hasGlobalPerm(permChar, nick) {
    return getGlobalPerm(nick).then(function(perm) {
      return perm ? permEqualOrGreater(perm, permChar) : false;
    });
  }

  /**
   * Checks to see if a user's permission level on a given channel (excluding
   * O, S, and P) is equal to or greater than a given permission level.
   * @param {string} permChar The permission char against which to check
   *    the user
   * @param {string} nick The nick of the user to be checked
   * @param {string} channel The channel from which to pull the nick's
   *    permission
   * @returns {Promise<boolean>} Resolves to true if the nick's permission
   *    matches or exceeds the given permChar; false otherwise.
   */
  function hasPermOnChannel(permChar, nick, channel) {
    return getPermOnChannel(nick, channel).then(function(perm) {
      return perm ? permEqualOrGreater(perm, permChar) : false;
    });
  }

  /**
   * Checks to see if a user's permission level, either globally or on a
   * given channel, is equal to or greater than a given permission level.
   * This is the be-all-end-all method to determining if a user has the
   * appropriate permission to carry out a certain task.
   * @param {string} permChar The permission char against which to check the
   *    user
   * @param {string} nick The nick of the user to be checked
   * @param {string|null} channel The channel from which to pull the nick's
   *    permission, or null to only check registered accounts
   * @returns {Promise<boolean>} Resolves to true if the nick's permission
   *    matches or exceeds the given permChar; false otherwise.
   */
  function hasPermission(permChar, nick, channel) {
    return Promise.resolve().then(function() {
      if (!PERMS[permChar]) {
        throw new Error("Permission char '" + permChar + "' does not exist.");
      }
      return !!channel && hasPermOnChannel(permChar, nick, channel);
    }).this(function(hasPerm) {
      return hasPerm || hasGlobalPerm(permChar, nick);
    });
  }

  /**
   * Lists all registered users in a series of NOTICE commands on IRC.
   * @param {string} replyTo The nick or channel to which the user list
   *      should be sent
   */
  function listUsers(replyTo) {
    var users = Object.keys(config.users).map(function(user) {
      return '[' + config.users[user].perm + ']' + user;
    }).sort(function(a, b) {
      if (a > b) return 1;
      if (a === b) return 0;
      return -1;
    });
    client.notice(replyTo, 'All global users:');
    client.notice(replyTo, users.join('  '));
  }

  /**
   * Called whenever a user's nick changes.  This allows the mod to update
   * the user's nick in the userCache.
   * @param {string} oldNick The user's old nick
   * @param {string} newNick The user's new nick.
   */
  function nickHandler(oldNick, newNick) {
    var lowNick = oldNick.toLowerCase();
    if (userCache[lowNick]) {
      userCache[newNick.toLowerCase()] = true;
      delete userCache[lowNick];
    }
  }
  client.on('nick', nickHandler);

  /**
   * Called whenever a user leaves a channel.  For cached users, scans to
   * see if they're in any other channel the bot is in.  If not, they are
   * removed from the userCache since they are no longer being tracked.
   * @param {string} channel The channel that was parted
   * @param {string} nick The user that parted
   */
  function partHandler(channel, nick) {
    var lowNick = nick.toLowerCase();
    if (userCache[lowNick]) {
      var chans = getNickChannels(nick);
      if (!chans.length) {
        delete userCache[lowNick];
      }
    }
  }
  client.on('part', partHandler);

  /**
   * Called whenever a user quits.  If that user was cached, they are
   * removed from the userCache.
   * @param {string} nick The nick that quit
   */
  function quitHandler(nick) {
    var lowNick = nick.toLowerCase();
    if (userCache[lowNick]) {
      delete userCache[lowNick];
    }
  }
  client.on('quit', quitHandler);

  /**
   * Creates or updates a user's global account, with a new global permission
   * (O, S, or P) and an optional authMethod.  The account creator must have
   * the appropriate permissions to create a user at their given permission
   * level.
   * @param {string} creator The nick of the user creating or modifying
   *    the account
   * @param {string} replyTo The nick or channel to which responses should
   *    be sent
   * @param {string} nick The nick of the user to create or update
   * @param {string} perm The permission char to assign to this user
   * @param {string|null} authMethod The auth method to use for this
   *    user's account, or null to accept the default (recommended)
   * @param {boolean} [existing] true if the nick's account is already
   *    existing, or false if it should be created.  If the status of
   *    the account does not coincide with this value, an error will be
   *    reported. Omit to eliminate this check.
   */
  function userSetPermission(creator, replyTo, nick, perm, authMethod,
      existing) {
    var lowNick = nick.toLowerCase();
    var isNew = !config.users[lowNick];
    Promise.resolve().then(function() {
      if (existing !== undefined) {
        if (!existing && !isNew) {
          throw new Error('User "' + nick + '" already exists.');
        } else if (existing && isNew) {
          throw new Error('User "' + nick + '" not found.');
        }
      }
      return getGlobalPerm(creator);
    }).then(function(creatorPerm) {
      var targetPerm;
      if (!isNew) {
        targetPerm = config.users[lowNick].perm;
      }
      if (!creatorPerm || creatorPerm !== 'O' && perm !== 'P') {
        throw new Error("Sorry, you can't set users to '" + perm + "'.");
      } else if (targetPerm && PERMS[creatorPerm].level <=
          PERMS[targetPerm].level) {
        throw new Error("Sorry, you can't modify '" + targetPerm + "' users.");
      } else if (authMethod && !AUTH_METHODS[authMethod]) {
        throw new Error('Auth method "' + authMethod + '" does not exist.');
      }
      config.users[lowNick] = {};
      config.users[lowNick].perm = perm;
      if (authMethod && authMethod !== config.defaultAuthMethod) {
        config.users[lowNick].authMethod = authMethod;
      }
      return config.save(['users']);
    }).then(function() {
      client.notice(replyTo, util.format('User [%s] %s %s.',
        perm, nick, isNew ? 'created' : 'saved'));
    }).catch(function(err) {
      client.notice(replyTo, err.message);
    });
  }

  return {
    name: 'Permissions',
    desc: 'Provides user permission checking per channel or globally',
    author: 'Tom Shawver',
    commands: {
      viewperm: {
        handler: function(from, to, target, args) {
          var inChan = false;
          if (to[0] === '#' || to[0] === '&') {
            inChan = true;
          }
          var replyTo = inChan ? to : from;
          getPermission(args[1], args[2]).then(function(perm) {
            if (perm === null) {
              client.say(replyTo, util.format('I know nothing about %s %s',
                args[1],
                args[2] ? ' on ' + args[2] : ' outside of a channel'));
            } else {
              client.say(replyTo, util.format('%s is [%s] %s%s.',
                args[1], perm, PERMS[perm].name,
                args[2] ? ' on ' + args[2] : ''));
            }
          }).catch(function(err) {
            log.error(err);
            client.say(replyTo, 'Error checking permission');
          });
        },
        desc: "View any user's permission level",
        help: [
          'Format: {cmd} <nick> [#channel]',
          'Examples:',
          '  /msg {nick} {cmd} bob',
          '  {!}{cmd} bob #irchelp'
        ],
        minPermission: 'P',
        pattern: /^(\S+)(?:\s+([#&]\S+))?$/
      },
      adduser: {
        handler: function(from, to, target, args) {
          var inChan = false;
          if (to[0] === '#' || to[0] === '&') {
            inChan = true;
          }
          var replyTo = inChan ? to : from;
          userSetPermission(from, replyTo, args[1], args[2], args[3], false);
        },
        desc: 'Adds a global user with privileged permissions',
        help: [
          'Format: {cmd} <nick> <perm> [authMethod]',
          '  nick: The nickname of the user to be added',
          '  perm: One of O, S, or P:',
          '    O: Owner. Full access to all commands, cannot be revoked.',
          '    S: SuperUser. Full access to all commands, except those ' +
            'which may impact other Owners or SuperUsers.',
          '    P: PowerUser. Limited access to global command set.',
          '  authMethod: The method by which this user will be authenticated.',
          '    (if not specified, "' + config.defaultAuthMethod +
            '" is configured to be used)',
          ' ',
          'Unless being set by an Owner, permission can only be set ' +
            'underneath your own level.',
          ' ',
          'Example:',
          '  /msg {nick} {cmd} Bob S'
        ],
        minPermission: 'S',
        pattern: /^(\S+)\s+([OSP])(?:\s+(\S+))?$/
      },
      updateuser: {
        handler: function(from, to, target, args) {
          var inChan = false;
          if (to[0] === '#' || to[0] === '&') {
            inChan = true;
          }
          var replyTo = inChan ? to : from;
          userSetPermission(from, replyTo, args[1], args[2], args[3], true);
        },
        desc: "Modifies a global user's permissions",
        help: [
          'Format: {cmd} <nick> <perm> [authMethod]',
          '  nick: The nickname of the user to be added',
          '  perm: One of O, S, or P:',
          '    O: Owner. Full access to all commands, cannot be revoked.',
          '    S: SuperUser. Full access to all commands, except those ' +
            'which may impact other Owners or SuperUsers.',
          '    P: PowerUser. Limited access to global command set.',
          '  authMethod: The method by which this user will be authenticated.',
          '    (if not specified, "' + config.defaultAuthMethod +
            '" is configured to be used)',
          ' ',
          'Unless being set by an Owner, permission can only be set ' +
            'underneath your own level.',
          ' ',
          'Example:',
          '  /msg {nick} {cmd} Bob P'
        ],
        minPermission: 'S',
        pattern: /^(\S+)\s+([OSP])(?:\s+(\S+))?$/
      },
      deleteuser: {
        handler: function(from, to, target, args) {
          var inChan = false;
          if (to[0] === '#' || to[0] === '&') {
            inChan = true;
          }
          var replyTo = inChan ? to : from;
          deleteUser(from, args[1], replyTo);
        },
        desc: 'Deletes a global user',
        help: [
          'Format: {cmd} <nick>',
          '  nick: The user to be deleted',
          ' ',
          'Unless deleted by an owner, only users under your current ' +
            'permission level can be deleted.',
          ' ',
          'Example:',
          '  /msg {nick} {cmd} Bob'
        ],
        minPermission: 'S',
        pattern: /^(\S+)$/
      },
      listusers: {
        handler: function(from, to) {
          var inChan = false;
          if (to[0] === '#' || to[0] === '&') {
            inChan = true;
          }
          var replyTo = inChan ? to : from;
          listUsers(replyTo);
        },
        desc: 'Lists all global bot users',
        help: [
          'Format: {cmd}',
          ' ',
          'Example:',
          '  /msg {nick} {cmd}'
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
      _.forOwn(authMods, function(authMod) {
        if (authMod.unload) authMod.unload();
      });
      client.removeListener('nick', nickHandler);
      client.removeListener('part', partHandler);
      client.removeListener('quit', quitHandler);
    }
  };
};

module.exports.configDefaults = {
  defaultAuthMethod: 'NickServ',
  users: {}
};
