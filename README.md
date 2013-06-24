# Toady
Wickedly extensible IRC bot written in Node.js.  Load and reload mods without reconnecting.

## Download. Install. Fly.
If you don't already have Node.js, [get it](http://nodejs.org). It's awesome.
And also required.

Then, grab Toady from Github by using the [download link](https://github.com/TomFrost/Toady/archive/master.zip),
or if you're dev-minded and like to stay updated, clone it on the command line:

	git clone git@github.com:TomFrost/Toady.git

Get into that folder on the command line and install:

    npm install

## Configure it. Just a little bit.
Copy config/default.yaml.sample to config/default.yaml.  Enter your server
settings, change Toady's name, and pay extra careful attention to the section
marked with

    ## !!IMPORTANT!! ##

Because four exclamation points means business, son.

## You turn Toady on.
To launch (from the Toady directory) on any non-Windows machine, or Cygwin:

    ./ribbit start

If you're on Windows, it's:

    ribbit.cmd start

Need to launch it on more than one server? Just copy config/default.yaml to
config/myotherserver.yaml, edit it for the new server, and launch
Toady like this:

    ./ribbit start myotherserver

When he's in your channel, do this in IRC for more info:

    /msg Toady help

## Teach Toady new tricks.
Toady can be extended through simple mods, and mods can make Toady do
practially anything.  Mods can be searched for, installed, and uninstalled
through ribbit.

**IMPORTANT NOTE: This section shows you how to install third-party mods.
These are not moderated, maintained, guaranteed, or otherwise vetted by
Toady's author.  Install at your own risk, as mods are capable of anything!**

List all Toady mods:

    ./ribbit search
    # Or in IRC: /msg Toady ribbit search

List only mods that deal with typos:

    ./ribbit search typo
    # Or in IRC: /msg Toady ribbit search typo

Install a mod:

    ./ribbit install typofix
    # Or in IRC, just say: !ribbit install typofix

Uninstall a mod:

    ./ribbit uninstall typofix
    # Or in IRC, just say: !ribbit uninstall typofix

Did I mention you can search, download, and install mods into a running Toady
instance directly from IRC?  Yeah.  Toady's like that.

## Write your own mods! (It's easy)
Mods for Toady are standard Node.js modules.  They can have their own
node_modules folder with dependencies set up in a package.json, they can
require() whatever they need, they can open new ports, and they can interact
with the entire Toady framework including other mods.  Toady mods have no
limitations.

### Make a basic mod
For your first mod, make a folder in Toady's 'mods' folder called 'test'.
That makes 'test' your mod's 'id' -- no other mod can be loaded with the same
id.  Inside of mods/test, create index.js and paste in the following.  This is
the most basic form of a mod:

	/**
	 * Creates a new Test mod
	 *
	 * @param {Object} config Contains config fields specific to this mod
	 * @param {Object} client The connected IRC client powering the bot
	 * @param {Object} modMan A reference to the ModManager object,
	 *      responsible for loading/unloading mods and commands.
	 * @returns {Object} The new Test mod
	 */
	module.exports = function(config, client, modMan) {
		return {
			name: "My Test Mod",
			version: "0.1.0",
			author: "Me, Myself, and I",
			desc: "I just made this to screw around",
			commands: {
				greet: {
					handler: function(from, to, target, args) {
						client.say(target, "Hi " + from + "!");
					},
					desc: "Makes the bot say Hi to you.",
                    help: [
                        "Format: {cmd} [#channel]",
                        "Examples:",
                        "  /msg {nick} {cmd} #room",
                        "  {!}{cmd}",
                        "  {!}{cmd} #otherRoomImIn",
                        " ",
                        "If this is said in a channel, I'll greet you on the" +
                            "same channel if no other is specified."
                    ],
                    targetChannel: true
				}
			}
		};
	};

If Toady isn't running yet, this mod will be loaded automatically when you
start him up.  If he *is* currently running, just say this:

	!loadmod test

And now you can try out your new `!greet` command. Any time you make a change
to this mod and want Toady to update to the latest version, just say:

	!reloadmod test

For a list of these and other mod-related commands, type

	!viewmod modcontrol

### Structure of a mod
The object literal that the exported function returns has the following
properties:

#### name: string
The name given to your mod when it's listed with `!help` or `!viewmod`.

#### version: string
The version of your mod.  This should follow the semantic versioning guidelines
at [semver.org](http://semver.org). **You can omit this if your mod has a
package.json file with a version! Toady will pull it from there instead.**

#### author: string
Your name!  You can optionally specify your E-mail address, in the format
`Your Name <your@email.com>`.  **You can omit this if your mod has a
package.json file with an author! Toady will pull it from there instead.**

#### desc: string
A very brief, one-liner description of what your mod does.  This will show
up in the `!viewmod` output.  **You can omit this if your mod has a
package.json file with a description! Toady will pull it from there instead.**

#### unload: function() *(optional)*
A function that will be called immediately before unloading this module in the
ModManager.  **If any event listeners have been placed on the ModManager
or the IRC client object, they MUST BE REMOVED by this function!** Toady cannot
enforce this, so it is up to you, the mod author, to make sure.  Toady will
have unexpected and unstable behavior if this function does not remove all
the mod's listeners.

#### blockReload: boolean *(optional, default false)*
If true, this will stop your mod from being reloaded with the `!reloadmod`
command.  While this can be convenient to stop the mod's "memory" from being
wiped by an unsuspecting Owner or SuperUser, this is *extremely bad practice*.
Use the config object to save changes rather than blocking your mod from
being reloaded.

#### blockUnload: boolean *(optional, default false)*
If true, this will stop your mod from being unloaded with the `!unloadmod`
command, but *not* through the `!reloadmod` command.  **This should only
ever be used for mods that are core to the function of the bot**

#### commands
An object literal that maps command names (whatever you would msg Toady or
say in a room with the fantasy char) to command objects.  Those are defined
below.  *This field is optional; not all mods have user-callabe commands.*

### Structure of a Command
Commands are managed by the Toady framework to prevent name overlaps, ensure
users have the appropriate permissions, etc.  If your mod just needs to listen
for IRC events and react to them, no commands are necessary.  But if you want
someone to be able to say `!somecommand`, here's how:

#### handler: function(from, to, target, args, inChan)
The function that executes when the function is called.  The arguments are:
- *from* - The nick of the user calling the command
- *to* - The bot's name if this was sent in a private message, or the channel the command was spoken in if not.
- *target* - The channel or nick targeted for the command. This is configured below.
- *args* - An array containing the arguments to this command.  If no *pattern* is specified below, this will have just one element: The entire string following the command or target.
- *inChan* - True if the command was said in a channel (and thus 'to' is a channel name); false if the command was messaged privately (and this 'to' is the bot's nick).

#### desc: string
A brief one-liner description of what the command does.  Shown in `!help`.

#### help: array
An array of strings to be sent in the `!help` command.  Each string will be
sent in its own IRC NOTICE, so this can be utilized to control line breaks.
The following placeholders will be automatically replaced with the appropriate
contents:
- **{!}** - The configured fantasy character
- **{cmd}** - The name of the command
- **{mod}** - The name of the mod (specified in the mod's `name` field)
- **{modId}** - The id of the mod (usually, its folder name in the mods folder)
- **{nick}** - The nickname of the bot
- **{version}** - The version number of the mod

#### minPermission: string *(optional)*
The permission character of the lowest permission allowed to call this command.
If omitted, the command won't be restricted by permission.  Toady recognizes
the following permissions, in order from most to least privileged:
- **O** - Owner. Full access to all commands, cannot be revoked.
- **S** - SuperUser. Full access to all commands, except those which may impact other Owners or SuperUsers.
- **P** - PowerUser. Limited access to global command set.
- **~** - Channel founder
- **&** - Channel admin
- **@** - Channel op
- **%** - Channel half-op
- **+** - Voice
- **''** - (Empty string) A user in a channel

The **O**, **S**, and **P** permissions are Toady-specfic and can be set with
the `!adduser` and `!updateuser` commands.  All others come directly from IRC.

#### pattern: RexExp *(optional)*
The regex pattern that the command arguments must match in order for the
function to be called.  If specified, the `args` argument in the handler
function will be the result of the match -- so index 0 will be the entire
string, 1 will be the first paranthetical match, 2 will be the second, and so
on.  If targetChannel or targetNick is specified as described below, this
pattern will *NOT* be applied to the target argument.

#### targetChannel: boolean *(optional, default false)*
Setting this to `true` will require that the first argument to the command
is a channel name, prefixed with `#` or `&`.  If the command is said in a
channel using the fantasy char, the channel can be omitted and it will be
assumed that the target is the same channel.  This value will be passed in the
handler's `target` argument.

#### targetNick: boolean *(optional, default false)*
Setting this to `true` will require that the first argument to the command
is a user's nick.  **Note that this will *not* ensure that the nick is real
or connected -- it just assumes the first argument is the target nick**.
This value will be passed in the handler's `target` argument.

#### hidden: boolean *(optional, default false)*
Setting this to `true` will cause this command to be omitted from `!help`.
This can be useful in games where certain commands would only make sense to
users if the game is currently running.  The "hidden" flag can be turned on
and off dynamically as needed.  It should **never** be used to exercise
any form of security through obscurity.  Use *minPermission* to restrict
access to commands.

### Config
The `config` argument passed to each mod is an object literal containing
configuration fields.  The fields are loaded in the following order, with
each step overwriting any existing fields from previous steps:
- The mod's own module.exports.configDefaults object, if one exists
- The mod_MODNAME-HERE section from the .yaml config file currently in use, if it exists
- The config/CONFNAME-mod_MODNAME.json file, if it exists

So if a mod named "test" is written with this at the bottom:

	module.exports.configDefaults = {
		delay: 12,
		message: 'Hello!',
		name: 'Ted'
	};

And **config/default.yaml** contains this block:

	mod_test:
	  delay: 5

And the file **config/default-mod_test.json** contains this:

	{
		"message": "Yo!"
	}

Then the config object passed into the 'test' mod when it's loaded will be:

	{
		delay: 5,
		message: "Yo!",
		name: "Ted"
	}

Why the complexity?
- module.exports.configDefaults allows you to define the default values your mod will be instantiated with, so that no error checking for nonexistant config values is necessary
- The block in the .yaml file allows the bot owner to easily specify new config options
- The .json file is what the config object itself saves when config.save() is called.

#### config.save()
The 'save' function is the only value that Toady itself adds to your config
object, and it is non-enumable -- so iterating over your config values will not
show 'save' as a property.  It's there, though, and calling it will write the
file config/default-mod_MODNAME.json, where "default" is the name of the .yaml
file currently in use.  Any saved config will be provided back to the mod if
it's reloaded, or the bot is restarted.

### Client
The IRC client provided to each mod is an instance of martynsmith's
fantastic [node-irc](https://github.com/martynsmith/node-irc) client, unaltered
in any way except for configuring and connecting it according to the options
defined in the configuration yaml file.

The client object allows the bot to send messages, join, part, quit, change
nicks, etc -- anything you would expect an IRC client to do.  It also tracks
the bot's nick as well as the users and their permissions in the channels the
bot is in, and exposes many events you can hook to be notified of new messages,
nick changes, parts, and more.  Just skim [the node-irc documentation site](https://node-irc.readthedocs.org/en/latest/API.html)
for details.

Here are a few examples of how easy the client is to use:

	client.say('#myChan', "HI GUYS! MY NAME IS " + client.nick + "!!!");

	function nickHandler(oldnick, newnick, channels) {
    	channels.forEach(function(channel) {
    		client.say(channel, "Stop changing your name, " + newnick);
    	});
    }
	client.on('nick', nickHandler);

	// And your mod's 'unload' function MUST contain this line
	// if you do the above:
	// client.removeListener('nick', nickHandler);

### ModManager
The ModManager instance that gets passed to each mod on load is a singleton
responsible for loading/unloading all mods, collecting command objects, and
providing all of these things to other mods on request.  In addition to
returning official mod properties in the resulting object literal, arbitrary
properties can be added for other mods to take advantage of.  For example,
the 'users' mod includes functions for finding and checking user permissions.
If your mod needs to do that, you could call:

	var usersMod = modMan.getMod('users');
	client.say(channel, "You have the permission: " + usersMod.getPermission(nick));

The ModManager also emits events for when mods and commands are
loaded/unloaded, so if your mod needs to modify all new commands as they load
(maybe your mod's goal is to remove permission requirements from all comamnds?),
listening for those events is extremely easy.

Since the use cases for accessing the ModManager are fairly rare, I'll refer to
the very thorough in-code documentation in app/modmanager/ModManager.js to
guide you to the different events and function calls.

### Examples
Learn faster from looking at code than reading docs? Nearly all of Toady's
functionality happens in mods -- from the help commands, to finding and
verifying user permissions, to even detecting and executing commands
themselves.  All of these core mods are very thoroughly documented in the
app/coremods folder.

## Distribute your mods on ribbit
To get your mods on ribbit, all you need to do is publish your mod to NPM
under the following name:

    toady-mod_name_here

So if your mod is named 'typofix', your mod's package.json should contain
this line:

    "name": "toady-typofix"

Don't have a package.json yet? Just type `npm init` in your mod's directory
and follow the prompts, giving it the "toady-" prefixed name when it asks.

If you haven't already done it, run `npm adduser` to log in (or make an
account) on NPM, and then run `npm publish` to give your mod to the world.
It should show up in ribbit searches within a few minutes.

## Toady has a lawyer
Toady is distributed under the BSD license.  See the 'LICENSE.txt' file for the
legalese.  It's friendly and open, I promise.

## Toady has a purpose in life
I wrote Toady in 2013 to help manage my dev team's IRC room. There are other
bots, but this is the magical mix of features that few of the others had:
- Written in Javascript, so practically anyone can extend it
- Dead-simple command framework, so new commands are no more than a few lines of code away
- Can develop on it and test mods without restarting (/msg Toady viewmod modcontrol)
- Can restrict its commands by its own global permissions as well as channel and NickServ permissions on the IRC server itself
- Since it's Node.js, making mods do crazy stuff like hosting websites to view channel logs right within Toady is as simple as `npm install express`

## Obligatory Copyright
Toady is Copyright ©2013 Tom Frost.
