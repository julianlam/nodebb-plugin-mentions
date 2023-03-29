
'use strict';

$(document).ready(function () {
	let groupList = [];
	let localUserList = [];

	$(window).on('composer:autocomplete:init chat:autocomplete:init', function (ev, data) {
		loadTopicUsers(data.element);

		if (!groupList.length) {
			loadGroupList();
		}

		let slugify;
		const strategy = {
			match: /\B@([^\s\n]*)?$/,
			search: function (term, callback) {
				require(['composer', 'helpers', 'slugify'], function (composer, helpers, _slugify) {
					slugify = _slugify;
					let mentions = [];
					if (!term) {
						mentions = usersToMentions(sortUsers(localUserList), helpers);
						return callback(mentions);
					}

					// Get composer metadata
					const uuid = data.options.className && data.options.className.match(/dropdown-(.+?)\s/)[1];
					socket.emit('plugins.mentions.userSearch', {
						query: term,
						composerObj: composer.posts[uuid],
					}, function (err, users) {
						if (err) {
							return callback([]);
						}
						const termLowerCase = term.toLocaleLowerCase();
						const localMatches = localUserList.filter(
							u => u.username.toLocaleLowerCase().startsWith(termLowerCase)
						);

						// remove local matches from search results
						users = users.filter(u => !localMatches.find(lu => lu.uid === u.uid));
						mentions = usersToMentions(sortUsers(localMatches).concat(sortUsers(users)), helpers);

						// Add groups that start with the search term
						const groupMentions = groupList.filter(function (groupName) {
							return groupName.toLocaleLowerCase().startsWith(termLowerCase);
						}).sort(function (a, b) {
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
			cache: true,
		};

		data.strategies.push(strategy);
	});

	$(window).on('action:composer.loaded', function (ev, data) {
		const composer = $('#cmp-uuid-' + data.post_uuid + ' .write');
		composer.attr('data-mentions', '1');
	});

	function sortUsers(users) {
		return users.sort(function (user1, user2) {
			return user1.username.toLocaleLowerCase() > user2.username.toLocaleLowerCase() ? 1 : -1;
		});
	}

	function usersToMentions(users, helpers) {
		return users.reduce(function (carry, user) {
			// Don't add current user to suggestions
			if (app.user.username && app.user.username === user.username) {
				return carry;
			}

			// Format suggestions as 'avatar username (fullname)'
			const avatar = helpers.buildAvatar(user, '24px', true);
			const fullname = user.fullname ? `(${user.fullname})` : '';
			carry.push(`${avatar} ${user.username} ${helpers.escape(fullname)}`);

			return carry;
		}, []);
	}

	function loadTopicUsers(element) {
		require(['composer', 'alerts'], function (composer, alerts) {
			function findTid() {
				const composerEl = element.parents('.composer').get(0);
				if (composerEl) {
					const uuid = composerEl.getAttribute('data-uuid');
					const composerObj = composer.posts[uuid];
					if (composerObj && composerObj.tid) {
						return composerObj.tid;
					}
				}
				if (ajaxify.data.template.topic) {
					return ajaxify.data.tid;
				}
				return null;
			}

			const tid = findTid();
			if (!tid) {
				localUserList = [];
				return;
			}
			socket.emit('plugins.mentions.getTopicUsers', {
				tid: tid,
			}, function (err, users) {
				if (err) {
					return alerts.error(err);
				}
				localUserList = users;
			});
		});
	}

	function loadGroupList() {
		socket.emit('plugins.mentions.listGroups', function (err, groupNames) {
			if (err) {
				require(['alerts'], function (alerts) {
					alerts.error(err);
				});
				return;
			}
			groupList = groupNames;
		});
	}
});
