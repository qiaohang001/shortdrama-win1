// 应用设置工具函数
// 用于读取和管理保存在localStorage中的APP_SETTINGS

const SETTINGS_KEY = "APP_SETTINGS";

// 默认设置
export const DEFAULT_APP_SETTINGS = {
  autoSave: true,
  autoSaveInterval: 30, // 秒
  defaultResolution: "768p竖",
  defaultDuration: 5, // 秒
  defaultVideoMode: "I2V",
  showGenerateLog: true,
  autoAddToAssets: true,
  notificationSound: true,
  language: "zh-CN",
  // 自定义下载/导出目录（空 = 系统「下载」目录）
  downloadDir: "",
};

// 获取所有设置
export function getAppSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("[AppSettings] 读取设置失败:", e);
  }
  return { ...DEFAULT_APP_SETTINGS };
}

// 获取单个设置
export function getAppSetting(key, defaultValue = null) {
  const settings = getAppSettings();
  if (key in settings) {
    return settings[key];
  }
  return defaultValue !== null ? defaultValue : (DEFAULT_APP_SETTINGS[key] ?? null);
}

// 保存设置
export function saveAppSettings(settings) {
  try {
    const current = getAppSettings();
    const newSettings = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    return newSettings;
  } catch (e) {
    console.warn("[AppSettings] 保存设置失败:", e);
    return null;
  }
}

// 保存单个设置
export function saveAppSetting(key, value) {
  return saveAppSettings({ [key]: value });
}

// 重置为默认设置
export function resetAppSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_APP_SETTINGS));
    return { ...DEFAULT_APP_SETTINGS };
  } catch (e) {
    console.warn("[AppSettings] 重置设置失败:", e);
    return null;
  }
}

// 视频分辨率选项
export const RESOLUTION_OPTIONS = [
  { value: "480p竖", label: "480p 竖屏" },
  { value: "480p横", label: "480p 横屏" },
  { value: "768p竖", label: "768p 竖屏" },
  { value: "768p横", label: "768p 横屏" },
  { value: "1080p竖", label: "1080p 竖屏" },
  { value: "1080p横", label: "1080p 横屏" },
];

// 视频时长选项
export const DURATION_OPTIONS = [3, 5, 8, 10];

// 视频模式选项
export const VIDEO_MODE_OPTIONS = [
  { value: "T2V", label: "文生视频 (T2V)" },
  { value: "I2V", label: "图生视频 (I2V)" },
  { value: "R2V", label: "首尾帧 (R2V)" },
  { value: "IA2V", label: "图音生视频 (IA2V)" },
];

// ========== 通知提示音 ==========
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  return audioContext;
}

// 播放提示音
export function playNotificationSound(type = "success") {
  if (!getAppSetting("notificationSound", true)) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === "success") {
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    } else if (type === "error") {
      oscillator.frequency.setValueAtTime(300, ctx.currentTime);
      oscillator.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
    } else {
      oscillator.frequency.setValueAtTime(660, ctx.currentTime);
    }
    
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn("[NotificationSound] 播放失败:", e);
  }
}

// ========== 多语言支持 ==========
const LANG_PACKS = {
  "zh-CN": {
    "app.title": "烬序·影墟",
    "menu.home": "首页",
    "menu.script": "剧本",
    "menu.characters": "角色",
    "menu.storyboard": "分镜",
    "menu.video": "视频",
    "menu.dubbing": "配音",
    "menu.3d": "3D导演台",
    "menu.edit": "剪辑",
    "menu.assets": "素材库",
    "settings.title": "设置",
    "settings.general": "常用设置",
    "settings.appearance": "外观设置",
    "settings.about": "关于我们",
    "settings.autoSave": "自动保存",
    "settings.autoSaveInterval": "自动保存间隔",
    "settings.defaultResolution": "默认视频分辨率",
    "settings.defaultDuration": "默认视频时长",
    "settings.defaultVideoMode": "默认视频模式",
    "settings.showGenerateLog": "显示生成日志",
    "settings.autoAddToAssets": "自动存入素材库",
    "settings.notificationSound": "通知提示音",
    "settings.language": "语言",
    "btn.save": "保存",
    "btn.cancel": "取消",
    "btn.confirm": "确认",
    "btn.generate": "生成",
    "btn.upload": "上传",
    "msg.success": "操作成功",
    "msg.error": "操作失败",
    "msg.loading": "加载中...",
    "msg.noData": "暂无数据",
  },
  "en-US": {
    "app.title": "JINSU·Shadow",
    "menu.home": "Home",
    "menu.script": "Script",
    "menu.characters": "Characters",
    "menu.storyboard": "Storyboard",
    "menu.video": "Video",
    "menu.dubbing": "Dubbing",
    "menu.3d": "3D Director",
    "menu.edit": "Editor",
    "menu.assets": "Assets",
    "settings.title": "Settings",
    "settings.general": "General",
    "settings.appearance": "Appearance",
    "settings.about": "About",
    "settings.autoSave": "Auto Save",
    "settings.autoSaveInterval": "Auto Save Interval",
    "settings.defaultResolution": "Default Resolution",
    "settings.defaultDuration": "Default Duration",
    "settings.defaultVideoMode": "Default Video Mode",
    "settings.showGenerateLog": "Show Generate Log",
    "settings.autoAddToAssets": "Auto Add to Assets",
    "settings.notificationSound": "Notification Sound",
    "settings.language": "Language",
    "btn.save": "Save",
    "btn.cancel": "Cancel",
    "btn.confirm": "Confirm",
    "btn.generate": "Generate",
    "btn.upload": "Upload",
    "msg.success": "Success",
    "msg.error": "Error",
    "msg.loading": "Loading...",
    "msg.noData": "No Data",
  },
};

// 翻译函数
export function t(key, defaultValue = null) {
  const lang = getAppSetting("language", "zh-CN");
  const pack = LANG_PACKS[lang] || LANG_PACKS["zh-CN"];
  if (key in pack) {
    return pack[key];
  }
  return defaultValue !== null ? defaultValue : key;
}

// 语言选项
export const LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
];
