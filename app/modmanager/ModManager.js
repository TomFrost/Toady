/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var _ = require('lodash');
var events = require('events');
var irc = require('../../lib/irc');
var log = require('../../lib/log');
var ModConfig = require('./ModConfig');
var ModLoader = require('./ModLoader');
var ribbit = require('../ribbit/Ribbit');
var semver = require('semver');
var util = require('util');

const TOADY_VERSION = require('../../package.json').version;

/**
 * A set of defaults to be applied to any loaded mod. Mods should probably
 * override most of these.
 * @type {Object}
 */
const MOD_DEFAULTS = {
  name: 'Unnamed Mod',
  desc: "This module's developer should probably write a description",
  version: TOADY_VERSION,
  author: 'Unknown',
  blockUnload: false,
  blockReload: false
};

/**
 * The ModManager is responsible for the loading and unloading of mods,
 * management of commands, and acts as the hub for all module
 * intercommunication.  It is passed to each new mod when it's loaded, and
 * fires the following events:
 *
 *   When a command is loaded:
 *     - cmdloaded - args: command object
 *     - cmdloaded:command_name - args: command object
 *   When a module is loaded (fires after the module's commands have all
 *   been loaded, also fires if the module is reloaded):
 *     - modloaded - args: mod object
 *     - modloaded:mod_name - args: mod object
 *   When a mod is unloaded (also fires if the module is reloaded):
 *     - modunloaded - args: mod name
 *     - modunloaded:mod_name - args: mod name
 *   When a mod is reloaded (fires following the unload and load events):
 *     - modreloaded - args: mod object
 *     - modreloaded:mod_name - args: mod object
 *   When a command is executed:
 *     - command - args: A command descriptor (see below)
 *     - command:cmd_name - args: A command descriptor (see below)
 *
 * A command descriptor is an object with the following properties:
 *   - {String} cmdId: The name of the command
 *   - {String} nick: The  nick of the caller
 *   - {String} to: The nick or channel to which the command was sent
 *   - {String} target: If the command has targetNick or targetChannel
 *     specified, this is the target collected from the message.
 *   - {Array} args: An array of arguments to be passed to the command.
 *     If no regex pattern was set for the command, this is an array of
 *     one string (the full text after the command/target).  If a pattern
 *     was specified, this is the result of message.match(pattern)
 *
 * @constructor
 */
var ModManager = function() {
  /**
   * A mapping of all command IDs to their command object
   * @type {Object}
   * @private
   */
  this._commands = {};

  /**
   * A mapping of all mod IDs to their mod object
   * @type {Object}
   * @private
   */
  this._mods = {};
};
util.inherits(ModManager, events.EventEmitter);

/**
 * Gets a loaded, individual command object.  The command returned will have
 * one additional field not specified by the command itself:
 *   - {String} id: The cmdId, or key, of this command
 * @param {String} cmdId The name of the command to retrieve
 * @returns {Object|null} The command object, or null if no such command
 *      exists.
 */
ModManager.prototype.getCommand = function(cmdId) {
  return this._commands[cmdId] || null;
};

/**
 * Gets a mapping of all command IDs to their command object.  The commands
 * returned will have one additional field not specified by the commands
 * themselves:
 *   - {String} id: The cmdId, or key, of the command
 * @returns {Object} The hash of IDs to objects
 */
ModManager.prototype.getCommands = function() {
  return this._commands;
};

/**
 * Gets an array of the IDs for all loaded mods.
 * @returns {Array} All mod IDs
 */
ModManager.prototype.getLoadedModIds = function() {
  return Object.keys(this._mods);
};

/**
 * Retrieves a given mod if loaded.  The mod returned will have two
 * additional fields not specified by the mod itself:
 *   - {String} id: The modId for this mod
 *   - {Object} config: The mod's config object
 *
 * Exercise extreme caution in modifying another mod's config object.  The mod
 * may not be prepared to handle dynamic config changes.
 * @param modId The ID of the mod to be returned
 * @returns {Object|null} The mod, or null if the mod is not loaded or not
 *      found.
 */
ModManager.prototype.getMod = function(modId) {
  return this._mods[modId] || null;
};

/**
 * Gets an array of all loaded mod objects.  The mods returned will have two
 * additional fields not specified by the mods themselves:
 *   - {String} id: The modId for the mod
 *   - {Object} config: The mod's config object
 *
 * Exercise extreme caution in modifying another mod's config object.  The mod
 * may not be prepared to handle dynamic config changes.
 * @returns {Array<Object>} All loaded mod objects.
 */
