"use strict";
/* globals socket, app */


$(document).ready(function() {
	var groupList = [];
	var localUserList = [];

	$(window).on('composer:autocomplete:init chat:autocomplete:init', function(ev, data) {
		loadTopicUsers(data.element);

		if (!groupList.length) {
			loadGroupList();
		}

		var slugify;
		var strategy = {
			match: /\B@([^\s\n]*)?$/,
			search: function (term, callback) {
				require(['composer', 'helpers', 'slugify'], function (composer, helpers, _slugify) {
					slugify = _slugify;
					var mentions = [];
					if (!term) {
						mentions = usersToMentions(sortUsers(localUserList), helpers);
						return callback(mentions);
					}

					// Get composer metadata
					var uuid = data.options.className && data.options.className.match(/dropdown-(.+?)\s/)[1];
					socket.emit('plugins.mentions.userSearch', {
						query: term,
						composerObj: composer.posts[uuid],
					}, function(err, users) {
						if (err) {
							return callback([]);
						}

						mentions = mentions.concat(usersToMentions(sortUsers(users), helpers));

						// Add groups that start with the search term
						var groupMentions = groupList.filter(function (groupName) {
							return groupName.toLocaleLowerCase().startsWith(term.toLocaleLowerCase());
						}).sort(function(a, b) {
							return a.toLocaleLowerCase() > b.toLocaleLowerCase() ? 1 : -1;
						});
						// Add group mentions at the bottom of dropdown
						mentions = mentions.concat(groupMentions);

						callback(mentions);
					});
				});
			},
			index: 1,
			replace: function (mention) {
				// Strip (fullname) part from mentions
				mention = mention.replace(/ \(.+\)/, '');
				mention = $('<div/>').html(mention);
				// Strip letter avatar
				mention.find('span').remove();
				return '@' + slugify(mention.text(), true) + ' ';
			},
			cache: true
		};

		data.strategies.push(strategy);
	});

	$(window).on('action:composer.loaded', function(e, data) {
		var composer = $('#cmp-uuid-' + data.post_uuid + ' .write');
		composer.attr('data-mentions', '1');
	});

	function sortUsers (users) {
		return users.sort(function (user1, user2) {
			return user1.username.toLocaleLowerCase() > user2.username.toLocaleLowerCase() ? 1 : -1;
		});
	}

	function usersToMentions (users, helpers) {
		return users.reduce(function (carry, user) {
			// Don't add current user to suggestions
			if (app.user.username && app.user.username === user.username) {
				return carry;
			}

			// Format suggestions as 'avatar username (fullname)'
			var avatar = helpers.buildAvatar(user, 'sm');
			var fullname = user.fullname ? '(' + user.fullname + ')' : '';
			carry.push(avatar + ' ' + user.username + ' ' + fullname);

			return carry;
		}, []);
	}

	function loadTopicUsers(element) {
		require(['composer'], function (composer) {
			var composerEl = element.parents('.composer').get(0);
			if (!composerEl) {
				return;
			}

			var uuid = composerEl.getAttribute('data-uuid');
			var composerObj = composer.posts[uuid];

			if (!composerObj.tid) {
				localUserList = [];
				return;
			}

			socket.emit('plugins.mentions.getTopicUsers', {
				tid: composerObj.tid,
			}, function (err, users) {
				localUserList = users;
			});
		});
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
