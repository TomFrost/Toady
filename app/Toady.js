/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var client = require('./irc/Client'),
	ModManager = require('./modmanager/ModManager'),
	Seq = require('seq');

client.setMaxListeners(0);
client.addListener('error', function(message) {
	console.log('[ERROR] ', message);
});

Seq()
	.seq(function() {
		console.log('Loading Core modules...');
		ModManager.loadCoreMods(this);
	})
	.seq(function() {
		console.log('Loading User modules...');
		ModManager.loadUserMods(this);
	})
	.seq(function() {
		console.log('Connecting to IRC...');
		client.connect(3, function() {
			console.log('Connected.');
		});
	})
	.catch(function(err) {
		console.log(err);
		process.exit(1);
	});
