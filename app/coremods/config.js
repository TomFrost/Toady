/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

var Seq = require('seq'),
	ModConfig = require('../modmanager/ModConfig');

/**
 * Config provides commands allowing privileged users to update config
 * values on a given mod.  It restricts access to only those configuration
 * items called out by the target mod itself, and ensures that submissions
 * match the config item's specified value and, optionally, regex pattern.
 *
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {

	/**
	 * Changes a mod's config value.  The only values that can be changed are
	 * the ones defined in a given mod's configItems property, and the change
	 * will only be successful if the value is of the right type and passes
	 * validation.
	 *
	 * This function should ALWAYS be used when altering a different mod's
	 * config, as calling config.save() may save properties that the target
	 * mod does not want or expect to have in its config file.  This may render
	 * the *.yaml config useless to the end user and should be avoided.  This
	 * function will only save properties that already exist within the target
	 * mod's config file, plus the new config option being set.
	 *
	 * @param {String} modId The ID of the target mod
	 * @param {String} key The config key to be changed in the target mod
	 * @param {String|Number|Boolean} val The value to be set.  If a string is
	 *      provided for the value, it will be converted to the config item's
	 *      target type before being saved.
	 * @param {Function} cb A callback to execute on completion.  Args:
	 *      - {Error} If an error exists
	 */
	function setConfig(modId, key, val, cb) {
		var mod = modMan.getMod(modId.toLowerCase());
		Seq()
			.seq(function assertModExists() {
				if (!mod) {
					this(new Error("Mod '" + modId +
						"' does not exist or is not loaded."));
				}
				else this();
			})
			.seq(function assertConfigItemExists() {
				if (!mod.configItems || !mod.configItems[key]) {
					this(new Error("Config item " + modId + '.' + key +
						" does not exist or cannot be edited live."));
				}
				else this();
			})
			.seq(function assertValMatchesType() {
				transformValue(mod, key, val, this);
			})
			.seq(function validate(newVal) {
				validateValue(mod, key, newVal, this);
			})
			.seq(function getConf(newVal) {
				this.vars.newVal = newVal;
				ModConfig.getModConfigFile(modId, this);
			})
			.seq(function saveConf(modFile) {
				var props = Object.keys(modFile);
				props.push(key);
				mod.config[key] = this.vars.newVal;
				mod.config.save(props, this);
			})
			.seq(function success() {
				if (cb)
					cb();
			})
			.catch(function(err) {
				if (cb)
					cb(err);
			});
	}

	/**
	 * Shows the current value for a config key to a nick or channel.
	 *
	 * @param {String} replyTo The nick or channel to which messages should
	 *      be sent
	 * @param {String} modId The ID of the mod whose config will be viewed
	 * @param {String} key The config key to be shown
	 */
	function showConfig(replyTo, modId, key) {
		var mod = modMan.getMod(modId.toLowerCase());
		Seq()
			.seq(function assertModExists() {
				if (!mod) {
					this(new Error("Mod '" + modId +
						"' does not exist or is not loaded."));
				}
				else this();
			})
			.seq(function assertConfigItemExists() {
				if (!mod.configItems || !mod.configItems[key]) {
					this(new Error("Config item " + modId + '.' + key +
						" does not exist or cannot be edited live."));
				}
				else this();
			})
			.seq(function displayVal() {
				client.notice(replyTo, mod.id + '.' + key + ': {' +
					(mod.configItems[key].type || 'string') + '} ' +
					(mod.config[key] === undefined ? "(unset)" :
						mod.config[key]));
			})
			.catch(function(err) {
				client.notice(replyTo, err.message);
			});
	}

	/**
	 * Validates that a value matches the format required by a specific
	 * config item, and converts strings to that type if necessary.
	 *
	 * @param {Object} mod The mod whose config is being altered
	 * @param {String} key The config key being altered on the given mod
	 * @param {String|Number|Boolean} val The provided value
	 * @param {Function} cb A callback to be executed on completion. Args:
	 *      - {Error} If the value does not match the required type and
	 *        cannot be converted.
	 *      - {String|Number|Boolean} The converted value
	 */
	function transformValue(mod, key, val, cb) {
		var newVal, err;
		switch (mod.configItems[key].type) {
			case 'boolean':
				val += '';
				if (val.match(/^(?:1|true)$/i))
					newVal = true;
				else if (val.match(/^(?:0|false)$/i))
					newVal = false;
				else {
					err = new Error(mod.id + '.' + key +
						" requires a boolean value: 1 or 0, true or false.");
				}
				break;
			case 'number':
				newVal = parseFloat(val);
				if (isNaN(newVal)) {
					err = new Error(mod.id + '.' + key +
						" requires a numerical value.");
				}
				break;
			default:
				newVal = val;
		}
		cb(err, newVal);
	}

	/**
	 * Validates a value against a config item's 'validate' function, if it
	 * exists for the given mod.  If it does not exist, validation passes
	 * automatically.
	 *
	 * Note that the value provided to this function should already be of the
	 * type specified in the config item.  This can be achieved by calling
	 * transformValue.
	 *
	 * @param {Object} mod The mod whose config is being altered
	 * @param {String} key The config key being altered on the given mod
	 * @param {String|Number|Boolean} val The value to be validated
	 * @param {Function} cb A callback to be executed on completion. Args:
	 *      - {Error} If validation failed
	 *      - {String|Number|Boolean} The provided value
	 */
	function validateValue(mod, key, val, cb) {
		if (mod.configItems[key].validate) {
			var res = mod.configItems[key].validate(val);
			if (res instanceof Error)
				cb(res);
			else if (!res)
				cb(new Error("Incorrect format for " + mod.id + '.' + key));
			else
				cb(null, val);
		}
		else
			this(null, val);
	}

	return {
		name: 'Config',
		desc: "Allows mods to expose configuration items for live changes",
		author: 'Tom Frost',
		commands: {
			setconfig: {
				handler: function(from, to, target, args, inChan) {
					var replyTo = inChan ? to : from;
					setConfig(args[1], args[2], args[3], function(err) {
						if (err)
							client.notice(replyTo, err.message);
						else
							client.notice(replyTo, 'Value saved.');
					});
				},
				desc: "Sets a config option on a specified mod",
				help: [
					"Format: {cmd} <modID>.<configKey> <value>",
					"Example:",
					"  /msg {nick} {cmd} somelogger.mysqlPort 6003",
					"  {!}{cmd} changreeter.greeting Howdy! I'm {nick}!"
				],
				pattern: /^([a-zA-Z0-9_\-]+)\.([a-zA-Z0-9_]+)\s(.+)$/,
				minPermission: 'S'
			},
			viewconfig: {
				handler: function(from, to, target, args, inChan) {
					showConfig(inChan ? to : from, args[1], args[2]);
				},
				desc: "Shows the current value of a mod's config option",
				help: [
					"Format: {cmd} <modID>.<configKey>",
					"Example:",
					"  /msg {nick} {cmd} somelogger.mysqlPort",
					"  {!}{cmd} changreeter.greeting"
				],
				pattern: /^([a-zA-Z0-9_\-]+)\.([a-zA-Z0-9_]+)$/,
				minPermission: 'S'
			}
		},
		setConfig: setConfig
	};
};
