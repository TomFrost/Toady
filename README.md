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
To launch (from the Toady directory):

    node app/Toady.js

Need to launch it on more than one server? Just copy config/default.yaml to
config/myotherserver.yaml, edit it for the new server, and launch
Toady like this:

    NODE_ENV=myotherserver node app/Toady.js

When he's in your channel, do this in IRC for more info:

    /msg Toady help

## Teach Toady new tricks.
Toady can be extended through simple mods, and mods can make Toady do
practially anything -- from logging channel messages, to opening up an HTTP
server to control him, to launching nuclear missiles.  But Toady hates that last
thing, so don't do that.  He'll be pissed.

I'll have docs here on how to write awesome mods soon, but until then, here's
what's up: almost ALL of Toady's functionality, including setting user
permissions, making him talk in a channel, and even executing all the commands,
is done in mods.  Check out the app/coremods folder and poke around.  The
documentation there is thorough, and provides great examples on what all a
mod can do.  Hint: anything.

For now, just know that all user-written mods should go in the 'mods' folder,
and they can be in any format that Node.js's require() can handle.  So...
- mods/mymod.js
- mods/mymod/index.js
- mods/mymod/somefolder/somefile.js (if there's a package.json with a 'main' property pointing there)

So mods can be as simple as one file, or a complex folder structure if it's
complicated enough to require that sort of thing.  And if so, that's awesome,
rock on.

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
