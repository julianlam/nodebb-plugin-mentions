const assert = require('assert');
const XRegExp = require('xregexp');
const regex = XRegExp('(?:^|\\s|\\>|;)(@[\\p{L}\\d\\-_.]+)', 'g');

// from NodeBB utils.js
const utils = {
	slugify: function (str, preserveCase) {
		if (!str) {
			return '';
		}
		str = str.replace(utils.trimRegex, '');
		if (utils.isLatin.test(str)) {
			str = str.replace(utils.invalidLatinChars, '-');
		} else {
			str = XRegExp.replace(str, utils.invalidUnicodeChars, '-');
		}
		str = !preserveCase ? str.toLocaleLowerCase() : str;
		str = str.replace(utils.collapseWhitespace, '-');
		str = str.replace(utils.collapseDash, '-');
		str = str.replace(utils.trimTrailingDash, '');
		str = str.replace(utils.trimLeadingDash, '');
		return str;
	},
	invalidUnicodeChars: XRegExp('[^\\p{L}\\s\\d\\-_]', 'g'),
	invalidLatinChars: /[^\w\s\d\-_]/g,
	trimRegex: /^\s+|\s+$/g,
	collapseWhitespace: /\s+/g,
	collapseDash: /-+/g,
	trimTrailingDash: /-$/g,
	trimLeadingDash: /^-/g,
	isLatin: /^[\w\d\s.,\-@]+$/,
};

describe('regex', function () {
	const matcher = new RegExp(regex);
	const strings = [
		'@testUser',
		'@testUser some text',
		'some text @testUser',
		'<a href="/user/testuser">@testUser</a>',
		'<a href="/user/testuser">@testUser</a> some text',
		'some text <a href="/user/testuser">@testUser</a>',
		'end of sentence. @testUser',
		'@testUser.',
		'@testUser\'s some text',
	]
	it('failed inside regex', function(done) {
		assert(false);
		done();
	});
	it('should match a mention in all strings', () => {
		strings.forEach(string => {
			const matches = string.match(matcher);
			assert(matches);
			assert.equal(utils.slugify(matches[0]), 'testuser');
		});
	});

	// TODO: Test for unicode/non-latin mention
	// TODO: Ideally the regex matcher should be its own utility function in `lib/`
});

describe('splitter', function () {
	const utility = require('../lib/utility');
	const testHTMLText = 'this is a post with <code>stuff in code</code> and a\n\n<blockquote>blockquote or two</blockquote>';
	const testMdText = 'this is a post with `stuff in code` and a \n\n>blockquote or two';

	it('should not error', () => {
		const results = [
			utility.split(testHTMLText, false, true, false),
			utility.split(testHTMLText, false, false, true),
			utility.split(testHTMLText, false, true, true),
			utility.split(testMdText, true, true, false),
			utility.split(testMdText, true, false, true),
			utility.split(testMdText, true, true, true),
		];
		results.forEach(test => assert(test));
	});

	describe('HTML text', () => {
		it('should split blockquotes properly', () => {
			const result = utility.split(testHTMLText, false, true, false);
			assert.equal(result[0], 'this is a post with <code>stuff in code</code> and a\n\n');
			assert.equal(result[1], '<blockquote>blockquote or two</blockquote>');
		});

		it('should split inline code properly', () => {
			const result = utility.split(testHTMLText, false, false, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '<code>stuff in code</code>');
			assert.equal(result[2], ' and a\n\n<blockquote>blockquote or two</blockquote>');
		});

		it('should split both blockquotes and code properly', () => {
			const result = utility.split(testHTMLText, false, true, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '<code>stuff in code</code>');
			assert.equal(result[2], ' and a\n\n');
			assert.equal(result[3], '<blockquote>blockquote or two</blockquote>');
		});

		it('should split HTML code blocks that are wrapped with only a <pre>', () => {
			const testString = '<p dir="auto">test text</p>\n<pre>var value = \'@admin\';</pre>\nafter text';
			const result = utility.split(testString, false, false, true);
			assert.equal(result[0], '<p dir="auto">test text</p>\n');
			assert.equal(result[1], '<pre>var value = \'@admin\';</pre>');
			assert.equal(result[2], '\nafter text');
		});

		it('should not accidentally split on <annotation> HTML tag', () => {
			const testString = '<p dir="auto">wonderful</p><annotation>what is an annotation anyway</annotation><a href="/">what</a>';
			const results = [
				utility.split(testString, false, false, false),
				utility.split(testString, false, false, true),
				utility.split(testString, false, true, false),
				utility.split(testString, false, true, true),
			];

			results.forEach(result => assert.strictEqual(result[0], '<p dir="auto">wonderful</p><annotation>what is an annotation anyway</annotation><a href="/">what</a>'));
		});
	});

	describe('Markdown text', () => {
		it('should split blockquotes properly', () => {
			const result = utility.split(testMdText, true, true, false);
			assert.equal(result[0], 'this is a post with `stuff in code` and a \n\n');
			assert.equal(result[1], '>blockquote or two');
		});

		it('should split inline code properly', () => {
			const result = utility.split(testMdText, true, false, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '`stuff in code`');
			assert.equal(result[2], ' and a \n\n>blockquote or two');
		});

		it('should split both blockquotes and code properly', () => {
			const result = utility.split(testMdText, true, true, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '`stuff in code`');
			assert.equal(result[2], ' and a \n\n');
			assert.equal(result[3], '>blockquote or two');
		});

		it('should split code fences properly', () => {
			const testString = 'this is some text\n\n```\nvar a = \'@admin\';\n```\nafter text';
			const result = utility.split(testString, true, false, true);
			assert.equal(result[0], 'this is some text\n\n');
			assert.equal(result[1], '```\nvar a = \'@admin\';\n```');
			assert.equal(result[2], '\nafter text');
		});
	});
});
