'use strict';

const { batch, db, Notifications, plugins, Privileges, Topics, utils } = require('./nodebb');
const { logError } = require('./utility');


/**
 * @param {object} postData
 * @param {string} nidType
 * @param {string} notificationText
 * @returns {Promise<object>} Promise with a created notification object
 */
async function createNotification(postData, nidType, notificationText) {
	let title = await Topics.getTopicField(postData.tid, 'title');
	if (title) {
		title = utils.decodeHTMLEntities(title);
	}

	return Notifications.create({
		type: 'mention',
		bodyShort: notificationText,
		bodyLong: postData.content,
		nid: `tid:${postData.tid}:pid:${postData.pid}:uid:${postData.uid}:${nidType}`,
		pid: postData.pid,
		tid: postData.tid,
		from: postData.uid,
		path: `/post/${postData.pid}`,
		topicTitle: title,
		importance: 6,
	});
}

/**
 * @param {object} postData
 * @param {(string|number)[]} uids
 * @param {string} nidType
 * @param {string} notificationText
 * @param {boolean} overrideIgnores field from plugin settings
 */
async function sendNotificationToUids(postData, uids, nidType, notificationText, overrideIgnores = false) {
	if (!uids.length) {
		return;
	}

	try {
		const notification = await createNotification(postData, nidType, notificationText);
		if (!notification) {
			return;
		}

		let filteredUids = [];
		await batch.processArray(uids, async (uidsPart) => {
			let filteredUidsPart = uidsPart.slice(0);

			// Filter by privileges
			filteredUidsPart = await Privileges.topics.filterUids('read', postData.tid, filteredUidsPart);

			// Filter by topic ignorance
			if (!overrideIgnores) {
				filteredUidsPart = await Topics.filterIgnoringUids(postData.tid, filteredUidsPart);
			}

			// Filter already notified users
			const isNotified = await db.isSortedSetMembers(`mentions:sent:${postData.pid}`, filteredUidsPart);
			filteredUidsPart = filteredUidsPart.filter((uid, idx) => !isNotified[idx]);

			if (filteredUidsPart.length) {
				filteredUids = filteredUids.concat(filteredUidsPart);
			}
		}, { interval: 1000, batch: 500 });

		if (notification && filteredUids.length) {
			plugins.hooks.fire('action:mentions.notify', { notification, uids: filteredUids });
			await Notifications.push(notification, filteredUids);

			const dates = filteredUids.map(() => Date.now());
			await db.sortedSetAdd(`mentions:sent:${postData.pid}`, dates, filteredUids);
		}
	} catch (err) {
		logError(err);
	}
}

module.exports = { sendNotificationToUids };
