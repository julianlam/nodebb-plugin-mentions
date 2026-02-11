
'use strict';

$(document).ready(function () {
	let groupList = [];
	let categoryList;
	const categorySlugMap = new Map();
	let localUserList = [];
	let helpers;

	function showAlert(type, message) {
		require(['alerts'], function (alerts) {
			alerts[type](message);
		});
	}

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
							showAlert('error', err.message);
							return callback([]);
						}
						const termLowerCase = term.toLocaleLowerCase();
						const localMatches = localUserList.filter(
							u => u.username.toLocaleLowerCase().startsWith(termLowerCase)
						);
						const categoryMatches = categoryList.filter(
							c => c && c.handle && c.handle.startsWith(termLowerCase)
						);

						// remove local matches from search results, add category matches
						users = users.filter(u => !localMatches.find(lu => lu.uid === u.uid));

						users = sortEntries(localMatches).concat(users).concat(sortEntries(categoryMatches));

						// Add groups that start with the search term
						const groupMentions = groupList.filter(
							group => group.name.toLocaleLowerCase().startsWith(termLowerCase) ||
								group.slug.startsWith(termLowerCase)
						).sort((a, b) =>a.name.toLocaleLowerCase() > b.name.toLocaleLowerCase() ? 1 : -1)
							.map(group => group.name);

						// Add group mentions at the bottom of dropdown
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
		data.options = {
			...data.options,
			...{
				maxCount: 100,
			},
		};
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
		require(['composer'], function (composer) {
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
					return showAlert('error', err);
				}
				localUserList = users;
			});
		});
	}

	function loadGroupList() {
		socket.emit('plugins.mentions.listGroups', async function (err, groupNames) {
			if (err) {
				return showAlert('error', err.message);
			}
			const s = await app.require('slugify');
			groupList = groupNames.map(name => ({ name, slug: s(name) }));
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
