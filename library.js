/* eslint-disable no-await-in-loop */

'use strict';

const _ = require('lodash');
const XRegExp = require('xregexp');
const validator = require('validator');
const entitiesDecode = require('html-entities').decode;

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');

const db = require.main.require('./src/database');
const api = require.main.require('./src/api');
const Topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const User = require.main.require('./src/user');
const Groups = require.main.require('./src/groups');
const Notifications = require.main.require('./src/notifications');
const Privileges = require.main.require('./src/privileges');
const plugins = require.main.require('./src/plugins');
const Meta = require.main.require('./src/meta');
const slugify = require.main.require('./src/slugify');
const batch = require.main.require('./src/batch');
const utils = require.main.require('./src/utils');
const SocketPlugins = require.main.require('./src/socket.io/plugins');

const utility = require('./lib/utility');

const regex = XRegExp('(?:^|\\s|\\>|;)(@[\\p{L}\\d\\-_.]+)', 'g');
const isLatinMention = /@[\w\d\-_.]+$/;

const Mentions = module.exports;

Mentions._settings = {};
Mentions._defaults = {
	disableFollowedTopics: 'off',
	autofillGroups: 'off',
	disableGroupMentions: '[]',
	overrideIgnores: 'off',
	display: '',
};

SocketPlugins.mentions = {};

Mentions.init = async (data) => {
	const routeHelpers = require.main.require('./src/routes/helpers');
	const controllers = require('./controllers');

	routeHelpers.setupAdminPageRoute(data.router, '/admin/plugins/mentions', [], controllers.renderAdminPage);

	// Retrieve settings
	Object.assign(Mentions._settings, Mentions._defaults, await Meta.settings.get('mentions'));
};

Mentions.addAdminNavigation = async (header) => {
	header.plugins.push({
		route: '/plugins/mentions',
		name: 'Mentions',
	});

	return header;
};

function getNoMentionGroups() {
	let noMentionGroups = ['registered-users', 'verified-users', 'unverified-users', 'guests'];
	try {
		noMentionGroups = noMentionGroups.concat(JSON.parse(Mentions._settings.disableGroupMentions));
	} catch (err) {
		winston.error(err);
	}
	return noMentionGroups;
}

Mentions.notify = async function (data) {
	const postData = data.post;
	const postOwner = parseInt(postData.uid, 10);
	const cleanedContent = Mentions.clean(postData.content, true, true, true);
	let matches = cleanedContent.match(regex);
	if (!matches) {
		return;
	}

	const noMentionGroups = getNoMentionGroups();
	matches = _.uniq(matches.map(match => slugify(match))).filter(match => match && !noMentionGroups.includes(match));
	if (!matches.length) {
		return;
	}

	const [uidsToNotify, groupsToNotify] = await Promise.all([
		getUidsToNotify(matches),
		getGroupsToNotify(matches),
	]);

	if (!uidsToNotify.length && !groupsToNotify.length) {
		return;
	}

	const [topic, author, topicFollowers] = await Promise.all([
		Topics.getTopicFields(postData.tid, ['title', 'cid']),
		User.getUserField(postData.uid, 'username'),
		Mentions._settings.disableFollowedTopics === 'on' ? Topics.getFollowers(postData.tid) : [],
	]);

	const title = entitiesDecode(topic.title);
	const titleEscaped = title.replace(/%/g, '&#37;').replace(/,/g, '&#44;');

	let uids = uidsToNotify.filter(
		uid => parseInt(uid, 10) !== postOwner && !topicFollowers.includes(uid)
	);

	if (Mentions._settings.privilegedDirectReplies === 'on') {
		const toPid = await posts.getPostField(data.post.pid, 'toPid');
		uids = await filterPrivilegedUids(uids, data.post.cid, toPid);
	}

	const groupMemberUids = {};
	groupsToNotify.forEach((groupData) => {
		groupData.members = groupData.members.filter((uid) => {
			if (!uid || groupMemberUids[uid]) {
				return false;
			}
			groupMemberUids[uid] = 1;
			return !uids.includes(uid) &&
				parseInt(uid, 10) !== postOwner &&
				!topicFollowers.includes(uid);
		});
	});

	const filteredUids = await filterUidsAlreadyMentioned(uids, postData.pid);
	if (filteredUids.length) {
		await sendNotificationToUids(postData, filteredUids, 'user', `[[notifications:user_mentioned_you_in, ${author}, ${titleEscaped}]]`);
		await db.setAdd(`mentions:pid:${postData.pid}:uids`, filteredUids);
	}

	for (let i = 0; i < groupsToNotify.length; ++i) {
		if (groupsToNotify[i] && groupsToNotify[i].name && groupsToNotify[i].members) {
			const memberUids = groupsToNotify[i].members;
			const groupName = groupsToNotify[i].name;
			const groupMentionSent = await db.isSetMember(`mentions:pid:${postData.pid}:groups`, groupName);
			if (!groupMentionSent && memberUids.length) {
				await sendNotificationToUids(postData, memberUids, groupName, `[[notifications:user_mentioned_group_in, ${author} , ${groupName}, ${titleEscaped}]]`);
				await db.setAdd(`mentions:pid:${postData.pid}:groups`, groupName);
			}
		}
	}
};

