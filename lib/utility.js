'use strict';

const Entities = require('html-entities').XmlEntities;
const XRegExp = require('xregexp');
const { winston } = require('./nodebb');


const entities = new Entities();
const Utility = {};

Utility.regex = XRegExp('(?:^|\\s|\\>|;)(@[\\p{L}\\d\\-_.]+)', 'g');

Utility.isLatinMention = /@[\w\d\-_.]+$/;

/**
 * @param {string} string
 * @returns {string}
 */
Utility.removePunctuationSuffix = function (string) {
	return string.replace(/[!?.]*$/, '');
};

/**
 * @param {string} input
 * @param {boolean} isMarkdown
 * @param {boolean} splitBlockquote
 * @param {boolean} splitCode
 * @returns {string[]}
 */
Utility.split = function (input, isMarkdown, splitBlockquote, splitCode) {
	if (!input) {
		return [];
	}

	const matchers = [isMarkdown ? '\\[.*?\\]\\(.*?\\)' : '<a\\s[\\s\\S]*?</a>(?=<[^>]+>)?'];
	if (splitBlockquote) {
		matchers.push(isMarkdown ? '^>.*$' : '^<blockquote>.*?</blockquote>');
	}
	if (splitCode) {
		matchers.push(isMarkdown ? '`[^`\n]+`|```[\\s\\S]+```' : '<code[\\s\\S]*?</code>|<pre[\\s\\S]*?</pre>');
	}
	return input.split(new RegExp(`(${matchers.join('|')})`, 'gm'));
};

/**
 * @param {Error} err
 */
Utility.logError = function (err) {
	winston.error('[nodebb-plugin-mentions]', err);
};

/**
 * @param {object} settings plugin settings
 * @returns {string[]}
 */
Utility.getNoMentionGroups = function (settings) {
	let noMentionGroups = ['registered-users', 'guests'];
	try {
		noMentionGroups = noMentionGroups.concat(JSON.parse(settings.disableGroupMentions));
	} catch (err) {
		Utility.logError(err);
	}
	return noMentionGroups;
};

/**
 * @param {string} string
 * @returns {string}
 */
Utility.decodeString = function (string) {
	return entities.decode(string);
};

module.exports = Utility;
