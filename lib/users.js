'use strict';

const { Groups, posts, User } = require('./nodebb');


/**
 * @param {(number|string)[]} uids
 * @param {number|string} cid
 * @param {number|string} toPid
 * @returns {Promise<(number|string)[]>}
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

/**
 * @param {object[]} users
 * @returns {Promise<object[]>}
 */
async function filterDisallowedFullnames(users) {
	const userSettings = await User.getMultipleUserSettings(users.map(user => user.uid));
	return users.filter((user, index) => userSettings[index].showfullname);
}

/**
 * @param {string[]} groupRecipients
 * @return {Promise<{ groupNames: string[], groupMembers: string[] }>}
 */
async function getGroupMemberUids(groupRecipients) {
	const groupNames = await Promise.all(
		groupRecipients.map(slug => Groups.getGroupNameByGroupSlug(slug))
	);

	const groupMembers = await Promise.all(
		groupNames.map(groupName => Groups.getMembers(groupName, 0, -1))
	);

	return { groupNames, groupMembers };
}

/**
 * @param {object[]} users
 * @returns {Promise<object[]>}
 */
async function stripDisallowedFullnames(users) {
	const userSettings = await User.getMultipleUserSettings(users.map(user => user.uid));
	return users.map((user, index) => {
		if (!userSettings[index].showfullname) {
			user.fullname = null;
		}
		return user;
	});
}

module.exports = { filterPrivilegedUids, filterDisallowedFullnames, getGroupMemberUids, stripDisallowedFullnames };
