'use strict';

var groups = module.parent.parent.require('./groups');

var Controllers = module.exports;

Controllers.renderAdminPage = function (req, res, next) {
	groups.getGroupsFromSet('groups:visible:createtime', req.uid, 0, -1, function(err, groupData) {
		if (err) {
			return next(err);
		}
		res.render('admin/plugins/mentions', { groups: groupData });
	});
};
