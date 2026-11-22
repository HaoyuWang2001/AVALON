#!/usr/bin/env node
/**
 * 小程序编译自检脚本（不依赖微信开发者工具）
 * 检查：JSON 合法性、页面四件套、usingComponents 路径、WXML 自定义组件注册、
 *       图片资源引用、WXML 标签配对、JS 语法。
 * 用法：node preview/check-miniprogram.js [--root <dir>]
 * 退出码：0 = 通过；1 = 发现问题
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : path.join(__dirname, '..', 'miniprogram'));

const BUILDIN = new Set([
  'view', 'scroll-view', 'swiper', 'swiper-item', 'movable-area', 'movable-view', 'cover-view', 'cover-image',
  'icon', 'text', 'rich-text', 'progress', 'button', 'checkbox', 'checkbox-group', 'form', 'input', 'label',
  'picker', 'picker-view', 'picker-view-column', 'radio', 'radio-group', 'slider', 'switch', 'textarea',
  'navigator', 'functional-page-navigator', 'audio', 'image', 'video', 'camera', 'live-player', 'live-pusher',
  'map', 'canvas', 'open-data', 'web-view', 'ad', 'official-account', 'block', 'template', 'import', 'include',
  'slot', 'wxs', 'page-meta', 'navigation-bar', 'root-portal', 'match-media', 'page-container', 'share-element',
  'keyboard-accessory', 'editor', 'voip-room', 'channel-live', 'channel-video', 'grid-view', 'list-view', 'sticky-header', 'sticky-section'
]);

const errors = [];
const warnings = [];
const rel = p => path.relative(ROOT, p) || '.';

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(ROOT);
} catch (e) {
  console.error(`无法读取项目目录: ${ROOT}\n${e.message}`);
  process.exit(1);
}

// ── 1. JSON 合法性 ─────────────────────────────────────────────
const jsonFiles = files.filter(f => f.endsWith('.json'));
for (const f of jsonFiles) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { errors.push(`JSON 解析失败: ${rel(f)} — ${e.message}`); }
}

// ── 2. app.json pages 四件套 ───────────────────────────────────
const appJsonPath = path.join(ROOT, 'app.json');
let appJson = null;
if (!fs.existsSync(appJsonPath)) {
  errors.push('缺少 app.json');
} else {
  try { appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')); }
  catch (e) { /* 已在上面记录 */ }
}
if (appJson && Array.isArray(appJson.pages)) {
  for (const page of appJson.pages) {
    const base = path.join(ROOT, page);
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      if (!fs.existsSync(base + ext)) errors.push(`页面缺少文件: ${page}${ext}`);
    }
  }
}

// ── 3. usingComponents 路径解析 ────────────────────────────────
const baseName = f => path.basename(f).replace(/\.(json|wxml|js|wxss)$/, '');
function resolveComponent(fromJson, value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('/')) return path.join(ROOT, value);
  if (value.startsWith('.')) return path.resolve(path.dirname(fromJson), value);
  // 兼容 "plugin://" 或 npm 包，跳过
  return null;
}
function checkUsingComponents(jsonPath) {
  let json;
  try { json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { return; }
  const map = json.usingComponents;
  if (!map || typeof map !== 'object') return;
  for (const [name, val] of Object.entries(map)) {
    const target = resolveComponent(jsonPath, val);
    if (!target) continue;
    if (!fs.existsSync(target + '.json') && !fs.existsSync(target + '.wxml') && !fs.existsSync(target + '.js')) {
      errors.push(`组件路径不存在: ${rel(jsonPath)} → "${name}": ${val}`);
    }
  }
}
for (const f of jsonFiles) checkUsingComponents(f);

// ── 4. WXML 自定义组件注册 + 图片资源 + 标签配对 ───────────────
const wxmlFiles = files.filter(f => f.endsWith('.wxml'));
const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

function registeredComponents(wxmlPath) {
  const dir = path.dirname(wxmlPath);
  const name = baseName(wxmlPath);
  const installed = new Set();
  const candidates = [
    path.join(dir, name + '.json'),
    appJsonPath
  ];
  for (const j of candidates) {
    if (!fs.existsSync(j)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(j, 'utf8'));
      Object.keys(json.usingComponents || {}).forEach(k => installed.add(k));
    } catch (e) {}
  }
  return installed;
}

