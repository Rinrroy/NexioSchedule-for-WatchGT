/*
 * NexioWatch - 蓝牙(BLE)发现模块（不使用 Wear Engine）
 *
 * 为什么不是「蓝牙传数据」：
 *   Lite Wearable 的 @system.bluetooth 只有 4 个静态方法
 *   （startBLEScan / stopBLEScan / subscribeBLEFound / unsubscribeBLEFound），
 *   只能扫描广播，没有 GATT 客户端/服务端，无法建立连接、读写特征值或传文件。
 *   所以蓝牙在本项目里承担「发现 + 触发」职责：
 *     手机端 NexioSchedule 作为 BLE 外设持续广播（含局域网地址），
 *     手表扫描到该广播后，用广播里的地址走局域网 HTTP 拉取整表 JSON
 *     （数据通道仍是 sync.js 的 fetch，不依赖 Wear Engine）。
 *   如果广播里没有地址，则回退到已保存的同步地址。
 *
 * 重要：本机 Lite 模拟器里 @system.bluetooth 解析为 undefined（实测），
 *   因此这里一律先做 typeof 判断，任何情况下都不能让页面白屏或抛异常。
 */
import bluetooth from '@system.bluetooth';
import { BLE_SERVICE_UUID, BLE_LOCAL_NAME, BLE_SCAN_MS } from './const.js';

var scanning = false;
var timer = null;
var found = [];

function available() {
  return bluetooth && typeof bluetooth.startBLEScan === 'function';
}

/* 把十六进制串还原成 ASCII（引擎有可能把广播数据给成 hex 字符串） */
function hexToAscii(hex) {
  var out = '';
  var i;
  for (i = 0; i + 1 < hex.length; i += 2) {
    var n = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(n)) return '';
    if (n < 32 || n > 126) break;
    out = out + String.fromCharCode(n);
  }
  return out;
}

/*
 * 广播数据里带局域网地址（约定前缀 "NEXIO|host:port"）。
 * 两种形态都要兼容：明文（ManufacturerData 被解码成字符串）与十六进制串。
 */
function parseAdv(data) {
  var text = data === undefined || data === null ? '' : String(data);
  var at = text.indexOf('NEXIO|');
  if (at < 0) {
    var hexAt = text.indexOf('4E4558494F7C');
    if (hexAt < 0) hexAt = text.indexOf('4e4558494f7c');
    if (hexAt < 0) return '';
    text = hexToAscii(text.substring(hexAt));
    at = text.indexOf('NEXIO|');
    if (at < 0) return '';
  }
  var rest = text.substring(at + 6);
  var bar = rest.indexOf('|');
  if (bar >= 0) rest = rest.substring(0, bar);
  /* 只保留 host:port 形态，去掉可能尾随的非地址字符 */
  var ok = rest.length > 0;
  var j;
  for (j = 0; j < rest.length; j++) {
    var ch = rest.charAt(j);
    if (!(ch >= '0' && ch <= '9') && ch !== '.' && ch !== ':') { ok = false; break; }
  }
  return ok ? rest : '';
}

function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!scanning) return;
  scanning = false;
  try {
    if (typeof bluetooth.unsubscribeBLEFound === 'function') bluetooth.unsubscribeBLEFound();
    if (typeof bluetooth.stopBLEScan === 'function') bluetooth.stopBLEScan({});
  } catch (e) {
    /* 停止失败不影响页面 */
  }
}

/*
 * cb(ok, message, host)
 *   ok=true 时 host 是广播里解析出的 "ip:port"（可能为空字符串 -> 调用方用已存地址）
 */
function discover(cb, timeoutMs) {
  var done = false;
  var wait = timeoutMs ? timeoutMs : BLE_SCAN_MS;
  function finish(ok, msg, host) {
    if (done) return;
    done = true;
    stop();
    if (cb) cb(ok, msg, host);
  }
  found = [];
  if (!available()) {
    finish(false, '本机不支持蓝牙扫描', '');
    return;
  }
  try {
    bluetooth.subscribeBLEFound({
      success: function (res) {
        var list = (res && res.devices) ? res.devices : [];
        var i;
        for (i = 0; i < list.length; i++) {
          var d = list[i];
          if (!d) continue;
          found.push(d);
          var host = parseAdv(d.data);
          /* 名称匹配才认为是 NexioSchedule 手机端 */
          if (host || (d.data && String(d.data).indexOf(BLE_SERVICE_UUID) >= 0)) {
            finish(true, '发现手机端 ' + (d.addr ? String(d.addr) : ''), host);
            return;
          }
        }
      },
      fail: function (data, code) {
        finish(false, '扫描失败(' + code + ')', '');
      }
    });
    bluetooth.startBLEScan({ interval: 0 });
    scanning = true;
    timer = setTimeout(function () {
      if (found.length) finish(true, '发现 ' + found.length + ' 个设备（未识别为手机端）', '');
      else finish(false, '未发现手机端广播', '');
    }, wait);
  } catch (e) {
    finish(false, '蓝牙不可用', '');
  }
}

function status() {
  return { available: available(), scanning: scanning, count: found.length };
}

export { available, discover, stop, status, parseAdv };
export default { available: available, discover: discover, stop: stop, status: status, parseAdv: parseAdv };
