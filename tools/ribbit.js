/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// NPM, why do you use stderr for non-error output? Uncool.
process.stderr._write = process.stderr.write;
process.stderr.write = function() {};

// Dependencies
var fs = require('fs'),
	npm = require('npm'),
	rimraf = require('rimraf'),
	Seq = require('seq'),
	path = require('path');

const MOD_DIR = path.normalize(path.join(__dirname, '..', 'mods'));
const MOD_PREFIX = 'toady-';

// Parse command and arguments
var cmd = process.argv[2] ? process.argv[2].toLowerCase() : '',
	args = process.argv.slice(3).join(' ');

// Route command
switch(cmd) {
	case 'start':
		startToady(args); break;
	case 'search':
		search(args); break;
	case 'install':
		installMod(args); break;
	case 'uninstall':
		uninstallMod(args); break;
	default:
		printUsage();
		process.exit(1);
}

/**
 * Outputs a fatal error message and exits.
 *
 * @param {Error} err An error object to display
 * @param {Number} [code] The exit code with which to exit the process.  This
 *      will be 1 if not specified.
 */
function exitFatal(err, code) {
	if (code === undefined || code === null)
		code = 1;
	console.log(err.message);
	process.exit(code);
}

/**
 * Installs a given Toady mod by having NPM install it into node_modules
 * (complete with the 'toady-' prefix) and symlinking it to the mods folder
 * without the prefix.
 *
 * @param {String} args The name of the mod to be installed, without the
 *      prefix
 */
function installMod(args) {
	var modPkg = MOD_PREFIX + args;
	Seq()
		.seq(function checkArgs() {
			if (args.indexOf(' ') != -1)
				this(new Error('Mod names cannot contain spaces'));
			else
				this();
		})
		.seq(function getNpm() {
			npm.load(this);
		})
		.seq(function runInstall(npm) {
			npm.dir = MOD_DIR;
			npm.root = npm.dir;
			console.log("Installing " + modPkg + "...");
			npm.install(modPkg, this);
		})
		.seq(function makeSymlink() {
			fs.symlink(path.join(npm.dir, modPkg), path.join(MOD_DIR, args),
				'dir', this);
		})
		.seq(function complete() {
			console.log('Installed!');
		})
		.catch(function(err) {
			exitFatal(err);
		});
}

/**
 * Scans an array of strings for the longest string length it contains.
 *
 * @param {Array} ary An array of strings
 * @returns {Number} The largest string length in the array
 */
function maxStrLen(ary) {
	var maxLen = 0;
	ary.forEach(function(str) {
		if (str.length > maxLen)
			maxLen = str.length;
	});
	return maxLen;
}

/**
 * Outputs usage instructions to stdout.
 */
function printUsage() {
	var usage = [
		"USAGE: ./ribbit <command> [options]\n",
		"COMMANDS:",
		"  start [config]   Starts Toady. Loads the 'default' config, unless you",
		"                   specify a different one.",
		"  search [term]    Searches for Toady mods that can be installed.  If",
		"                   the search term is omitted, we'll list everything!",
		"  install <mod>    Installs a Toady mod.  If Toady is currently running,",
		"                   use /msg Toady loadmod <mod> in IRC to load it up.",
		"  uninstall <mod>  Uninstalls an installed mod.  If Toady is currently",
		"                   running, consider /msg Toady unloadmod <mod> first."
	];
	usage.forEach(function(line) {
		console.log(line);
	});
}

/**
 * Executes an NPM search for mods matching the toady mod prefix and an
 * optional additional search query.
 *
 * @param {String} query A search query to limit the results
 */
function search(query) {
	Seq()
		.seq(function getNpm() {
			npm.load(this);
		})
		.seq(function runSearch(npm) {
			var queryStr = query ? ' [' + query + ']' : '';
			console.log("Searching for mods" + queryStr + "...");
			this.vars.stdOn = stdOff();
			var args = query.split(' ');
			args.push(MOD_PREFIX, this);
			npm.search.apply(npm, args);
		})
		.seq(function getKeys(res) {
			this.vars.stdOn();
			var pregex = new RegExp('^' + MOD_PREFIX);
			var modIds = Object.keys(res).filter(function(key) {
				return key.match(pregex);
			}).map(function(key) {
				return key.substr(MOD_PREFIX.length);
			});
			if (!modIds || !modIds.length)
				this(new Error("No results for \"" + query + "\"."));
			else {
				this.vars.results = res;
				this.vars.maxId = maxStrLen(modIds);
				this.vars.maxDesc = process.stdout.columns -
					this.vars.maxId - 4;
				console.log('');
				this(null, modIds);
			}
		})
		.flatten()
		.seqEach(function(modId) {
			console.log(strFit(modId, this.vars.maxId), '  ',
				strFit(this.vars.results[MOD_PREFIX + modId].description,
				this.vars.maxDesc, true));
			this();
		})
		.catch(function(err) {
			exitFatal(err);
		});
}

/**
 * Starts an instance of Toady.  If called with no arguments, Toady will
 * be started using config/default.yaml as the config file.  Otherwise,
 * Toady will attempt to load config/{ARGS}.yaml.
 *
 * @param {String} [args] The name of the config to load
 */
function startToady(args) {
	if (args == 'default')
		args = null;
	if (args)
		process.env.NODE_ENV = args;
	require('../app/Toady');
}

/**
 * Overrides stdout so that any form of console logging is null-routed.  This
 * is useful to silence NPM output.
 *
 * @returns {Function} A function that, when called, will restore stdout to
 *      its original setting.
 */
function stdOff() {
	var oldStdout = process.stdout.write;
	process.stdout.write = function() {};

	return function() {
		process.stdout.write = oldStdout;
	};
}

/**
 * Makes a string fit the specified space, either by right-padding it with
 * spaces or by truncating it.
 *
 * @param {String} str The string whose length should be changed
 * @param {Number} len The new length of the string
 * @param {boolean} [truncOnly] true if this function should only truncate
 *      the string, and never pad it; false otherwise.  This is useful
 *      to avoid unnecessary padding on the last string of a line.
 * @returns {String} The string, with a length matching the len argument.
 */
function strFit(str, len, truncOnly) {
	if (!truncOnly) {
		while (str.length < len)
			str += ' ';
	}
	if (str.length > len)
		str = str.substring(0, len);
	return str;
}

/**
 * Uninstalls a mod by removing the symlink in the mods folder, as well as
 * deleting the mod from node_modules.  If a mod was not installed through
 * this means, an error will be returned.
 *
 * @param {String} args An installed mod ID to be deleted
 */
function uninstallMod(args) {
	var modPath = path.join(MOD_DIR, args),
		nonRibbitErr = new Error("Ribbit will only uninstall mods that it \
installed.\nYou're safe to delete " + path.join('mods', args) + " yourself, \
though, if you no longer need it!");
	Seq()
		.seq(function sanitize() {
			if (args.indexOf(' ') != -1 || args.indexOf('/') != -1)
				this(new Error("The remove command takes a single mod ID."));
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
				this(new Error("Mod '" + args + "' not found."));
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
				MOD_PREFIX + args) + '$');
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
			console.log("Deleted", args);
		})
		.catch(function(err) {
			exitFatal(err);
		});
}
