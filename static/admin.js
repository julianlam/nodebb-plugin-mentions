'use strict';

define('admin/plugins/mentions', ['settings', 'alerts'], function (Settings, alerts) {
	const ACP = {};

	ACP.init = function () {
		Settings.load('mentions', $('.mentions-settings'));

		$('#save').on('click', function () {
			Settings.save('mentions', $('.mentions-settings'), function () {
				alerts.success('Settings Saved');
			});
		});
	};

	return ACP;
});
