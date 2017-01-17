'use strict';
var async = require('async');
var settings = require('./settings');

var nbbRequire = module.parent.parent.require;

var db = nbbRequire('./src/database');
var pagination = nbbRequire('./src/pagination');
var groups = nbbRequire('./src/groups');

var Controllers = {};

Controllers.renderAdminPage = function (req, res, next) {
	var page = parseInt(req.query.page, 10) || 1;
	var groupsPerPage = 20;
	var pageCount = 0;

	async.waterfall([
		function (next) {
			db.getSortedSetRevRange('groups:createtime', 0, -1, next);
		},
		function (groupNames, next) {
			groupNames = groupNames.filter(function (name) {
				return name.indexOf(':privileges:') === -1 && name !== 'registered-users';
			});
			pageCount = Math.ceil(groupNames.length / groupsPerPage);

			var start = (page - 1) * groupsPerPage;
			var stop = start + groupsPerPage - 1;

			groupNames = groupNames.slice(start, stop + 1);
			groups.getGroupsData(groupNames, next);
		},
		function (groupData, next) {
			next(null, { groups: groupData, pagination: pagination.create(page, pageCount) });
		},
		function (groupData, next) {
			settings.get(function (mentionDisabledGroups) {
				for (var group in groupData.groups) {
					var grp = groupData.groups[group];
					grp.canMention = mentionDisabledGroups.indexOf(grp.slug.toLowerCase()) === -1;
				}

				next(null, groupData);
			});
		}
	], function (err, data) {
		if (err) {
			return next(err);
		}

		res.render('admin/plugins/mentions', data);
	});
};

module.exports = Controllers;