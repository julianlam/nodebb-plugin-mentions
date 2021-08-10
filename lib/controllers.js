'use strict';

const { Groups } = require('./nodebb');


const Controllers = {};

Controllers.renderAdminPage = function (req, res, next) {
	Groups.getGroupsFromSet('groups:visible:createtime', 0, -1, (err, groupData) => {
		if (err) {
			return next(err);
		}
		res.render('admin/plugins/mentions', { groups: groupData });
	});
};

module.exports = Controllers;