for (const f of wxmlFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const installed = registeredComponents(f);
  const stack = [];
  let m;
  while ((m = tagRe.exec(src))) {
    const [, closing, tag, attrs, selfClose] = m;
    const line = src.slice(0, m.index).split('\n').length;
    const lower = tag.toLowerCase();
    const isCustom = !BUILDIN.has(lower) && (tag.includes('-') || /^[A-Z]/.test(tag));
    if (isCustom && !installed.has(tag)) {
      errors.push(`未注册组件: ${rel(f)}:${line} <${tag}> 未在 ${baseName(f)}.json 的 usingComponents 中声明`);
    }
    // 资源引用 /images/...
    const resRe = /(?:src|poster|background-image)\s*=\s*"(\/images\/[^"{}]+)"/g;
    let rm;
    while ((rm = resRe.exec(attrs))) {
      const p = path.join(ROOT, rm[1]);
      if (!fs.existsSync(p)) errors.push(`资源不存在: ${rel(f)}:${line} ${rm[1]}`);
    }
    // 标签配对（全部按显式闭合匹配；自闭合靠 selfClose）
    if (closing) {
      if (stack.length === 0 || stack[stack.length - 1].tag !== lower) {
        errors.push(`标签不配对: ${rel(f)}:${line} </${tag}>（栈顶: ${stack.length ? stack[stack.length - 1].tag : '空'}）`);
      } else stack.pop();
    } else if (!selfClose) {
      stack.push({ tag: lower, line });
    }
  }
  if (stack.length > 0) {
    errors.push(`标签未闭合: ${rel(f)} 第 ${stack[stack.length - 1].line} 行 <${stack[stack.length - 1].tag}>`);
  }
}

// ── 5. WXSS 语法 ──────────────────────────────────────────────
const wxssFiles = files.filter(f => f.endsWith('.wxss'));
let postcss = null;
try { postcss = require('postcss'); } catch (e) { /* 可选依赖 */ }

// 去掉注释与字符串字面量（保留长度/换行，便于定位行号）
function stripCssNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\])*"/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\])*'/g, m => m.replace(/[^\n]/g, ' '));
}
const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

for (const f of wxssFiles) {
  const src = fs.readFileSync(f, 'utf8');
  if (postcss) {
    try {
      const root = postcss.parse(src, { from: f });
      // 选择器里混入 @ 规则（典型：删除样式后残留 ".rank-1 .rank-2 .rank-3"）
      root.walkRules(rule => {
        if (rule.selector && rule.selector.includes('@')) {
          const line = rule.source && rule.source.start ? rule.source.start.line : '?';
          errors.push(`WXSS 选择器异常（缺少 {} 块）: ${rel(f)}:${line} "${rule.selector.replace(/\s+/g, ' ').trim().slice(0, 80)}"`);
          rule.walkDecls(() => {}); // noop
        }
        // 空选择器（如孤立的 "}" 前残留）
        if (!rule.selector || !rule.selector.trim()) {
          const line = rule.source && rule.source.start ? rule.source.start.line : '?';
          errors.push(`WXSS 空选择器: ${rel(f)}:${line}`);
        }
      });
    }
    catch (e) {
      const line = e.line || (e.input && e.input.line) || '?';
      errors.push(`WXSS 解析失败: ${rel(f)}:${line} — ${e.reason || e.message}`);
    }
  }
  const code = stripCssNonCode(src);
  // 连续分号：WXSS 编译器会报 "unexpected token `;`"（postcss 不报错）
  const dupRe = /;\s*;/g;
  let dm;
  while ((dm = dupRe.exec(code))) {
    errors.push(`WXSS 多余分号(;;): ${rel(f)}:${lineAt(src, dm.index)}`);
  }
  // @import 目标存在性
  const impRe = /@import\s+(?:url\()?\s*['"]?([^'")\s]+)['"]?\s*\)?\s*;/g;
  let im;
  while ((im = impRe.exec(code))) {
    const target = path.resolve(path.dirname(f), im[1]);
    if (!fs.existsSync(target)) errors.push(`WXSS @import 不存在: ${rel(f)} → ${im[1]}`);
  }
}

// ── 6. JS 语法 ────────────────────────────────────────────────
const jsFiles = files.filter(f => /\.(js|cjs)$/.test(f));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    const msg = (e.stderr || e.stdout || '').toString().split('\n').slice(0, 3).join(' ').trim();
    errors.push(`JS 语法错误: ${rel(f)} — ${msg}`);
  }
}

// ── 7. 包体积（排除 node_modules；上传包限制 2MB） ─────────────
let total = 0;
for (const f of files) total += fs.statSync(f).size;
const MB = total / 1024 / 1024;
if (MB > 2) warnings.push(`项目文件总大小 ${MB.toFixed(2)}MB 超过主包 2MB 上限（上传前会被压缩，仅供参考；未使用文件应移出 miniprogram/）`);

// ── 输出 ──────────────────────────────────────────────────────
console.log(`检查目录: ${ROOT}`);
console.log(`扫描文件: ${files.length}（JSON ${jsonFiles.length} / WXML ${wxmlFiles.length} / WXSS ${wxssFiles.length} / JS ${jsFiles.length}），合计 ${MB.toFixed(2)}MB`);
if (warnings.length) {
  console.log(`\n⚠ 警告 ${warnings.length}:`);
  warnings.forEach(w => console.log('  - ' + w));
}
if (errors.length) {
  console.log(`\n✗ 发现 ${errors.length} 个问题:`);
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✓ 编译自检通过');
