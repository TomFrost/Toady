/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// Dependencies
var fs = require('fs'),
	path = require('path'),
	npm = require('npm'),
	rimraf = require('rimraf'),
	Seq = require('seq');

const MOD_DIR = path.normalize(path.join(__dirname, '../../mods'));
const MOD_PREFIX = 'toady-';

/**
 * Installs a given Toady mod by having NPM install it into node_modules
 * (complete with the 'toady-' prefix) and symlinking it to the mods folder
 * without the prefix.
 *
 * @param {String} modId The ID of the mod to be installed, without the
 *      Toady package prefix
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
function install(modId, cb) {
	var modPkg = MOD_PREFIX + modId;
	Seq()
		.seq(function checkArgs() {
			if (modId.indexOf(' ') != -1)
				this(new Error('Mod names cannot contain spaces'));
			else
				this();
		})
		.seq(function getNpm() {
			npm.load(this);
		})
		.seq(function runInstall(npm) {
			npm.install(modPkg, this);
		})
		.seq(function makeSymlink() {
			fs.symlink(path.join(npm.dir, modPkg), path.join(MOD_DIR, modId),
				'dir', this);
		})
		.seq(function complete() {
			cb();
		})
		.catch(function(err) {
			cb(err);
		});
}

/**
 * Executes an NPM search for mods matching the toady mod prefix and an
 * optional additional search query.
 *
 * @param {String|null} [query] A search query to limit the result.  Omit to
 *      return all Toady mods.
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 *          - {Array} The modIds (Strings) that were found in the search.  Each
 *            element of the array will have a corresponding key in the NPM
 *            result set, where the key is prefixed with {@link #MOD_PREFIX}.
 *          - {Object} The raw NPM result set from the search, mapping package
 *            names to package metadata.  Note that not all results in this
 *            set may be Toady mods.  It's best to iterate through the array
 *            of modIds, prepending {@link #MOD_PREFIX} to each one, and
 *            pulling that key from this object.
 */
function search(query, cb) {
	Seq()
		.seq(function getNpm() {
			npm.load(this);
		})
		.seq(function runSearch(npm) {
			var args = query.split(' ');
			args.push(MOD_PREFIX, this);
			npm.search.apply(npm, args);
		})
		.seq(function getKeys(res) {
			var pregex = new RegExp('^' + MOD_PREFIX);
			var modIds = Object.keys(res).filter(function(key) {
				return key.match(pregex);
			}).map(function(key) {
				return key.substr(MOD_PREFIX.length);
			});
			if (!modIds || !modIds.length)
				this(new Error("No results for \"" + query + "\"."));
			else
				cb(null, modIds, res);
		})
		.catch(function(err) {
			cb(err);
		});
}

/**
 * Uninstalls a mod by removing the symlink in the mods folder, as well as
 * deleting the mod from node_modules.  If a mod was not installed through
 * this means, an error will be returned.
 *
 * @param {String} modId An installed mod ID to be deleted
 * @param {Function} cb A callback function to be executed on completion.
 *      Arguments provided are:
 *          - {Error} An error object, if an error occurred
 */
function uninstall(modId, cb) {
	var modPath = path.join(MOD_DIR, modId),
		nonRibbitErr = new Error("Only mods installed with this utility \
can be uninstalled with this utility.");
	Seq()
		.seq(function sanitize() {
			if (modId.indexOf(' ') != -1 || modId.indexOf('/') != -1)
				this(new Error("The uninstall command takes a single mod ID."));
			else
				this();
		})
		.seq(function getStat() {
			var next = this;
			fs.lstat(modPath, function(err, stat) {
				if ((err && err.code == 'ENOENT') || !err)
					next(null, stat);
				else
					next(err);
			});
		})
		.seq(function assertSymLink(stat) {
			if (!stat)
				this(new Error("Mod '" + modId + "' not found."));
			else if (!stat.isSymbolicLink())
				this(nonRibbitErr);
			else
				this();
		})
		.seq(function getLinkedPath() {
			fs.readlink(modPath, this);
		})
		.seq(function assertNodeModules(linkPath) {
			var existsRegex = new RegExp(path.join('node_modules',
				MOD_PREFIX + modId) + '$');
			if (!linkPath.match(existsRegex))
				this(nonRibbitErr);
			else {
				this.vars.linkPath = linkPath;
				this(null, linkPath);
			}
		})
		.seq(function deleteSymLink() {
			fs.unlink(modPath, this);
		})
		.seq(function deleteLinkPath() {
			rimraf(this.vars.linkPath, this);
		})
		.seq(function success() {
			cb();
		})
		.catch(function(err) {
			cb(err);
		});
}

module.exports = {
	MOD_DIR: MOD_DIR,
	MOD_PREFIX: MOD_PREFIX,
	install: install,
	search: search,
	uninstall: uninstall
};
