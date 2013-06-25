/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// Dependencies
var events = require("events"),
	fs = require('fs'),
	util = require('util'),
	config = require('config'),
	Seq = require('seq'),
	objUtil = require('../util/Object'),
	ModConfig = require('./ModConfig'),
	ModLoader = require('./ModLoader'),
	client = require('../irc/Client'),
	ribbit = require('../ribbit/Ribbit');

/**
 * A set of defaults to be applied to any loaded mod. Mods should probably
 * override most of these.
 * @type {Object}
 */
const MOD_DEFAULTS = {
	name: 'Unnamed Mod',
	desc: "This module's developer should probably write a description",
	version: '0.0.0',
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
 *      - cmdloaded - args: command object
 *      - cmdloaded:command_name - args: command object
 *   When a module is loaded (fires after the module's commands have all
 *   been loaded, also fires if the module is reloaded):
 *      - modloaded - args: mod object
 *      - modloaded:mod_name - args: mod object
 *   When a mod is unloaded (also fires if the module is reloaded):
 *      - modunloaded - args: mod name
 *      - modunloaded:mod_name - args: mod name
 *   When a mod is reloaded (fires following the unload and load events):
 *      - modreloaded - args: mod object
 *      - modreloaded:mod_name - args: mod object
 *   When a command is executed:
 *      - command - args: A command descriptor (see below)
 *      - command:cmd_name - args: A command descriptor (see below)
 *
 * A command descriptor is an object with the following properties:
 *      - {String} cmdId: The name of the command
 *      - {String} nick: The  nick of the caller
 *      - {String} to: The nick or channel to which the command was sent
 *      - {String} target: If the command has targetNick or targetChannel
 *        specified, this is the target collected from the message.
 *      - {Array} args: An array of arguments to be passed to the command.
 *        If no regex pattern was set for the command, this is an array of
 *        one string (the full text after the command/target).  If a pattern
 *        was specified, this is the result of message.match(pattern)
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
 *      - {String} id: The cmdId, or key, of this command
 *
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
 *      - {String} id: The cmdId, or key, of the command
 *
 * @returns {Object} The hash of IDs to objects
 */
ModManager.prototype.getCommands = function() {
	return this._commands;
};

/**
 * Gets an array of the IDs for all loaded mods.
 *
 * @returns {Array} All mod IDs
 */
ModManager.prototype.getLoadedModIds = function() {
	return Object.keys(this._mods);
};

/**
 * Retrieves a given mod if loaded.  The mod returned will have two
 * additional fields not specified by the mod itself:
 *      - {String} id: The modId for this mod
 *      - {Object} config: The mod's config object
 *
 * Exercise extreme caution in modifying another mod's config object.  The mod
 * may not be prepared to handle dynamic config changes.
 *
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
 *      - {String} id: The modId for the mod
 *      - {Object} config: The mod's config object
 *
 * Exercise extreme caution in modifying another mod's config object.  The mod
 * may not be prepared to handle dynamic config changes.
 *
 * @returns {Array} All loaded mod objects.
 */
ModManager.prototype.getMods = function() {
	var modArray = [];
	objUtil.forEach(this._mods, function(key, val) {
		modArray.push(val);
	});
	return modArray;
};

/**
 * Indicates whether a given mod ID is loaded or not.
 *
 * @param modId The ID of the mod to be checked
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
 *
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
ModManager.prototype.loadCoreMods = function(cb) {
	if (!cb)
		cb = function() {};
	var self = this;
	ModLoader.getCoreModIds(function(err, ids) {
		if (err)
			cb(err);
		else
			self.loadMods(ids, cb);
	});
};

/**
 * Loads a mod and its commands into the manager.  This could fail for a
 * number of reasons:
 *      - This mod, or a mod with the same ID, has already been loaded
 *      - Failed reading or parsing the mod's config file
 *      - Mod contains a command ID that collides with a previously loaded
 *        command
 *
 * If successful, the function can cause the following events to be fired on
 * the ModManager object:
 *
 *   When a command is loaded:
 *      - cmdloaded - args: command object
 *      - cmdloaded:command_name - args: command object
 *   When a module is loaded (fires after the module's commands have all
 *   been loaded, also fires if the module is reloaded):
 *      - modloaded - args: mod object
 *      - modloaded:mod_name - args: mod object
 *
 * Note that while new mods can be added to the 'mods' folder and loaded after
 * the bot has already been started, only mods that were present in the
 * 'coremods' folder at start time can be loaded/unloaded.
 *
 * @param {String} modId The ID of a mod in the 'mods' or 'coremods' folder to
 *      be loaded
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Object} The loaded mod object
 */
ModManager.prototype.loadMod = function(modId, cb) {
	if (!cb)
		cb = function() {};
	if (this._mods[modId])
		cb(new Error("Module '" + modId + "' is already loaded"));
	var self = this;
	Seq()
		.seq(function getMod() {
			ModLoader.loadMod(modId, this);
		})
		.seq(function getModConfig(modFunc, pkgJson) {
			this.vars.modFunc = modFunc;
			this.vars.pkgJson = pkgJson;
			ModConfig.getConfig(modId, modFunc.configDefaults, this);
		})
		.seq(function initMod(modConf) {
			var modFunc = this.vars.modFunc,
				rawMod = modFunc(modConf, client, self),
				pkgJson = this.vars.pkgJson,
				modPkg = {};
			if (pkgJson) {
				if (pkgJson.name)
					modPkg.name = pkgJson.name.replace(ribbit.MOD_PREFIX, '');
				if (pkgJson.version)
					modPkg.version = pkgJson.version;
				if (pkgJson.description)
					modPkg.desc = pkgJson.description;
				if (pkgJson.author) {
					var type = typeof pkgJson.author;
					if (type == 'string')
						modPkg.author = pkgJson.author;
					else if (type == 'object' && pkgJson.author.name)
						modPkg.author = pkgJson.author.name;
				}
			}
			var mod = objUtil.merge(MOD_DEFAULTS, modPkg, rawMod, {
				id: modId,
				config: modConf
			});
			this.vars.mod = mod;
			this(null, mod);
		})
		.seq(function checkCommandCollisions(mod) {
			var collisions = [],
				next = this;
			objUtil.forEach(mod.commands || {}, function(key) {
				if (self._commands[key])
					collisions.push(key);
			});
			if (collisions.length) {
				ModLoader.unloadMod(modId, function() {
					next(new Error("Module '" + modId +
						"' could not be loaded: The following \
commands are already registered: " +
						collisions.join(', ')));
				});
			}
			else
				this(null, mod);
		})
		.seq(function integrateMod(mod) {
			objUtil.forEach(mod.commands || {}, function(key, val) {
				val.mod = mod;
				key = key.toLowerCase();
				val.id = key;
				self._commands[key] = val;
				self.emit('cmdloaded', val);
				self.emit('cmdloaded:' + key, val);
			});
			self._mods[modId] = mod;
			console.log('Loaded mod:', modId);
			self.emit('modloaded', mod);
			self.emit('modloaded:' + modId, mod);
			cb(null, mod);
		})
		.catch(function(err) {
			cb(err);
		});
};

/**
 * Calls {@link #loadMod} once for each provided mod ID.
 *
 * @param {Array} modIds An array of all mod IDs to be loaded
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
ModManager.prototype.loadMods = function(modIds, cb) {
	if (!cb)
		cb = function() {};
	var self = this;
	Seq(modIds)
		.seqEach(function(modId) {
			self.loadMod(modId, this);
		})
		.seq(function() {
			cb();
		})
		.catch(function(err) {
			cb(err);
		});
};

/**
 * Calls {@link #loadMod} once for each mod in the 'mods' folder.  Each
 * will fire its own individual events.  Generally, this should only be
 * called by the bootstrapping process as one or all of these mods are likely
 * to have already been loaded by the time any other code could trigger this.
 *
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
ModManager.prototype.loadUserMods = function(cb) {
	if (!cb)
		cb = function() {};
	var self = this;
	ModLoader.getUserModIds(function(err, ids) {
		if (err)
			cb(err);
		else
			self.loadMods(ids, cb);
	});
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
 *      - modreloaded - args: mod object
 *      - modreloaded:mod_name - args: mod object
 *
 * @param {String} modId The ID of the mod to be reloaded.
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
ModManager.prototype.reloadMod = function(modId, cb) {
	if (!cb)
		cb = function() {};
	if (!this._mods[modId])
		cb(new Error("Module '" + modId + "' is not loaded"));
	else if (this._mods[modId].blockReload)
		cb(new Error("Module '" + modId + "' can not be reloaded"));
	else {
		var self = this;
		Seq()
			.seq(function() {
				self.unloadMod(modId, true, this);
			})
			.seq(function() {
				self.loadMod(modId, this);
			})
			.seq(function() {
				self.emit('modreloaded', self._mods[modId]);
				self.emit('modreloaded:' + modId, self._mods[modId]);
				cb();
			})
			.catch(function(err) {
				cb(err);
			});
	}
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
 *
 * @param {String} modId The ID of the mod to be unloaded.
 * @param {boolean} [force] true to override the 'blockUnload' property if set;
 *      false otherwise.
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
ModManager.prototype.unloadMod = function(modId, force, cb) {
	if (typeof force == 'function') {
		cb = force;
		force = null;
	}
	if (!cb)
		cb = function() {};
	var self = this,
		mod = this._mods[modId];
	if (!mod)
		cb(new Error("Module '" + modId + "' is not loaded"));
	else if (mod.blockUnload && !force)
		cb(new Error("Module '" + modId + "' can not be unloaded"));
	else {
		if (mod.commands) {
			objUtil.forEach(mod.commands, function(key) {
				if (self._commands[key])
					delete self._commands[key];
			});
		}
		if (mod.unload)
			mod.unload();
		delete this._mods[modId];
		ModLoader.unloadMod(modId, function(err) {
			if (err)
				cb(err);
			else {
				self.emit('modunloaded', modId);
				self.emit('modunloaded:' + modId, modId);
				cb();
			}
		});
	}
};

module.exports = new ModManager();
module.exports.setMaxListeners(0);
