
'use strict';

$(document).ready(function () {
	let groupList = [];
	let categoryList;
	const categorySlugMap = new Map();
	let localUserList = [];
	let helpers;

	$(window).on('composer:autocomplete:init chat:autocomplete:init', function (ev, data) {
		loadTopicUsers(data.element);

		if (!groupList.length) {
			loadGroupList();
		}

		if (!categoryList) {
			loadCategoryList();
		}
		let slugify;
		const strategy = {
			match: /\B@([^\s\n]*)?$/,
			search: function (term, callback) {
				require(['composer', 'helpers', 'slugify'], function (composer, _helpers, _slugify) {
					helpers = _helpers;
					slugify = _slugify;
					if (!term) {
						return callback(localUserList.filter((user) => user.uid !== app.user.uid));
					}

					// Get composer metadata
					const uuid = data.options.className && data.options.className.match(/dropdown-(.+?)\s/)[1];
					socket.emit('plugins.mentions.userSearch', {
						query: term,
						composerObj: composer.posts[uuid],
					}, function (err, users) {
						if (err) {
							require(['alerts'], function (alerts) {
								alerts.alert({
									id: 'mention-error',
									type: 'danger',
									message: err.message,
									timeout: 5000,
								});
							});
							return callback([]);
						}
						const termLowerCase = term.toLocaleLowerCase();
						const localMatches = localUserList.filter(
							u => u.username.toLocaleLowerCase().startsWith(termLowerCase)
						);
						const categoryMatches = categoryList.filter(c => c && c.handle && c.handle.startsWith(termLowerCase));

						// remove local matches from search results, add category matches
						users = users.filter(u => !localMatches.find(lu => lu.uid === u.uid));
						users = sortEntries(localMatches).concat(sortEntries([...users, ...categoryMatches]));
						// mentions = entriesToMentions(users, helpers);

						// Add groups that start with the search term
						const groupMentions = groupList.filter(function (groupName) {
							return groupName.toLocaleLowerCase().startsWith(termLowerCase);
						}).sort(function (a, b) {
							return a.toLocaleLowerCase() > b.toLocaleLowerCase() ? 1 : -1;
						});

						// Add group mentions at the bottom of dropdown
						// mentions = mentions.concat(groupMentions);

						callback([...users, ...groupMentions]);
					});
				});
			},
			index: 1,
			template: entryToMention,
			replace: function (mention) {
				if (mention.uid) {
					return `@${mention.userslug} `;
				} else if (mention.cid) {
					return `@${utils.isNumber(mention.cid) ? mention.handle : mention.slug} `;
				} else if (mention) {
					return `@${slugify(mention, true)} `;
				}
			},
			cache: true,
		};

		data.strategies.push(strategy);
	});

	$(window).on('action:composer.loaded', function (ev, data) {
		const composer = $('#cmp-uuid-' + data.post_uuid + ' .write');
		composer.attr('data-mentions', '1');
	});

	function sortEntries(entries) {
		return entries.sort(function (entry1, entry2) {
			const comparator1 = entry1.username || entry1.name;
			const comparator2 = entry2.username || entry2.name;
			return comparator1.toLocaleLowerCase() > comparator2.toLocaleLowerCase() ? 1 : -1;
		});
	}

	function entryToMention(entry) {
		// Format suggestions as 'avatar username/name (fullname/slug)'
		switch(true) {
			case entry.hasOwnProperty('uid'): {
				const avatar = helpers.buildAvatar(entry, '24px', true);
				const fullname = entry.fullname ? `(${entry.fullname})` : '';
				return `${avatar} ${entry.username || entry.name} ${helpers.escape(fullname)}`;
			}

			case entry.hasOwnProperty('cid'): {
				const avatar = helpers.buildCategoryIcon(entry, '24px', 'rounded-circle');
				return `${avatar} ${entry.name}${!utils.isNumber(entry.cid) ? ` (${entry.slug})` : ''}`;
			}

			default:
				return entry.hasOwnProperty('name') ? entry.name : entry;
		}
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

	function loadCategoryList() {
		require(['api'], async (api) => {
			const { categories } = await api.get('/categories');
			categoryList = categories;
			categories.forEach((category) => {
				categorySlugMap.set(category.name.toLowerCase(), category.handle);
			});
		});
	}
});
