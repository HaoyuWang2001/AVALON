// Custom Jest reporter — 简洁进度输出：
//   ▶ 02_rooms.test.js 开始 (49 用例)
//   （动态 \r 行） 02_rooms.test.js (~7.3s): 20/49
//   PASS 02_rooms.test.js 7.3s (predict ~7.3s) TOTAL 49
//   （失败时 FAIL + 失败用例标题与错误首行）
// 预估时长来自环境变量 SUITE_TIMES="suiteName:seconds,..."（test-backend.sh 从 .test-baseline 传入）。

const path = require('path');

class ProgressReporter {
  constructor() {
    // SUITE_TIMES="name:seconds:count,..."（test-backend.sh 从 .test-baseline 传入）
    this._predicted = {};
    try {
      (process.env.SUITE_TIMES || '').split(',').forEach(seg => {
        const [k, v, cnt] = seg.split(':');
        if (k && v) this._predicted[k.trim()] = { sec: parseFloat(v), count: parseInt(cnt, 10) || 0 };
      });
    } catch (e) { /* ignore */ }
    this._current = null;
    this._passed = 0;
    this._failed = 0;
  }

  _suiteName(test) {
    return path.basename(test.path).replace(/\.test\.js$/, '');
  }

  onTestStart(test) {
    const name = this._suiteName(test);
    const meta = this._predicted[name];
    // 优先用 baseline 的用例数作为总数（test.tests 在 jest 主进程可能为空）
    const total = meta && meta.count > 0 ? meta.count : (test.tests || []).length;
    this._current = { name, total, done: 0, failed: 0 };
    process.stdout.write(`\n▶ ${name}.test.js 开始 (${total} 用例)\n`);
  }

  onTestCaseResult(test, tc) {
    const c = this._current;
    if (!c) return;
    if (tc.status === 'failed') c.failed++;
    c.done++;
    const meta = this._predicted[c.name];
    const predict = meta ? `~${meta.sec}s` : '~?s';
    const failMark = c.failed ? ` ✕${c.failed}` : '';
    const totalStr = c.total > 0 ? `/${c.total}` : '';
    process.stdout.write(`\r  ${c.name}.test.js (${predict}): ${c.done}${totalStr}${failMark}`);
  }

  onTestResult(test, tr) {
    const c = this._current || {};
    const sec = ((tr.perfStats && tr.perfStats.runtime) || 0) / 1000;
    const meta = this._predicted[c.name];
    const predict = meta ? `(predict ~${meta.sec}s)` : '';
    const realTotal = (tr.testResults || []).length;
    process.stdout.write('\n');
    if (tr.numFailingTests === 0) {
      process.stdout.write(`PASS ${c.name}.test.js ${sec.toFixed(1)}s ${predict} TOTAL ${realTotal}\n`);
    } else {
      process.stdout.write(`FAIL ${c.name}.test.js ${sec.toFixed(1)}s ${predict} TOTAL ${realTotal} (${tr.numFailingTests} fail)\n`);
      (tr.testResults || []).forEach(r => {
        if (r.status === 'failed') {
          process.stdout.write(`  ✕ ${r.title}\n`);
          if (r.failureMessages) {
            r.failureMessages.slice(0, 2).forEach(m => {
              const firstLine = (m.split('\n').find(l => l.trim()) || m).trim();
              process.stdout.write(`    ${firstLine}\n`);
            });
          }
        }
      });
    }
    this._passed += tr.numPassingTests;
    this._failed += tr.numFailingTests;
    this._current = null;
  }

  onRunComplete(contexts, results) {
    const suites = results.testResults || [];
    const suitesPassed = suites.filter(r => r.numFailingTests === 0).length;
    const timeSec = ((Date.now() - (results.startTime || Date.now())) / 1000).toFixed(3);
    process.stdout.write(`\n════ TEST RESULT: ${this._passed} passed / ${this._failed} failed ════\n`);
    process.stdout.write(`Test Suites: ${suitesPassed} passed, ${suites.length} total\n`);
    process.stdout.write(`Tests:       ${this._passed} passed, ${this._passed + this._failed} total\n`);
    process.stdout.write(`Time:        ${timeSec} s\n`);
  }
}

module.exports = ProgressReporter;
