'use strict';


const db = module.parent.require('./database');
const batch = module.parent.require('./batch');
module.exports = {
	name: 'Delete mentions:sent:<pid> sorted sets',
	timestamp: Date.UTC(2021, 10, 2),
	method: async function () {
		const { progress } = this;
		const nextPid = await db.getObjectField('global', 'nextPid');
		const allPids = [];
		for (let pid = 1; pid < nextPid; ++pid) {
			allPids.push(pid);
		}
		progress.total = allPids.length;
		await batch.processArray(allPids, async (pids) => {
			progress.incr(pids.length);
			await db.deleteAll(pids.map(pid => `mentions:sent:${pid}`));
		}, {
			batch: 500,
		});
	},
};