async function getUidsToNotify(matches) {
	const uids = await db.sortedSetScores('userslug:uid', matches);
	return _.uniq(uids.filter(Boolean).map(String));
}

async function getGroupsToNotify(matches) {
	if (!matches.length) {
		return [];
	}
	const groupNames = Object.values(await db.getObjectFields('groupslug:groupname', matches));
	const groupMembers = await Promise.all(groupNames.map(async (groupName) => {
		if (!groupName) {
			return [];
		}
		return db.getSortedSetRange(`group:${groupName}:members`, 0, 999);
	}));
	return groupNames.map((groupName, i) => ({
		name: groupName,
		members: groupMembers[i],
	}));
}

Mentions.actionPostsPurge = async (hookData) => {
	if (hookData && Array.isArray(hookData.pids)) {
		await db.deleteAll([
			...hookData.posts.map(p => `mentions:pid:${p.pid}:uids`),
			...hookData.posts.map(p => `mentions:pid:${p.pid}:groups`),
		]);
	}
};

async function filterUidsAlreadyMentioned(uids, pid) {
	const isMember = await db.isSetMembers(`mentions:pid:${pid}:uids`, uids);
	return uids.filter((uid, index) => !isMember[index]);
}

Mentions.addFilters = async (data) => {
	data.regularFilters.push({ name: '[[notifications:mentions]]', filter: 'mention' });
	return data;
};

Mentions.notificationTypes = async (data) => {
	data.types.push('notificationType_mention');
	return data;
};

Mentions.addFields = async (data) => {
	if (!Meta.config.hideFullname) {
		data.fields.push('fullname');
	}
	return data;
};

async function sendNotificationToUids(postData, uids, nidType, notificationText) {
	if (!uids.length) {
		return;
	}

	const filteredUids = [];
	const notification = await createNotification(postData, nidType, notificationText);
	if (!notification) {
		return;
	}

	await batch.processArray(uids, async (uids) => {
		uids = await Privileges.topics.filterUids('read', postData.tid, uids);
		if (Mentions._settings.overrideIgnores !== 'on') {
			uids = await Topics.filterIgnoringUids(postData.tid, uids);
		}
		filteredUids.push(...uids);
	}, {
		interval: 1000,
		batch: 500,
	});

	if (notification && filteredUids.length) {
		plugins.hooks.fire('action:mentions.notify', { notification, uids: filteredUids });
		Notifications.push(notification, filteredUids);
	}
}

async function createNotification(postData, nidType, notificationText) {
	const title = await Topics.getTopicField(postData.tid, 'title');
	return await Notifications.create({
		type: 'mention',
		bodyShort: notificationText,
		bodyLong: postData.content,
		nid: `tid:${postData.tid}:pid:${postData.pid}:uid:${postData.uid}:${nidType}`,
		pid: postData.pid,
		tid: postData.tid,
		from: postData.uid,
		path: `/post/${postData.pid}`,
		topicTitle: title ? utils.decodeHTMLEntities(title) : title,
		importance: 6,
	});
}

Mentions.parsePost = async (data) => {
	if (!data || !data.postData || !data.postData.content) {
		return data;
	}

	const parsed = await Mentions.parseRaw(data.postData.content);
	data.postData.content = parsed;
	return data;
};

function removePunctuationSuffix(string) {
	return string.replace(/[!?.]*$/, '');
}

