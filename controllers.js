'use strict';

const groups = require.main.require('./src/groups');

const Controllers = module.exports;

Controllers.renderAdminPage = async function (req, res) {
	const groupData = await groups.getGroupsFromSet('groups:visible:createtime', 0, -1);
	res.render('admin/plugins/mentions', {
		groups: groupData,
		title: '[[notifications:mentions]]',
	});
};
