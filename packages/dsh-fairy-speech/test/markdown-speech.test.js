import assert from 'node:assert/strict';
import test from 'node:test';

import { markdownToSpeechText } from '../lib/index.js';
import { extractSpeechText } from '../lib/server/markdown-speech.js';

// 这套断言守的是「朗读提炼器」的边界：它是手写的、替代了原来的 mdast 三件套，
// 一旦语义漂了，用户听到的就是把代码念出来、或者整段粘连成一句。

test('drops fenced code blocks of both fence characters', () => {
  assert.equal(markdownToSpeechText('前后文。\n\n```js\nconst a = 1;\n```\n\n结尾。'), '前后文。结尾。');
  assert.equal(markdownToSpeechText('~~~\ncode\n~~~\n之后。'), '之后。');
});

test('drops tables instead of reading their cells', () => {
  assert.equal(markdownToSpeechText('| 项 | 值 |\n| --- | --- |\n| a | 1 |\n\n表格之后。'), '表格之后。');
});

test('keeps link text, drops destinations, images and inline code', () => {
  assert.equal(
    markdownToSpeechText('见 [文档](https://example.com/a_(b)) 与 ![图](x.png) 以及 `inline()` 调用。'),
    '见 文档 与 以及 调用。',
  );
});

test('honours backslash escapes so escaped markers stay literal', () => {
  assert.equal(markdownToSpeechText('反斜杠 \\*不是强调\\* 和 snake_case_name'), '反斜杠 *不是强调* 和 snake_case_name；');
});

test('gives headings and list items their own spoken block', () => {
  assert.equal(markdownToSpeechText('## 结论\n\n已完成。'), '结论；已完成。');
  assert.equal(markdownToSpeechText('1. 第一步\n2. 第二步\n   - 子项 A'), '第一步；第二步；子项 A；');
});

test('does not speak task-list checkboxes', () => {
  assert.equal(markdownToSpeechText('- [x] 已同步\n- [ ] 待办'), '已同步；待办；');
});

test('strips inline HTML tags but keeps their text', () => {
  assert.equal(markdownToSpeechText('这是 <b>加粗</b> 的 <br> 换行'), '这是 加粗 的 换行；');
});

test('treats `---` under a paragraph as a setext heading, not a rule', () => {
  assert.equal(markdownToSpeechText('标题文字\n===\n\n正文'), '标题文字；正文；');
  assert.equal(markdownToSpeechText('上\n\n---\n\n下'), '上；下；');
});

test('joins blockquote lines into one spoken block', () => {
  assert.equal(markdownToSpeechText('> 引用第一行\n> 引用第二行\n\n普通段落'), '引用第一行 引用第二行；普通段落；');
});

test('extractor output stays unnormalised so normalisation runs once', () => {
  // 提炼器只负责「哪些字 + 块间停顿」，发音级改写（符号、单位、数字）在
  // normalizeSpeechText 里；两条职责混在一起会让同一段文本被改写两次。
  assert.equal(extractSpeechText('第一项没有标点\n\n第二项也没有标点'), '第一项没有标点； 第二项也没有标点；');
});