Mentions.parseRaw = async (content) => {
	let splitContent = utility.split(content, false, false, true);
	let matches = [];
	splitContent.forEach((cleanedContent, i) => {
		if ((i % 2) === 0) {
			matches = matches.concat(cleanedContent.match(regex) || []);
		}
	});

	if (!matches.length) {
		return content;
	}

	matches = _.uniq(matches).map((match) => {
		/**
		 *	Javascript-favour of regex does not support lookaround,
		 *	so need to clean up the cruft by discarding everthing
		 *	before the @
		 */
		const atIndex = match.indexOf('@');
		return atIndex !== 0 ? match.slice(atIndex) : match;
	});

	await Promise.all(matches.map(async (match) => {
		const slug = slugify(match.slice(1));
		match = removePunctuationSuffix(match);

		const uid = await User.getUidByUserslug(slug);
		const results = await utils.promiseParallel({
			groupExists: Groups.existsBySlug(slug),
			user: User.getUserFields(uid, ['uid', 'username', 'fullname']),
		});

		if (results.user.uid || results.groupExists) {
			const regex = isLatinMention.test(match) ?
				new RegExp(`(?:^|\\s|\>|;)${match}\\b`, 'g') :
				new RegExp(`(?:^|\\s|\>|;)${match}`, 'g');

			let skip = false;

			splitContent = splitContent.map((c, i) => {
				// *Might* not be needed anymore? Check pls...
				if (skip || (i % 2) === 1) {
					skip = c === '<code>';	// if code block detected, skip the content inside of it
					return c;
				}
				return c.replace(regex, (match) => {
					// Again, cleaning up lookaround leftover bits
					const atIndex = match.indexOf('@');
					const plain = match.slice(0, atIndex);
					match = match.slice(atIndex);
					if (results.user.uid) {
						switch (Mentions._settings.display) {
							case 'fullname':
								match = results.user.fullname || match;
								break;
							case 'username':
								match = results.user.username;
								break;
						}
					}

					const str = results.user.uid ?
						`<a class="plugin-mentions-user plugin-mentions-a" href="${nconf.get('url')}/uid/${results.user.uid}">${match}</a>` :
						`<a class="plugin-mentions-group plugin-mentions-a" href="${nconf.get('url')}/groups/${slug}">${match}</a>`;

					return plain + str;
				});
			});
		}
	}));

	return splitContent.join('');
};

Mentions.clean = function (input, isMarkdown, stripBlockquote, stripCode) {
	let split = utility.split(input, isMarkdown, stripBlockquote, stripCode);
	// only keep non-code/non-blockquote
	split = split.filter((el, i) => (i % 2) === 0);
	return split.join('');
};

/*
	Local utility methods
*/
async function filterPrivilegedUids(uids, cid, toPid) {
	let toPidUid;
	if (toPid) {
		toPidUid = await posts.getPostField(toPid, 'uid');
	}

	// Remove administrators, global mods, and moderators of the post's cid
	uids = await Promise.all(uids.map(async (uid) => {
		// Direct replies are a-ok.
		if (uid === toPidUid) {
			return uid;
		}

		const [isAdmin, isMod] = await Promise.all([
			User.isAdministrator(uid),
			User.isModerator(uid, cid),	// covers gmod as well
		]);

		return isAdmin || isMod ? false : uid;
	}));

	return uids.filter(Boolean);
}

async function filterDisallowedFullnames(users) {
	const userSettings = await User.getMultipleUserSettings(users.map(user => user.uid));
	return users.filter((user, index) => userSettings[index].showfullname);
}

async function stripDisallowedFullnames(users) {
	const userSettings = await User.getMultipleUserSettings(users.map(user => user.uid));
	return users.map((user, index) => {
		if (!userSettings[index].showfullname) {
			user.fullname = null;
		}
		return user;
	});
}

/*
	WebSocket methods
*/

SocketPlugins.mentions.getTopicUsers = async (socket, data) => {
	const uids = await Topics.getUids(data.tid);
	let users = await User.getUsers(uids);
	users = users.filter(u => u && u.userslug);
	if (Meta.config.hideFullname) {
		return users;
	}
	return stripDisallowedFullnames(users);
};

SocketPlugins.mentions.listGroups = async function () {
	if (Mentions._settings.autofillGroups === 'off') {
		return [];
	}

	const groups = await Groups.getGroups('groups:visible:createtime', 0, -1);
	const noMentionGroups = getNoMentionGroups();
	return groups.filter(g => g && !noMentionGroups.includes(g)).map(g => validator.escape(String(g)));
};

SocketPlugins.mentions.userSearch = async (socket, data) => {
	// Search by username
	let { users } = await api.users.search(socket, data);

	if (!Meta.config.hideFullname) {
		// Strip fullnames of users that do not allow their full name to be visible
		users = await stripDisallowedFullnames(users);

		// Search by fullname
		let { users: fullnameUsers } = await api.users.search(socket, { query: data.query, searchBy: 'fullname' });
		// Hide results of users that do not allow their full name to be visible (prevents "enumeration attack")
		fullnameUsers = await filterDisallowedFullnames(fullnameUsers);

		// Merge results, filter duplicates (from username search, leave fullname results)
		users = users.filter(
			userObj => fullnameUsers.filter(userObj2 => userObj.uid === userObj2.uid).length === 0
		).concat(fullnameUsers);
	}

	if (Mentions._settings.privilegedDirectReplies !== 'on') {
		return users;
	}

	if (data.composerObj) {
		const cid = Topics.getTopicField(data.composerObj.tid, 'cid');
		const filteredUids = await filterPrivilegedUids(users.map(userObj => userObj.uid), cid, data.composerObj.toPid);

		users = users.filter(userObj => filteredUids.includes(userObj.uid));
	}

	return users;
};

