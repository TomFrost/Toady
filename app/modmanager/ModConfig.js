/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// Dependencies
var fs = require('fs'),
	config = require('config'),
	objUtil = require('../util/Object'),
	env = process.env.NODE_ENV || 'default';

const CONFIG_PATH = __dirname + "/../../config/" + env + "-mod_{mod}.json";
const CONFIG_PREFIX = 'mod_';

/**
 * Gets a path to save a config file specific to a mod.
 *
 * @param {String} modId The mod ID to associate with the file
 * @returns {String} A path appropriate for a config file for this mod ID
 */
function getPath(modId) {
	return CONFIG_PATH.replace('{mod}', modId);
}

/**
 * Gets a closure that will JSONify any enumerable properties on 'this' and
 * save it to a file unique to the given modId when called.
 *
 * @param {String} modId The modId for which to generate the closure.  This
 *      determines the filename to which the JSON will be saved.
 * @returns {Function} A closure which, when called, will save the enumerable
 *      local properties of 'this' as JSON to a file.  Arguments are:
 *          - {Array} OPTIONAL: An array of top-level properties to save. If
 *            omitted, every enumerable property will be saved.
 *          - {Function} OPTIONAL: A callback function to be executed when
 *            complete.  Arguments:
 *              - {Error} If an error occurred while saving the file.
 */
var getSaveFunc = function(modId) {
	return function(props, cb) {
		var serial = this,
			self = this;
		if (typeof props == 'function') {
			cb = props;
			props = null;
		}
		if (props) {
			serial = {};
			props.forEach(function(key) {
				if (self.hasOwnProperty(key))
					serial[key] = self[key];
			});
		}
		fs.writeFile(getPath(modId), JSON.stringify(serial, null, '\t'), cb);
	};
};

/**
 * Gets an object containing configuration values for a given mod, as well
 * as a non-enumerable non-writable function called "save" that will persist
 * any runtime changes to this config to a file.
 *
 * The configuration object is created in the following fashion:
 *      1: Start with any properties passed in with the 'defaults' argument.
 *         Note that, when writing a Toady mod, this will be whatever has
 *         been set to module.exports.configDefault (if anything)
 *      2: Deep-merge that with any values set in the mod_MODID section of the
 *         default.yaml file (or, for multiple server configs, the SERVER.yaml
 *         file).  Conflicting properties will be overwritten.
 *      3: Deep-merge that with any properties that have been set using
 *         config.save() (where 'config' is the object returned in the
 *         callback of this function).  Conflicting properties will be
 *         overridden
 *
 * Using the returned config object is very straightforward.  Just add whatever
 * you like:
 *
 *      config.foo = "bar";
 *      config.hello = {world: "!"};
 *
 * and save it!
 *
 *      config.save();
 *      // OR:
 *      config.save(function(err) {
 *          if (err) console.log(err);
 *          else console.log('Saved!');
 *      }
 *      // OR:
 *      config.save([prop1, prop2, prop4]);
 *
 * Anything saved will still exist when the bot is restarted or the module
 * is reloaded, thanks to step 3 above.
 *
 * Note that calling this function consecutive times with the same
 * modId/defaults will NOT return the same config object, and is not an
 * appropriate method for changing the config for a mod from a different mod.
 * If that functionality is necessary, it's strongly recommended to access the
 * 'config' property of a mod to read its values, but change those values only
 * with the Config mod's setConfig() function.
 *
 * In the Toady framework, the config object returned by this function is
 * passed directly to each mod when the mod is loaded.
 *
 * @param {String} modId The mod ID whose configuration should be loaded
 * @param {Object|null} defaults An object containing default properties
 *      to be set if neither the bot config or the mod config file has
 *      those properties set.
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Object} An object containing all this mod's config properties,
 *            as well as a save([cb]) function to save any future changes.
 */
function getConfig(modId, defaults, cb) {
	var conf = objUtil.deepMerge(defaults || {},
			config[CONFIG_PREFIX + modId] || {});
	getModConfigFile(modId, function(err, modFile) {
		conf = objUtil.deepMerge(conf, modFile);
		Object.defineProperty(conf, 'save', {
			value: getSaveFunc(modId).bind(conf)
		});
		cb(null, conf);
	});
}

/**
 * Gets the contents of the mod's JSON-formatted config file, parses it, and
 * returns it in a callback.  If the config file does not (yet) exist, an
 * empty object will be passed back instead.
 *
 * Note that, unlike {@link #getConfig}, the object produced by this function
 * will NOT be merged from any other config source and will NOT contain a
 * save() function to persist changes.  The contents of the mod config file
 * will be only what the mod itself was responsible for saving manually.
 *
 * @param {String} modId The ID of the mod whose file should be loaded
 * @param {Function} cb A callback function to be executed on completion. Args:
 *      - {Error} An error object, if an error occurred.  Most likely errors
 *          include issues reading the file (excepting the file not existing)
 *          and inability to parse the file's JSON.
 *      - {Object} The parsed config object stored in the file
 */
function getModConfigFile(modId, cb) {
	fs.readFile(getPath(modId), function(err, json) {
		if (err && err.code != 'ENOENT')
			cb(err);
		else {
			var success = true,
				savedConf = {};
			if (json) {
				try {
					savedConf = JSON.parse(json);
				}
				catch (e) {
					success = false;
					cb(e);
				}
			}
			if (success)
				cb(null, savedConf || {});
		}
	});
}

module.exports = {
	CONFIG_PATH: CONFIG_PATH,
	CONFIG_PREFIX: CONFIG_PREFIX,
	getConfig: getConfig,
	getModConfigFile: getModConfigFile
};
