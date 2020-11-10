'use strict';

var groups = require.main.require('./src/groups');

var Controllers = module.exports;

Controllers.renderAdminPage = function (req, res, next) {	
	groups.getGroupsFromSet('groups:visible:createtime', 0, -1, function(err, groupData) {		
		if (err) {
			return next(err);
		}
		res.render('admin/plugins/mentions', { groups: groupData });
	});
};
