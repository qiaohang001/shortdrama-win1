import React, { useState, useEffect, useRef } from "react";
import { downloadUrl, saveBlob } from "../../utils.js";
import { runDispatchJob, api, generateImage, img2imgImage, extractTail, concatVideos } from "../../dispatch-jobs.js";
import { isLoggedIn, precheckCredits, getCreditBalance } from "../../utils/backend-api.js";
import { getAppSetting, saveAppSetting } from "../../utils/app-settings.js";
import { calcVideoPrice, getPrice } from "../../utils/pricing-utils.js";
import { extractAppearance } from "./CharacterManager.jsx";

const VIDEO_MODES = [
  { key: "i2v", label: "图生视频 (I2V)", desc: "角色参考图驱动，人物外貌一致，模型自由发挥画面" },
  { key: "s2v", label: "人物+场景参考", desc: "人物+场景参考图驱动，不依赖首帧，人物外貌与场景一致" },
  { key: "r2v", label: "首尾帧 (R2V)", desc: "首帧+尾帧精确控制画面起止，轻量图生视频工作流" },
  { key: "ia2v", label: "全能参考 (Ref2VA)", desc: "参考图片+参考音频+文本，最多9图3音，多模态参考工作流" },
  { key: "lipsync", label: "对口型 (LipSync)", desc: "人物图+配音音频，AI对口型生成" },
  { key: "t2v", label: "文生视频 (T2V)", desc: "纯文字描述生成，自由度最高" },
];

// 各渠道支持的生成模式（标准生成=实例面板工作流；高级生成=自部署 MiniMax H3 锁脸链路）
const PROV_MODES = {
  autodl: ["i2v", "r2v", "ia2v", "lipsync", "t2v"],
  wan22: ["i2v", "s2v"],
};
const getVideoModes = (provider) => {
  const keys = PROV_MODES[provider] || PROV_MODES.autodl;
  return VIDEO_MODES.filter(m => keys.includes(m.key));
};

// 视频生成渠道（provider）：标准生成=实例面板工作流 / 高级生成=自部署MiniMax H3锁脸
const VIDEO_PROVIDERS = [
  { key: "autodl", label: "标准生成", desc: "实例面板工作流，1-3积分/秒" },
  { key: "wan22", label: "高级生成", desc: "自部署 MiniMax H3，720P=5/1080P=6积分/秒" },
];

// 视频生成价格：从调度机全局价格配置获取
function getVideoPricePerSec(mode, resolution, provider) {
  return calcVideoPrice(mode, resolution, 1, provider);
}

// I2V支持的分辨率（lightx2v_v5支持1080P和1:1）
// 按分辨率分组，横屏竖屏交替显示，方便用户选择
const RESOLUTIONS_I2V = [
  { key: "1080p横", label: "1080P 横屏（16:9）" },
  { key: "1080p竖", label: "1080P 竖屏（9:16）" },
  { key: "1080p(1:1)", label: "1080P 方形（1:1）" },
  { key: "768p横", label: "768P 横屏（16:9）" },
  { key: "768p竖", label: "768P 竖屏（9:16）" },
  { key: "768p(1:1)", label: "768P 方形（1:1）" },
  { key: "480p横", label: "480P 横屏（16:9）" },
  { key: "480p竖", label: "480P 竖屏（9:16）" },
  { key: "480p(1:1)", label: "480P 方形（1:1）" },
];

// R2V/T2V支持的分辨率（不支持1080P）
// 按分辨率分组，横屏竖屏交替显示
const RESOLUTIONS_BASIC = [
  { key: "768p横", label: "768P 横屏（16:9）" },
  { key: "768p竖", label: "768P 竖屏（9:16）" },
  { key: "480p横", label: "480P 横屏（16:9）" },
  { key: "480p竖", label: "480P 竖屏（9:16）" },
];

// 根据模式获取可用分辨率（自动隐藏不支持的档位）
// wan22（自部署 MiniMax H3）：H3 原生 720p/1080p 档位 + 576p 兼容
const RESOLUTIONS_WAN22 = [
  { key: "1080p横", label: "1080P 横屏（16:9）" },
  { key: "1080p竖", label: "1080P 竖屏（9:16）" },
  { key: "720p横", label: "720P 横屏（16:9）" },
  { key: "720p竖", label: "720P 竖屏（9:16）" },
  { key: "576p竖", label: "576P 竖屏（9:16）" },
  { key: "576p横", label: "576P 横屏（16:9）" },
];
const getResolutions = (mode, provider) => {
  if (provider === "wan22") return RESOLUTIONS_WAN22;
  let list;
  if (mode === "i2v" || mode === "s2v") list = RESOLUTIONS_I2V;
  else if (mode === "ia2v" || mode === "lipsync") list = RESOLUTIONS_IA2V;
  else list = RESOLUTIONS_BASIC;
  return list;
};

// 根据模式获取可用时长（I2V/S2V/IA2V/LipSync=1-10秒，R2V/T2V=1-15秒；高级生成MiniMax H3的I2V/S2V支持30/60秒长视频分段续接）
const getDurations = (mode, provider, resolution) => {
  const is1080 = (resolution || "").includes("1080");
  // 1080p 只支持 5 秒以内（实测 1080p 每步约 180s，超过 5 秒耗时不可接受）
  if (provider === "wan22" && is1080) {
    return DURATIONS.filter(d => d.key <= 5);
  }
  let list = DURATIONS.filter(d => d.key <= (mode === "i2v" || mode === "ia2v" || mode === "s2v" || mode === "lipsync" ? 10 : 15));
  if (provider === "wan22" && (mode === "i2v" || mode === "s2v")) {
    list = list.concat([
      { key: 30, label: "30秒（长视频）" },
      { key: 60, label: "60秒（长视频）" },
    ]);
  }
  return list;
};

// 根据模式获取最大时长
const getMaxDuration = (mode) => {
  return (mode === "i2v" || mode === "ia2v" || mode === "s2v" || mode === "lipsync") ? 10 : 15;
};

const DURATIONS = [
  { key: 1, label: "1秒" },
  { key: 2, label: "2秒" },
  { key: 3, label: "3秒" },
  { key: 4, label: "4秒" },
  { key: 5, label: "5秒" },
  { key: 6, label: "6秒" },
  { key: 7, label: "7秒" },
  { key: 8, label: "8秒" },
  { key: 9, label: "9秒" },
  { key: 10, label: "10秒" },
  { key: 11, label: "11秒" },
  { key: 12, label: "12秒" },
  { key: 13, label: "13秒" },
  { key: 14, label: "14秒" },
  { key: 15, label: "15秒" },
];

// 实例面板工作流（标准生成 autodl 渠道）：MiniMax H3 系列 / Wan2.2 首尾帧
const I2V_WORKFLOW_ID = "API-U01-minimax_h3_基础版API"; // 图生视频（人物/场景参考图，锁脸）
const R2V_WORKFLOW_ID = "API-G02-首尾帧-Wan2.2首尾帧视频"; // 首尾帧（Wan2.2）
const IA2V_WORKFLOW_ID = "API-U06-9图3音频-V5"; // 全能参考（最多9图3音，Ref2VA）
const LIPSYNC_WORKFLOW_ID = "API-U11-Minimax-图片音频对口型API"; // 对口型
const T2V_WORKFLOW_ID = "API-U03-minimax_h3_light2v-文生视频加速版API-V2"; // 文生视频加速版
const WAN22_WORKFLOW_ID = "minimax_h3_a14b"; // 自部署 MiniMax H3（高级生成锁脸链路，保留不动）

// 视频风格选项
const VIDEO_STYLES = [
  { key: "cinematic", label: "电影级写实", desc: "Cinematic realism, high contrast lighting, professional color grading" },
  { key: "anime", label: "动漫风格", desc: "Anime style, vibrant colors, expressive characters, Japanese animation aesthetic" },
  { key: "realistic", label: "超写实", desc: "Hyper-realistic, photorealistic, ultra detailed, natural lighting" },
  { key: "noir", label: "黑色电影", desc: "Film noir, black and white, high contrast shadows, mysterious atmosphere" },
  { key: "cyberpunk", label: "赛博朋克", desc: "Cyberpunk, neon lights, futuristic city, high tech low life" },
  { key: "fantasy", label: "奇幻风格", desc: "Fantasy style, magical atmosphere, ethereal lighting, dreamlike" },
  { key: "horror", label: "恐怖风格", desc: "Horror style, dark atmosphere, eerie lighting, suspenseful" },
  { key: "comedy", label: "喜剧风格", desc: "Comedy style, bright colors, cheerful atmosphere, exaggerated expressions" },
  { key: "guofeng3d", label: "国风3D动画", desc: "Chinese-style 3D animation, ink-wash aesthetics, paper-cut art elements, vibrant red-black palette, stylized cinematic 3D render" },
];

// ─── 全局画质前置词库（按视频风格注入，替代旧固定后缀；硬性约束全风格生效）───
const QUALITY_PREFIXES = {
  cinematic: "8K超高清院线电影级画质，超高细节纹理，4K渲染输出。ARRI Alexa 65大画幅电影机质感，动态宽容度拉满；50mm标准定焦镜头，f/2.8浅景深，焦点精准锁定人物主体；柯达5219电影胶片质感，细腻自然颗粒，色彩柔和不锐化过度；24fps标准电影帧率，2.39:1宽银幕画幅。",
  realistic: "8K超高清写实画质，超高细节纹理，4K渲染输出。真实摄影机质感，50mm标准定焦镜头，f/2.8浅景深焦点精准锁定人物；真实亚洲人种皮肤质感，自然面部微表情，毛细血管细微可见，光影层次真实自然，拒绝过度磨皮与重度美白。",
  anime: "日系动漫电影级画质，吉卜力手绘质感与细腻光影结合，画面干净通透；色彩鲜明柔和，赛璐璐复古上色搭配新海诚式光影氛围，线条清晰流畅，背景细节丰富。",
  noir: "黑白胶片电影质感，高反差明暗对比，深邃阴影，细腻颗粒，40年代黑色电影美学，低调戏剧性打光，影调层次丰富。",
  cyberpunk: "赛博朋克电影质感，红蓝霓虹对比光，雨夜反光地面，高饱和低亮度，未来都市细节丰富，电影级景深与颗粒。",
  fantasy: "奇幻电影级画质，魔法氛围光影，粒子光效细腻，梦幻色彩层次，史诗级场景渲染，超高细节纹理。",
  horror: "恐怖电影质感，压抑暗调，受限光源，高对比阴影，阴冷色调，氛围压迫，电影级噪点颗粒，细节真实。",
  comedy: "明亮喜剧电影质感，高调柔和布光，色彩明快饱满，画面干净通透，电影级细节与景深。",
  guofeng3d: "国风3D动画电影质感，工笔水墨意境与三维动画光影结合，红黑双色国潮配色，剪纸/皮影元素点缀，画面干净通透；角色造型风格化，场景如中式动画电影级渲染，线条清晰，层次分明。",
};
const QUALITY_HARD_RULES = "全局硬性约束：全程无超帧、无画面畸变扭曲、无多余空镜、无穿帮道具、人物口型与台词1:1精准同步；无AI失真脸部，皮肤保留原生毛孔肌理，拒绝过度磨皮、重度美白；人物四肢手部动作自然无畸形，五官脸型全程统一，服装发型配饰前后镜头无改动；画面流畅无抖动、无闪烁卡顿、无崩坏肢体，阴影过渡柔和，无塑料假人质感。";
const DEFAULT_QUALITY_PREFIX = "8K超高清电影级画质，超高细节纹理，4K渲染输出，专业影视级画面，自然光影与真实质感。";
function getQualityPrefix(styleKey) {
  return QUALITY_PREFIXES[styleKey] || DEFAULT_QUALITY_PREFIX;
}

// ─── 专业光影库（8套成套光影方案，细化提示词时按情绪推荐并注入）───
const LIGHTING_LIBRARY = [
  { key: "rembrandt", name: "伦勃朗光", desc: "全局光影：单侧硬光主灯+弱辅光，人物脸颊形成标志性三角光斑，后方窄轮廓光分离背景，色温4200K，光线聚焦人物面部，明暗层次分明，氛围感压抑伤感", emotions: ["单人情绪", "悬疑", "文艺", "压抑"] },
  { key: "butterfly", name: "蝴蝶光", desc: "全局光影：正面高位柔光主灯，下方反光板弱化暗部阴影，色温5500K，柔和低对比，整体治愈温柔氛围", emotions: ["甜宠", "温柔", "女主", "恋爱", "浪漫"] },
  { key: "golden_backlight", name: "黄昏侧逆光", desc: "全局光影：夕阳暖调侧逆光，色温3200K，强发丝轮廓光，正面低亮度柔光辅光，冷暖撞色，温柔伤感氛围感", emotions: ["离别", "黄金时刻", "黄昏", "伤感", "回忆"] },
  { key: "three_point_soft", name: "三点柔光", desc: "全局光影：正面柔光主光+侧辅光+背部轮廓光，色温5500K，明暗过渡平缓，日常松弛治愈氛围", emotions: ["日常", "居家", "办公室", "对话", "平静"] },
  { key: "hard_single", name: "悬疑单硬光", desc: "全局光影：顶部单侧硬光主光源，色温4000K，无多余辅光，极高明暗对比，大面积深邃暗部，紧张压抑悬疑氛围", emotions: ["密室", "对峙", "惊悚", "恐怖", "压迫"] },
  { key: "blue_city_night", name: "蓝调城市夜景光", desc: "全局光影：天空冷蓝环境光7000K，搭配街边暖黄辅光，伦勃朗光塑造人物面部，冷暖对冲，孤独压抑氛围", emotions: ["都市", "孤独", "夜景", "雨夜", "失落"] },
  { key: "kerosene_warm", name: "煤油暖黄光", desc: "全局光影：单盏煤油灯侧方暖黄主光，色温2600K，低亮度辅光提亮眼窝，面部形成伦勃朗三角光斑，厚重沉郁离别氛围", emotions: ["夜晚", "室内", "离别", "烛火", "沉重"] },
  { key: "cyber_contrast", name: "赛博朋克对比光", desc: "全局光影：红蓝双色霓虹分侧对冲打光，混合色温，低亮度环境，高色彩反差，赛博氛围感", emotions: ["赛博", "霓虹", "科幻", "都市夜"] },
];
const EMOTION_LIGHTING_MAP = [
  { keywords: ["密室", "对峙", "惊悚", "恐怖", "压迫", "悬疑", "诡异", "紧张"], light: "hard_single" },
  { keywords: ["甜宠", "温柔", "恋爱", "浪漫", "暧昧", "甜蜜", "亲密"], light: "butterfly" },
  { keywords: ["离别", "黄昏", "夕阳", "伤感", "回忆", "黄金时刻", "日落"], light: "golden_backlight" },
  { keywords: ["日常", "居家", "办公室", "对话", "平静", "叙述", "温馨"], light: "three_point_soft" },
  { keywords: ["都市", "孤独", "夜景", "雨夜", "失落", "霓虹街", "城市"], light: "blue_city_night" },
  { keywords: ["夜晚", "室内", "烛火", "沉重", "煤油", "深夜"], light: "kerosene_warm" },
  { keywords: ["赛博", "霓虹", "科幻", "未来都市", "机械"], light: "cyber_contrast" },
  { keywords: ["单人", "文艺", "压抑", "情绪", "内心"], light: "rembrandt" },
];
function recommendLighting(desc, title, dialogue) {
  const text = (desc + title + dialogue).toLowerCase();
  for (const m of EMOTION_LIGHTING_MAP) {
    if (m.keywords.some(k => text.includes(k))) {
      const lib = LIGHTING_LIBRARY.find(l => l.key === m.light);
      if (lib) return lib;
    }
  }
  return LIGHTING_LIBRARY[3]; // 默认三点柔光，中性安全
}

// 专业运镜库（每种带精确参数描述）
const CAMERA_MOVES = {
  static: { name: "固定镜头", desc: "固定镜头，机位不动，画面稳定无晃动，客观冷静视角，适合对话、沉思、强调时刻" },
  push_in: { name: "缓慢推近", desc: "缓慢匀速推近镜头，从远景过渡到中景或特写，聚焦主体面部，制造紧张感或情绪强调，速度平稳无顿挫" },
  pull_out: { name: "缓慢拉远", desc: "缓慢匀速拉远镜头，从特写/中景过渡到远景，揭示环境空间，制造孤独感、结束感或宏大感" },
  pan: { name: "水平横摇", desc: "镜头原地水平左右摇动，展示环境空间或跟随横向运动，速度平稳流畅，无剧烈晃动" },
  follow: { name: "跟随跟拍", desc: "镜头跟随主体同步移动，与主体保持固定距离，画面中心始终锁定主体，代入感强，适合行走、赶路场景" },
  handheld: { name: "手持跟拍", desc: "手持镜头自然轻微晃动，纪实感强，追逐打斗场景用急促小幅度晃动增强紧张感，镜头距主体1.5-2米" },
  crane: { name: "升降镜头", desc: "镜头垂直方向缓慢升降，从低机位升到高机位或反之，展示宏大场面或视角转换，运动轨迹平滑" },
  orbit: { name: "环绕镜头", desc: "镜头围绕主体缓慢环绕半圈到一圈，360度展示人物或物体，强调主体重要性，速度均匀" },
  whip_pan: { name: "快速甩镜", desc: "快速水平摇动镜头，画面产生运动模糊拖影，用于急促转场或动作切换，制造强烈节奏感" },
  low_angle: { name: "低机位仰拍", desc: "低角度仰拍主体，主体显得高大有压迫感，适合反派登场、力量展示、气势营造" },
  top_down: { name: "俯拍上帝视角", desc: "高角度垂直俯拍，展示全局空间布局，适合场面调度、孤独感、战场全景" },
  steadicam: { name: "斯坦尼康跟拍", desc: "佩戴斯坦尼康稳定器跟随主体平滑移动，画面稳定无晃动兼具运动感，适合长镜头跟拍、走廊行进、连续动作场景，镜头距主体2-3米" },
  macro: { name: "微距特写", desc: "镜头贴近主体进行微距拍摄，突出细微细节（瞳孔、物件纹理、水滴、绣纹），浅景深虚化背景，强化凝视感与情绪张力" }
};