ModManager.prototype.getMods = function() {
  var modArray = [];
  _.forOwn(this._mods, function(val) {
    modArray.push(val);
  });
  return modArray;
};

/**
 * Indicates whether a given mod ID is loaded or not.
 * @param {string} modId The ID of the mod to be checked
 * @returns {boolean} true if the mod is currently loaded; false otherwise
 */
ModManager.prototype.isLoaded = function(modId) {
  return !!this._mods[modId];
};

/**
 * Calls {@link #loadMod} once for each mod in the 'coremods' folder.  Each
 * will fire its own individual events.  Generally, this should only be
 * called by the bootstrapping process as one or all of these mods are likely
 * to have already been loaded by the time any other code could trigger this.
 * @returns {Promise} Resolves on completion
 */
ModManager.prototype.loadCoreMods = function() {
  return ModLoader.getCoreModIds().then(function(ids) {
    return this.loadMods(ids);
  }.bind(this));
};

/**
 * Loads a mod and its commands into the manager.  This could fail for a
 * number of reasons:
 *   - This mod, or a mod with the same ID, has already been loaded
 *   - Failed reading or parsing the mod's config file
 *   - Mod contains a command ID that collides with a previously loaded
 *     command
 *
 * If successful, the function can cause the following events to be fired on
 * the ModManager object:
 *
 *   When a command is loaded:
 *     - cmdloaded - args: command object
 *     - cmdloaded:command_name - args: command object
 *   When a module is loaded (fires after the module's commands have all
 *   been loaded, also fires if the module is reloaded):
 *     - modloaded - args: mod object
 *     - modloaded:mod_name - args: mod object
 *
 * Note that while new mods can be added to the 'mods' folder and loaded after
 * the bot has already been started, only mods that were present in the
 * 'coremods' folder at start time can be loaded/unloaded.
 * @param {string} modId The ID of a mod in the 'mods' or 'coremods' folder to
 *   be loaded
 * @returns {Promise<Object>} Resolves with the loaded mod object
 */
ModManager.prototype.loadMod = function(modId) {
  // TODO: Rewrite and break down
  if (this._mods[modId]) {
    throw new Error("Module '" + modId + "' is already loaded");
  }
  var pkg;
  ModLoader.loadMod(modId).then(function(modPkg) {
    if (modPkg.func.minToadyVersion &&
        semver.lt(TOADY_VERSION, modPkg.func.minToadyVersion)) {
      throw new Error(modId + ' requires Toady version ' +
        modPkg.func.minToadyVersion + ' or later.  You are running ' +
        TOADY_VERSION + '.');
    }
    pkg = modPkg;
    return ModConfig.getConfig(modId, modPkg.func.configDefaults);
  }).then(function(modConf) {
    var modPkg = {};
    var rawMod;
    try {
      rawMod = pkg.func(modConf, irc, this);
    } catch(e) {
      var err = new Error("Mod '" + modId + "' is improperly formatted");
      err.original = e;
      throw err;
    }
    if (pkg.json.json) {
      if (pkg.json.name) {
        modPkg.name = pkg.json.name.replace(ribbit.MOD_PREFIX, '');
      }
      if (pkg.json.version) {
        modPkg.version = pkg.json.version;
      }
      if (pkg.json.description) {
        modPkg.desc = pkg.json.description;
      }
      if (pkg.json.author) {
        var type = typeof pkg.json.author;
        if (type === 'string') {
          modPkg.author = pkg.json.author;
        } else if (type === 'object' && pkg.json.author.name) {
          modPkg.author = pkg.json.author.name;
        }
      }
    }
    return _.assign(MOD_DEFAULTS, modPkg, rawMod, {
      id: modId,
      config: modConf
    });
  }.bind(this)).then(function(mod) {
    var collisions = [];
    var commandNames = Object.keys(mod.commands);
    commandNames.forEach(function(name) {
      if (this._commands[name]) {
        collisions.push(name);
      }
    }, this);
    if (collisions.length) {
      throw new Error("Module '" + modId + "' could not be loaded: The " +
        'following commands are already registered: ' +
        collisions.join(', '));
    }
    _.forOwn(mod.commands || {}, function(val, key) {
      var cmd = key.toLowerCase();
      val.mod = mod;
      val.id = cmd;
      this._commands[cmd] = val;
      this.emit('cmdloaded', val);
      this.emit('cmdloaded:' + cmd, val);
    }, this);
    this._mods[modId] = mod;
    log.info('Loaded mod:', modId);
    this.emit('modloaded', mod);
    this.emit('modloaded:' + modId, mod);
    return mod;
  }.bind(this)).catch(function(err) {
    ModLoader.unloadMod(modId);
    log.error(err);
    throw err.original || err;
  });
};

