'use strict';

var groups = require.main.require('./src/groups');

var Controllers = module.exports;

Controllers.renderAdminPage = function (req, res, next) {
	console.log('load groups');
	groups.getGroupsFromSet('groups:visible:createtime', 0, -1, function(err, groupData) {
		console.log('err', err);
		console.log('groupData', groupData);
		if (err) {
			return next(err);
		}
		res.render('admin/plugins/mentions', { groups: groupData });
	});
};