// 专业镜头语言库（五类，中英对照）——细化时每镜从五维各选一项
const SHOT_LANGUAGE_LIB = {
  shotSize: { label: "1、景别与机位", items: [
    { cn: "微距特写", en: "extreme close-up" },
    { cn: "中景", en: "medium shot" },
    { cn: "俯拍45°", en: "45-degree high angle" },
    { cn: "平视1.65米", en: "eye-level at 1.65m" },
    { cn: "仰拍0.5米", en: "low angle at 0.5m" },
    { cn: "全景", en: "full shot" },
    { cn: "远景", en: "long shot" },
    { cn: "大远景", en: "extreme long shot" },
    { cn: "超远景", en: "ultra wide establishing shot" },
    { cn: "低机位", en: "low camera position" },
    { cn: "过肩构图", en: "over-the-shoulder" },
    { cn: "遮挡式构图", en: "framed/obstructed composition" },
  ]},
  dof: { label: "2、景深控制", items: [
    { cn: "浅景深（背景完全模糊）", en: "shallow depth of field, background fully blurred" },
    { cn: "中等景深（背景轻微模糊）", en: "medium depth of field, background softly blurred" },
    { cn: "深景深（背景完全清晰）", en: "deep depth of field, background fully sharp" },
    { cn: "前景对焦", en: "focus on foreground" },
    { cn: "主体对焦", en: "focus on subject" },
    { cn: "背景对焦", en: "focus on background" },
  ]},
  composition: { label: "3、构图方式", items: [
    { cn: "左右三分构图", en: "rule of thirds, left-right split" },
    { cn: "三分加对称构图", en: "rule of thirds with symmetry" },
    { cn: "黄金分割点站位", en: "golden ratio subject placement" },
    { cn: "过肩反打", en: "over-the-shoulder reverse shot" },
    { cn: "Whip Pan/Tilt 重新寻焦", en: "whip pan/tilt refocus" },
  ]},
  moveFx: { label: "4、运镜与特效", items: [
    { cn: "无人机超广角暴力快推", en: "drone ultra-wide aggressive fast push-in", fx: "high" },
    { cn: "子弹时间", en: "bullet time", fx: "high" },
    { cn: "慢动作", en: "slow motion", fx: "mid" },
    { cn: "360°环绕高速旋转", en: "360-degree high-speed orbit", fx: "high" },
    { cn: "镜头冻结", en: "freeze frame", fx: "mid" },
    { cn: "Whip Pan 横扫", en: "whip pan sweep", fx: "high" },
    { cn: "垂直空间Z轴战斗", en: "vertical Z-axis fight choreography", fx: "high" },
    { cn: "强制抽帧加震动", en: "forced frame skip with camera shake", fx: "high" },
    { cn: "负片反转", en: "negative inversion", fx: "high" },
    { cn: "镜头螺旋环绕", en: "spiral orbit around subject", fx: "high" },
    { cn: "固定镜头", en: "static fixed camera", fx: "low" },
    { cn: "缓慢推近", en: "slow push-in", fx: "low" },
    { cn: "缓慢拉远", en: "slow pull-back", fx: "low" },
    { cn: "水平横摇", en: "slow pan", fx: "low" },
    { cn: "手持跟拍", en: "handheld follow", fx: "mid" },
    { cn: "升降镜头", en: "crane up/down", fx: "mid" },
  ]},
  focal: { label: "5、焦段参考", items: [
    { cn: "18mm超广角", en: "18mm ultra-wide lens" },
    { cn: "24mm广角", en: "24mm wide lens" },
    { cn: "35mm", en: "35mm lens" },
    { cn: "50mm", en: "50mm lens" },
    { cn: "70mm中长焦", en: "70mm medium telephoto" },
    { cn: "85mm面部近景", en: "85mm facial close-up lens" },
  ]},
};
const SHOT_LANGUAGE_TEXT = Object.values(SHOT_LANGUAGE_LIB)
  .map(g => `${g.label}：${g.items.map(i => i.cn).join("、")}`).join("\n");
const SHOT_LANGUAGE_EN = Object.values(SHOT_LANGUAGE_LIB)
  .map(g => `${g.label} 英文镜语：${g.items.map(i => `${i.cn}→${i.en}`).join("；")}`).join("\n");
// 高风险特效（人物镜降级为慢速版本，空镜/无人镜可用）
const SHOT_FX_HIGH = Object.values(SHOT_LANGUAGE_LIB.moveFx.items).filter(i => i.fx === "high").map(i => i.cn).join("、");

// 情绪→运镜自动映射（关键词匹配）
const EMOTION_CAMERA_MAP = [
  { keywords: ["紧张", "追逐", "打斗", "激烈", "危急", "逃跑", "追杀", "搏斗"], camera: "handheld", reason: "手持跟拍制造紧张代入感" },
  { keywords: ["悲伤", "孤独", "失落", "绝望", "哭泣", "落寞", "凄凉"], camera: "pull_out", reason: "缓拉揭示孤独环境" },
  { keywords: ["震撼", "宏大", "壮观", "登场", "气势", "霸气", "威严"], camera: "crane", reason: "升降镜头展示宏大场面" },
  { keywords: ["温馨", "浪漫", "亲密", "温柔", "甜蜜", "暧昧"], camera: "orbit", reason: "环绕镜头营造温柔氛围" },
  { keywords: ["悬疑", "神秘", "诡异", "惊悚", "恐惧", "压迫", "不安"], camera: "push_in", reason: "缓慢推近制造压迫感" },
  { keywords: ["对话", "沉思", "平静", "日常", "叙述", "回忆"], camera: "static", reason: "固定镜头保持客观稳定" },
  { keywords: ["愤怒", "爆发", "冲突", "争吵", "怒吼", "摔砸"], camera: "whip_pan", reason: "甩镜制造急促冲突感" },
  { keywords: ["行走", "赶路", "旅行", "移动", "奔跑", "前行"], camera: "follow", reason: "跟随跟拍保持运动感" },
  { keywords: ["反派", "霸气", "压迫", "高高在上", "藐视"], camera: "low_angle", reason: "低机位仰拍增强压迫感" }
];

// 根据分镜内容自动推荐运镜
function recommendCamera(desc, title, dialogue) {
  const text = (desc + title + dialogue).toLowerCase();
  for (const m of EMOTION_CAMERA_MAP) {
    if (m.keywords.some(k => text.includes(k))) {
      return { ...CAMERA_MOVES[m.camera], key: m.camera, reason: m.reason };
    }
  }
  return { ...CAMERA_MOVES.static, key: "static", reason: "默认固定镜头保持稳定" };
}

// AI细化提示词 - 镜头分类模板库（按镜头功能分类，每类有专属细化要点；auto=自动识别）
const REFINE_TEMPLATES = [
  {
    key: "auto", label: "自动识别",
    guide: "请先判断本分镜的镜头功能类型（从特效/打斗/文戏/氛围/惊悚/运镜/场景中选取最匹配的一类），再用该类专属要点进行细化。"
  },
  {
    key: "vfx", label: "特效类",
    guide: "特效类细化要点：重点描绘能量/法术/技能释放全过程（能量颜色、粒子密度与轨迹、释放方向与源点）；元素材质与物理反馈（火焰/冰霜/雷电/光效的质感层次）；受击对象的视觉反应（碎裂、飞溅、震动）；光效与环境的相互作用（照亮、染色、投射阴影）；特效节奏与镜头配合（爆发瞬间、余波消散）。"
  },
  {
    key: "fight", label: "打斗类",
    guide: "打斗类细化要点：动作连贯性与逻辑（攻防转换、重心变化、发力瞬间）；打击感（接触瞬间的顿挫、速度拖影、衣袂与发丝随动）；双方姿态与距离感（近身缠斗/拉开距离）；节奏张力（快慢交替、蓄力到爆发）；环境互动（踩踏扬尘、震碎地面、墙面裂纹）。"
  },
  {
    key: "drama", label: "文戏类",
    guide: "文戏类细化要点：面部微表情与眼神（情绪层次、嘴角与眉梢细节）；台词节奏与情绪；双人对位构图（站位关系、视线方向）；肢体小动作（手部特写、无意识动作）；情感氛围（克制或爆发、留白感）。"
  },
  {
    key: "ambience", label: "氛围类",
    guide: "氛围类细化要点：光影色调主导情绪（冷/暖、明/暗、色温）；环境质感细节（雾气、尘埃、水汽、光斑）；空间纵深感与层次（前景-主体-背景）；时间感（晨昏/雨雪/风）；整体基调统一（压抑/温暖/空旷/拥挤）。"
  },
  {
    key: "horror", label: "惊悚类",
    guide: "惊悚类细化要点：压迫感构图（低机位、过肩、挤压空间）；暗部细节与受限光源（单一光源、忽明忽暗）；悬念元素（遮挡、背影、若隐若现）；镜头呼吸感与缓慢推进；心理紧张暗示（环境反常、安静中的细微声响感）。"
  },
  {
    key: "camera", label: "运镜类",
    guide: "运镜类细化要点：镜头运动方式明确（推/拉/摇/移/跟/环绕/升降）；运动速度与节奏（平稳/急促/呼吸感）；景别推进关系（远景-中景-特写的过渡）；视角与主体关系（主观/客观、跟随/悬停）；转场逻辑（无缝衔接、甩镜、遮罩）。"
  },
  {
    key: "scene", label: "场景类",
    guide: "场景类细化要点：场景建立顺序（先环境后主体）；空间结构描述（大小、纵深、布局）；元素关系与动线（人物在场景中的位置与移动）；时代与地域特征（建筑、植被、器物）；场景动态元素（风吹草动、水流、人群流动）。"
  },
];

// 图音生视频(Ref2VA)支持的分辨率
const RESOLUTIONS_IA2V = [
  { key: "1080p横", label: "1080P 横屏（16:9）" },
  { key: "1080p竖", label: "1080P 竖屏（9:16）" },
  { key: "768p横", label: "768P 横屏（16:9）" },
  { key: "768p竖", label: "768P 竖屏（9:16）" },
  { key: "480p横", label: "480P 横屏（16:9）" },
  { key: "480p竖", label: "480P 竖屏（9:16）" },
];

// 通过调度机API提取视频最后一帧（避免前端CORS问题）
const extractLastFrameViaAPI = async (videoUrl, log) => {
  try {
    if (log) log("正在通过调度机提取视频尾帧…");
    const result = await api("/api/video/extract-last-frame", {
      method: "POST",
      body: JSON.stringify({ video_url: videoUrl }),
    });
    if (result && result.image_url) {
      let frameUrl = result.image_url;
      // 兼容调度机返回的相对路径（如 /static/frames/xxx.png），拼成完整URL
      if (typeof frameUrl === "string" && frameUrl.startsWith("/")) {
        const baseUrl = (typeof localStorage !== "undefined" && localStorage.getItem("DISPATCH_BASE_URL")) || "https://api.jinsuai.cn";
        frameUrl = baseUrl + frameUrl;
      }
      if (log) log(`调度机提取尾帧成功：${frameUrl.substring(0, 80)}...`);
      return frameUrl;
    }
    if (log) log("⚠️ 调度机提取尾帧返回空，将尝试前端提取");
    return null;
  } catch (e) {
    if (log) log(`⚠️ 调度机提取尾帧失败（${e.message}），将尝试前端提取`);
    return null;
  }
};

// 从视频URL抽取最后一帧（尾帧），用于作为下一镜首帧
const extractLastFrame = (videoUrl) => new Promise((resolve) => {
  if (!videoUrl || typeof videoUrl !== "string") { resolve(null); return; }
  let done = false;
  let objectUrl = null;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);

  const cleanup = () => {
    try { video.pause(); } catch {}
    try { video.removeAttribute("src"); video.load(); } catch {}
    try { if (objectUrl) URL.revokeObjectURL(objectUrl); } catch {}
    try { video.parentNode && video.parentNode.removeChild(video); } catch {}
  };
  const finish = (url) => {
    if (done) return;
    done = true;
    cleanup();
    resolve(url);
  };
  const fail = (reason) => {
    console.warn("[extractLastFrame] failed:", reason);
    finish(null);
  };

  video.addEventListener("error", () => fail("video error"));
  video.addEventListener("loadedmetadata", () => {
    try {
      video.currentTime = Math.max(0, (video.duration || 1) - 0.1);
    } catch (e) { fail("seek error"); }
  });
  video.addEventListener("seeked", () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          finish(objectUrl);
        } else {
          fail("toBlob null");
        }
      }, "image/jpeg", 0.9);
    } catch (e) { fail("canvas error: " + e.message); }
  });

  video.src = videoUrl;
  try { video.load(); } catch (e) { fail("load error: " + e.message); }
  // 超时保护
  setTimeout(() => fail("timeout"), 15000);
});