/**
 * Calls {@link #loadMod} once for each provided mod ID.
 * @param {Array<string>} modIds An array of all mod IDs to be loaded
 * @returns {Promise} Resolves on complete
 */
ModManager.prototype.loadMods = function(modIds) {
  return Promise.all(modIds.map(this.loadMod.bind(this)));
};

/**
 * Calls {@link #loadMod} once for each mod in the 'mods' folder.  Each
 * will fire its own individual events.  Generally, this should only be
 * called by the bootstrapping process as one or all of these mods are likely
 * to have already been loaded by the time any other code could trigger this.
 * @returns {Promise} Resolves on complete
 */
ModManager.prototype.loadUserMods = function() {
  return ModLoader.getUserModIds().then(this.loadMods.bind(this));
};

/**
 * Reloads a currently loaded module by calling {@link #unloadMod} on it
 * (forcing the unload if the mod explicitly blocks unloads) followed
 * immediately by a {@link #loadMod}.
 *
 * This operation will start the mod off from a blank slate, as well as
 * observe any changes in the code since the last time the mod was loaded.
 * This can be extremely useful for development of new mods, as a mod can
 * be reloaded and tested frequently without restarting/reconnecting the bot.
 *
 * Reloads can be blocked by setting the 'blockReload' property to 'true' on
 * a given mod object.  This is strongly not recommended and should only be
 * used in special cases.
 *
 * Note that, if a code error is introduced into the
 * mod since the last reload, the mod will unload successfully and be reported
 * as "not found" when it attempts to load again.  This effectively unloads
 * the mod, even if unloading is blocked.
 *
 * This function causes the following events to fire on the ModManager object:
 *   When a mod is reloaded (fires following the unload and load events):
 *     - modreloaded - args: mod object
 *     - modreloaded:mod_name - args: mod object
 * @param {string} modId The ID of the mod to be reloaded.
 * @returns {Promise} Resolves on complete
 */
ModManager.prototype.reloadMod = function(modId) {
  if (!this._mods[modId]) {
    throw new Error("Module '" + modId + "' is not loaded");
  } else if (this._mods[modId].blockReload) {
    throw new Error("Module '" + modId + "' can not be reloaded");
  }
  return this.unloadMod(modId, true).then(function() {
    return this.loadMod(modId);
  }.bind(this)).then(function() {
    this.emit('modreloaded', this._mods[modId]);
    this.emit('modreloaded:' + modId, this._mods[modId]);
  }.bind(this));
};

/**
 * Unloads a given mod, removing it and its commands from the manager.
 * Unloading a mod causes the mod's 'unload' function to be called (if it
 * exists) to safely remove any event listeners.  This avoids memory leaks
 * and unexpected behavior.
 *
 * Unloading a mod can be blocked by setting 'blockUnload: true' in the mod
 * object.  This is appropriate for core mods or mods that are integral to
 * the execution of a bot, but is not recommended for most user mods.
 *
 * The blockUnload property can be overridden by setting 'force' to true.
 * Note that, if blockUnload has been set, it's likely for a good reason.  Use
 * with care.  The {@link #reloadMod} function will always set 'force' to
 * true, as it immediately reloads the mod after a successful unload.
 *
 * This function causes the following events to fire on the ModManager object:
 *   When a mod is unloaded (also fires if the module is reloaded):
 *      - modunloaded - args: mod name
 *      - modunloaded:mod_name - args: mod name
 * @param {string} modId The ID of the mod to be unloaded
 * @param {boolean} [force] true to override the 'blockUnload' property if set;
 *      false otherwise
 * @returns {Promise} Resolves on complete
 */
ModManager.prototype.unloadMod = function(modId, force) {
  var mod = this._mods[modId];
  if (!mod) {
    throw new Error("Module '" + modId + "' is not loaded");
  } else if (mod.blockUnload && !force) {
    throw new Error("Module '" + modId + "' can not be unloaded");
  }
  if (mod.commands) {
    var commandNames = Object.keys(mod.commands);
    commandNames.forEach(function(name) {
      if (this._commands[name]) {
        delete this._commands[name];
      }
    }, this);
  }
  if (mod.unload) {
    mod.unload();
  }
  delete this._mods[modId];
  return ModLoader.unloadMod(modId).then(function() {
    this.emit('modunloaded', modId);
    this.emit('modunloaded:' + modId, modId);
  }.bind(this));
};

module.exports = new ModManager();
module.exports.setMaxListeners(0);
