/* Markdown → 可朗读正文的零依赖提炼器。
 *
 * 以前这层用 mdast-util-from-markdown + mdast-util-gfm + micromark-extension-gfm，
 * 只为了拿到「一段回复里哪些字该念」。那三件带 59 个传递依赖，而锚包已经用
 * bundleDependencies 把六个子包内联进同一个 tarball —— 剩下的第三方依赖仍然要在
 * 安装时去 registry 拉，等于「一个包」只做了一半。朗读只需要「正文 + 块间停顿」，
 * 不需要完整语法树，所以这里按行做一遍就够，整套随之变成零第三方运行时依赖。
 *
 * 取舍（与 mdast 的差异都写在这里，改之前先想清楚是不是真的需要）：
 * - 围栏代码块、表格、图片、行内代码不朗读；行内 HTML 只去掉标签本身、保留文字；
 * - 4 空格缩进的「缩进代码块」当普通段落念（mdast 会跳过）；助手回复里几乎不出现，
 *   而把它当成代码块反而会吞掉列表里的续行；
 * - 块级 HTML 容器（`<details>` 那类）只跳过标签行，里面的文字照念。
 */
const BLOCK_TERMINATORS = /[。！？；.!?;…]$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const BLOCK_QUOTE = /^ {0,3}>\s?/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s+|$)/;
const TASK_BOX = /^\[[ xX]\]\s*/;
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S+/;
const FOOTNOTE_DEFINITION = /^ {0,3}\[\^[^\]]+\]:\s*/;
const HTML_LINE = /^ {0,3}(?:<!--[\s\S]*?-->|<[^>]+>)(?:\s*<[^>]+>)*\s*$/;
const ESCAPED_PUNCTUATION = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const ESCAPE_TOKEN = /\u0000(\d+)\u0001/g;

/** 行内代码整段不念：换成空格，避免左右两个词粘成一个。 */
function dropInlineCode(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '`') {
      output += text[index];
      index += 1;
      continue;
    }
    let run = 0;
    while (text[index + run] === '`') run += 1;
    const marker = '`'.repeat(run);
    const close = text.indexOf(marker, index + run);
    if (close === -1) {
      output += marker;
      index += run;
      continue;
    }
    output += ' ';
    index = close + run;
  }
  return output;
}

/**
 * 去掉行内标记但留下要念的文字。反斜杠转义先换成占位符，
 * 否则 `\*不算强调\*` 会被后面的强调规则当成语法吃掉。
 */
export function stripInlineMarkup(raw) {
  const literals = [];
  const protectedText = String(raw ?? '').replace(ESCAPED_PUNCTUATION, (_match, char) => {
    literals.push(char);
    return `\u0000${literals.length - 1}\u0001`;
  });
  let text = protectedText
    // 图片不念（alt 也不念，与 mdast 一致）。目标地址里允许一层成对括号，
    // 否则 Wikipedia 那种 `…/a_(b)` 会剩下一个孤零零的 `)`。
    .replace(/!\[[^\]]*\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, ' ')
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ')
    .replace(/\[\^[^\]]*\]/g, ' ')
    // 链接只念文字，两个引用式写法同理。
    .replace(/\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, '$1')
    .replace(/<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/g, '$1');
  text = dropInlineCode(text)
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/\*\*([^\s*][^*]*?)\*\*/g, '$1')
    .replace(/(?<![\w])__([^\s_][^_]*?)__(?![\w])/g, '$1')
    .replace(/\*([^\s*][^*]*?)\*/g, '$1')
    .replace(/(?<![\w])_([^\s_][^_]*?)_(?![\w])/g, '$1')
    .replace(/~~([^\s~][^~]*?)~~/g, '$1')
    .replace(/\s+$/, '');
  return text.replace(ESCAPE_TOKEN, (_match, index) => literals[Number(index)]);
}

/** GFM 表格的分隔行：只有带 `|` 才算表格，否则 `标题\n---` 是 setext 标题。 */
function isTableDelimiter(line) {
  if (!line.includes('|')) return false;
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{1,}:?\s*$/.test(cell));
}

function isFenceClose(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  if (match === null) return false;
  return match[1][0] === fence.char && match[1].length >= fence.length;
}

/**
 * 把 markdown 提炼成「可以直接念」的一行文本：块之间用 `；` 补停顿，
 * 已经以终止标点结尾的块不再补。真正面向发音的改写交给 normalizeSpeechText。
 */
export function extractSpeechText(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const chunks = [];
  let buffer = [];
  let bufferKind = 'plain';
  let fence = null;

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];
    if (!text) return;
    chunks.push(BLOCK_TERMINATORS.test(text) ? text : `${text}；`);
  };
  const addBlock = (text) => {
    flush();
    bufferKind = 'plain';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned) chunks.push(BLOCK_TERMINATORS.test(cleaned) ? cleaned : `${cleaned}；`);
  };
  const addLine = (kind, text) => {
    if (bufferKind !== kind) flush();
    bufferKind = kind;
    buffer.push(text);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence !== null) {
      if (isFenceClose(line, fence)) fence = null;
      continue;
    }
    const fenceOpen = FENCE_OPEN.exec(line);
    if (fenceOpen !== null) {
      flush();
      fence = { char: fenceOpen[1][0], length: fenceOpen[1].length };
      continue;
    }
    if (line.trim() === '') {
      flush();
      bufferKind = 'plain';
      continue;
    }
    /* 表格整块跳过：先认表头，再吞掉分隔行与随后的每一行。 */
    if (line.includes('|') && isTableDelimiter(lines[index + 1] ?? '')) {
      flush();
      index += 1;
      while (index + 1 < lines.length && lines[index + 1].trim() !== '' && lines[index + 1].includes('|')) index += 1;
      continue;
    }
    const setext = SETEXT_UNDERLINE.test(lines[index + 1] ?? '') && !LIST_ITEM.test(line) && !BLOCK_QUOTE.test(line) && !THEMATIC_BREAK.test(line);
    if (setext) {
      addBlock(stripInlineMarkup(line));
      index += 1;
      continue;
    }
    const heading = ATX_HEADING.exec(line);
    if (heading !== null) {
      addBlock(stripInlineMarkup(heading[2] ?? ''));
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      flush();
      continue;
    }
    if (BLOCK_QUOTE.test(line)) {
      let quoted = line;
      while (BLOCK_QUOTE.test(quoted)) quoted = quoted.replace(BLOCK_QUOTE, '');
      addLine('quote', stripInlineMarkup(quoted));
      continue;
    }
    if (LIST_ITEM.test(line)) {
      addBlock(stripInlineMarkup(line.replace(LIST_ITEM, '').replace(TASK_BOX, '')));
      bufferKind = 'item';
      continue;
    }
    if (LINK_DEFINITION.test(line) && !FOOTNOTE_DEFINITION.test(line)) {
      flush();
      continue;
    }
    if (HTML_LINE.test(line)) {
      flush();
      continue;
    }
    /* 脚注定义里的正文照念（与 mdast 那条老路子一致），只去掉定义标记。 */
    const body = FOOTNOTE_DEFINITION.test(line) ? line.replace(FOOTNOTE_DEFINITION, '') : line;
    const text = stripInlineMarkup(body).replace(/\\$/, '');
    /* 列表项的续行有缩进，属于同一个块；不缩进就是新段落。 */
    if (bufferKind === 'item' && /^\s{2,}/.test(line)) {
      buffer.push(text);
      continue;
    }
    addLine('plain', text);
  }
  flush();
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}