// 把本地图片（blob URL或base64）上传到调度机，获取公网URL
const uploadImageToServer = async (imageUrl, log) => {
  if (!imageUrl) return null;
  
  // 如果已经是腾讯云COS的URL（永久URL），直接返回，不需要重复上传
  if (imageUrl.includes("myqcloud.com") || imageUrl.includes("cdn.jinsuai.cn")) {
    if (log) log(`✅ 图片已是腾讯云COS永久URL，无需上传：${imageUrl.substring(0, 80)}...`);
    return imageUrl;
  }
  
  try {
    const imgType = imageUrl.startsWith("blob:") ? "blob" : imageUrl.startsWith("data:") ? "base64" : (imageUrl.startsWith("http") || imageUrl.startsWith("/")) ? "http-url" : "other";
    if (log) log(`正在上传图片（${imgType}格式，长度${imageUrl.length}）：${imageUrl.substring(0, 80)}${imageUrl.length > 80 ? "..." : ""}`);
    
    const baseUrl = (typeof localStorage !== "undefined" && localStorage.getItem("DISPATCH_BASE_URL")) || "https://api.jinsuai.cn";
    // 上传接口用http（避免自签名证书问题），返回的图片URL用https
    const uploadBaseUrl = baseUrl;
    const imageBaseUrl = baseUrl;
    
    // 获取认证token
    const authToken = (typeof localStorage !== "undefined" && localStorage.getItem("DISPATCH_TOKEN")) || "";
    const authHeaders = {};
    if (authToken) {
      authHeaders["Authorization"] = "Bearer " + authToken;
    }
    
    // 对于所有http/https或/开头的相对路径，都传给调度机下载并保存
    if (imageUrl.startsWith("http") || imageUrl.startsWith("/")) {
      let urlToDownload = imageUrl;
      if (urlToDownload.startsWith("/")) {
        urlToDownload = baseUrl + urlToDownload;
      }
      if (log) log(`URL传调度机下载并保存：${uploadBaseUrl}/api/upload/image`);
      const formData = new FormData();
      formData.append("url", urlToDownload);
      const res = await fetch(uploadBaseUrl + "/api/upload/image", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        let publicUrl = data.url;
        if (publicUrl && publicUrl.startsWith("/")) {
          publicUrl = imageBaseUrl + publicUrl;
        }
        if (log) log(`图片上传成功：${publicUrl}`);
        return publicUrl;
      }
      const errText = await res.text().catch(() => "");
      if (log) log(`❌ 图片上传失败：HTTP ${res.status} ${errText}`);
      console.warn("[uploadImage] 上传失败:", res.status, errText);
      return null;
    }
    
    // 对于blob/base64，转换成文件上传
    let file;
    if (imageUrl.startsWith("blob:")) {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      file = new File([blob], `image_${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
    } else if (imageUrl.startsWith("data:")) {
      const commaIdx = imageUrl.indexOf(",");
      const header = commaIdx > 0 ? imageUrl.substring(0, commaIdx) : "data:image/jpeg;base64";
      const data = commaIdx > 0 ? imageUrl.substring(commaIdx + 1) : imageUrl;
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const bstr = atob(data);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      file = new File([u8arr], `image_${Date.now()}.jpg`, { type: mime });
    } else {
      if (log) log(`❌ 不支持的图片格式`);
      return null;
    }
    
    if (log) log(`上传文件到调度机：${uploadBaseUrl}/api/upload/image`);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(uploadBaseUrl + "/api/upload/image", {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      let publicUrl = data.url;
      if (publicUrl && publicUrl.startsWith("/")) {
        publicUrl = imageBaseUrl + publicUrl;
      }
      if (log) log(`图片上传成功：${publicUrl}`);
      return publicUrl;
    }
    const errText = await res.text().catch(() => "");
    if (log) log(`❌ 图片上传失败：HTTP ${res.status} ${errText}`);
    console.warn("[uploadImage] 上传失败:", res.status, errText);
    return null;
  } catch (e) {
    if (log) log(`❌ 图片上传异常：${e.message}`);
    console.warn("[uploadImage] 异常:", e);
    return null;
  }
}

export const VideoGenBoard = ({ project, update, log, externalFirstFrame, onClearExternalFirstFrame }) => {
  const allShots = (project.shots || []).filter(Boolean);
  const episodes = (project.episodes || []).filter(Boolean);
  const characters = project.materials?.characters || [];
  // 并发生成：per-shot busy（支持同时生成多个分镜，进度互不干扰）；busyRef 为同步锁，防同一分镜重复点击
  const [busyIds, setBusyIds] = useState({});
  const busyRef = useRef({});
  const setBusy = (id) => { busyRef.current[id] = true; setBusyIds((prev) => ({ ...prev, [id]: true })); };
  const clearBusy = (id) => { delete busyRef.current[id]; setBusyIds((prev) => { const n = { ...prev }; delete n[id]; return n; }); };
  const [genProgress, setGenProgress] = useState({}); // {shotId: {text, queuePosition, status, progress}}
  const [selectedMode, setSelectedMode] = useState(() => String(getAppSetting("defaultVideoMode", "I2V")).toLowerCase());
  const [resolution, setResolution] = useState(() => getAppSetting("defaultResolution", "720p竖"));
  const [duration, setDuration] = useState(() => Number(getAppSetting("defaultDuration", 5)));
  const [selectedStyle, setSelectedStyle] = useState(() => getAppSetting("defaultVideoStyle", "cinematic"));
  const [videoProvider, setVideoProvider] = useState(() => getAppSetting("defaultVideoProvider", "autodl"));

  // 初始分辨率兜底：确保默认分辨率在可用列表中（H3 已移除 768p 档位）
  useEffect(() => {
    const available = getResolutions(selectedMode, videoProvider);
    if (available.length && !available.find(r => r.key === resolution)) {
      setResolution(available[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 多分镜合并生成长视频：mergeMode=多选模式，mergeSelected=勾选的 shot id 集合
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState({});
  const [mergingLongVideo, setMergingLongVideo] = useState(false);

  const [lastFrameUrl, setLastFrameUrl] = useState("");
  const [firstFrameUrl, setFirstFrameUrl] = useState("");
  // 全能参考(Ref2VA/v2)模式：参考音频URL数组（最多3个）和用户手动上传的参考图（选填）
  const [refAudioUrls, setRefAudioUrls] = useState(["", "", ""]);
  const [refImageUrl, setRefImageUrl] = useState("");
  // 素材库中的音频素材（用于快速选择已生成的配音）
  const [audioAssets, setAudioAssets] = useState([]);
  // 首帧来源选择：shot=本分镜分镜图，prev_video=上个视频尾帧，custom=用户手动上传
  const [firstFrameSource, setFirstFrameSource] = useState("shot");
  // 尾帧来源选择：next_shot=下一分镜分镜图，next_video=下个视频尾帧，custom=用户手动上传
  const [lastFrameSource, setLastFrameSource] = useState("next_shot");
  const [refiningShotId, setRefiningShotId] = useState("");
  // AI细化提示词 - 镜头分类（auto=自动识别，也可手动选特效/打斗/文戏/氛围/惊悚/运镜/场景）
  const [refineType, setRefineType] = useState("auto");
  const [editingShotId, setEditingShotId] = useState("");
  const [editingPrompt, setEditingPrompt] = useState("");
  const [selectedEpisode, setSelectedEpisode] = useState(episodes[0]?.id || "");
  const [selectedShotId, setSelectedShotId] = useState(allShots[0]?.id || "");
  const [showCharSelect, setShowCharSelect] = useState("");
  // ===== 场景资产（保证场景一致性） =====
  const [showScenePanel, setShowScenePanel] = useState(false);
  const [showSceneSelect, setShowSceneSelect] = useState(""); // 展开场景选择的分镜id
  const [analyzingScenes, setAnalyzingScenes] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState("");
  const [x99RefPicker, setX99RefPicker] = useState(null); // {sceneId} 图生图参考图选择器
  const [refiningSceneId, setRefiningSceneId] = useState("");
  const [addingScene, setAddingScene] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [newSceneDesc, setNewSceneDesc] = useState("");
  const [newScenePrompt, setNewScenePrompt] = useState("");
  const [editingScene, setEditingScene] = useState(null); // {id,name,desc,prompt}
  const [previewSceneImage, setPreviewSceneImage] = useState("");

  // 加载素材库中的音频素材（用于快速选择已生成的配音）
  useEffect(() => {
    const audios = (project?.assets || []).filter((a) => a.type === "audio" && a.url);
    setAudioAssets(audios);
  }, [project?.assets]);

  // 按集筛选分镜
  const shots = selectedEpisode === "all" ? allShots : allShots.filter(s => s && s.episodeId === selectedEpisode);

  // AI细化分镜提示词
  const refinePrompt = async (sh) => {
    if (refiningShotId) return;

    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用AI细化提示词功能");
      return;
    }
    // 积分预校验（AI细化提示词：U00 Qwen GPU 细化，价格从调度机获取）
    try {
      const refinePrice = getPrice("video_refine", 1.0);
      const precheck = await precheckCredits(refinePrice, "text", "AI细化视频提示词");
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${refinePrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！AI细化提示词需要${refinePrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }

    setRefiningShotId(sh.id);
    log(`正在为「${sh.title}」AI细化视频提示词...`);
    try {
      const sceneType = sh.sceneType || "中景";
      const cameraMove = sh.cameraMove || "固定";
      const shotDuration = duration;
      const desc = sh.sceneDesc || "";
      const dialogue = sh.dialogue || "";
      const charList = sh.characters || [];
      const nChar = charList.length;
      const characters = charList.join("、") || "无（空镜）";
      // 按分镜实际角色数动态生成 H3 Subject 分配说明（0人=空镜 / 1人 / N人）
      let subjectAssign, subjectUse, extraRule, shotBodyRule, appearanceRule;
      if (nChar === 0) {
        subjectAssign = "<Subject 1> 是场景环境（来自 <Picture 1>），本镜头未绑定角色参考图，以场景环境为主体；分镜描述中明确出现的倒伏护卫/尸体作为场景元素保留，保留其面部";
        subjectUse = "场景环境全程用 <Subject 1>";
        extraRule = "【本镜头未绑定角色参考图：画面中禁止出现任何活人、站立或行走的人物、路人、人群、人影；分镜描述中明确出现的倒伏护卫/尸体，必须作为真实尸身呈现——保留清晰可辨的面部（闭眼、无表情、面无血色、面色青灰），完全静止，绝无呼吸起伏、绝无任何动作、绝不起身不移动不抬头不睁眼，只作场景元素，绝不写成站立/行走/活动的 guards/person】";
        shotBodyRule = "场景主体元素的位置与变化；分镜描述中明确出现的倒伏护卫/尸体以静止尸身呈现（面部清晰可辨：闭眼、无表情、面无血色，绝无任何动作与呼吸起伏）";
        appearanceRule = "（空镜无绑定角色，无需外貌描述）";
      } else {
        const subjNames = charList
          .map((c, i) => `<Subject ${i + 1}> 是出场角色${i + 1}（${c}，外观与身份来自 <Picture ${i + 1}>）`)
          .join("，");
        subjectAssign = `${subjNames}，<Subject ${nChar + 1}> 是场景环境（来自 <Picture ${nChar + 1}>）`;
        const uses = charList.map((_, i) => `<Subject ${i + 1}>`).join("、");
        subjectUse = `出场角色全程用 ${uses}，场景用 <Subject ${nChar + 1}>`;
        extraRule = "【禁止出现分镜绑定角色之外的任何其他人物、人群、路人、观众或额外角色】；多角色互动时按出场顺序写清各自的位置、动作、视线关系";
        shotBodyRule = nChar === 1
          ? "<Subject 1> 在画面中的位置与主要动作"
          : `各出场角色在画面中的位置与主要动作（按 ${uses} 顺序逐人写清）`;
        appearanceRule = `各角色外貌细节（五官/发型/服装/配饰）在 [Shot 1] 首次出现时各描述一次，与对应参考图保持一致，后续镜头不再重复`;
      }
      // 当前选中的镜头分类模板（auto=让LLM自动判断类型）
      const refineTpl = REFINE_TEMPLATES.find(t => t.key === refineType) || REFINE_TEMPLATES[0];
      const recommendedCam = recommendCamera(desc, sh.title || "", dialogue);
      
      const recommendedLight = recommendLighting(desc, sh.title || "", dialogue);
      const shotLibText = SHOT_LANGUAGE_TEXT;
      const fxHighText = SHOT_FX_HIGH;
      
      // ── 方案B：组装本次任务的补充规则（保留项目特有的空镜/尸体/Subject分配/光影/镜头类型/画质约束）──
      const shotLibRule = shotDuration >= 8
        ? "本分镜时长≥8秒：至少使用 2 个不同的镜头语言（不同景别或不同运镜），禁止全程固定镜头，除非分镜明确要求监控/客观静止视角"
        : "本分镜时长较短：至少规划 1 个明确运镜，避免全程固定镜头";
      const rules = [
        `【参考主体分配】${subjectAssign}。${subjectUse}。${extraRule}`,
        `【角色外貌】${appearanceRule}`,
        `【镜头语言库】${shotLibText}`,
        `【镜头语言规则】1.每个镜头必须写全五维：景别与机位、景深、构图、运镜与特效、焦段，缺一不可；2.${shotLibRule}；3.运镜描述要具体到镜头距离、运动速度、晃动幅度、主体位置关系，禁止"平稳跟随跟镜"这类模糊描述；4.高风险特效（${fxHighText}）：空镜/无人物分镜可以使用，有人物分镜自动降级为慢速或小幅版本；5.镜头切换遵循背景继承，后一镜的机位/光线/场景元素与前一镜自然衔接，无跳变`,
        `【光影库】${LIGHTING_LIBRARY.map(v => `${v.name}：${v.desc}`).join("\n")}`,
        `【推荐光影】${recommendedLight.name}（${recommendedLight.desc}），如情绪匹配度更高可另选库内其他方案；每个镜头必须写明本段光影方案（光源类型+色温+方向+明暗对比），不要写"灯光柔和"这类模糊描述`,
        `【镜头类型】本分镜按「${refineTpl.label}」细化：${refineTpl.guide}`,
        `【画质硬约束】${QUALITY_HARD_RULES}`,
        `【用户指定运镜】${cameraMove}（用户指定了具体运镜时优先使用；未指定则按镜头语言库规划）`,
      ].join("\n");

      const shotInfo = [
        `分镜标题：${sh.title}`,
        `场景类型：${sceneType}`,
        `时长：${shotDuration}秒`,
        `分镜描述：${desc}`,
        `对话内容：${dialogue}`,
        `出场角色：${characters}`,
      ].join("\n");

      // 调调度机 U00 细化端点（Qwen3.8-27B 中文六段，扣 2 积分；参考图=用户手动选择的角色图）
      const res = await api("/api/video/refine", {
        method: "POST",
        body: JSON.stringify({
          prompt: shotInfo,
          reference_images: getShotCharacterImages(sh),
          style: selectedStyle || "",
          rules,
        })
      });
      const refinedText = (res.detailed_description || "").trim();
      if (!refinedText) throw new Error("U00未返回细化内容");

      // 保存 H3 结构化 JSON 到 promptCn（summary + detailed_description，结构不变，内容为中文）
      const savedPromptCn = JSON.stringify({ summary: res.summary || "", detailed_description: refinedText });
      update({ shots: shots.map(s => s.id === sh.id ? { ...s, promptCn: savedPromptCn } : s) });
      log(`✅「${sh.title}」提示词细化成功（${savedPromptCn.length}字符，U00中文六段）`);

      // 积分扣减已移至后端（/api/video/refine 扣 2 积分），前端仅刷新余额显示
      if (isLoggedIn()) {
        try {
          const balanceData = await getCreditBalance();
          if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
          if (window.refreshUserInfo) window.refreshUserInfo();
        } catch (e) {}
      }
    } catch (err) {
      log(`❌ 提示词细化失败：${err.message}`);
    } finally {
      setRefiningShotId("");
    }
  };

  // 获取分镜涉及的角色图片（优先使用用户手动选择的角色，优先传四视图）
  const getShotCharacterImages = (sh) => {
    // 仅使用用户手动选择的角色图；未选择则返回空（空镜/无人物分镜不传人物参考图，不自动绑定）
    // 人物锁定优先传四视图（多视角锁定更强）；未生成四视图时回退单张参考图
    if (sh.selectedCharIds && sh.selectedCharIds.length > 0) {
      const selectedChars = characters.filter(c => sh.selectedCharIds.includes(c.id));
      if (selectedChars.length > 0) {
        const missingFourView = selectedChars.filter(c => !c.fourView && c.image);
        if (missingFourView.length > 0) {
          log(`⚠️ ${missingFourView.map(c => c.name).join("、")} 未生成四视图，暂用人物参考图（建议先生成四视图，锁定效果更强）`);
        }
        return selectedChars.map(c => c.fourView || c.image).filter(Boolean);
      }
    }
    return [];
  };

  // 切换角色选择
  const toggleCharSelection = (sh, charId) => {
    const selected = sh.selectedCharIds || [];
    const newSelected = selected.includes(charId)
      ? selected.filter(id => id !== charId)
      : [...selected, charId];
    update({ shots: allShots.map(s => s.id === sh.id ? { ...s, selectedCharIds: newSelected } : s) });
  };

  // ========== 场景资产（保证场景一致性） ==========
  const scenes = project.materials?.scenes || [];

  // 容错解析LLM返回的JSON数组（兼容```json代码块包裹）
  const extractJsonArray = (text) => {
    const t = (text || "").trim();
    try { return JSON.parse(t); } catch (e) {}
    try {
      const m = t.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (m) return JSON.parse(m[0]);
    } catch (e) {}
    return null;
  };

  const updateScenes = (newScenes) => {
    update({ materials: { ...(project.materials || {}), scenes: newScenes } });
  };

  // 刷新积分余额显示
  const refreshBalanceAfter = async () => {
    if (!isLoggedIn()) return;
    try {
      const b = await getCreditBalance();
      if (window.onCreditUpdate) window.onCreditUpdate(b.balance || b.credits || 0);
      if (window.refreshUserInfo) window.refreshUserInfo();
    } catch (e) {}
  };

  // AI分析剧本场景：从所有分镜中提取常用场景（名称/描述/生图提示词）
  const analyzeScenes = async () => {
    if (analyzingScenes) return;
    if (!isLoggedIn()) { alert("请先登录后再使用场景分析功能"); return; }
    const scenePrice = getPrice("llm_scene_extract", 1.0);
    try {
      const precheck = await precheckCredits(scenePrice, "text", "AI分析剧本场景");
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${scenePrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！场景分析需要${scenePrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    setAnalyzingScenes(true);
    log("正在分析剧本场景...");
    try {
      // 场景构图描述跟随用户画幅选择
      const sceneCompDesc = resolution.includes("竖") ? "竖屏9:16竖向构图，画面纵向纵深，主体居中或黄金分割位，留出上下层次" : (resolution.includes("方") || resolution.includes("1:1")) ? "方形1:1构图，主体居中，四周留白层次" : "横幅16:9横向构图，画面开阔，主体居中或黄金分割位，留出天空与地面层次";
      const shotTexts = allShots.filter(Boolean).map(s =>
        `- ${s.title || "未命名"}｜${s.sceneType || "未知"}\n  描述：${s.sceneDesc || "无"}${s.dialogue ? `\n  台词：${s.dialogue}` : ""}`
      ).join("\n");
      const prompt = `你是专业的短剧场景美术指导。请从以下分镜列表中分析出整部剧出现的所有场景（地点/环境），并为每个场景生成：
1. 场景名称（简洁，如"雨夜小巷"）
2. 场景描述（一句话说明场景的核心特征）
3. 场景生图提示词（60-120字，必须包含：环境主体与空间结构、时代风格、光影色调、氛围情绪、关键道具元素，可直接用于AI生图）

严格要求：
- 【重要·纯场景空镜】场景提示词必须是空无一人的环境空镜：严禁出现任何人、人群、人潮、人影、背影、半身像、脸、手、脚等任何人体或身体部位；严禁兵器被人握持、手持道具等动作描写；"万头攒动/人潮涌动"等一律转化为空旷的广场、台阶、街道等无人环境
- 【构图】${sceneCompDesc}
- 合并相同/相似场景（"小巷"与"深夜小巷"算同一个）
- 按出现频率排序，最多12个场景
- 只输出JSON数组，不要任何其他文字或markdown代码块，格式：
[{"name":"场景名","desc":"场景描述","prompt":"场景生图提示词"}]

分镜列表：
${shotTexts}`;
      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 16384 }),
      });
      const arr = extractJsonArray(res.text);
      if (!arr || !Array.isArray(arr) || arr.length === 0) throw new Error("LLM返回格式无法解析");
      const valid = arr
        .filter(s => s && (s.name || s.prompt))
        .map((s, i) => ({
          id: "scene_" + Date.now() + "_" + i + "_" + Math.random().toString(36).substring(2, 6),
          name: String(s.name || `场景${i + 1}`).trim(),
          desc: String(s.desc || "").trim(),
          prompt: String(s.prompt || s.desc || s.name || "").trim(),
          image: "",
          source: "analyze",
        }));
      // 合并：分析结果与已有场景按名称去重，已有的保留原数据（含已生成图片）
      const merged = [];
      for (const ns of valid) {
        const exist = scenes.find(o => o.name === ns.name);
        merged.push(exist ? { ...exist } : ns);
      }
      for (const os of scenes) {
        if (!valid.find(ns => ns.name === os.name)) merged.push(os);
      }
      updateScenes(merged);
      setShowScenePanel(true);
      log(`✅ 场景分析完成：识别 ${valid.length} 个场景（合并后共 ${merged.length} 个）`);
      await refreshBalanceAfter();
    } catch (err) {
      log(`❌ 场景分析失败：${err.message}`);
    } finally {
      setAnalyzingScenes(false);
    }
  };

  // AI优化单个场景提示词
  const refineScenePrompt = async (scene) => {
    if (refiningSceneId) return;
    if (!isLoggedIn()) { alert("请先登录后再使用场景提示词优化"); return; }
    const price = getPrice("llm_scene_refine", 1.0);
    try {
      const precheck = await precheckCredits(price, "text", `优化场景提示词：${scene.name}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${price}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！提示词优化需要${price}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    setRefiningSceneId(scene.id);
    log(`正在优化场景「${scene.name}」提示词...`);
    try {
      // 输入净化：剥离"人物：xxx"、△动作行、尺寸/画幅词（16:9/横幅等），只留环境线索喂给LLM
      const stripSize = (s) => (s || "").replace(/[0-9]+\s*[:：x×]\s*[0-9]+/g, "").replace(/横幅|竖幅|横屏|竖屏|横版|竖版|横构图|竖构图|横构图/g, "");
      const envDesc = stripSize((scene.desc || "").replace(/人物：[^\n。；]*/g, "").replace(/△[^\n]*/g, "").replace(/【[^】]*】/g, "").trim() || scene.name);
      const envPrompt = stripSize((scene.prompt || "").replace(/人物：[^\n。；]*/g, "").replace(/△[^\n]*/g, "").replace(/【[^】]*】/g, "").trim() || "");
      const prompt = `你是专业的AI生图提示词工程师。请优化以下场景的生图提示词，使其更精致、可直接用于AI生图。
要求：1. 60-120字；2. 包含：环境主体与空间结构、时代风格、光影色调、氛围情绪、关键道具；3. 只输出提示词本身，不要解释、不要markdown代码块；4. 不要包含任何画幅/尺寸/构图方向描述（如16:9、9:16、1:1、横屏、竖屏、横幅、横版、竖版），画幅比例由生成图片时按用户选择统一控制。
【重要·纯场景空镜】这是场景概念图，必须是空无一人的环境空镜：严禁出现任何人、人群、人潮、人影、背影、脸、手、脚等任何人体或身体部位；严禁"铁手套握飞针"等任何手持兵器/道具的动作描写；"万头攒动/人潮涌动"等一律改为空旷的广场、台阶、街道等无人环境；忽略下面描述中的全部人物、动作、台词细节，只提炼环境本身：空间结构、建筑陈设、自然景观、天气、无人场景道具、光影色调、氛围情绪。

场景名称：${scene.name}
环境描述：${envDesc}
当前提示词：${envPrompt || "无"}`;
      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 8192 }),
      });
      const text = (res.text || "").trim();
      if (!text) throw new Error("LLM未返回内容");
      updateScenes(scenes.map(s => s.id === scene.id ? { ...s, prompt: text } : s));
      log(`✅ 场景「${scene.name}」提示词已优化（${text.length}字符）`);
      await refreshBalanceAfter();
    } catch (err) {
      log(`❌ 提示词优化失败：${err.message}`);
    } finally {
      setRefiningSceneId("");
    }
  };

  // AI生成场景参考图（Qwen-Image，保证场景一致性）
  const genSceneImage = async (scene) => {
    if (generatingSceneId) return;
    if (!isLoggedIn()) { alert("请先登录后再使用场景生图功能"); return; }
    const imgPrice = getPrice("image_generate", 3.0);
    try {
      const precheck = await precheckCredits(imgPrice, "image", `场景生图：${scene.name}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${imgPrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！生成场景图需要${imgPrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    setGeneratingSceneId(scene.id);
    log(`正在生成场景「${scene.name}」图片...`);
    try {
      const prompt = scene.prompt || scene.desc || scene.name;
      // 场景图比例：横屏固定 1672×941（16:9 横版场景参考图）；竖屏/方形保持原尺寸
      const sceneSize = resolution.includes("竖") ? "928x1664" : (resolution.includes("方") || resolution.includes("1:1")) ? "1328x1328" : "1672x941";
      const res = await generateImage({ prompt, model: "Qwen/Qwen-Image", size: sceneSize, n: 1 });
      const imageUrl = res.image_url || res.url || (res.images && res.images[0]) || res.result_url;
      if (!imageUrl) throw new Error("未返回图片地址");
      updateScenes(scenes.map(s => s.id === scene.id ? { ...s, image: imageUrl } : s));
      // 同时存入素材库
      try {
        const currentAssets = project?.assets || [];
        const newImageAsset = {
          id: "a_scene_image_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "image",
          title: `${scene.name}场景图（${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}）`,
          url: imageUrl,
          status: "ready",
          tags: ["场景生图", scene.name],
          favorite: false,
          sceneId: scene.id,
          sceneName: scene.name,
          createdAt: Date.now(),
        };
        update({ assets: [newImageAsset, ...currentAssets] });
        log(`✅ 场景图已存入素材库：${newImageAsset.title}`);
      } catch (e) {
        log(`⚠️ 场景图存入素材库失败：${e.message}`);
      }
      log(`✅ 场景「${scene.name}」图片生成成功`);
      await refreshBalanceAfter();
    } catch (err) {
      log(`❌ 场景生图失败：${err.message}`);
    } finally {
      setGeneratingSceneId("");
    }
  };

  // AI 图生图（X99 IPAdapter 风格迁移）：以「其他场景图 / 素材库图」为风格参考，生成当前场景
  // 参考的是已有的图（如上一个场景），把它的画风迁移到当前场景，实现全剧场景风格统一
  const genSceneImageX99 = async (scene, refImageUrl, refTitle) => {
    if (generatingSceneId) return;
    if (!isLoggedIn()) { alert("请先登录后再使用场景图生图功能"); return; }
    if (!refImageUrl) {
      alert("请先选择一张参考图（其他场景图或素材库图片）");
      return;
    }
    const imgPrice = getPrice("image_generate", 3.0);
    try {
      const precheck = await precheckCredits(imgPrice, "image", `场景图生图：${scene.name}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${imgPrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！场景图生图需要${imgPrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    setGeneratingSceneId(scene.id);
    log(`以「${refTitle || "参考图"}」为风格参考生成「${scene.name}」（X99 风格迁移）...`);
    try {
      const prompt = scene.prompt || scene.desc || scene.name;
      const seed = Math.floor(Math.random() * 2147483647);
      const res = await img2imgImage({ image_url: refImageUrl, prompt, negative_prompt: "", seed });
      const imageUrl = res.image_url || res.url || (res.images && res.images[0]) || res.result_url;
      if (!imageUrl) throw new Error("未返回图片地址");
      updateScenes(scenes.map(s => s.id === scene.id ? { ...s, image: imageUrl } : s));
      // 同时存入素材库
      try {
        const currentAssets = project?.assets || [];
        const newImageAsset = {
          id: "a_scene_image_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "image",
          title: `${scene.name}场景图（X99风格迁移 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}）`,
          url: imageUrl,
          status: "ready",
          tags: ["场景生图", scene.name],
          favorite: false,
          sceneId: scene.id,
          sceneName: scene.name,
          createdAt: Date.now(),
        };
        update({ assets: [newImageAsset, ...currentAssets] });
        log(`✅ 场景图已存入素材库：${newImageAsset.title}`);
      } catch (e) {
        log(`⚠️ 场景图存入素材库失败：${e.message}`);
      }
      log(`✅ 场景「${scene.name}」图生图成功（X99 风格迁移）`);
      await refreshBalanceAfter();
    } catch (err) {
      log(`❌ 场景图生图失败：${err.message}`);
    } finally {
      setGeneratingSceneId("");
    }
  };

  // 图生图参考图候选：其他场景的图 + 素材库图片（去重）
  const x99Candidates = (() => {
    if (!x99RefPicker) return [];
    const others = (scenes || [])
      .filter(s => s.id !== x99RefPicker.sceneId && s.image)
      .map(s => ({ id: "scene_" + s.id, title: `${s.name}（场景图）`, url: s.image }));
    const assets = (project?.assets || [])
      .filter(a => a.type === "image" && a.url)
      .map(a => ({ id: "asset_" + a.id, title: a.title || "素材图", url: a.url }));
    const seen = new Set();
    return [...others, ...assets].filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; });
  })();
  const x99RefScene = x99RefPicker ? scenes.find(s => s.id === x99RefPicker.sceneId) : null;

  // 添加场景（手动）
  const saveNewScene = () => {
    const name = newSceneName.trim();
    if (!name) { alert("请填写场景名称"); return; }
    const newScene = {
      id: "scene_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      name,
      desc: newSceneDesc.trim(),
      prompt: newScenePrompt.trim() || name,
      image: "",
      source: "manual",
    };
    updateScenes([...scenes, newScene]);
    setAddingScene(false);
    setNewSceneName(""); setNewSceneDesc(""); setNewScenePrompt("");
    log(`✅ 已添加场景「${name}」`);
  };

  // 保存场景编辑
  const saveEditScene = () => {
    if (!editingScene) return;
    const name = editingScene.name.trim();
    if (!name) { alert("场景名称不能为空"); return; }
    updateScenes(scenes.map(s => s.id === editingScene.id
      ? { ...s, name, desc: editingScene.desc.trim(), prompt: editingScene.prompt.trim() }
      : s));
    setEditingScene(null);
    log(`场景「${name}」已更新`);
  };

  // 删除场景
  const deleteScene = (scene) => {
    if (!window.confirm(`确定删除场景「${scene.name}」吗？删除后分镜的场景绑定也会解除。`)) return;
    updateScenes(scenes.filter(s => s.id !== scene.id));
    update({ shots: allShots.map(s => s.selectedSceneId === scene.id ? { ...s, selectedSceneId: null } : s) });
    log(`已删除场景「${scene.name}」`);
  };

  // 切换分镜绑定的场景（单选）
  const toggleSceneSelection = (sh, sceneId) => {
    const newVal = sh.selectedSceneId === sceneId ? null : sceneId;
    update({ shots: allShots.map(s => s.id === sh.id ? { ...s, selectedSceneId: newVal } : s) });
  };

  // 找上一个分镜（同集内，按顺序）
  const getPrevShot = (sh) => {
    if (!sh) return null;
    const idx = shots.findIndex(s => s && s.id === sh.id);
    if (idx <= 0) return null;
    // 只找同集的上一个分镜，且必须有有效videoUrl
    const sameEp = shots.filter(s => s && s.episodeId === sh.episodeId);
    const sameIdx = sameEp.findIndex(s => s && s.id === sh.id);
    if (sameIdx > 0) {
      const prev = sameEp[sameIdx - 1];
      if (prev && prev.videoUrl && prev.videoUrl.startsWith("http")) {
        return prev;
      }
    }
    return null;
  };

  // 获取本集内下一分镜（用于R2V尾帧）
  const getNextShot = (sh) => {
    if (!sh) return null;
    const sameEp = shots.filter(s => s && s.episodeId === sh.episodeId);
    const sameIdx = sameEp.findIndex(s => s && s.id === sh.id);
    if (sameIdx >= 0 && sameIdx < sameEp.length - 1) {
      return sameEp[sameIdx + 1];
    }
    return null;
  };

  const genVideo = async (sh) => {
    if (busyRef.current[sh.id]) return; // 同步锁：同一分镜防重复提交
    setBusy(sh.id);
    log(`开始生成视频：${sh.title}（${selectedMode.toUpperCase()}）`);
    try {
      // 未登录用户不能使用（移进try，确保异常不静默）
      if (!isLoggedIn()) {
        alert("请先登录后再使用视频生成功能");
        clearBusy(sh.id);
        return;
      }
      // 积分预校验：按模式+分辨率分别定价
      const pricePerSec = getVideoPricePerSec(selectedMode, resolution, videoProvider);
      const needCredits = pricePerSec * duration;
      log(`正在校验积分（需要${needCredits}积分）…`);
      try {
        const precheck = await precheckCredits(needCredits, "video", `视频生成：${sh.title}`);
        if (!precheck.sufficient && precheck.sufficient !== undefined) {
          log(`❌ 积分不足：需要${needCredits}积分，当前余额${precheck.balance || 0}积分`);
          alert(`积分不足！生成此视频需要${needCredits}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
          clearBusy(sh.id);
          return;
        }
        log(`积分预校验通过：需要${needCredits}积分，余额充足`);
      } catch (e) {
        log(`⚠️ 积分预校验失败（${e.message}），继续生成`);
      }

      // 分镜绑定的场景（用于场景一致性：场景参考图 + 场景设定并入提示词）
      const boundScene = scenes.find(sc => sc.id === sh.selectedSceneId);

      const sceneType = sh.sceneType || "中景";
      const cameraMove = sh.cameraMove || "固定";
      const shotDuration = duration;

      // 获取当前选择的风格描述
      const styleObj = VIDEO_STYLES.find(s => s.key === selectedStyle);
      const styleDesc = styleObj ? styleObj.desc : "";

      // 动态生成构图描述（根据用户选择的分辨率）
      let compositionDesc = "";
      if (resolution.includes("竖")) {
        compositionDesc = "竖屏9:16构图";
      } else if (resolution.includes("横")) {
        compositionDesc = "横屏16:9构图";
      } else if (resolution.includes("1:1") || resolution.includes("方")) {
        compositionDesc = "方形1:1构图";
      }

      // 事件描述：分镜标题 + 分镜描述
      const eventTitle = sh.title || "";
      const eventDesc = sh.sceneDesc || "";
      const eventFullDesc = eventTitle ? `${eventTitle}。${eventDesc}` : eventDesc;

      // 视频提示词：优先 H3 结构化细化（summary+detailed_description），其次 AI 细化中文提示词，最后默认模板
      // 画质前置词（按风格选择）统一放最前，硬性约束全风格生效
      const qualityPrefix = getQualityPrefix(selectedStyle);
      // 尝试解析 promptCn 为 H3 结构化 JSON（细化输出格式）
      let h3Refined = null;
      if (sh.promptCn) {
        try {
          const candidate = sh.promptCn.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(candidate);
          if (parsed && parsed.detailed_description) h3Refined = parsed;
        } catch (e) { /* 非 JSON，走旧逻辑 */ }
      }
      let videoPrompt;
      let h3Payload = null;
      if (h3Refined) {
        // H3 结构化模式：画质/风格/构图/场景设定并入 summary（detailed_description 保持镜头化原文，不破坏 H3 结构）
        const styleInject = [styleDesc, compositionDesc].filter(Boolean).join("。");
        const sceneText = boundScene ? [boundScene.name, boundScene.prompt || boundScene.desc].filter(Boolean).join("。") : "";
        const summaryParts = [h3Refined.summary || "", `${qualityPrefix}${QUALITY_HARD_RULES}`.trim()];
        if (styleInject) summaryParts.push(styleInject);
        if (sceneText) summaryParts.push(`场景设定：${sceneText}`);
        h3Payload = {
          summary: summaryParts.filter(Boolean).join("。"),
          detailed_description: h3Refined.detailed_description,
        };
        videoPrompt = `${qualityPrefix}${QUALITY_HARD_RULES}。${h3Refined.detailed_description}。${styleInject}${sceneText ? "。场景设定：" + sceneText : ""}`;
        log(`使用 H3 规范化提示词（summary ${h3Payload.summary.length}字符 + detailed_description ${h3Refined.detailed_description.length}字符）+ 风格：${styleObj?.label || "默认"}`);
      } else if (sh.promptCn && sh.promptCn.length > 50) {
        videoPrompt = sh.promptCn;
        // 在AI细化提示词前后追加：画质前置词（前缀）+ 风格描述、构图描述
        const suffixParts = [];
        if (styleDesc) suffixParts.push(styleDesc);
        if (compositionDesc) suffixParts.push(compositionDesc);
        videoPrompt = `${qualityPrefix}${QUALITY_HARD_RULES}。${videoPrompt}。${suffixParts.join("。")}`;
        log(`使用AI细化提示词（${sh.promptCn.length}字符）+ 画质前缀：${selectedStyle} + 风格：${styleObj?.label || "默认"} + 构图：${compositionDesc || "默认"}`);
      } else {
        videoPrompt = `${qualityPrefix}${QUALITY_HARD_RULES}。${sceneType}镜头，${cameraMove}运镜，时长${shotDuration}秒。${eventFullDesc}。${styleDesc ? styleDesc + "。" : ""}${compositionDesc ? compositionDesc + "。" : ""}`;
        log(`使用默认模板提示词 + 画质前缀：${selectedStyle} + 风格：${styleObj?.label || "默认"} + 构图：${compositionDesc || "默认"}（建议先点击AI细化提示词）`);
      }

      // 场景一致性：非 H3 结构化模式时并入分镜绑定场景的设定（H3 模式已并入 summary）
      if (boundScene && !h3Payload) {
        const sceneText = [boundScene.name, boundScene.prompt || boundScene.desc].filter(Boolean).join("。");
        videoPrompt += `。场景设定：${sceneText}`;
        log(`已并入场景「${boundScene.name}」设定，保证场景一致性`);
      }

      // AutoDL ComfyUI工作流参数
      const workflowParams = {
        prompt: videoPrompt,
        duration: (videoProvider === "wan22" && (selectedMode === "i2v" || selectedMode === "s2v") && duration >= 30)
          ? duration
          : Math.min(10, shotDuration),
        resolution: resolution,
        ...(h3Payload ? { h3_prompt: h3Payload } : {}),
      };

      let refIdx = 0;
      let hasFirstFrame = false;

      if (selectedMode === "i2v" || selectedMode === "s2v") {
        // 图生视频（API-U01 / wan22 人物参考）：使用人物+场景参考图；s2v=人物+场景参考，i2v+prem=首帧+人物+场景
        const charImages = getShotCharacterImages(sh);
        const selChars = characters.filter(c => (sh.selectedCharIds || []).includes(c.id) && (c.fourView || c.image));
        const subjectNames = selChars.map(c => c.name || "").filter(Boolean);
        // 角色外观描述（与 ref_image 人物图顺序一一对应）：H3 锁人物需要「文字外观 + <Picture N> 图片引用」双重锚定
        const subjectDescs = selChars.map(c => extractAppearance(c) || "").filter(Boolean);
        let refIdx = 0;
        if (charImages.length === 0) {
          log("ℹ️ 本分镜未绑定人物图，按无人物参考生成（仅场景参考图 + 提示词）");
        } else {
          // 1. 上传人物参考图（从ref_image_0开始，最多9张）
          log(`找到${charImages.length}张角色图，开始上传…`);
          for (let i = 0; i < charImages.length; i++) {
            if (refIdx >= 9) break; // lightx2v_v5支持ref_image_0到ref_image_8共9张
            const img = charImages[i];
            log(`正在上传第${i + 1}张角色图…`);
            const charPublicUrl = await uploadImageToServer(img, log);
            if (charPublicUrl) {
              workflowParams[`ref_image_${refIdx}`] = charPublicUrl;
              log(`第${i + 1}张角色图上传成功，ref_image_${refIdx} = ${charPublicUrl.substring(0, 80)}...`);
              refIdx++;
            } else {
              log(`❌ 第${i + 1}张角色图上传失败`);
            }
          }
        }
        const charCount = refIdx; // 人物参考图数量

        // 1.5 上传场景参考图（分镜绑定了场景且有场景图时，人物图之后追加，保证场景一致性）
        if (boundScene && boundScene.image) {
          log(`找到场景「${boundScene.name}」参考图，开始上传…`);
          const scenePublicUrl = await uploadImageToServer(boundScene.image, log);
          if (scenePublicUrl && refIdx < 9) {
            workflowParams[`ref_image_${refIdx}`] = scenePublicUrl;
            log(`场景参考图上传成功，ref_image_${refIdx} = ${scenePublicUrl.substring(0, 80)}...`);
            refIdx++;
          } else {
            log(`⚠️ 场景参考图上传失败或参考图已达上限（${refIdx}/9），仅用人物参考图`);
          }
        }

        // 2. 添加随机种子（seed）
        const seed = Math.floor(Math.random() * 2147483647);
        workflowParams.seed = seed;
        log(`随机种子：${seed}`);
        if (subjectNames.length > 0) {
          workflowParams.subject_names = subjectNames;
          log(`角色参考绑定：${subjectNames.join("、")}`);
        }
        if (subjectDescs.length > 0) {
          workflowParams.subject_descs = subjectDescs;
          log(`角色外观描述绑定：${subjectDescs.length}个角色，首角色描述：${subjectDescs[0].substring(0, 60)}…`);
        }

        if (videoProvider === "wan22") {
          if (selectedMode === "s2v") {
            // 人物+场景参考模式：不依赖首帧，直接用人物+场景参考图
            log(`参考图：人物${charCount}张${charCount > 0 ? `（ref_image_0-ref_image_${charCount - 1}）` : ""}，人物+场景参考模式，不使用首帧`);
          } else {
            // 首帧+人物图模式：获取首帧（本分镜分镜图 / 上个视频尾帧 / 手动上传）
            log(`参考图：人物${charCount}张${charCount > 0 ? `（ref_image_0-ref_image_${charCount - 1}）` : ""}，首帧来源见下方设置`);
            let resolvedFirstFrame = null;
            let firstFrameDesc = "";
            if (firstFrameSource === "shot") {
              resolvedFirstFrame = sh.imageUrl;
              firstFrameDesc = `本分镜「${sh.title}」分镜图`;
            } else if (firstFrameSource === "prev_video") {
              const prevShot = getPrevShot(sh);
              if (prevShot && prevShot.videoUrl) {
                log(`找到上一镜「${prevShot.title}」视频，正在提取尾帧作为首帧…`);
                resolvedFirstFrame = await extractLastFrameViaAPI(prevShot.videoUrl, log);
                if (!resolvedFirstFrame) {
                  log("调度机提取失败，尝试前端提取…");
                  const firstFrame = await extractLastFrame(prevShot.videoUrl);
                  if (firstFrame) resolvedFirstFrame = await uploadImageToServer(firstFrame, log);
                }
                firstFrameDesc = `上一镜「${prevShot.title}」视频尾帧`;
              } else {
                throw new Error("首帧来源选择了「上个视频尾帧」，但上一镜没有生成视频。请先生成上一镜视频，或选择其他首帧来源。");
              }
            } else if (firstFrameSource === "custom") {
              resolvedFirstFrame = firstFrameUrl;
              firstFrameDesc = "用户手动上传";
            }
            if (!resolvedFirstFrame) {
              throw new Error(`首帧获取失败（来源：${firstFrameDesc}）。请检查图片是否有效，或选择其他首帧来源。`);
            }
            log(`首帧：${firstFrameDesc}`);
            const firstPublicUrl = await uploadImageToServer(resolvedFirstFrame, log);
            if (!firstPublicUrl) {
              throw new Error("首帧上传失败，请检查图片URL或重新上传。");
            }
            workflowParams.first_frame = firstPublicUrl;
            log(`首帧上传成功 ✓`);
          }
        } else {
          log(`参考图：人物${charCount}张${charCount > 0 ? `（ref_image_0-ref_image_${charCount - 1}）` : ""}，不使用首帧`);
        }
      } else if (selectedMode === "r2v") {
        // 首尾帧（minimax_h3_lightx2v）：首帧和尾帧都是必填，各有三种来源选择
        const prevShot = getPrevShot(sh);
        const nextShot = getNextShot(sh);

        // ========== 获取首帧 ==========
        let resolvedFirstFrame = null;
        let firstFrameDesc = "";

        if (firstFrameSource === "shot") {
          // 来源1：本分镜分镜图
          resolvedFirstFrame = sh.imageUrl;
          firstFrameDesc = `本分镜「${sh.title}」分镜图`;
        } else if (firstFrameSource === "prev_video") {
          // 来源2：上个视频的尾帧
          if (prevShot && prevShot.videoUrl) {
            log(`找到上一镜「${prevShot.title}」视频，正在提取尾帧作为首帧…`);
            resolvedFirstFrame = await extractLastFrameViaAPI(prevShot.videoUrl, log);
            if (!resolvedFirstFrame) {
              log("调度机提取失败，尝试前端提取…");
              const firstFrame = await extractLastFrame(prevShot.videoUrl);
              if (firstFrame) {
                resolvedFirstFrame = await uploadImageToServer(firstFrame, log);
              }
            }
            firstFrameDesc = `上一镜「${prevShot.title}」视频尾帧`;
          } else {
            throw new Error("首帧来源选择了「上个视频尾帧」，但上一镜没有生成视频。请先生成上一镜视频，或选择其他首帧来源。");
          }
        } else if (firstFrameSource === "custom") {
          // 来源3：用户手动上传
          resolvedFirstFrame = firstFrameUrl;
          firstFrameDesc = "用户手动上传";
        }

        if (!resolvedFirstFrame) {
          throw new Error(`首帧获取失败（来源：${firstFrameDesc}）。请检查图片是否有效，或选择其他首帧来源。`);
        }

        log(`首帧：${firstFrameDesc}`);
        const firstPublicUrl = await uploadImageToServer(resolvedFirstFrame, log);
        if (!firstPublicUrl) {
          throw new Error("首帧上传失败，请检查图片URL或重新上传。");
        }
        workflowParams.first_frame = firstPublicUrl;
        log(`首帧上传成功 ✓`);

        // ========== 获取尾帧（必填） ==========
        let resolvedLastFrame = null;
        let lastFrameDesc = "";

        if (lastFrameSource === "next_shot") {
          // 来源1：下一分镜分镜图
          if (nextShot && nextShot.imageUrl) {
            resolvedLastFrame = nextShot.imageUrl;
            lastFrameDesc = `下一分镜「${nextShot.title}」分镜图`;
          } else {
            throw new Error("尾帧来源选择了「下一分镜分镜图」，但下一分镜没有分镜图。请先生成下一分镜分镜图，或选择其他尾帧来源。");
          }
        } else if (lastFrameSource === "next_video") {
          // 来源2：下个视频的首帧
          if (nextShot && nextShot.videoUrl) {
            log(`找到下一镜「${nextShot.title}」视频，正在提取首帧作为尾帧…`);
            // 提取视频首帧
            try {
              const video = document.createElement("video");
              video.crossOrigin = "anonymous";
              video.src = nextShot.videoUrl;
              await new Promise((resolve, reject) => {
                video.onloadeddata = resolve;
                video.onerror = reject;
              });
              video.currentTime = 0;
              await new Promise((resolve) => {
                video.onseeked = resolve;
              });
              const canvas = document.createElement("canvas");
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(video, 0, 0);
              const firstFrameDataUrl = canvas.toDataURL("image/png");
              resolvedLastFrame = await uploadImageToServer(firstFrameDataUrl, log);
              lastFrameDesc = `下一镜「${nextShot.title}」视频首帧`;
            } catch (e) {
              log(`⚠️ 提取下一镜视频首帧失败：${e.message}`);
              throw new Error("尾帧来源选择了「下个视频首帧」，但提取下一镜视频首帧失败。请选择其他尾帧来源。");
            }
          } else {
            throw new Error("尾帧来源选择了「下个视频首帧」，但下一镜没有生成视频。请先生成下一镜视频，或选择其他尾帧来源。");
          }
        } else if (lastFrameSource === "custom") {
          // 来源3：用户手动上传
          resolvedLastFrame = lastFrameUrl;
          lastFrameDesc = "用户手动上传";
        }

        if (!resolvedLastFrame) {
          throw new Error(`尾帧获取失败（来源：${lastFrameDesc}）。尾帧是必填项，请检查图片是否有效，或选择其他尾帧来源。`);
        }

        log(`尾帧：${lastFrameDesc}`);
        const lastPublicUrl = await uploadImageToServer(resolvedLastFrame, log);
        if (!lastPublicUrl) {
          throw new Error("尾帧上传失败，请检查图片URL或重新上传。");
        }
        workflowParams.last_frame = lastPublicUrl;
        log(`尾帧上传成功 ✓`);

        log(`首尾帧（lightx2v）：首帧✓ 尾帧✓（均为必填）`);
      } else if (selectedMode === "ia2v") {
        // 全能参考（minimax_h3_image_audio_to_video_v2 / Ref2VA）：所有参数选填，支持最多9张参考图+3个参考音频
        // 1. 获取参考图片（优先用户手动上传，否则自动获取角色参考图，和I2V一样）
        let refImages = [];
        if (refImageUrl) {
          // 用户手动上传了参考图，优先使用
          refImages.push(refImageUrl);
          log("参考图片：使用用户手动上传的参考图");
        } else {
          // 自动获取角色参考图（和I2V一样）
          const charImages = getShotCharacterImages(sh);
          if (charImages.length > 0) {
            refImages = charImages;
            log(`参考图片：自动获取 ${charImages.length} 张角色参考图`);
          } else {
            log("⚠️ 没有角色参考图，也没有手动上传参考图，将纯文本生成");
          }
        }

        // 2. 上传参考图片（ref_image_0~8，最多9张）
        let refImgIdx = 0;
        for (let i = 0; i < refImages.length; i++) {
          if (refImgIdx >= 9) break;
          const img = refImages[i];
          const imgPublicUrl = await uploadImageToServer(img, log);
          if (imgPublicUrl) {
            workflowParams[`ref_image_${refImgIdx}`] = imgPublicUrl;
            refImgIdx++;
          }
        }

        // 3. 添加参考音频（ref_audio_0~2，最多3个，选填）
        let audioIdx = 0;
        for (let i = 0; i < refAudioUrls.length; i++) {
          const audioUrl = refAudioUrls[i]?.trim();
          if (audioUrl && audioUrl.startsWith("http")) {
            workflowParams[`ref_audio_${audioIdx}`] = audioUrl;
            audioIdx++;
          }
        }
        if (audioIdx === 0) {
          log("ℹ️ 未填写参考音频，将不使用音频参考");
        }

        // 4. 添加随机种子（seed）
        const seed = Math.floor(Math.random() * 2147483647);
        workflowParams.seed = seed;
        log(`随机种子：${seed}`);
        // 角色参考绑定（与 i2v/s2v 分支一致：从已选角色提取名字，H3 锁人物用）
        const ia2vSelChars = characters.filter(c => (sh.selectedCharIds || []).includes(c.id) && (c.fourView || c.image));
        const ia2vSubjectNames = ia2vSelChars.map(c => c.name || "").filter(Boolean);
        if (ia2vSubjectNames.length > 0) {
          workflowParams.subject_names = ia2vSubjectNames;
          log(`角色参考绑定：${ia2vSubjectNames.join("、")}`);
        }

        // 5. duration 已经在 workflowParams 中设置了（1-10秒）
        log(`全能参考（Ref2VA v2）：参考图${refImgIdx}张 + 参考音频${audioIdx}个 + 时长${workflowParams.duration}秒`);
      } else if (selectedMode === "lipsync") {
        // 对口型（minimax_h3_image_audio_to_video 对口型工作流）：人物图 + 配音音频 → AI对口型视频
        // 1. 人物参考图（必填，取第一张）
        const charImages = getShotCharacterImages(sh);
        let lipCharUrl = null;
        if (charImages.length > 0) {
          log(`找到${charImages.length}张角色图，上传第1张用于对口型…`);
          lipCharUrl = await uploadImageToServer(charImages[0], log);
          if (lipCharUrl) {
            workflowParams.ref_image_0 = lipCharUrl;
            log(`对口型人物图上传成功，ref_image_0 = ${lipCharUrl.substring(0, 80)}...`);
          } else {
            throw new Error("对口型人物图上传失败，请检查人物参考图是否有效。");
          }
        } else {
          throw new Error("对口型模式必须绑定至少一张人物图（选择分镜人物或上传参考图）。");
        }

        // 2. 配音音频（必填）
        const lipAudio = (refAudioUrls[0] || "").trim();
        if (!lipAudio || !lipAudio.startsWith("http")) {
          throw new Error("对口型模式必须提供配音音频（请在音频素材中选择或填写音频URL）。");
        }
        workflowParams.ref_audio_0 = lipAudio;
        log(`对口型音频绑定：${lipAudio.substring(0, 80)}...`);

        // 3. 提示词：优先细化后的 summary（对口型动作描述），回退原始分镜
        const lipPrompt = (h3Payload && h3Payload.summary) ? h3Payload.summary : videoPrompt;
        workflowParams.prompt = lipPrompt;
        log(`对口型提示词：${lipPrompt.substring(0, 80)}...`);

        // 4. 随机种子
        const lipSeed = Math.floor(Math.random() * 2147483647);
        workflowParams.seed = lipSeed;
        log(`随机种子：${lipSeed}`);
        log(`对口型（LipSync）：人物图1张 + 音频1个 + 时长${workflowParams.duration}秒`);
      }
      // t2v：不传参考图

      // 根据模式选择不同的工作流ID（标准生成=实例面板工作流，高级生成=自部署 MiniMax H3 锁脸链路）
      let currentWorkflowId;
      if (videoProvider === "wan22") {
        currentWorkflowId = selectedMode === "s2v" ? WAN22_WORKFLOW_ID + "_s2v" : WAN22_WORKFLOW_ID + "_i2v"; // 自部署 MiniMax H3（保留不动）
      } else if (selectedMode === "i2v" || selectedMode === "s2v") {
        currentWorkflowId = I2V_WORKFLOW_ID; // API-U01 minimax_h3 基础版（人物/场景参考图锁脸）
      } else if (selectedMode === "r2v") {
        currentWorkflowId = R2V_WORKFLOW_ID; // API-G02 Wan2.2 首尾帧
      } else if (selectedMode === "ia2v") {
        currentWorkflowId = IA2V_WORKFLOW_ID; // API-U06 9图3音频
      } else if (selectedMode === "lipsync") {
        currentWorkflowId = LIPSYNC_WORKFLOW_ID; // API-U11 图片音频对口型
      } else {
        currentWorkflowId = T2V_WORKFLOW_ID; // API-U03 文生视频加速版
      }

      // 根据模式限制duration（I2V=1-10秒，R2V/T2V=1-15秒）；长视频（30/60秒潜空间接力）不限制
      if (!(videoProvider === "wan22" && (selectedMode === "i2v" || selectedMode === "s2v") && duration >= 30)) {
        const maxDuration = getMaxDuration(selectedMode);
        workflowParams.duration = Math.min(maxDuration, Math.max(1, workflowParams.duration));
      }

      // ===== 长视频（高级生成·分段续接）：30/60 秒，每 10 秒一段，段间尾帧衔接 =====
      const isLongVideo = (videoProvider === "wan22" && (selectedMode === "i2v" || selectedMode === "s2v") && duration >= 30);
      let res;
      if (isLongVideo) {
        // U02 潜空间接力（EndlessH3）：分镜切成 10s 段，段间 latent 接力 + 参考图锁脸，实例端无缝合成
        const SEG_SEC = 10;
        const totalSegs = Math.round(duration / SEG_SEC);
        const shots = [];
        for (let i = 0; i < totalSegs; i++) {
          const segParams = { ...workflowParams, duration: SEG_SEC };
          delete segParams.first_frame; // 潜空间接力不需要首帧（latent 直接续接）
          delete segParams.h3_prompt;   // U02 用 prompt 字段拼 H3 结构化（调度机按 subject_names 重建锁脸定义）
          shots.push(segParams);
        }
        log(`🎬 长视频模式（U02 潜空间接力）：${totalSegs} 段 × ${SEG_SEC} 秒 = ${totalSegs * SEG_SEC} 秒，参考图全程锁脸`);
        const shotsRes = await runDispatchJob({
          type: "video_shots",
          payload: {
            shots,
            resolution,
            provider: videoProvider,
            total_duration: duration, // 计费用（pricing video_shots 按总秒数）
          },
          pollInterval: 5000,
          timeoutMs: 7200000,
          onProgress: (progress, text, info) => {
            setGenProgress(prev => ({ ...prev, [sh.id]: { text: `长视频 · ${text}`, ...info } }));
          }
        });
        res = { resultUrl: shotsRes.resultUrl };
        log(`✅ 长视频生成完成：${totalSegs * SEG_SEC} 秒（${shotsRes.resultUrl.substring(0, 80)}…）`);
            } else {
        log(`提交视频生成任务，工作流：${currentWorkflowId}，模式：${selectedMode}`);

        res = await runDispatchJob({
          type: "video",
          payload: {
            workflow: currentWorkflowId,
            model: videoProvider === "wan22" ? "MiniMax-H3-A14B" : "MiniMax-H3",
            mode: selectedMode,
            provider: videoProvider,
            ...workflowParams,
          },
          pollInterval: 5000,
          timeoutMs: 7200000,
          onProgress: (progress, text, info) => {
            setGenProgress(prev => ({ ...prev, [sh.id]: { text, ...info } }));
          }
        });
      }

      // 获取视频实际时长并更新
      const actualDuration = await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(Math.round(v.duration));
        v.onerror = () => resolve(null);
        v.src = res.resultUrl;
      });
      const durationUpdate = actualDuration ? { duration: actualDuration } : {};

      // 1. 更新分镜的videoUrl（函数式更新：并发生成多个分镜时互不覆盖）
      update((p) => ({ ...p, shots: p.shots.map(s => s.id === sh.id ? { ...s, videoUrl: res.resultUrl, ...durationUpdate } : s) }));
      // 2. 同时存入素材库（根据用户设置控制是否自动存入）
      if (getAppSetting("autoAddToAssets", true)) {
        try {
          const newVideoAsset = {
            id: "a_video_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
            type: "video",
            title: `${sh.title}（${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
            url: res.resultUrl,
            status: "ready",
            tags: ["视频生成", selectedMode.toUpperCase(), sh.episodeId ? `第${sh.episodeId}集` : ""].filter(Boolean),
            favorite: false,
            shotId: sh.id,
            episodeId: sh.episodeId || "",
            duration: actualDuration || duration,
            resolution: resolution,
            mode: selectedMode,
            createdAt: Date.now()
          };
          // 函数式更新：并发存入素材库时基于最新列表，不互相覆盖
          update((p) => ({ ...p, assets: [newVideoAsset, ...(p.assets || [])] }));
          log(`✅ 视频已存入素材库：${newVideoAsset.title}`);
        } catch (e) {
          log(`⚠️ 视频存入素材库失败：${e.message}`);
        }
      }
      log(`✅ 视频生成成功：${sh.title}${actualDuration ? `（实际时长${actualDuration}秒）` : ""}`);

      // 积分扣减已移至后端（/api/jobs/submit 按真实时长/分辨率/模式扣费），前端仅刷新余额显示
      if (isLoggedIn()) {
        try {
          const balanceData = await getCreditBalance();
          if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
          if (window.refreshUserInfo) window.refreshUserInfo();
        } catch (e) {}
      }
    } catch (e) {
      log(`❌ 视频生成失败：${e.message}`);
    } finally {
      clearBusy(sh.id);
      setGenProgress(prev => { const next = { ...prev }; delete next[sh.id]; return next; });
    }
  };

  // ===== 多分镜合并生成长视频（选 3-6 个分镜 → H3 续接生成一条长视频） =====
  const toggleMergeSelect = (id) => {
    setMergeSelected(prev => {
      const n = { ...prev };
      if (n[id]) { delete n[id]; return n; }
      if (Object.keys(n).length >= 6) { alert("最多选择 6 个分镜"); return prev; }
      n[id] = true;
      return n;
    });
  };

  const buildMergedShotPrompt = (sh) => {
    const sceneType = sh.sceneType || "中景";
    const cameraMove = sh.cameraMove || "固定";
    const shotDuration = sh.duration || duration || 5;
    const styleObj = VIDEO_STYLES.find(s => s.key === selectedStyle);
    const styleDesc = styleObj ? styleObj.desc : "";
    let compositionDesc = "";
    if (resolution.includes("竖")) compositionDesc = "竖屏9:16构图";
    else if (resolution.includes("横")) compositionDesc = "横屏16:9构图";
    else if (resolution.includes("1:1") || resolution.includes("方")) compositionDesc = "方形1:1构图";
    const eventFullDesc = (sh.title || "") + (sh.sceneDesc ? "。" + sh.sceneDesc : "");
    const qualityPrefix = getQualityPrefix(selectedStyle);
    // 兼容 H3 结构化细化（JSON）：取 detailed_description 作为可拼接文本
    let refinedText = sh.promptCn || "";
    if (refinedText) {
      try {
        const candidate = refinedText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        const parsed = JSON.parse(candidate);
        if (parsed && parsed.detailed_description) refinedText = parsed.detailed_description;
      } catch (e) { /* 非 JSON，保留原文 */ }
    }
    let videoPrompt;
    if (refinedText && refinedText.length > 50) {
      const suffixParts = [];
      if (styleDesc) suffixParts.push(styleDesc);
      if (compositionDesc) suffixParts.push(compositionDesc);
      videoPrompt = `${qualityPrefix}${QUALITY_HARD_RULES}。${refinedText}。${suffixParts.join("。")}`;
    } else {
      videoPrompt = `${qualityPrefix}${QUALITY_HARD_RULES}。${sceneType}镜头，${cameraMove}运镜，时长${shotDuration}秒。${eventFullDesc}。${styleDesc ? styleDesc + "。" : ""}${compositionDesc ? compositionDesc + "。" : ""}`;
    }
    const boundScene = scenes.find(sc => sc.id === sh.selectedSceneId);
    if (boundScene) {
      const sceneText = [boundScene.name, boundScene.prompt || boundScene.desc].filter(Boolean).join("。");
      videoPrompt += `。场景设定：${sceneText}`;
    }
    return videoPrompt;
  };

  const genMergedLongVideo = async () => {
    if (mergingLongVideo) return;
    const selShots = allShots.filter(s => mergeSelected[s.id]);
    if (selShots.length < 3 || selShots.length > 6) {
      alert(`请选择 3-6 个分镜合并生成长视频（当前选中 ${selShots.length} 个）`);
      return;
    }
    if (!isLoggedIn()) {
      alert("请先登录后再使用视频生成功能");
      return;
    }
    for (const sh of selShots) {
      if (getShotCharacterImages(sh).length === 0) {
        alert(`分镜「${sh.title}」没有角色参考图，请先选择角色或生成人物图`);
        return;
      }
    }
    const totalSec = selShots.reduce((acc, sh) => acc + (sh.duration || duration || 5), 0);
    const pricePerSec = getVideoPricePerSec("s2v", resolution, videoProvider);
    const needCredits = Math.round(totalSec * pricePerSec);
    log(`🎬 合并长视频：${selShots.length} 个分镜，合计约 ${totalSec} 秒，需 ${needCredits} 积分（${pricePerSec}积分/秒）`);
    try {
      const precheck = await precheckCredits(needCredits, "video_shots", `合并长视频：${selShots.length}个分镜`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${needCredits}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！合并长视频需要${needCredits}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
      log("积分预校验通过，开始构建分镜队列…");
    } catch (e) {
      log(`⚠️ 积分预校验失败（${e.message}），继续生成`);
    }

    setMergingLongVideo(true);
    try {
      const shots = [];
      for (let i = 0; i < selShots.length; i++) {
        const sh = selShots[i];
        log(`合并分镜 ${i + 1}/${selShots.length}「${sh.title}」：构建提示词 + 上传参考图…`);
        const prompt = buildMergedShotPrompt(sh);
        // 人物参考图（第1张起）
        const subjectRefs = [];
        const charImages = getShotCharacterImages(sh);
        for (const img of charImages) {
          const url = await uploadImageToServer(img, log);
          if (url) subjectRefs.push(url);
        }
        // 场景参考图（人物之后追加）
        const sceneRefs = [];
        const boundScene = scenes.find(sc => sc.id === sh.selectedSceneId);
        if (boundScene && boundScene.image) {
          const url = await uploadImageToServer(boundScene.image, log);
          if (url) sceneRefs.push(url);
        }
        const shotItem = { prompt, duration: Math.min(10, Math.max(3, sh.duration || duration || 5)) };
        // 参考图契约：人物在前（ref_image_0..N-1）+ 场景在后（ref_image_N..），对齐调度机 _collect_refs 按 subject_names 切分
        subjectRefs.forEach((u, i) => { shotItem[`ref_image_${i}`] = u; });
        sceneRefs.forEach((u, i) => { shotItem[`ref_image_${subjectRefs.length + i}`] = u; });
        // 多角色锁脸：subject_names 传全部分镜绑定角色名（调度机据此切分人物/场景并生成锁脸定义）
        const shotCharNames = (sh.characters || [])
          .filter(c => charImages.includes(c.fourView) || charImages.includes(c.image))
          .map(c => c.name || "").filter(Boolean);
        if (shotCharNames.length > 0) shotItem.subject_names = shotCharNames;
        shots.push(shotItem);
        log(`  分镜${i + 1}：人物${subjectRefs.length}张 场景${sceneRefs.length}张 时长${shotItem.duration}秒`);
      }

      log(`提交合并长视频任务（${shots.length} 段，${resolution}）…`);
      const res = await runDispatchJob({
        type: "video_shots",
        payload: {
          workflow: WAN22_WORKFLOW_ID + "_shots",
          model: "MiniMax-H3",
          mode: "s2v",
          provider: "wan22",
          resolution,
          total_duration: totalSec,
          shots,
        },
        pollInterval: 5000,
        timeoutMs: 14400000,
        onProgress: (progress, text, info) => {
          setGenProgress(prev => ({ ...prev, merge: { text: `合并长视频 · ${text}`, ...info } }));
        }
      });

      // 完成：取实际时长
      const actualDuration = await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(Math.round(v.duration));
        v.onerror = () => resolve(null);
        v.src = res.resultUrl;
      });
      const durationUpdate = actualDuration ? { duration: actualDuration } : {};

      // 1. 视频放到第一个选中分镜上
      update((p) => ({ ...p, shots: p.shots.map(s => s.id === selShots[0].id ? { ...s, videoUrl: res.resultUrl, ...durationUpdate } : s) }));
      // 2. 存入素材库
      if (getAppSetting("autoAddToAssets", true)) {
        try {
          const newVideoAsset = {
            id: "a_video_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
            type: "video",
            title: `合并长视频·${selShots.length}镜（${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
            url: res.resultUrl,
            status: "ready",
            tags: ["视频生成", "长视频", `合并${selShots.length}镜`],
            favorite: false,
            shotId: selShots[0].id,
            episodeId: selShots[0].episodeId || "",
            duration: actualDuration || totalSec,
            resolution: resolution,
            mode: "s2v",
            createdAt: Date.now()
          };
          update((p) => ({ ...p, assets: [newVideoAsset, ...(p.assets || [])] }));
          log(`✅ 合并长视频已存入素材库：${newVideoAsset.title}`);
        } catch (e) {
          log(`⚠️ 视频存入素材库失败：${e.message}`);
        }
      }
      log(`✅ 合并长视频生成成功：${selShots.length} 个分镜${actualDuration ? `（实际时长${actualDuration}秒）` : `（约${totalSec}秒）`}`);
      if (isLoggedIn()) {
        try {
          const balanceData = await getCreditBalance();
          if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
          if (window.refreshUserInfo) window.refreshUserInfo();
        } catch (e) {}
      }
      // 成功后退出多选模式
      setMergeMode(false);
      setMergeSelected({});
    } catch (e) {
      log(`❌ 合并长视频失败：${e.message}`);
    } finally {
      setMergingLongVideo(false);
      setGenProgress(prev => { const next = { ...prev }; delete next.merge; return next; });
    }
  };

  // 视频价格：按模式+分辨率分别定价
  const pricePerSec = getVideoPricePerSec(selectedMode, resolution, videoProvider);
  const currentCredits = pricePerSec * duration;
  const isPremProvider = videoProvider === "wan22";
  const showFirstFramePanel = selectedMode === "r2v" || (isPremProvider && selectedMode === "i2v");
  const showLastFrame = selectedMode === "r2v";

  return (
    <div style={{ padding: 16, height: "100%", overflow: "auto", color: "var(--text)" }}>
      {/* 来自3D导演台的首帧提示 */}
      {externalFirstFrame && (
        <div style={{ marginBottom: 12, padding: "10px 14px", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8, background: "rgba(245,158,11,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
          <img src={externalFirstFrame} alt="3D导演台首帧" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", marginBottom: 2 }}>🎬 已使用3D导演台渲染的首帧</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>i2v模式将优先使用此首帧作为参考图</div>
          </div>
          <button onClick={() => { onClearExternalFirstFrame?.(); log("已清除3D导演台首帧"); }} style={{ padding: "6px 12px", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, background: "transparent", color: "#f59e0b", cursor: "pointer", fontSize: 11 }}>
            清除
          </button>
        </div>
      )}

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg, #0b0f17)", margin: "0 -16px 16px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>🎥 视频生成 · {VIDEO_PROVIDERS.find(p => p.key === videoProvider)?.label || "标准"}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
            value={selectedMode} onChange={e => {
              const newMode = e.target.value;
              setSelectedMode(newMode);
              // 自动校正分辨率（如果当前分辨率在新模式下不可用）
              const availableResolutions = getResolutions(newMode, videoProvider);
              if (!availableResolutions.find(r => r.key === resolution)) {
                setResolution(availableResolutions[0] ? availableResolutions[0].key : "768p竖");
              }
              // 自动校正时长（如果当前时长超过新模式的最大值）
              const maxDur = getMaxDuration(newMode);
              if (duration > maxDur) {
                setDuration(maxDur);
              }
            }}>
            {getVideoModes(videoProvider).map(m => <option key={m.key} value={m.key}>{isPremProvider && m.key === "i2v" ? "首帧+人物+场景参考" : m.label}</option>)}
          </select>
          <select style={{ padding: "6px 10px", border: "1px solid #7A5CFF", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, fontWeight: 600 }}
            value={videoProvider} onChange={e => {
              const newProvider = e.target.value;
              setVideoProvider(newProvider);
              saveAppSetting("defaultVideoProvider", newProvider);
              // 当前模式不被新渠道支持时，先切到第一个可用模式
              const nextMode = getVideoModes(newProvider).find(m => m.key === selectedMode) ? selectedMode : getVideoModes(newProvider)[0].key;
              // 校正分辨率到新渠道可用档（如 wan22 切到 576P 竖屏）
              const avail = getResolutions(nextMode, newProvider);
              if (!avail.find(r => r.key === resolution)) {
                setResolution(avail[0] ? avail[0].key : "768p竖");
              }
              if (nextMode !== selectedMode) {
                setSelectedMode(nextMode);
              }
              // 长视频（30/60秒）仅高级生成 MiniMax H3 的 I2V 可用；切到其他渠道/模式时回到常规时长
              if (duration >= 30 && !(newProvider === "wan22" && nextMode === "i2v")) {
                setDuration(Math.min(duration, getMaxDuration(nextMode)));
              }
              // 1080p 只支持 5 秒以内：切到高级生成且当前为 1080p 时限制时长
              if (newProvider === "wan22" && (resolution || "").includes("1080") && duration > 5) {
                setDuration(5);
              }
            }}
            title="选择视频生成渠道（不同模型价格不同）">
            {VIDEO_PROVIDERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {videoProvider === "wan22" && (
            <button
              onClick={() => { setMergeMode(!mergeMode); if (!mergeMode) setMergeSelected({}); }}
              style={{ padding: "6px 12px", border: mergeMode ? "2px solid #7A5CFF" : "1px solid #7A5CFF", borderRadius: 6, background: mergeMode ? "rgba(122,92,255,0.2)" : "transparent", color: "#7A5CFF", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
              title="勾选 3-6 个分镜，合并生成一条长视频（分镜间自动衔接）"
            >
              🎬 合并长视频{mergeMode ? "（多选分镜中）" : ""}
            </button>
          )}
          <select style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
            value={resolution} onChange={e => {
              const v = e.target.value;
              setResolution(v);
              // 1080p 只支持 5 秒以内：切到 1080p 且当前时长超 5 秒时自动回到 5 秒
              if (videoProvider === "wan22" && v.includes("1080") && duration > 5) {
                setDuration(5);
                log(`⚠️ 1080p 仅支持 5 秒以内视频，已自动调整时长为 5 秒`);
              }
            }}>
            {getResolutions(selectedMode, videoProvider).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
            value={duration} onChange={e => setDuration(Number(e.target.value))}>
            {getDurations(selectedMode, videoProvider, resolution).map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <select style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
            value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)}
            title="选择视频风格">
            {VIDEO_STYLES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select style={{ padding: "6px 10px", border: "1px solid #7A5CFF", borderRadius: 6, background: "rgba(122,92,255,0.1)", color: "var(--text)", fontSize: 12 }}
            value={selectedEpisode} onChange={e => setSelectedEpisode(e.target.value)}>
            {episodes.map((ep, i) => {
              const epShots = allShots.filter(s => s && s.episodeId === ep.id);
              return <option key={ep.id} value={ep.id}>{ep.title || `第${i + 1}集`}（{epShots.length}个分镜）</option>;
            })}
          </select>
        </div>
      </div>

      {/* 模式说明 */}
      <div style={{ marginBottom: 12, padding: "10px 14px", border: "1px solid rgba(122,92,255,0.3)", borderRadius: 8, background: "rgba(122,92,255,0.1)" }}>
        <div style={{ fontSize: 12, color: "#7A5CFF", fontWeight: 600, marginBottom: 4 }}>
          当前模式：{isPremProvider && selectedMode === "i2v" ? "首帧+人物+场景参考" : (VIDEO_MODES.find(m => m.key === selectedMode)?.label)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {isPremProvider && selectedMode === "i2v" ? "首帧+人物图参考生成，人物外貌一致，画面起止可控" : (VIDEO_MODES.find(m => m.key === selectedMode)?.desc)} · {VIDEO_PROVIDERS.find(p => p.key === videoProvider)?.desc} · {resolution} {duration}秒 = {currentCredits} 积分（{pricePerSec}积分/秒）
          {videoProvider === "wan22" && selectedMode === "i2v" && duration >= 30 && (
            <span style={{ color: "#7A5CFF" }}> · 长视频按 {Math.round(duration / 10)} 段×10秒分段续接，段间首帧自动衔接上一段尾帧，生成时间较长请耐心等待</span>
          )}
        </div>
      </div>

      {/* ===== 场景资产（保证场景一致性） ===== */}
      <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-2, #1c2433)", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🎬 场景资产 <span style={{ fontSize: 10, color: "var(--text-muted, #8b95a7)", fontWeight: 400 }}>（场景参考图+场景设定，保证场景一致性）</span></span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              onClick={analyzeScenes}
              disabled={analyzingScenes}
            >
              {analyzingScenes ? "⏳ 分析中..." : `🔍 分析剧本场景（${getPrice("llm_scene_extract", 1.0)}积分）`}
            </button>
            <button
              style={{ padding: "6px 12px", border: "1px solid #7A5CFF", borderRadius: 6, background: "rgba(122,92,255,0.1)", color: "#7A5CFF", cursor: "pointer", fontSize: 11 }}
              onClick={() => { setAddingScene(prev => { const next = !prev; if (next) setShowScenePanel(true); return next; }); }}
            >
              ➕ 添加场景
            </button>
            <button
              style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text-secondary, #8b95a7)", cursor: "pointer", fontSize: 11 }}
              onClick={() => setShowScenePanel(!showScenePanel)}
            >
              {showScenePanel ? "收起 ▲" : `展开 ▼（${scenes.length}）`}
            </button>
          </div>
        </div>
        {showScenePanel && (
          <div style={{ padding: "0 14px 14px" }}>
            {scenes.length === 0 && !addingScene && (
              <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted, #8b95a7)", fontSize: 12, background: "rgba(122,92,255,0.05)", borderRadius: 6, marginBottom: 10, lineHeight: 1.6 }}>
                暂无场景资产。<br/>点击「🔍 分析剧本场景」自动从分镜提取整剧场景，或「➕ 添加场景」手动创建。<br/>为场景生成参考图后，在分镜中「选择场景」即可保证场景一致性。
              </div>
            )}
            {/* 添加场景表单 */}
            {addingScene && (
              <div style={{ padding: 12, border: "1px solid #7A5CFF", borderRadius: 8, marginBottom: 10, background: "rgba(122,92,255,0.05)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#7A5CFF", marginBottom: 8 }}>➕ 添加场景</div>
                <input
                  placeholder="场景名称（如：雨夜小巷）"
                  value={newSceneName}
                  onChange={e => setNewSceneName(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", marginBottom: 6 }}
                />
                <input
                  placeholder="场景描述（一句话，可选）"
                  value={newSceneDesc}
                  onChange={e => setNewSceneDesc(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", marginBottom: 6 }}
                />
                <textarea
                  placeholder="场景提示词（用于AI生图，可选；留空则用场景名）"
                  value={newScenePrompt}
                  onChange={e => setNewScenePrompt(e.target.value)}
                  style={{ width: "100%", minHeight: 60, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                  <button
                    style={{ padding: "6px 14px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                    onClick={() => { setAddingScene(false); setNewSceneName(""); setNewSceneDesc(""); setNewScenePrompt(""); }}
                  >取消</button>
                  <button
                    style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    onClick={saveNewScene}
                  >保存</button>
                </div>
              </div>
            )}
            {/* 场景列表 */}
            {scenes.map(scene => (
              <div key={scene.id} style={{ display: "flex", gap: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8, background: "var(--panel-1, transparent)" }}>
                <div style={{ width: 88, height: 110, borderRadius: 6, overflow: "hidden", background: "var(--input-bg)", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {scene.image ? (
                    <img src={scene.image} alt={scene.name} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} onClick={(e) => { e.stopPropagation(); setPreviewSceneImage(scene.image); }} />
                  ) : (
                    <span style={{ fontSize: 26 }}>🏞️</span>
                  )}
                  {scene.image && (
                    <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(16,185,129,0.9)", borderRadius: 4, padding: "1px 5px", fontSize: 9, color: "#fff" }}>✓</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingScene?.id === scene.id ? (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#7A5CFF", marginBottom: 6 }}>✏️ 修改场景</div>
                      <input
                        placeholder="场景名称"
                        value={editingScene.name}
                        onChange={e => setEditingScene({ ...editingScene, name: e.target.value })}
                        style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", marginBottom: 6 }}
                      />
                      <input
                        placeholder="场景描述"
                        value={editingScene.desc}
                        onChange={e => setEditingScene({ ...editingScene, desc: e.target.value })}
                        style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", marginBottom: 6 }}
                      />
                      <textarea
                        placeholder="场景提示词（用于AI生图与视频场景设定）"
                        value={editingScene.prompt}
                        onChange={e => setEditingScene({ ...editingScene, prompt: e.target.value })}
                        style={{ width: "100%", minHeight: 56, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
                        <button
                          style={{ padding: "5px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 11 }}
                          onClick={() => setEditingScene(null)}
                        >取消</button>
                        <button
                          style={{ padding: "5px 12px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                          onClick={saveEditScene}
                        >保存</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scene.name}</span>
                        <span style={{ fontSize: 9, color: "var(--text-muted, #8b95a7)", flexShrink: 0 }}>{scene.source === "manual" ? "手动" : "AI分析"}</span>
                      </div>
                      {scene.desc && <div style={{ fontSize: 10, color: "var(--text-muted, #8b95a7)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scene.desc}</div>}
                      <div style={{ fontSize: 11, color: "var(--text-secondary, #8b95a7)", marginTop: 4, lineHeight: 1.5, maxHeight: 50, overflow: "hidden", fontStyle: "italic" }}>{scene.prompt}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <button
                          style={{ padding: "5px 10px", border: "none", borderRadius: 5, background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 11 }}
                          onClick={() => genSceneImage(scene)}
                          disabled={!!generatingSceneId}
                        >
                          {generatingSceneId === scene.id ? "⏳ 生成中..." : `🤖 文生图（${getPrice("image_generate", 3.0)}积分）`}
                        </button>
                        <button
                          style={{ padding: "5px 10px", border: "1px solid #5CE1E6", borderRadius: 5, background: "rgba(92,225,230,0.12)", color: "#5CE1E6", cursor: !generatingSceneId ? "pointer" : "not-allowed", fontSize: 11 }}
                          onClick={() => { if (!generatingSceneId) setX99RefPicker({ sceneId: scene.id }); }}
                          disabled={!!generatingSceneId}
                          title="选择一张已有场景图/素材图作为风格参考（如上一个场景），用 X99 IPAdapter 风格迁移生成当前场景，保持全剧场景风格一致"
                        >
                          {generatingSceneId === scene.id ? "⏳ 生成中..." : `🎨 图生图（${getPrice("image_generate", 3.0)}积分）`}
                        </button>
                        <button
                          style={{ padding: "5px 10px", border: "1px solid #7A5CFF", borderRadius: 5, background: "rgba(122,92,255,0.1)", color: "#7A5CFF", cursor: "pointer", fontSize: 11 }}
                          onClick={() => refineScenePrompt(scene)}
                          disabled={!!refiningSceneId}
                        >
                          {refiningSceneId === scene.id ? "⏳ 优化中..." : `✨ 优化提示词（${getPrice("llm_scene_refine", 1.0)}积分）`}
                        </button>
                        <button
                          style={{ padding: "5px 10px", border: "1px solid #f59e0b", borderRadius: 5, background: "rgba(245,158,11,0.12)", color: "#f59e0b", cursor: "pointer", fontSize: 11 }}
                          onClick={() => document.getElementById("sceneUpload_" + scene.id).click()}
                          title="上传本地图片作为场景参考图"
                        >📤 上传</button>
                        <input type="file" accept="image/*" style={{ display: "none" }} id={"sceneUpload_" + scene.id}
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            log(`正在上传场景「${scene.name}」图片…`);
                            try {
                              const objectUrl = URL.createObjectURL(file);
                              const publicUrl = await uploadImageToServer(objectUrl, log);
                              if (publicUrl) {
                                updateScenes(scenes.map(s => s.id === scene.id ? { ...s, image: publicUrl } : s));
                                log(`✅ 场景「${scene.name}」图片上传成功，已作为场景参考图`);
                              } else { log(`❌ 场景「${scene.name}」图片上传失败`); }
                              URL.revokeObjectURL(objectUrl);
                            } catch (err) { log(`❌ 场景「${scene.name}」图片上传失败: ${err.message}`); }
                            e.target.value = "";
                          }} />
                        <button
                          style={{ padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 5, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 11 }}
                          onClick={() => setEditingScene({ id: scene.id, name: scene.name, desc: scene.desc || "", prompt: scene.prompt || "" })}
                        >✏️ 修改</button>
                        <button
                          style={{ padding: "5px 10px", border: "1px solid #ef4444", borderRadius: 5, background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 11 }}
                          onClick={() => deleteScene(scene)}
                        >🗑 删除</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 图生图（X99）参考图选择器：选择其他场景图/素材库图作为风格参考 */}
      {x99RefPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setX99RefPicker(null)}>
          <div style={{ background: "#1a2130", border: "1px solid var(--border)", borderRadius: 12, padding: 16, width: "min(560px, 92vw)", maxHeight: "75vh", overflow: "auto", boxSizing: "border-box" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>选择风格参考图（X99 图生图）</div>
            <div style={{ fontSize: 10, color: "var(--text-muted, #8b95a7)", marginBottom: 10, lineHeight: 1.6 }}>
              正在生成「{x99RefScene?.name}」：请选择一张 <b>已有场景图 / 素材库图片</b> 作为风格参考（例如上一个场景），
              将把它的画风迁移到当前场景，实现全剧场景风格统一。
            </div>
            {x99Candidates.length === 0 ? (
              <div style={{ fontSize: 11, color: "#f59e0b", padding: "12px 0", lineHeight: 1.6 }}>
                暂无可用参考图。请先在其他场景用「🤖 文生图」生成一张场景图（或先在素材库存入图片），再回来使用图生图。
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 8 }}>
                {x99Candidates.map(c => (
                  <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "var(--panel-2, #202838)" }}
                    onClick={() => { const sc = x99RefScene; setX99RefPicker(null); genSceneImageX99(sc, c.url, c.title); }}>
                    <img src={c.url} alt={c.title} style={{ width: "100%", height: 78, objectFit: "cover", display: "block", background: "#000" }} />
                    <div style={{ fontSize: 10, padding: "5px 6px", color: "var(--text-secondary, #8b95a7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button style={{ padding: "6px 14px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 11 }} onClick={() => setX99RefPicker(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* R2V首尾帧设置 / 高级·顶级参考首帧设置 */}
      {showFirstFramePanel && (
        <div style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>🖼️ {selectedMode === "r2v" ? "首尾帧设置（首帧和尾帧均为必填，各有三种来源可选）" : "参考首帧设置（首帧来源可选，人物图自动使用已生成角色）"}</span>
            <span style={{ fontSize: 11, color: "#7A5CFF", fontWeight: 500 }}>
              当前分镜：{shots.find(s => s.id === selectedShotId)?.title || "请点击下方分镜卡片选择"}
            </span>
          </div>

          {/* 首帧设置 */}
          <div style={{ marginBottom: 12, padding: 10, border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, background: "rgba(245,158,11,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b" }}>
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>*</span> 首帧（必填）
              </span>
              <select
                value={firstFrameSource}
                onChange={(e) => setFirstFrameSource(e.target.value)}
                style={{ padding: "4px 8px", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 4, background: "var(--input-bg)", color: "var(--text)", fontSize: 11 }}
              >
                <option value="shot">本分镜分镜图</option>
                <option value="prev_video">上个视频尾帧</option>
                <option value="custom">用户手动上传</option>
              </select>
            </div>

            {/* 根据来源显示输入 */}
            {firstFrameSource === "custom" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
                  placeholder="首帧图片 URL" value={firstFrameUrl} onChange={e => setFirstFrameUrl(e.target.value)} />
                <input type="file" accept="image/*" style={{ display: "none" }} id="firstFrameUpload"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    log("正在上传首帧图片…");
                    try {
                      const objectUrl = URL.createObjectURL(file);
                      const publicUrl = await uploadImageToServer(objectUrl, log);
                      if (publicUrl) { setFirstFrameUrl(publicUrl); log("首帧图片上传成功 ✓"); }
                      else { log("❌ 首帧图片上传失败"); }
                      URL.revokeObjectURL(objectUrl);
                    } catch (err) { log("❌ 首帧图片上传失败: " + err.message); }
                    e.target.value = "";
                  }} />
                <button onClick={() => document.getElementById("firstFrameUpload").click()}
                  style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "#f59e0b", color: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                  📤 上传
                </button>
              </div>
            )}

            {/* 首帧预览 */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 80, height: 100, background: "var(--input-bg)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                {(() => {
                  const currentShot = shots.find(s => s.id === selectedShotId);
                  const prevShot = currentShot ? getPrevShot(currentShot) : null;
                  let previewUrl = "";
                  if (firstFrameSource === "shot") previewUrl = currentShot?.imageUrl || "";
                  else if (firstFrameSource === "prev_video") previewUrl = prevShot?.videoUrl ? "" : "";
                  else if (firstFrameSource === "custom") previewUrl = firstFrameUrl || "";
                  return previewUrl ? <img src={previewUrl} alt="首帧预览" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 4 }}>
                      {firstFrameSource === "shot" ? "无分镜图" : firstFrameSource === "prev_video" ? "需生成时提取" : "请上传图片"}
                    </div>;
                })()}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", flex: 1 }}>
                {firstFrameSource === "shot" && (shots.find(s => s.id === selectedShotId)?.imageUrl ? "✓ 使用本分镜分镜图" : "⚠️ 本分镜无分镜图，请先生成")}
                {firstFrameSource === "prev_video" && (getPrevShot(shots.find(s => s.id === selectedShotId))?.videoUrl ? "✓ 将提取上个视频尾帧" : "⚠️ 上个视频不存在，请先生成")}
                {firstFrameSource === "custom" && (firstFrameUrl ? "✓ 使用手动上传的首帧" : "⚠️ 请上传或填写首帧URL")}
              </div>
            </div>
          </div>

          {/* 尾帧设置（必填，仅R2V模式） */}
          {showLastFrame && (
          <div style={{ padding: 10, border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, background: "rgba(16,185,129,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#10b981" }}>
                <span style={{ color: "#10b981", fontWeight: 600 }}>*</span> 尾帧（必填）
              </span>
              <select
                value={lastFrameSource}
                onChange={(e) => setLastFrameSource(e.target.value)}
                style={{ padding: "4px 8px", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 4, background: "var(--input-bg)", color: "var(--text)", fontSize: 11 }}
              >
                <option value="next_shot">下一分镜分镜图</option>
                <option value="next_video">下个视频首帧</option>
                <option value="custom">用户手动上传</option>
              </select>
            </div>

            {/* 根据来源显示输入 */}
            {lastFrameSource === "custom" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
                  placeholder="尾帧图片 URL" value={lastFrameUrl} onChange={e => setLastFrameUrl(e.target.value)} />
                <input type="file" accept="image/*" style={{ display: "none" }} id="lastFrameUpload"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    log("正在上传尾帧图片…");
                    try {
                      const objectUrl = URL.createObjectURL(file);
                      const publicUrl = await uploadImageToServer(objectUrl, log);
                      if (publicUrl) { setLastFrameUrl(publicUrl); log("尾帧图片上传成功 ✓"); }
                      else { log("❌ 尾帧图片上传失败"); }
                      URL.revokeObjectURL(objectUrl);
                    } catch (err) { log("❌ 尾帧图片上传失败: " + err.message); }
                    e.target.value = "";
                  }} />
                <button onClick={() => document.getElementById("lastFrameUpload").click()}
                  style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                  📤 上传
                </button>
              </div>
            )}

            {/* 尾帧预览 */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 80, height: 100, background: "var(--input-bg)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                {(() => {
                  const currentShot = shots.find(s => s.id === selectedShotId);
                  const nextShot = currentShot ? getNextShot(currentShot) : null;
                  let previewUrl = "";
                  if (lastFrameSource === "next_shot") previewUrl = nextShot?.imageUrl || "";
                  else if (lastFrameSource === "next_video") previewUrl = "";
                  else if (lastFrameSource === "custom") previewUrl = lastFrameUrl || "";
                  return previewUrl ? <img src={previewUrl} alt="尾帧预览" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 4 }}>
                      {lastFrameSource === "next_shot" ? "无分镜图" : lastFrameSource === "next_video" ? "需生成时提取" : "请上传图片"}
                    </div>;
                })()}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", flex: 1 }}>
                {lastFrameSource === "next_shot" && (getNextShot(shots.find(s => s.id === selectedShotId))?.imageUrl ? `✓ 使用下一分镜「${getNextShot(shots.find(s => s.id === selectedShotId))?.title}」分镜图` : "⚠️ 下一分镜无分镜图，请先生成")}
                {lastFrameSource === "next_video" && (getNextShot(shots.find(s => s.id === selectedShotId))?.videoUrl ? "✓ 将提取下个视频首帧" : "⚠️ 下个视频不存在，请先生成")}
                {lastFrameSource === "custom" && (lastFrameUrl ? "✓ 使用手动上传的尾帧" : "⚠️ 请上传或填写尾帧URL")}
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* 全能参考(Ref2VA/v2) / 对口型(LipSync)设置 */}
      {(selectedMode === "ia2v" || selectedMode === "lipsync") && (
        <div style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{selectedMode === "lipsync" ? "🎙️ 对口型设置（人物图 + 配音音频必填）" : "🎛️ 全能参考设置（Ref2VA v2，所有参数选填，最多9图+3音）"}</span>
            <span style={{ fontSize: 11, color: "#7A5CFF", fontWeight: 500 }}>
              当前分镜：{shots.find(s => s.id === selectedShotId)?.title || "请点击下方分镜卡片选择"}
            </span>
          </div>
          {/* 参考图片 */}
          {selectedMode === "ia2v" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              🖼️ 参考图片（选填，不填则自动使用角色参考图）
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--input-bg)", color: "var(--text)", fontSize: 11 }}
                placeholder="参考图片 URL（不填则自动使用角色参考图）" value={refImageUrl} onChange={e => setRefImageUrl(e.target.value)} />
              <input type="file" accept="image/*" style={{ display: "none" }} id="refImageUpload"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  log("正在上传参考图片…");
                  try {
                    const objectUrl = URL.createObjectURL(file);
                    const publicUrl = await uploadImageToServer(objectUrl, log);
                    if (publicUrl) {
                      setRefImageUrl(publicUrl);
                      log("✅ 参考图片上传成功");
                    }
                    URL.revokeObjectURL(objectUrl);
                  } catch (err) { log("❌ 参考图片上传失败: " + err.message); }
                  e.target.value = "";
                }} />
              <button onClick={() => document.getElementById("refImageUpload").click()}
                style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                📤 上传
              </button>
              {refImageUrl && <button onClick={() => setRefImageUrl("")} style={{ padding: "6px 10px", border: "1px solid #ef4444", borderRadius: 6, background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>清除</button>}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
              {refImageUrl ? "✓ 使用手动上传的参考图片" : "ℹ️ 将自动使用人物管理中的角色参考图（最多9张）"}
            </div>
          </div>
          )}
          {selectedMode === "lipsync" && (
            <div style={{ marginBottom: 10, fontSize: 11, color: "var(--text-muted)" }}>
              🖼️ 人物图：自动使用分镜人物的第1张角色图（四视图优先），无需手动上传。
            </div>
          )}
          {/* 参考音频 */}
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{selectedMode === "lipsync" ? "🎵 配音音频（必填，1个，支持 MP3/WAV/MP4/FLAC）" : "🎵 参考音频 URL（选填，最多3个，支持 MP3/WAV/MP4/FLAC）"}</span>
              <button onClick={() => {
                // 前往生成本镜音频：触发父组件切换到配音模块
                if (window.switchToDubbing) {
                  window.switchToDubbing(selectedShotId);
                } else {
                  log("💡 请在「配音」模块生成本分镜的音频，生成后复制音频URL粘贴到此处");
                }
              }} style={{ padding: "4px 10px", border: "1px solid #7A5CFF", borderRadius: 4, background: "rgba(122,92,255,0.1)", color: "#7A5CFF", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" }}>
                🎙️ 前往生成本镜音频
              </button>
            </div>
            {(selectedMode === "lipsync" ? [0] : [0, 1, 2]).map(idx => (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 42 }}>音频 {idx + 1}</span>
                <input style={{ flex: 1, minWidth: 150, padding: "5px 8px", border: selectedMode === "lipsync" && !refAudioUrls[0]?.trim() ? "1px solid #ef4444" : "1px solid var(--border)", borderRadius: 4, background: "var(--input-bg)", color: "var(--text)", fontSize: 11 }}
                  placeholder={selectedMode === "lipsync" ? "https://example.com/audio.mp3（必填）" : `https://example.com/audio${idx + 1}.mp3`}
                  value={refAudioUrls[idx] || ""}
                  onChange={e => {
                    const newUrls = [...refAudioUrls];
                    newUrls[idx] = e.target.value;
                    setRefAudioUrls(newUrls);
                  }} />
                {/* 从素材库选择已生成的配音 */}
                {audioAssets.length > 0 && (
                  <select
                    value=""
                    onChange={e => {
                      const audioUrl = e.target.value;
                      if (audioUrl) {
                        const newUrls = [...refAudioUrls];
                        newUrls[idx] = audioUrl;
                        setRefAudioUrls(newUrls);
                        log(`✅ 已从素材库选择音频：${audioUrl.substring(0, 50)}...`);
                      }
                    }}
                    style={{ padding: "5px 8px", border: "1px solid #7A5CFF", borderRadius: 4, background: "rgba(122,92,255,0.1)", color: "#7A5CFF", fontSize: 10, cursor: "pointer", maxWidth: 180 }}
                  >
                    <option value="">📚 从素材库选择</option>
                    {audioAssets.map((a, i) => (
                      <option key={a.id || i} value={a.url}>
                        {(a.title || `音频${i+1}`).substring(0, 25)}
                      </option>
                    ))}
                  </select>
                )}
                <input type="file" accept="audio/*,.mp3,.wav,.mp4,.flac,.m4a,.aac,.ogg" style={{ display: "none" }} id={`refAudioUpload${idx}`}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    log(`正在上传音频 ${idx + 1}：${file.name}（${(file.size / 1024 / 1024).toFixed(2)}MB）…`);
                    try {
                      // 上传音频文件到调度机
                      const formData = new FormData();
                      formData.append("file", file);
                      const uploadRes = await fetch((window.UPLOAD_BASE_URL || "https://api.jinsuai.cn") + "/api/upload/file", {
                        method: "POST",
                        body: formData,
                      });
                      if (uploadRes.ok) {
                        const data = await uploadRes.json();
                        let audioUrl = data.url || data.file_url || data.path;
                        if (audioUrl && audioUrl.startsWith("/")) {
                          audioUrl = (window.UPLOAD_BASE_URL || "https://api.jinsuai.cn") + audioUrl;
                        }
                        if (audioUrl) {
                          const newUrls = [...refAudioUrls];
                          newUrls[idx] = audioUrl;
                          setRefAudioUrls(newUrls);
                          log(`✅ 音频 ${idx + 1} 上传成功：${audioUrl.substring(0, 60)}...`);
                        } else {
                          log(`❌ 音频上传返回空URL`);
                        }
                      } else {
                        const errText = await uploadRes.text().catch(() => "");
                        log(`❌ 音频上传失败：HTTP ${uploadRes.status} ${errText}`);
                      }
                    } catch (err) {
                      log(`❌ 音频上传异常：${err.message}`);
                    }
                    e.target.value = "";
                  }} />
                <button onClick={() => document.getElementById(`refAudioUpload${idx}`).click()}
                  style={{ padding: "5px 10px", border: "none", borderRadius: 4, background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" }}>
                  📤 上传
                </button>
                {refAudioUrls[idx] && <button onClick={() => {
                  const newUrls = [...refAudioUrls];
                  newUrls[idx] = "";
                  setRefAudioUrls(newUrls);
                }} style={{ padding: "4px 8px", border: "1px solid #ef4444", borderRadius: 4, background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 10 }}>清除</button>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: refAudioUrls.filter(u => u?.trim()).length > 0 ? "#10b981" : (selectedMode === "lipsync" ? "#ef4444" : "var(--text-muted)"), marginTop: 3 }}>
              {refAudioUrls.filter(u => u?.trim()).length > 0
                ? `✓ 已填写 ${refAudioUrls.filter(u => u?.trim()).length} 个参考音频`
                : (selectedMode === "lipsync" ? "⚠️ 配音音频为必填项，未填写无法生成对口型视频" : "ℹ️ 未填写参考音频，将不使用音频参考（纯图/文生成）")}
            </div>
          </div>
        </div>
      )}

      {/* i2v提示 */}
      {selectedMode === "i2v" && (
        <div style={{ marginBottom: 16, padding: "10px 14px", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, background: "rgba(16,185,129,0.08)" }}>
          <div style={{ fontSize: 11, color: "#10b981", lineHeight: 1.6 }}>
            {isPremProvider ? (
              <>✓ 首帧+人物+场景参考模式：<br/>
                &nbsp;&nbsp;1. 人物图 = 已生成的角色图（保证人物一致）<br/>
                &nbsp;&nbsp;2. 场景图 = 已生成的场景图（保证场景一致，绑定场景后自动并入）<br/>
                &nbsp;&nbsp;3. 首帧来源可选：本分镜分镜图 / 上个视频尾帧 / 手动上传<br/>
                &nbsp;&nbsp;4. 支持1080P/1:1分辨率，时长1-10秒</>
            ) : (
              <>✓ i2v模式（API-U01 图生视频）：<br/>
                &nbsp;&nbsp;1. 人物参考图 = 人物管理中已生成的角色图（保证人物一致，四视图优先）<br/>
                &nbsp;&nbsp;2. 支持1080P和1:1方形分辨率，最多9张参考图，时长1-10秒<br/>
                &nbsp;&nbsp;3. 不使用首帧（纯人物参考图生成）</>
            )}
          </div>
        </div>
      )}

      {/* t2v提示 */}
      {selectedMode === "t2v" && (
        <div style={{ marginBottom: 16, padding: "10px 14px", border: "1px solid rgba(122,92,255,0.3)", borderRadius: 8, background: "rgba(122,92,255,0.08)" }}>
          <div style={{ fontSize: 11, color: "#7A5CFF", lineHeight: 1.6 }}>
            ✓ t2v模式（API-U03 文生视频加速版）：<br/>
            &nbsp;&nbsp;1. 纯文字描述生成，自由度最高，不需要参考图<br/>
            &nbsp;&nbsp;2. 支持480P/768P竖屏/横屏，时长1-15秒<br/>
            &nbsp;&nbsp;3. 不支持1080P分辨率
          </div>
        </div>
      )}

      {shots.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div>暂无分镜</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>请先在「分镜与生图」模块生成分镜</div>
        </div>
      )}

      {mergeMode && (() => {
        const selList = allShots.filter(s => mergeSelected[s.id]);
        const tot = selList.reduce((a, s) => a + (s.duration || duration || 5), 0);
        const price = getVideoPricePerSec("s2v", resolution, videoProvider);
        return (
          <div style={{ position: "sticky", top: 52, zIndex: 15, background: "rgba(122,92,255,0.12)", border: "1px solid #7A5CFF", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#7A5CFF" }}>🎬 合并长视频：已选 {selList.length}/6 个分镜（需 3-6 个，按分镜顺序合并）</span>
            <button
              onClick={genMergedLongVideo}
              disabled={mergingLongVideo || selList.length < 3}
              style={{ padding: "7px 14px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: mergingLongVideo || selList.length < 3 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: mergingLongVideo || selList.length < 3 ? 0.6 : 1 }}
            >
              {mergingLongVideo ? "⏳ 合并生成中（长视频耗时较长）…" : `合并生成长视频（约${tot}秒 · ${Math.round(tot * price)}积分）`}
            </button>
            <button onClick={() => { setMergeMode(false); setMergeSelected({}); }} style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>取消</button>
            {mergingLongVideo && genProgress.merge && (
              <span style={{ fontSize: 11, color: genProgress.merge.status === "queued" ? "#f59e0b" : "#10b981", fontWeight: 600 }}>{genProgress.merge.text}</span>
            )}
          </div>
        );
      })()}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shots.map(sh => {
          const charImages = getShotCharacterImages(sh);
          const prevShot = getPrevShot(sh);
          const nextShot = getNextShot(sh);
          const canI2V = charImages.length > 0;
          // R2V首尾帧模式（lightx2v）：首帧和尾帧都是必填，根据用户选择的来源判断
          let firstFrameAvailable = false;
          let lastFrameAvailable = false;
          if (firstFrameSource === "shot") firstFrameAvailable = !!sh.imageUrl;
          else if (firstFrameSource === "prev_video") firstFrameAvailable = !!(prevShot && prevShot.videoUrl);
          else if (firstFrameSource === "custom") firstFrameAvailable = !!firstFrameUrl;
          if (lastFrameSource === "next_shot") lastFrameAvailable = !!(nextShot && nextShot.imageUrl);
          else if (lastFrameSource === "next_video") lastFrameAvailable = !!(nextShot && nextShot.videoUrl);
          else if (lastFrameSource === "custom") lastFrameAvailable = !!lastFrameUrl;
          const canR2V = firstFrameAvailable && lastFrameAvailable;
          return (
            <div key={sh.id} onClick={() => setSelectedShotId(sh.id)} style={{ border: selectedShotId === sh.id ? "2px solid #7A5CFF" : "1px solid var(--border)", borderRadius: 12, padding: 16, background: mergeSelected[sh.id] ? "rgba(122,92,255,0.1)" : "var(--panel-2)", cursor: "pointer", transition: "all 0.2s", position: "relative" }}>
              {mergeMode && (
                <div style={{ position: "absolute", top: 10, left: 10, zIndex: 5 }} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={!!mergeSelected[sh.id]} onChange={() => toggleMergeSelect(sh.id)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                </div>
              )}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 120, height: 160, background: "var(--input-bg)", borderRadius: 8, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {sh.videoUrl ? (
                    <video src={sh.videoUrl} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : sh.imageUrl ? (
                    <img src={sh.imageUrl} alt={sh.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 32 }}>🎬</span>
                  )}
                  <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.7)", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fff" }}>
                    {sh.sceneType || "中景"}
                  </div>
                  {sh.videoUrl && (
                    <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(16,185,129,0.9)", borderRadius: 4, padding: "2px 6px", fontSize: 9, color: "#fff" }}>
                      ✓ 已生成
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{sh.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {sh.sceneType} · {sh.cameraMove} · {sh.duration || duration}秒
                    {sh.characters && sh.characters.length > 0 && ` · 角色：${sh.characters.join("、")}`}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 8, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
                    {sh.sceneDesc || "无描述"}
                  </div>
                  {sh.promptCn && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>✨ AI细化提示词（H3 规范，将用于视频生成）</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, maxHeight: 80, overflow: "hidden", fontStyle: "italic" }}>
                        {(() => { try { const p = JSON.parse(sh.promptCn); return p.detailed_description || sh.promptCn; } catch (e) { return sh.promptCn; } })()}
                      </div>
                    </div>
                  )}
                  {sh.dialogue && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(122,92,255,0.1)", borderRadius: 6, fontSize: 12, fontStyle: "italic" }}>
                      💬 {sh.dialogue}
                    </div>
                  )}
                  {/* 模式可用性提示 */}
                  {selectedMode === "i2v" && !canI2V && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#f59e0b" }}>⚠️ 该分镜无匹配的角色参考图</div>
                  )}
                  {selectedMode === "r2v" && !canR2V && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#f59e0b" }}>
                      ⚠️ R2V首尾帧模式：首帧来源「{firstFrameSource === "shot" ? "本分镜分镜图" : firstFrameSource === "prev_video" ? "上个视频尾帧" : "用户手动上传"}」{firstFrameAvailable ? "✓" : "✗"}，尾帧来源「{lastFrameSource === "next_shot" ? "下一分镜分镜图" : lastFrameSource === "next_video" ? "下个视频首帧" : "用户手动上传"}」{lastFrameAvailable ? "✓" : "✗"}。请确保首帧和尾帧都有有效来源。
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  onClick={() => genVideo(sh)}
                  disabled={!!busyIds[sh.id]}
                >
                  {busyIds[sh.id] ? "⏳ 生成中，请耐心等待…" : `🎬 生成视频 (${currentCredits}积分)`}
                </button>
                {busyIds[sh.id] && genProgress[sh.id] && (
                  <span style={{ fontSize: 11, color: genProgress[sh.id].status === "queued" ? "#f59e0b" : "#10b981", fontWeight: 600 }}>
                    {genProgress[sh.id].status === "queued" 
                      ? `⏳ ${genProgress[sh.id].text}，预计等待${genProgress[sh.id].queuePosition * 2}分钟`
                      : `🎬 ${genProgress[sh.id].text}`}
                  </span>
                )}
                {busyIds[sh.id] && (!genProgress[sh.id] || !genProgress[sh.id].status) && (
                  <span style={{ fontSize: 11, color: "#f59e0b" }}>
                    ⏱️ 正在提交任务，请稍候…
                  </span>
                )}
                {!busyIds[sh.id] && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    💡 高峰期生成可能较慢，请耐心等待
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <button
                  style={{ padding: "6px 12px", border: "1px solid #10b981", borderRadius: 6, background: sh.selectedCharIds?.length > 0 ? "rgba(16,185,129,0.15)" : "transparent", color: "#10b981", cursor: "pointer", fontSize: 12 }}
                  onClick={() => setShowCharSelect(showCharSelect === sh.id ? "" : sh.id)}
                >
                  👤 选择角色 {sh.selectedCharIds?.length > 0 ? `(${sh.selectedCharIds.length})` : ""}
                </button>
                <button
                  style={{ padding: "6px 12px", border: "1px solid #f59e0b", borderRadius: 6, background: sh.selectedSceneId ? "rgba(245,158,11,0.15)" : "transparent", color: "#f59e0b", cursor: "pointer", fontSize: 12 }}
                  onClick={() => setShowSceneSelect(showSceneSelect === sh.id ? "" : sh.id)}
                >
                  🎬 选择场景 {sh.selectedSceneId ? `(${scenes.find(sc => sc.id === sh.selectedSceneId)?.name || "已选"})` : ""}
                </button>
                <button
                  style={{ padding: "6px 12px", border: "1px solid #f59e0b", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: "#f59e0b", cursor: refiningShotId ? "wait" : "pointer", fontSize: 12 }}
                  onClick={() => refinePrompt(sh)}
                  disabled={refiningShotId !== ""}
                >
                  {refiningShotId === sh.id ? "⏳ 细化中..." : "✨ AI细化提示词"}
                </button>
                <select
                  value={refineType}
                  onChange={e => setRefineType(e.target.value)}
                  title="选择镜头类型用于AI细化提示词（自动识别/特效/打斗/文戏/氛围/惊悚/运镜/场景）"
                  style={{ padding: "6px 10px", border: "1px solid #7A5CFF", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12 }}
                >
                  {REFINE_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <button
                  style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                  onClick={() => {
                    setEditingShotId(sh.id);
                    setEditingPrompt(sh.promptCn || sh.sceneDesc || "");
                  }}
                >
                  ✏️ 编辑提示词
                </button>
                {sh.videoUrl && (
                  <>
                    <button
                      style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                      onClick={async () => {
                        const filename = `${sh.title || 'video'}.mp4`;
                        try {
                          if (sh.videoUrl.startsWith('blob:') || sh.videoUrl.startsWith('data:')) {
                            const r = await fetch(sh.videoUrl);
                            const b = await r.blob();
                            await saveBlob(filename, b, { log });
                          } else {
                            const success = await downloadUrl(sh.videoUrl, filename, { log });
                            if (!success) {
                              if (confirm('直接下载失败，是否在浏览器中打开？')) {
                                window.open(sh.videoUrl, '_blank');
                              }
                            }
                          }
                        } catch (e) {
                          if (log) log(`❌ 下载失败：${String((e && e.message) || e)}`);
                        }
                      }}
                    >
                      ⬇️ 下载
                    </button>
                    <button
                      style={{ padding: "6px 12px", border: "1px solid #ef4444", borderRadius: 6, background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
                      onClick={() => {
                        if (window.confirm("确定要清除这个视频吗？")) {
                          update({ shots: shots.map(s => s.id === sh.id ? { ...s, videoUrl: null } : s) });
                        }
                      }}
                    >
                      🗑 清除
                    </button>
                  </>
                )}
              </div>
              {/* 角色选择列表 */}
              {showCharSelect === sh.id && (
                <div style={{ marginTop: 12, padding: 12, border: "1px solid #10b981", borderRadius: 8, background: "rgba(16,185,129,0.05)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#10b981", marginBottom: 8 }}>
                    👤 选择参考角色（不选则自动匹配）
                  </div>
                  {characters.filter(c => c.image).length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>暂无角色图片，请先在「人物管理」生成角色参考图</div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {characters.filter(c => c.image).map(c => {
                        const selected = sh.selectedCharIds?.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleCharSelection(sh, c.id)}
                            style={{
                              width: 60, height: 80, borderRadius: 6, overflow: "hidden", cursor: "pointer",
                              border: selected ? "2px solid #10b981" : "2px solid transparent",
                              boxShadow: selected ? "0 0 8px rgba(16,185,129,0.5)" : "none",
                              position: "relative"
                            }}
                          >
                            <img src={c.image} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            {selected && (
                              <div style={{ position: "absolute", top: 2, right: 2, background: "#10b981", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</div>
                            )}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 9, padding: "2px 4px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
                    已选择 {sh.selectedCharIds?.length || 0} 个角色 · 点击角色图片可勾选/取消
                  </div>
                </div>
              )}
              {/* 场景选择列表 */}
              {showSceneSelect === sh.id && (
                <div style={{ marginTop: 12, padding: 12, border: "1px solid #f59e0b", borderRadius: 8, background: "rgba(245,158,11,0.05)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", marginBottom: 8 }}>
                    🎬 选择场景（保证场景一致性：生成视频时自动使用场景参考图 + 并入场景设定）
                  </div>
                  {scenes.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      暂无场景资产，请先在顶部「🎬 场景资产」面板点击「分析剧本场景」或「添加场景」
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {scenes.map(sc => {
                        const selected = sh.selectedSceneId === sc.id;
                        return (
                          <div
                            key={sc.id}
                            onClick={() => toggleSceneSelection(sh, sc.id)}
                            style={{
                              width: 88, height: 100, borderRadius: 6, overflow: "hidden", cursor: "pointer",
                              border: selected ? "2px solid #f59e0b" : "2px solid transparent",
                              boxShadow: selected ? "0 0 8px rgba(245,158,11,0.5)" : "none",
                              position: "relative", background: "var(--input-bg)",
                              display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                          >
                            {sc.image ? (
                              <img src={sc.image} alt={sc.name} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} onClick={(e) => { e.stopPropagation(); setPreviewSceneImage(sc.image); }} />
                            ) : (
                              <span style={{ fontSize: 24 }}>🏞️</span>
                            )}
                            {selected && (
                              <div style={{ position: "absolute", top: 2, right: 2, background: "#f59e0b", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✓</div>
                            )}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 9, padding: "2px 4px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sc.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
                    {sh.selectedSceneId
                      ? `已选场景：${scenes.find(sc => sc.id === sh.selectedSceneId)?.name || "（场景已删除）"}`
                      : "未选择场景（默认不使用场景参考）"} · 点击场景卡片可选中/取消（单选）
                  </div>
                </div>
              )}
              {/* 模块内编辑提示词区域 */}
              {editingShotId === sh.id && (
                <div style={{ marginTop: 12, padding: 12, border: "1px solid #7A5CFF", borderRadius: 8, background: "rgba(122,92,255,0.05)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#7A5CFF", marginBottom: 8 }}>✏️ 编辑视频提示词</div>
                  <textarea
                    value={editingPrompt}
                    onChange={(e) => setEditingPrompt(e.target.value)}
                    style={{ width: "100%", minHeight: 100, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 12, resize: "vertical", fontFamily: "inherit" }}
                    placeholder="输入视频生成提示词..."
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                    <button
                      style={{ padding: "6px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                      onClick={() => {
                        setEditingShotId("");
                        setEditingPrompt("");
                      }}
                    >
                      取消
                    </button>
                    <button
                      style={{ padding: "6px 16px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                      onClick={() => {
                        update({ shots: shots.map(s => s.id === sh.id ? { ...s, promptCn: editingPrompt } : s) });
                        setEditingShotId("");
                        setEditingPrompt("");
                        log(`「${sh.title}」提示词已更新`);
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {previewSceneImage && (
        <div
          onClick={() => setPreviewSceneImage("")}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
        >
          <img src={previewSceneImage} alt="场景大图" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
