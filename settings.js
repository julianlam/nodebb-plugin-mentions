'use strict';

var nbbRequire = module.parent.parent.require;
var settings = nbbRequire('./src/settings');

var props = {
    settingsName: 'mentions',
    settingsVersion: 1.0,
    defaultSettings: {
        mentionDisabledGroups: []
    }
};

var Settings = {};

Settings.get = function (callback) {
    var pluginSettings = new settings(props.settingsName, props.settingsVersion, props.defaultSettings, function () {
        callback && callback(this.get().mentionDisabledGroups);
    });
};

module.exports = Settings;