/*
 * Toady
 * Copyright 2013 Tom Frost
 */

var ribbit = require('../ribbit/Ribbit'),
	Seq = require('seq'),
	strUtil = require('../util/String');

module.exports = function(config, client, modMan) {

	function install(replyTo, modId) {
		client.notice(replyTo, "Installing \"" + modId + "\"...");
		Seq()
			.seq(function runInstall() {
				ribbit.install(modId, this);
			})
			.seq(function loadMod() {
				client.notice(replyTo, "Installed!  Loading mod...");
				modMan.loadMod(modId, this);
			})
			.seq(function success() {
				client.notice(replyTo, "Mod \"" + modId + "\" loaded.");
			})
			.catch(function(err) {
				client.notice(replyTo, err.message);
			});
	}

	function search(replyTo, terms) {
		if (!terms)
			terms = '';
		client.notice(replyTo, "Searching for \"" + terms + "\"...");
		ribbit.search(terms, function(err, modIds, res) {
			if (err)
				client.notice(replyTo, err.message);
			else {
				var maxId = strUtil.maxLen(modIds);
				client.notice(replyTo, "** Results for \"" + terms + "\" **");
				modIds.forEach(function(modId) {
					client.notice(replyTo, strUtil.fit(modId, maxId) + '  ' +
						res[ribbit.MOD_PREFIX + modId].description);
				});
				client.notice(replyTo, "** End of results **");
			}
		});
	}

	function uninstall(replyTo, modId) {
		Seq()
			.seq(function unload() {
				if (modMan.isLoaded(modId))
					modMan.unloadMod(modId, this);
				else
					this(null, true);
			})
			.seq(function uninstall(unloadSkipped) {
				if (!unloadSkipped)
					client.notice(replyTo, "Mod \"" + modId + "\" unloaded.");
				client.notice(replyTo, "Uninstalling \"" + modId + "\"...");
				ribbit.uninstall(modId, this);
			})
			.seq(function success() {
				client.notice(replyTo, "Mod \"" + modId + "\" uninstalled.");
			})
			.catch(function(err) {
				client.notice(replyTo, err.message);
			})
	}

	return {
		name: "Ribbit",
		desc: "IRC interface for the Ribbit mod management system",
		version: "0.1.0",
		author: "Tom Frost",
		commands: {
			ribbit: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					switch (args[1].toLowerCase()) {
						case 'search': search(replyTo, args[2]); break;
						case 'install': install(replyTo, args[2]); break;
						case 'uninstall': uninstall(replyTo, args[2]); break;
					}
				},
				desc: "Accesses the Ribbit mod management tool to install \
third-party mods",
				help: [
					"** !!IMPORTANT!! **",
					"** The Toady Mod Repository is not curated or \
monitored, and the general public can",
					"** post to it.  Beware of nefarious mods that may \
destroy your machine or steal your secrets.",
					" ",
					"Format: {cmd} <command> [options]",
					"Available commands:",
					"  SEARCH [term]:     Searches published mods for the \
given terms. Omit terms to list all available mods.",
					"  INSTALL [modID]:   Installs and loads a new mod",
					"  UNINSTALL [modID]: Unloads and uninstalls an existing \
mod",
					" ",
					"Examples:",
					"  /msg {nick} {cmd} search",
					"  /msg {nick} {cmd} search typo",
					"  /msg {nick} {cmd} install typofix",
					"  /msg {nick} {cmd} uninstall typofix"
				],
				minPermission: 'S',
				pattern: /^(search|install|uninstall)(?:\s+(.+))?$/i
			}
		}
	}
};
