/*
 * NexioWatch - 原项目图标(NexioSchedule 启动图标)的 canvas 点阵数据
 *
 * 为什么需要这个文件：
 *   ACE-Lite 的 canvas 没有 drawImage / createImageBitmap / Image 对象，
 *   图片无法直接贴到画布上；而 HML 的 <image> 每个节点都要几 KB，页面里塞不下。
 *   因此把图标预先编码成"每行 RLE"字符串常量，运行时用 ctx.fillRect 逐行还原，
 *   只占一个 canvas 节点，且不用任何图片解码器。
 *
 * 数据来源：
 *   common/img/app_icon.png (96x96 RGBA, 由 NexioSchedule 的 nexio_schedule.webp 转出)
 *   生成链路：PNG -> RGBA -> 黑色底 alpha_composite(透明角变纯黑) -> LANCZOS resize
 *            -> quantize(16 色, MAXCOVERAGE) -> 每行 RLE
 *   生成脚本：.dsh-tmp/gen_icon24.py + .dsh-tmp/gen_iconjs.py (不进源码目录)
 *
 * pal 格式：16 个调色板颜色，每个 6 位小写十六进制('rrggbb')，拼接后长度恒为 96。
 *   调色板索引 i 的颜色 = '#' + pal.substr(i * 6, 6)。
 *
 * enc 格式(每套 n 行)：
 *   - 用 '~' 分隔行，共 n-1 个 '~'。
 *   - 每行由若干 2 字符 run 组成：第 1 字符 = 调色板索引，第 2 字符 = run 长度-1。
 *   - 索引与长度都用 ALPHA 映射：'A'..'P' 表示索引 0..15，长度 1..64 同理映射到 ALPHA[0..63]。
 *   - 每行编码的像素数恰好等于 n（整行都编码，不跳过背景）。
 *
 * 为什么整行都编码(而不是跳过近黑像素)：
 *   初版按"跳过 r+g+b<24 的像素"编码，结果每行开头的黑色像素被丢弃，
 *   解码端从 x=0 开始 fillRect 会让整行图形左移(24x24 实测平均左移 2.1px，
 *   与源图不符的像素 461/576 = 80%)。整行编码后每行恰好 n 像素，解码端
 *   只需从左到右连续填充即可精确还原(实测 0 误差)，代价是 enc 略长但仍在上限内。
 *
 * 解码方式(ES5，页面直接用)：
 *   每一行是一条 y 方向的整数行号(y = 0 是第 1 行、y = n-1 是最后一行)，
 *   x 从 0 开始，每个 run 画一条 1 像素高的横条：
 *       ctx.fillStyle = '#' + ICON.pal.substr(ci * 6, 6);
 *       ctx.fillRect(x, y, len, 1);      // 宽度 len、高度 1；y 就是该行行号
 *       x += len;
 *   画完后每行的 x 累计值应恰好回到 n；约 300~520 次 fillRect 即可还原整图。
 *
 * 解码示例(ES5)：
 *   var rows = ICON32.enc.split('~');
 *   for (var y = 0; y < ICON32.n; y++) {
 *     var row = rows[y], x = 0;
 *     for (var k = 0; k + 1 < row.length; k += 2) {
 *       var ci = ALPHA.indexOf(row.charAt(k));
 *       var len = ALPHA.indexOf(row.charAt(k + 1)) + 1;
 *       ctx.fillStyle = '#' + ICON32.pal.substr(ci * 6, 6);
 *       ctx.fillRect(x, y, len, 1);
 *       x += len;
 *     }
 *   }
 */
var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var ICON32 = {
  n: 32,
  pal: '000000fffffffd69115557ede770b26e6e6eb1b5f1fb9f60ad55f2f7c9aca6a6a6e8a0dd8e86f0f59a97f7d7e1ed6c80',
  enc:
    'Af~Af~Af~ADFAKVFAAD~'
    + 'ACFABXFAAC~ACKABXKAAC~ACKABXKAAC~ACKABXKAAC~'
    + 'ACKABDJAHACBHFPBNAEBOABDKAAC~ACKABCJACGHBPCEDOABCKAAC~ACKABCHACGHAPCEELABCKAAC~ACKABCHACBHENDLCEAIALABCKAAC~'
    + 'ACKABCHACAJABLOAIALABCKAAC~ACKABCHACAOABLOAIBBCKAAC~ACKABCHACAOABAJANDLEBBIBBCKAAC~ACKABCHACAOABANAPANBECLAEALABBIAMABCKAAC~'
    + 'ACKABCHACAOABMIAMABCKAAC~ACKABCHACAOABMIAMABCKAAC~ACKABCNAHAOABAOALEBFIAMABCKAAC~ACKABCNAPAOABALAEDLABFMBBCKAAC~'
    + 'ACKABCNAPAOABMDAMABCKAAC~ACKABCNAPAOABLOADAMABCKAAC~ACKABCOAPAEALGGEMADAGABCKAAC~ACKABDLAECIHDCGABDKAAC~'
    + 'ACKABEONBEKAAC~ACKABXKAAC~ACKABXKAAC~ACFABXFAAC~'
    + 'ADFAKVFAAD~Af~Af~Af'
};

export { ALPHA, ICON32 };
export default { ALPHA: ALPHA, ICON32: ICON32 };
