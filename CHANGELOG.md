# Toady
Wickedly extensible IRC bot written in Node.js.  Load and reload mods without reconnecting.

## Changelog
### 0.2.0
- **ModConfig:** Added config.save() argument to save only specified config properties.
- **ModLoader:** Support full Node.js unloading of Ribbit-installed mods.  Previously, Ribbit-installed mods would not be deleted from the Node.js require() cache.
- **ModManager:** Added 'config' property to loaded mods to reference the mod's config object.  This is the same reference the mod itself was passed at load time.
- **ModManager:** Now checks the running Toady's version number against the mod's module.exports.minToadyVersion string to ensure the mod is compatible with the running Toady instance.
- **Users:** Config updates now save users only, allowing the defaultAuthMethod to remain changeable in the yaml.

### 0.1.0
Initial release