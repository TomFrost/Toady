/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var fs = require('fs'),
	path = require('path'),
	objUtil = require('../util/Object'),
	Ribbit = require('../ribbit/Ribbit'),
	Seq = require('seq');

const CORE_MOD_DIR = __dirname + '/../coremods';
const USER_MOD_DIR = __dirname + '/../../mods';

var coreModIds,
	coreModIdMap;

/**
 * Converts an array to an object map, using the array values as keys and
 * setting the values to boolean true.  This is useful for speeding up
 * repeated checks for existing values in an array.
 *
 * @param {Array} ary The array to be converted
 * @returns {Object} The hash map
 */
function arrayToMap(ary) {
	var map = {};
	ary.forEach(function(elem) {
		map[elem] = true;
	});
	return map;
}

/**
 * Retrieves an object map, with the keys being all available mod IDs in the
 * 'coremods' folder, and each value being boolean true.
 *
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Object} The hash map
 */
function getCoreModIdMap(cb) {
	if (coreModIds) {
		if (!coreModIdMap)
			coreModIdMap = arrayToMap(coreModIds);
		cb(null, coreModIdMap);
	}
	else {
		getCoreModIds(function(err, ids) {
			if (err)
				cb(err);
			else {
				coreModIdMap = arrayToMap(ids);
				cb(null, coreModIdMap);
			}
		});
	}
}

/**
 * Gets an array of all available mod IDs in the 'coremods' folder.
 *
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Array} The array of mod IDs
 */
function getCoreModIds(cb) {
	if (coreModIds)
		cb(null, coreModIds);
	else {
		getModIdsInDir(CORE_MOD_DIR, function(err, ids) {
			if (err)
				cb(err);
			else {
				coreModIds = ids;
				cb(null, ids);
			}
		});
	}
}

/**
 * Gets an array of all available mod IDs in the 'mods' folder.
 *
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Array} The array of mod IDs
 */
function getUserModIds(cb) {
	getModIdsInDir(USER_MOD_DIR, cb);
}

/**
 * Gets an array of all available mod IDs in a given directory.
 *
 * @param {String} dir The path to the folder to be checked
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Array} The array of mod IDs
 */
function getModIdsInDir(dir, cb) {
	fs.readdir(dir, function(err, list) {
		if (err)
			cb(err);
		else {
			var modIds = list.filter(function(file) {
				return file[0] != '.';
			}).map(function(file) {
				return file.replace(/\.js$/, '');
			});
			cb(null, modIds);
		}
	});
}

/**
 * Loads a mod by its mod ID, only to the extent of resolving its file name
 * and requiring it.  If the ID is found in the coremods folder (according to
 * a snapshot taken of this folder at start time), it will be loaded from
 * there.  Otherwise, it will attempt to load the mod from the 'mods' folder.
 *
 * Note that loading modules into the Toady framework is significantly more
 * complex than calling this function; this should only be called from
 * {@link ModManager#loadMod}.
 *
 * @param {String} modId The ID of the mod to be loaded
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {*} The result of requiring the mod file.  If the mod is
 *            properly formatted, this should be an executable function.
 *          - {Object|null} If found, the parsed package.json file associated
 *            with the mod.
 */
function loadMod(modId, cb) {
	Seq()
		.seq(function getMap() {
			getCoreModIdMap(this);
		})
		.seq(function getMod(coreModMap) {
			var mod,
				loadErr;
			this.vars.dir = coreModMap[modId] ? CORE_MOD_DIR : USER_MOD_DIR;
			try {
				mod = require(path.join(this.vars.dir, modId));
			}
			catch (e) {
				loadErr = new Error("Could not load mod '" + modId +
					"': Module does not exist");
				if (e.stack)
					console.log(e.stack);
				else
					console.log(e);
			}
			this(loadErr, mod);
		})
		.seq(function getPackageJson(mod) {
			var pkgJson = null;
			try {
				pkgJson = require(path.join(this.vars.dir, modId,
					'package.json'));
			}
			catch (e) {
				pkgJson = null;
			}
			cb(null, mod, pkgJson);
		})
		.catch(function(err) {
			cb(err);
		});
}

/**
 * Unloads a mod by its mod ID, only to the extent of removing the mod file
 * and any other files in the mod's folder from the Node.js module cache.
 * This will cause these files to be re-processed and fully loaded if
 * {@link #loadMod} is called for this mod again in the future.
 *
 * Note that unloading modules from the Toady framework is significantly more
 * complex than calling this function; this should only be called from
 * {@link ModManager#unloadMod}.
 *
 * @param {String} modId The ID of the mod to be unloaded.
 * @param {Function} [cb] A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
function unloadMod(modId, cb) {
	getCoreModIdMap(function(err, coreModMap) {
		if (err)
			cb(err);
		else {
			var dir = coreModMap[modId] ? CORE_MOD_DIR : USER_MOD_DIR,
				modKey = require.resolve(dir + '/' + modId),
				modObj = require.cache[modKey];
			if (modObj) {
				var regex = new RegExp('\/(?:' + Ribbit.MOD_PREFIX +
					')?' + modId);
				objUtil.forEach(require.cache, function(key) {
					if (key.match(regex))
						delete require.cache[key];
				});
				if (cb)
					cb(null);
			}
			else if (cb) {
				cb(new Error("No loaded modules belonging to '" + modId +
					"' were found."));
			}
		}
	});
}

module.exports = {
	getCoreModIds: getCoreModIds,
	getUserModIds: getUserModIds,
	loadMod: loadMod,
	unloadMod: unloadMod
};