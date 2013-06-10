/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// NPM, why do you use stderr for non-error output? Uncool.
process.stderr._write = process.stderr.write;
process.stderr.write = function() {};

// Dependencies
var ribbit = require('../app/ribbit/Ribbit'),
	Seq = require('seq'),
	strUtil = require('../app/util/String');

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
		install(args); break;
	case 'uninstall':
		uninstall(args); break;
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
 * Installs a given Toady mod.
 *
 * @param {String} args The name of the mod to be installed, without the
 *      prefix
 */
function install(args) {
	var modPkg = ribbit.MOD_PREFIX + args;
	console.log("Installing " + modPkg + "...");
	ribbit.install(args, function(err) {
		if (err)
			exitFatal(err);
		else
			console.log('Installed!');
	});
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
 * Lists any Toady mods matching the search query, or all mods if no query
 * is provided.
 *
 * @param {String} query A search query to limit the results
 */
function search(query) {
	Seq()
		.seq(function getResults() {
			this.vars.stdOn = stdOff();
			ribbit.search(query, this);
		})
		.seq(function prepOutput(modIds, res) {
			this.vars.stdOn();
			if (!modIds || !modIds.length)
				this(new Error("No results for \"" + query + "\"."));
			else {
				this.vars.results = res;
				this.vars.maxId = strUtil.maxLen(modIds);
				this.vars.maxDesc = process.stdout.columns -
					this.vars.maxId - 4;
				console.log('');
				this(null, modIds);
			}
		})
		.flatten()
		.seqEach(function(modId) {
			console.log(strUtil.fit(modId, this.vars.maxId), '  ',
				strUtil.fit(this.vars.results[ribbit.MOD_PREFIX + modId]
				.description, this.vars.maxDesc, true));
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
 * Uninstalls a Toady mod.
 *
 * @param {String} args An installed mod ID to be deleted
 */
function uninstall(args) {
	var modPkg = ribbit.MOD_PREFIX + args;
	console.log("Uninstalling " + modPkg + "...");
	ribbit.uninstall(args, function(err) {
		if (err)
			exitFatal(err);
		else
			console.log('Uninstalled.');
	});
}
