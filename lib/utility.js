'use strict';

const Utility = module.exports;

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
