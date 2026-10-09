/*
 * NexioWatch - 应用图标（圆形）的 canvas 点阵数据
 *
 * 为什么需要这个文件：
 *   ACE-Lite 的 canvas 没有 drawImage / createImageBitmap / Image 对象，
 *   图片无法直接贴到画布上；而 HML 的 <image> 每个节点都要几 KB，页面里塞不下。
 *   因此把图标预先编码成"每行 RLE"字符串常量，运行时用 ctx.fillRect 逐行还原，
 *   只占一个 canvas 节点，且不用任何图片解码器。
 *
 * 圆形（m08330「手表端的图标应该为圆形，包括关于页面」）：
 *   桌面图标是真正的圆形 PNG（白色圆盘 + 内嵌 logo，圆外 alpha=0）；
 *   关于页的点阵则把同样的圆形构图先合成到黑底上再编码 —— 圆外是纯黑，
 *   画在黑底画布上视觉上就是圆形（Lite canvas 没有 clip，这是唯一可行做法）。
 *
 * 数据来源：
 *   NexioSchedule/app/src/main/res/mipmap-xxxhdpi/nexio_schedule.webp (192x192 RGBA)
 *   生成链路：裁出彩色 logo 本体 (33,33)-(158,158)
 *            -> 合成到 32x32 的白色圆盘内(占比 0.86，抗锯齿椭圆掩码)
 *            -> 黑底 alpha_composite -> 近黑像素归零
 *            -> 24 位色彩空间里按「频次 x 饱和度」+ 最小色距挑选 32 色调色板
 *            -> 每行 RLE
 *   生成脚本：.dsh-tmp/mkicon7.py + .dsh-tmp/mkicon8.py (不进源码目录)
 *   实测：32 色 meanErr 4.35、vivid 17；16 色只剩 1 个鲜艳色（logo 会发灰），故取 32 色。
 *
 * pal 格式：调色板颜色按 'rrggbb' 拼接，长度 = 颜色数 * 6。
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
  pal: '000000ffffffd6d6d6fd6b15636363fc863c9545fa6b54f0f37568bc51d8ea6a99a6a6a6b47cf8fcb786de6dc6f196b7d2a0fb9da2ecf8cbb08b8b8bfdfdfdfdfffffcfffffefefefafafafdfbfafefffffffffefffffbfd6c17fd6e19fd6f1a',
  enc:
    'AKEALACAYABBYACALAEAAK~AITAYABJYATAAI~AGTAYABBYCUDYCBBYATAAG~AFCABAZAYBZJYBZABACAAF~' +
    'AECABAYAWAVKaCXAYABACAAE~ADCABAYASANJSFCAYABACAAD~ACCABASAFADAeAfFFCICKCOBCABACAAC~' +
    'ABTABAYAFAeAFIIDKCODYABATAAB~ABYBSAdAfBFGIDKCODJAQAUAYAAB~AALABAYANAeAFAfEFCICKCOEJAQAYABALAAA~' +
    'AAYAUAWANAfBFANCSICDQAJBQAZAXAYAAA~EABAYAWANAfAFASAYQMAJAQAcAYABAEA~LAXAYAWANAfAFAYCWFUFZAYBMAJAQAcAYAXALA~' +
    'CABAYAWANAfAFAYAVAZAYACAYKXAYAMAGAQAcAYABACA~YABAZAWASAfAFAYAaACAFAICKCODJACABAYAMAGAQAcAUABAYA~' +
    'BBZAWASAfAFAYAaAYANBPGOAQBCAXAYAMAGAQAcAUABB~BBZAWASAfAFAYAVAYNUAYAMAGAQAcAUABB~' +
    'YABAZAWASAfAIAYAVAZAYMUAYAMAGARAcAUABAYA~CABAYAWASAFAIAYAVAXBUEXAbAUFYAMAGARAcAYABACA~' +
    'LAXAYAWASAFAIAYAaAYAPCODCABAZAUDYAMAHARAcAYAXALA~EABAYAWASAIBYAaAYAKAOEJAQAbAUEYAMAHARAcAYABAEA~' +
    'AAYAUAWASAIAKAYAVAYACAYECAYAUFYAMAHARAcAXAYAAA~AALABAYASAIAKAYAUAYIUFYARAHARAYABALAAA~' +
    'ABYBSAIAKACABGbIYAHBRAZAYAAB~ABTABACAKBPBQNRBHBCABATAAB~ACCABASAKAOCJEGEHFRABACAAC~ADCAZACAPBQFMFRDCAYACAAD~' +
    'AECABAYRBACAAE~AFCABAYPBACAAF~AGTAYABBYBZAXDZBYABBYATAAG~AITAYABJYATAAI~AKEALACAYABBYACALAEAAK'
};

export { ALPHA, ICON32 };
export default { ALPHA: ALPHA, ICON32: ICON32 };
