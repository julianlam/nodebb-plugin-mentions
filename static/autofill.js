"use strict";
/* globals socket, app, utils */


$(document).ready(function() {
	var groupList = [];
	var localUserList = [];

	$(window).on('composer:autocomplete:init', function(ev, data) {
		localUserList = loadDomUsers();

		if (!groupList.length) {
			loadGroupList();
		}

		var subset;
		var strategy = {
			match: /\B@([^\s\n]*)?$/,
			search: function (term, callback) {
				var usernames;
				if (!term) {
					usernames = localUserList.concat(groupList).filter(function(value, index, array) {
						return array.indexOf(value) === index && value !== app.user.username;
					}).sort(function(a, b) {
						return a.toLocaleLowerCase() > b.toLocaleLowerCase();
					});
					return callback(usernames);
				}

				socket.emit('user.search', {query: term}, function(err, userdata) {
					if (err) {
						return callback([]);
					}

					usernames = userdata.users.map(function(user) {
						return user.username;
					});

					subset = localUserList.concat(groupList).filter(function(username) {
						return username.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) !== -1;
					});

					usernames = usernames.concat(subset).filter(function(value, index, array) {
						return array.indexOf(value) === index;
					});

					subset = subset.map(function(name) {
						return name.toLocaleLowerCase();
					});

					usernames.sort(function(a, b) {
						if (subset.indexOf(a.toLocaleLowerCase()) !== -1 && subset.indexOf(b.toLocaleLowerCase()) === -1) {
							return -1;
						} else if (subset.indexOf(a.toLocaleLowerCase()) === -1 && subset.indexOf(b.toLocaleLowerCase()) !== -1) {
							return 1;
						} else {
							return a.toLocaleLowerCase() > b.toLocaleLowerCase();
						}
					});

					// Remove current user from suggestions
					if (app.user.username && usernames.indexOf(app.user.username) !== -1) {
						usernames.splice(usernames.indexOf(app.user.username), 1);
					}

					callback(usernames);
				});
			},
			index: 1,
			replace: function (mention) {
				mention = $('<div/>').html(mention).text();
				return '@' + utils.slugify(mention, true) + ' ';
			},
			cache: true
		};

		data.strategies.push(strategy);
	});

	$(window).on('action:composer.loaded', function(e, data) {
		var composer = $('#cmp-uuid-' + data.post_uuid + ' .write');
		composer.attr('data-mentions', '1');
	});

	function loadDomUsers() {
		var DOMusers = [];
		$('[component="post"][data-uid!="0"]').each(function(idx, el) {
			var	username = el.getAttribute('data-username');
			if (DOMusers.indexOf(username) === -1) {
				DOMusers.push(username);
			}
		});
		return DOMusers;
	}

	function loadGroupList() {
		socket.emit('plugins.mentions.listGroups', function(err, groupNames) {
			if (err) {
				return app.alertError(err.message);
			}
			groupList = groupNames;
		});
	}

});
