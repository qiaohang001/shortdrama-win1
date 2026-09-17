import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
// shell模块使用动态导入，避免Tauri v2版本不兼容导致构建失败
import { ThreePane, TaskCard, MenuBar, StatusBar, DockNav, TopBar, applyTheme, openDB, SessionProvider, BillingUI, AccountButton } from "@dual/ui";
import { NewScriptModule } from "./components/NewScript/NewScriptModule.jsx";
import { CharacterManager } from "./components/NewScript/CharacterManager.jsx";
import { StoryboardBoard } from "./components/NewScript/StoryboardBoard.jsx";
import { VideoGenBoard } from "./components/NewScript/VideoGenBoard.jsx";
import { EditExport } from "./components/NewScript/EditExport.jsx";
import { Director3D } from "./components/Director3D";
import { DubbingBoard } from "./components/DubbingBoard";
import { TemplateMarket } from "./components/TemplateMarket";
import { AssetLibrary } from "./components/AssetLibrary.jsx";
import { RechargeModal } from "./components/RechargeModal.jsx";
import { getAppSetting, playNotificationSound, t } from "./utils/app-settings.js";
import AuthModal from "./components/AuthModal.jsx";
import { openPurchasePage } from "./utils/openExternal.js";
import { MembershipModal } from "./components/MembershipModal.jsx";
import { CustomSettingsDialog } from "./components/CustomSettingsDialog.jsx";
import { isLoggedIn, getCurrentUser, logout as apiLogout, changePassword } from "./utils/backend-api";
import { getCurrentUser as getDispatchUser, MEMBERSHIP_NAMES } from "./dispatch-jobs";
import { defaultProject, templateProject, cloneProject, packageProject, isPackage, metaOf, PROJECT_TEMPLATES, DRAMA_TYPES, normalizeProject, relTime } from "./utils.js";
import { saveBlob } from "./utils.js";
import jinsuLogo from "./assets/jinsu-logo.png";
import jinsuLogoH from "./assets/jinsu-logo-h.png";


const TABS = [
  { k: "script", t: "剧本创作", icon: "🎬" },
  { k: "characters", t: "人物管理", icon: "👤" },
  { k: "storyboard", t: "分镜与生图", icon: "📝" },
  { k: "dub", t: "配音工作室", icon: "🎙️" },
  { k: "video", t: "视频生成", icon: "🎥" },
  { k: "editor", t: "剪辑导出", icon: "✂️" },
  { k: "stage3d", t: "3D导演台", icon: "🎭", vip: true },
  { k: "library", t: "素材库", icon: "🗂" },
];

// 无限画布 / 3D 导演台「开发中」目标能力清单（对应升级规格 §4.1 / §5.1）。
// 现有基础版仍可使用，以下为后续逐项补齐的验收目标。
const CANVAS_ROADMAP = [
  { heading: "基础操控", items: [
    "无边视口：平移 / 滚轮缩放，无边界，可横向排布数十集工作链路",
    "框选、多选、分组、复制‑粘贴、删除、锁定节点",
    "画布工程本地保存、另存、版本快照，随时回退分镜方案",
    "可拖拽功能节点",
  ] },
  { heading: "节点类型", items: [
    "文本节点：剧情梗概 / 人设 / 台词备注 / 拍摄要求",
    "LLM 节点（GLM‑4‑Flash）：剧本生成、分镜拆解、台词润色",
    "BGE‑M3 检索节点：素材库搜索、桥段查重、风格调取",
    "3D 导演台入口节点，点开即进入虚拟片场",
    "视频生成（Wan‑2.2）/ 音频 TTS / 字幕 / 剪辑合并节点",
    "图片参考、情绪板、场景预设、角色卡片",
  ] },
  { heading: "工作流逻辑", items: [
    "节点连线设定数据流向，上游输出自动下发下游",
    "一键顺序执行整条流水线；改剧本后下游分镜 / 镜头自动刷新",
    "多分支并行，同时生成多种剧情版本对比",
    "连线备注、颜色分类，区分剧情 / 运镜 / 灯光参数链路",
  ] },
  { heading: "短剧专项", items: [
    "按剧集分区，画布左右依次排布第 1‑N 集工作流",
    "镜头卡片自由拖拽调换镜头顺序",
    "单个镜头节点独立调试提示词、单独重生成视频",
    "素材卡片跨剧集复用角色、场景、参考画面",
  ] },
];

const STAGE3D_ROADMAP = [
  { heading: "虚拟场景搭建", items: [
    "内置海量环境预设：都市街道 / 室内居室 / 古风庭院 / 雨夜外景 / 咖啡厅等",
    "自定义地面、墙体、门窗、天空盒、环境雾气、雨雪环境特效",
    "自由摆放桌椅、摆件、交通工具等全部道具资产",
  ] },
  { heading: "角色人偶调度", items: [
    "多虚拟人偶，设定外貌服饰，锁定角色样貌保证视频人脸统一",
    "拖拽更改 XYZ 坐标、身体朝向、视线目标，解决双人对话眼神跑偏",
    "骨骼姿态编辑器：争吵 / 拥抱 / 站立 / 坐下 / 抬手 / 落泪",
    "时间轴关键帧：行走、抬手、奔跑、位移路线，预览完整动作",
  ] },
  { heading: "摄影机系统（核心）", items: [
    "多独立摄像机：远景 / 中景 / 近景 / 人脸特写 / 过肩 / 俯拍 / 低角度",
    "自定义画幅，固定 9:16 竖屏比例与安全构图框",
    "运镜参数：缓慢推镜 / 拉镜 / 环绕 / 跟随 / 镜头抖动",
    "机位快照，导出每个摄像机视角预览图作为构图参考",
  ] },
  { heading: "灯光与氛围", items: [
    "拖拽式主光 / 辅光 / 轮廓光 / 环境光 / 点光源",
    "亮度、色温、软硬阴影、彩色氛围光",
    "模板套用：昏暗烛光 / 冷调雨夜 / 午后暖阳 / 霓虹夜景",
  ] },
  { heading: "和无限画布互通", items: [
    "从画布剧本节点读取台词、场景需求，自动初始化场景",
    "调好机位 / 灯光 / 人物后，一键输出结构化分镜提示词 + 机位预览图",
    "生成完毕的镜头画面回传到画布视频节点",
    "场景配置保存为可复用节点，下个工程直接载入",
  ] },
  { heading: "高级附加", items: [
    "镜头清单预览，顺序播放分镜机位动画预演成片节奏",
    "遮挡检查，排查人偶被墙体 / 道具挡住脸部等构图缺陷",
    "导出整套片场参数、截图、运镜脚本，供给 AI 视频生成引擎",
  ] },
];

// ── 最近打开追踪（多项目管理增强，纯本地 localStorage）──
const SD_RECENT_KEY = "SD_RECENT_OPEN";
function recordRecentSd(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(SD_RECENT_KEY) || "[]");
    const next = [{ id, t: Date.now() }, ...arr.filter((x) => x.id !== id)].slice(0, 16);
    localStorage.setItem(SD_RECENT_KEY, JSON.stringify(next));
  } catch (_) {}
}
function recentMapSd() {
  try { return new Map(JSON.parse(localStorage.getItem(SD_RECENT_KEY) || "[]").map((x) => [x.id, x.t])); } catch { return new Map(); }
}

export function App() {
  const [db, setDb] = useState(null);
  // 自动迁移旧的HTTP API地址到HTTPS
  useEffect(() => {
    try {
      const oldUrl = localStorage.getItem("DISPATCH_BASE_URL");
      if (oldUrl && oldUrl.startsWith("http://")) {
        const newUrl = oldUrl.replace("http://", "https://");
        localStorage.setItem("DISPATCH_BASE_URL", newUrl);
        console.log("[API地址迁移] 已将旧的HTTP地址升级为HTTPS:", oldUrl, "->", newUrl);
      }
    } catch (e) {}
  }, []);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("script");
  const [logLines, setLogLines] = useState([]);
  const [isVip, setIsVip] = useState(() => {
    try { return localStorage.getItem("USER_VIP_STATUS") === "true"; } catch { return false; }
  });
  // 带时间戳的可视日志：所有生成/操作状态都带时间，便于判断「还在跑」还是「卡住」。
  const log = useCallback((m) => {
    const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogLines((prev) => [...prev.slice(-50), `[${ts}] ${m}`]);
    // 通知提示音：根据日志内容播放对应的提示音
    try {
      if (m.includes("成功") || m.includes("✅") || m.includes("完成")) {
        playNotificationSound("success");
      } else if (m.includes("失败") || m.includes("❌") || m.includes("错误") || m.includes("异常")) {
        playNotificationSound("error");
      }
    } catch (e) {}
  }, []);

  const [theme, setTheme] = useState(() => localStorage.getItem("THEME") || "dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [showTemplateMarket, setShowTemplateMarket] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [membershipInfo, setMembershipInfo] = useState(null);
  // 全局价格配置（从调度机动态获取）
  const [pricing, setPricing] = useState(null);
  // 登录状态管理
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [showAuth, setShowAuth] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [authMode, setAuthMode] = useState("login");
  const [feat, setFeat] = useState(() => {
    try { return JSON.parse(localStorage.getItem("SD_FEATURES") || "{}"); } catch { return {}; }
  });
  const fileInputRef = useRef(null);

  // 打开用户手册（提示用户手动打开，避免Tauri v2模块导入导致构建失败）
  const openUserManual = useCallback(() => {
    alert("用户手册已打包到软件安装目录中。\n\n请在软件安装目录中找到「用户手册.md」文件，用记事本或Markdown编辑器打开查看。");
  }, []);

  // 从调度机获取全局价格配置
  const fetchPricing = useCallback(async () => {
    try {
      const baseUrl = (localStorage.getItem("DISPATCH_BASE_URL") || "https://api.jinsuai.cn").replace(/\/$/, "");
      const resp = await fetch(`${baseUrl}/api/pricing`);
      if (resp.ok) {
        const data = await resp.json();
        setPricing(data);
        // 暴露到window对象，方便各个组件访问
        window.APP_PRICING = data;
        console.log("[价格配置] 从调度机获取成功:", data);
      } else {
        console.warn("[价格配置] 获取失败，使用默认价格");
      }
    } catch (e) {
      console.warn("[价格配置] 获取异常:", e.message);
    }
  }, []);

  // 从调度机获取用户信息（积分+会员状态）
  const fetchDispatchUserInfo = useCallback(async () => {
    // 检查调度机token
    const dispatchToken = localStorage.getItem("DISPATCH_TOKEN");
    if (!dispatchToken) {
      console.log("[用户信息] 没有DISPATCH_TOKEN，跳过获取");
      return;
    }
    try {
      console.log("[用户信息] 开始从调度机获取用户信息...");
      const user = await getDispatchUser();
      console.log("[用户信息] 获取成功:", user);
      
      // 更新积分
      setCreditBalance(user.credits || 0);
      
      // 如果currentUser不存在，自动设置一个基本的currentUser（确保积分能显示）
      if (!currentUser) {
        setCurrentUser({
          username: user.username || user.phone || "用户",
          nickname: user.nickname || user.username || "用户",
          ...user
        });
      }
      
      // 更新会员状态
      const level = user.membership_level || 0;
      const isVip = level > 0;
      setIsVip(isVip);
      try { localStorage.setItem("USER_VIP_STATUS", isVip ? "true" : "false"); } catch {}
      // 计算剩余天数
      let daysRemaining = 0;
      if (user.membership_expiry) {
        const expiry = new Date(user.membership_expiry);
        const now = new Date();
        daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      }
      // 折扣率
      const discountMap = { 0: 1, 1: 0.9, 2: 0.85, 3: 0.8 };
      setMembershipInfo({
        plan_name: MEMBERSHIP_NAMES[level] || "免费用户",
        plan: MEMBERSHIP_NAMES[level] || "免费用户",
        is_vip: isVip,
        is_active: isVip,
        level: level,
        expired_at: user.membership_expiry,
        days_remaining: daysRemaining,
        discount_rate: discountMap[level] || 1,
        monthly_quota: user.monthly_quota,
        monthly_used: user.monthly_used,
      });
    } catch (e) {
      console.error("从调度机获取用户信息失败:", e);
    }
  }, []);

  // 登录成功处理
  const handleLoginSuccess = useCallback((user) => {
    setCurrentUser(user);
    setShowAuth(false);
    // 登录成功后从调度机获取积分和会员状态
    fetchDispatchUserInfo();
  }, [fetchDispatchUserInfo]);

  // 登出处理
  const handleLogout = useCallback(async () => {
    await apiLogout();
    setCurrentUser(null);
    setCreditBalance(0);
  }, []);

  // 修改密码相关状态和函数
  const [changePwdForm, setChangePwdForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [changePwdMsg, setChangePwdMsg] = useState(null);

  const handleChangePassword = async () => {
    setChangePwdMsg(null);
    if (!changePwdForm.oldPassword || !changePwdForm.newPassword || !changePwdForm.confirmPassword) {
      setChangePwdMsg({ type: "error", text: "请填写所有密码字段" });
      return;
    }
    if (changePwdForm.newPassword !== changePwdForm.confirmPassword) {
      setChangePwdMsg({ type: "error", text: "两次输入的新密码不一致" });
      return;
    }
    if (changePwdForm.newPassword.length < 6) {
      setChangePwdMsg({ type: "error", text: "新密码长度不能少于6位" });
      return;
    }
    setChangePwdLoading(true);
    try {
      await changePassword(changePwdForm.oldPassword, changePwdForm.newPassword);
      setChangePwdMsg({ type: "success", text: "密码修改成功" });
      setChangePwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      setChangePwdMsg({ type: "error", text: e.message || "密码修改失败" });
    } finally {
      setChangePwdLoading(false);
    }
  };

  // 打开登录弹窗
  const openLogin = useCallback((mode = "login") => {
    setAuthMode(mode);
    setShowAuth(true);
  }, []);

  // 调度机登录态恢复。
  // 旧实现把明文密码存在 localStorage（DISPATCH_PASS / JINSU_LOGIN_PASSWORD），
  // 启动时再拿它去登录 —— 等于把用户密码明文留在磁盘上，任何人读到这两个键即可接管账号。
  // 改为：只用已保存的 token 向调度机核验，失效就清掉让用户重新登录。
  useEffect(() => {
    const restoreDispatchSession = async () => {
      const token = localStorage.getItem("DISPATCH_TOKEN");
      if (!token) return;
      try {
        const base = (localStorage.getItem("DISPATCH_BASE_URL") || "https://api.jinsuai.cn").replace(/\/$/, "");
        const res = await fetch(`${base}/api/auth/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          localStorage.removeItem("DISPATCH_TOKEN");
          localStorage.removeItem("DISPATCH_USER");
          console.log("[调度机] 登录态已失效，请重新登录");
        }
      } catch (e) {
        // 网络异常时保留 token，不误清登录态
        console.error("[调度机] 校验登录态异常:", e.message);
      }
    };
    restoreDispatchSession();
  }, []);

  // 初始化：检查登录状态并从调度机获取积分和会员状态
  useEffect(() => {
    // 启动时获取全局价格配置
    fetchPricing();
    
    // 自动登录调度机（如果没有 token 但有保存的账号密码）
    const autoLoginDispatch = async () => {
      const token = localStorage.getItem("DISPATCH_TOKEN");
      if (token) return;
      const username = localStorage.getItem("DISPATCH_USER");
      const password = localStorage.getItem("DISPATCH_PASS");
      if (!username || !password) return;
      try {
        const base = (localStorage.getItem("DISPATCH_BASE_URL") || "https://api.jinsuai.cn").replace(/\/$/, "");
        const res = await fetch(base + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
          localStorage.setItem("DISPATCH_TOKEN", data.token);
          console.log("[调度机] 启动时自动登录成功");
        }
      } catch (e) {
        console.error("[调度机] 启动时自动登录失败:", e.message);
      }
    };
    autoLoginDispatch();
    
    const dispatchToken = localStorage.getItem("DISPATCH_TOKEN");
    
    // 如果有调度机token但没有currentUser，自动设置一个基本的currentUser
    if (dispatchToken && !currentUser) {
      const username = localStorage.getItem("DISPATCH_USER") || "用户";
      setCurrentUser({ username, nickname: username });
    }
    
    // 如果有调度机token，获取用户信息
    if (dispatchToken) {
      fetchDispatchUserInfo();
    }
    
    // 全局积分更新回调（子组件扣减积分后调用）
    window.onCreditUpdate = (balance) => {
      setCreditBalance(balance);
    };
    // 全局用户信息刷新函数（事件驱动，开通会员/充值/扣积分后调用）
    window.refreshUserInfo = () => {
      if (localStorage.getItem("DISPATCH_TOKEN")) {
        fetchDispatchUserInfo();
      }
    };
    return () => {
      delete window.onCreditUpdate;
      delete window.refreshUserInfo;
    };
  }, [fetchDispatchUserInfo]);

  const [page, setPage] = useState(null);
  // 3D导演台渲染的首帧图片，传递给视频生成模块
  const [externalFirstFrame, setExternalFirstFrame] = useState(null);
  // 素材库联动：配音草稿（chunk + nonce）与剪辑片段。
  const [dubChunk, setDubChunk] = useState("");
  const [dubNonce, setDubNonce] = useState(0);
  const [dubAudio, setDubAudio] = useState(null);
  const [editorAssets, setEditorAssets] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trashList, setTrashList] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  // 强制刷新任务已用时间（每秒一次），必须放在所有提前 return 之前。
  const [, forceTick] = useState(0);

  const useAssetDub = (a) => {
    const t = (a.text || a.title || "").trim();
    const line = t ? `【素材·${a.title}】\n${t}` : `【素材·${a.title}】（无文本，音频源：${a.url || ""}）`;
    setDubChunk(line);
    setDubNonce((n) => n + 1);
    setDubAudio(a.type === "audio" ? a.url : null);
    setPage(null); setTab("dub");
    log(`已将素材「${a.title}」送入配音。`);
  };
  const useAssetEdit = (a) => {
    setEditorAssets((prev) => prev.some((x) => x.id === a.id) ? prev : [...prev, a]);
    setPage(null); setTab("editor");
    log(`已将素材「${a.title}」加入剪辑时间线。`);
  };
  // 剪辑器消费完 incomingAssets 后回调清空，避免同一批素材被重复添加
  const clearEditorAssets = useCallback(() => setEditorAssets([]), []);

  useEffect(() => {
    // 使用@dual/ui的applyTheme设置主题（恢复软件最开始的颜色）
    applyTheme(theme);
  }, [theme]);

  const featOn = (k) => feat[k] !== false;
  const toggleFeat = (k) => setFeat((f) => {
    const n = { ...f, [k]: f[k] === false ? true : false };
    localStorage.setItem("SD_FEATURES", JSON.stringify(n));
    return n;
  });

  useEffect(() => {
    let alive = true;
    openDB().then(async (d) => {
      if (!alive) return;
      setDb(d);
      let list = (await d.listProjects("shortdrama")).map((p) => ({ id: p.id, ...metaOf(p.data), updatedAt: p.updatedAt }));
      if (list.length === 0) {
        const def = defaultProject("我的第一部短剧");
        await d.saveProject("shortdrama", def.id, def);
        list = [{ id: def.id, ...metaOf(def), updatedAt: Date.now() }];
      }
      if (!alive) return;
      setProjects(list);
      setActiveId(list[0].id);
    }).catch((e) => { if (alive) log("数据库初始化失败：" + e.message); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!db || !activeId) return;
    let alive = true;
    db.loadProject("shortdrama", activeId).then((data) => { if (alive && data) setProject(normalizeProject(data)); });
    return () => { alive = false; };
  }, [db, activeId]);

  // 从调度机获取会员状态（每60秒刷新一次）
  useEffect(() => {
    const dispatchToken = localStorage.getItem("DISPATCH_TOKEN");
    if (!dispatchToken) {
      setIsVip(false);
      setMembershipInfo(null);
      try { localStorage.setItem("USER_VIP_STATUS", "false"); } catch {}
      return;
    }
    fetchDispatchUserInfo();
    const timer = setInterval(fetchDispatchUserInfo, 60000);
    return () => clearInterval(timer);
  }, [currentUser, fetchDispatchUserInfo]);

  useEffect(() => {
    if (!db || !activeId || !project) return;
    // 根据用户设置控制自动保存
    if (!getAppSetting("autoSave", true)) return;
    const interval = Number(getAppSetting("autoSaveInterval", 30)) * 1000;
    // interval 已经是毫秒，之前套 Math.min(400, interval) 导致恒为 400ms，
    // 用户设置的「自动保存间隔」完全失效，且每次改动都全量写一次 IndexedDB。
    const t = setTimeout(() => db.saveProject("shortdrama", activeId, project), interval);
    return () => clearTimeout(t);
  }, [db, activeId, project]);

  // 任务时间显示：活跃任务每秒刷新「已用时间」。必须放在任何提前 return 之前。
  const activeQueueLength = (project?.tasks || []).filter((t) => ["pending", "running", "paused"].includes(t.status)).length;
  useEffect(() => {
    if (activeQueueLength > 0) {
      const i = setInterval(() => forceTick((x) => x + 1), 1000);
      return () => clearInterval(i);
    }
  }, [activeQueueLength]);

  if (!project) {
    return <div style={{ padding: 40, color: "var(--text-muted, #5d6779)", background: "var(--bg, #0b0f17)", height: "100vh", boxSizing: "border-box", whiteSpace: "pre-wrap" }}>{logLines.length ? <span style={{ color: "var(--danger, #ef4444)" }}>{logLines.slice(-3).join("\n")}</span> : "加载中…"}</div>;
  }

  // 确保项目有默认字段，避免 undefined.scenes 报错
  if (!project.scenes) project.scenes = [];
  if (!project.episodes) project.episodes = [];
  if (!project.shots) project.shots = [];
  if (!project.materials) project.materials = { characters: [], scenes: [] };
  if (!project.characters) project.characters = [];
  if (!project.tasks) project.tasks = [];
  if (!project.dramaType) project.dramaType = "real";
  if (!project.outline) project.outline = { synopsis: "" };
  if (!project.script) project.script = "";

  const recent = recentMapSd(); // 最近打开映射（首页用）

  const update = (patch) => setProject((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  const switchProject = (id) => { recordRecentSd(id); setActiveId(id); };
  const deleteProject = async () => {
    if (projects.length <= 1) { log("至少保留一个项目。"); return; }
    if (!window.confirm("删除当前短剧项目？不可撤销。")) return;
    await db.deleteProject("shortdrama", activeId);
    const rest = projects.filter((p) => p.id !== activeId);
    setProjects(rest);
    setActiveId(rest[0].id);
  };
  const renameProject = (title) => {
    setProject((p) => ({ ...p, title }));
    setProjects((l) => l.map((x) => (x.id === activeId ? { ...x, title } : x)));
  };

  // ── 项目元数据：置顶 / 归档 / 标签（缺陷 §1 / §3）────
  const applyMeta = async (id, patch) => {
    if (!db) return;
    const rec = await db.loadProject("shortdrama", id);
    if (!rec) return;
    const next = { ...rec, ...patch };
    await db.saveProject("shortdrama", id, next);
    setProjects((l) => l.map((p) => (p.id === id ? { ...p, ...metaOf(next) } : p)));
    if (id === activeId) setProject((p) => ({ ...p, ...patch }));
  };
  const togglePin = (id) => { const p = projects.find((x) => x.id === id); applyMeta(id, { pinned: !(p && p.pinned) }); };
  const toggleArchive = (id) => { const p = projects.find((x) => x.id === id); applyMeta(id, { archived: !(p && p.archived) }); };
  const addTag = (id, tag) => {
    const p = projects.find((x) => x.id === id); if (!p || !tag) return;
    const tags = Array.from(new Set([...(p.tags || []), tag]));
    applyMeta(id, { tags });
  };
  const removeTag = (id, tag) => {
    const p = projects.find((x) => x.id === id); if (!p) return;
    applyMeta(id, { tags: (p.tags || []).filter((t) => t !== tag) });
  };

  // ── 克隆 / 模板 / 导入工程包（缺陷 §1 / §3）────
  const newProject = async (tpl, dramaType) => {
    const def = tpl ? templateProject(tpl, null) : defaultProject("新短剧 " + (projects.length + 1));
    def.dramaType = dramaType || def.dramaType || "real";
    await db.saveProject("shortdrama", def.id, def);
    setProjects((l) => [{ id: def.id, ...metaOf(def) }, ...l]);
    setActiveId(def.id);
    setTab("script");
    setPage(null);
  };
  const cloneCurrent = async () => {
    const copy = cloneProject(project, (project.title || "项目") + " 副本");
    await db.saveProject("shortdrama", copy.id, copy);
    setProjects((l) => [{ id: copy.id, ...metaOf(copy) }, ...l]);
    setActiveId(copy.id);
    log("已克隆项目：" + copy.title);
  };
  const importProject = async (data) => {
    if (!data || typeof data !== "object") { log("文件格式无效。"); return; }
    let p;
    if (isPackage(data)) p = { ...data.project, id: "sd_" + Date.now(), createdAt: Date.now() };
    else p = { ...data, id: "sd_" + Date.now(), createdAt: Date.now() };
    await db.saveProject("shortdrama", p.id, p);
    setProjects((l) => [{ id: p.id, ...metaOf(p) }, ...l]);
    setActiveId(p.id);
    setTab("script"); setPage(null);
    log("已导入工程：" + (p.title || "(未命名)") + (isPackage(data) ? "（工程包）" : ""));
  };

  // ── 回收站（缺陷 §3：缺回收站）────
  const moveToTrash = async (id) => {
    if (projects.length <= 1) { log("至少保留一个项目。"); return; }
    const rec = await db.loadProject("shortdrama", id);
    if (!rec) return;
    if (!window.confirm("将「" + (rec.title || "未命名") + "」移入回收站？可从回收站恢复。")) return;
    await db.saveProject("shortdrama_trash", id, { ...rec, _trashAt: Date.now() });
    await db.deleteProject("shortdrama", id);
    const rest = projects.filter((p) => p.id !== id);
    setProjects(rest);
    if (activeId === id) { setActiveId(rest[0]?.id); setPage(null); }
    log("已移入回收站：" + (rec.title || ""));
  };
  const openTrash = async () => {
    const t = await db.listProjects("shortdrama_trash");
    setTrashList(t.map((r) => ({ id: r.id, title: r.data.title, trashAt: r.data._trashAt, data: r.data })));
    setShowTrash(true);
  };
  const restoreTrash = async (id) => {
    const rec = await db.loadProject("shortdrama_trash", id);
    if (!rec) return;
    delete rec._trashAt;
    await db.saveProject("shortdrama", id, rec);
    await db.deleteProject("shortdrama_trash", id);
    setProjects((l) => [{ id, ...metaOf(rec) }, ...l]);
    setTrashList((l) => l.filter((x) => x.id !== id));
    log("已从回收站恢复：" + (rec.title || ""));
  };
  const purgeTrash = async (id) => {
    await db.deleteProject("shortdrama_trash", id);
    setTrashList((l) => l.filter((x) => x.id !== id));
    log("已永久删除。");
  };
  const emptyTrash = async () => {
    const t = await db.listProjects("shortdrama_trash");
    for (const r of t) await db.deleteProject("shortdrama_trash", r.id);
    setTrashList([]);
    log("回收站已清空。");
  };

  // ── 工程包导出（缺陷 §3：素材不能随 JSON 打包）────
  const exportPackage = async () => {
    const blob = new Blob([JSON.stringify(packageProject(project), null, 2)], { type: "application/json" });
    const res = await saveBlob((project.title || "shortdrama") + "_工程包.json", blob, { log });
    if (res.ok) log("已导出工程包（含全部资产链接）：" + (res.path || ""));
    else if (res.err) log("导出失败：" + res.err);
  };
  const onPkgPicked = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { importProject(JSON.parse(reader.result)); } catch { log("导入失败：文件格式无效"); } };
    reader.readAsText(f);
    e.target.value = "";
  };

  // ── 任务队列控制（缺陷 §11：暂停/取消/优先级/重试/批量）────
  const updateTask = (id, patch) => setProject((p) => ({ ...p, tasks: (p.tasks || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const cancelTask = (id) => updateTask(id, { status: "canceled" });
  const pauseTask = (id) => updateTask(id, { status: "paused" });
  const resumeTask = (id) => updateTask(id, { status: "pending" });
  const retryTask = (id) => updateTask(id, { status: "pending", error: null, progress: 0 });
  const setTaskPriority = (id, pri) => updateTask(id, { priority: pri });
  const batchCancelTasks = () => setProject((p) => ({ ...p, tasks: (p.tasks || []).map((t) => (["pending", "running", "paused"].includes(t.status) ? { ...t, status: "canceled" } : t)) }));

  const visibleTabs = TABS.filter((t) => {
    if (t.dev) return false;
    if (t.k === "editor") return featOn("video");
    return true;
  });
  const activeTab = visibleTabs.some((t) => t.k === tab) ? tab : (visibleTabs[0]?.k || "script");

  const exportProject = async () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const res = await saveBlob((project.title || "shortdrama") + ".json", blob, { log });
    if (res.ok) log("已导出项目 JSON：" + (res.path || ""));
    else if (res.err) log("导出失败：" + res.err);
  };
  const exportCastScenes = async () => {
    const shots = project?.shots || [];
    const castCount = new Map();
    shots.forEach((sh) => (sh.dialogues || []).forEach((d) => { const nm = (d.character || "").trim(); if (nm) castCount.set(nm, (castCount.get(nm) || 0) + 1); }));
    const cast = [...castCount.keys()].map((name, i) => ({ id: "cast_" + i, name, lines: castCount.get(name) }));
    const scenes = (project?.scenes || []).map((s) => ({ id: s.id, title: s.title || "场景", desc: s.desc || "", imageUrl: s.imageUrl || null }));
    const data = { kind: "shortdrama-cast-scenes", version: 1, projectTitle: project.title || "", exportedAt: Date.now(), cast, scenes };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const res = await saveBlob((project.title || "shortdrama") + "_角色场景.json", blob, { log });
    if (res.ok) log(`已导出角色与场景：「${cast.length} 位角色 / ${scenes.length} 个场景」，可在 3D 导演台「导入短剧角色/场景」载入：${res.path || ""}`);
    else if (res.err) log("导出失败：" + res.err);
  };
  const importFile = () => { if (fileInputRef.current) fileInputRef.current.click(); };
  const onFilePicked = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { importProject(JSON.parse(reader.result)); } catch { log("导入失败：文件格式无效"); }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  const dockItems = [
    { key: "home", icon: "🏠", label: "首页", group: "入口", active: page === "home", onClick: () => setPage("home") },
    ...visibleTabs.map((t) => ({
      key: t.k, icon: t.icon, label: t.t, group: t.k === "library" ? "资源" : "创作",
      active: page === null && activeTab === t.k,
      onClick: () => { setPage(null); setTab(t.k); },
    })),
    { key: "about", icon: "ℹ️", label: "关于我们", group: "关于", active: page === "about", onClick: () => setPage("about") },
  ];

  let center;
  if (page !== "home" && page !== "about" && !project) {
    center = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>欢迎使用烬序·影墟</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>请先创建一个新项目，或从首页打开已有项目，开始你的短剧创作之旅。</p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button onClick={() => newProject()} style={{ padding: "10px 24px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>✨ 创建新项目</button>
          <button onClick={() => setPage("home")} style={{ padding: "10px 24px", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>🏠 返回首页</button>
        </div>
      </div>
    );
  }
  // 全部标签（首页筛选用）
  const allTags = Array.from(new Set(projects.flatMap((p) => p.tags || []))).filter(Boolean);
  // 当前项目的任务队列（首页快速看板 + 侧栏用）
  const queue = project?.tasks || [];
  const activeQueue = queue.filter((t) => ["pending", "running", "paused"].includes(t.status));
  const failedQueue = queue.filter((t) => t.status === "failed");

  const fmtClock = (ts) => (ts ? new Date(ts).toLocaleTimeString("zh-CN", { hour12: false }) : "");
  const fmtElapsed = (t) => {
    const start = t.startedAt || t.updatedAt || t.createdAt;
    if (!start) return "";
    const end = t.finishedAt || Date.now();
    const s = Math.max(0, Math.floor((end - start) / 1000));
    const m = Math.floor(s / 60), sec = s % 60;
    return (m > 0 ? m + " 分 " : "") + sec + " 秒";
  };
  if (page === "home") center = <HomePage
    projects={projects}
    recentMap={recent}
    activeId={activeId}
    allTags={allTags}
    activeQueue={activeQueue}
    failedQueue={failedQueue}
    onNew={newProject}
    onOpen={(id) => { switchProject(id); setPage(null); setTab("script"); }}
    onEnter={() => { setPage(null); setTab("script"); }}
    onTogglePin={togglePin}
    onToggleArchive={toggleArchive}
    onClone={async (id) => { const rec = await db.loadProject("shortdrama", id); if (!rec) return; const c = cloneProject(rec); await db.saveProject("shortdrama", c.id, c); setProjects((l) => [{ id: c.id, ...metaOf(c) }, ...l]); log("已克隆：" + c.title); }}
    onTrash={moveToTrash}
    onArchive={toggleArchive}
    onOpenTemplates={() => setShowTemplates(true)}
    onOpenAssets={() => { setPage(null); setTab("library"); }}
  />;
  else if (page === "about") center = <AboutPage theme={theme} />;
  else if (activeTab === "script") center = <NewScriptModule project={project} update={update} log={log} onSwitchTab={setTab} />;
  else if (activeTab === "characters") center = <CharacterManager project={project} update={update} log={log} />;
  else if (activeTab === "storyboard") center = <StoryboardBoard project={project} update={update} log={log} />;
  else if (activeTab === "video") center = <VideoGenBoard project={project} update={update} log={log} externalFirstFrame={externalFirstFrame} onClearExternalFirstFrame={() => setExternalFirstFrame(null)} />;
  else if (activeTab === "editor") center = <EditExport
    project={project} update={update} log={log}
    incomingAssets={editorAssets}
    onConsumeAssets={clearEditorAssets}
  />;
  else if (activeTab === "stage3d") {
    if (!isVip) {
      center = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎭</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>3D导演台</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 400, lineHeight: 1.6, marginBottom: 20 }}>3D导演台为VIP专属功能，订阅会员后即可使用完整的3D场景编排、人物布局和机位预设。</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => openPurchasePage("membership")} style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              💎 查看会员套餐
            </button>
          </div>
        </div>
      );
    } else {
      center = <Director3D project={project} update={update} log={log} onRenderFrame={(imageDataUrl) => {
        setExternalFirstFrame(imageDataUrl);
        setTab("video");
        log("已从3D导演台渲染首帧，切换到视频生成模块");
      }} />;
    }
  }
  else if (activeTab === "dub") center = <DubbingBoard
    project={project} update={update} log={log}
    incomingChunk={dubChunk} incomingAudio={dubAudio} chunkNonce={dubNonce}
  />;
  else if (activeTab === "library") center = <AssetLibrary project={project} update={update} log={log} onUseDub={useAssetDub} onUseEdit={useAssetEdit} />;
  else center = <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>未知标签页</div>;

  const episodes = project?.episodes || [];
  const shots = project?.shots || [];
  const scenes = project?.scenes || [];
  const doneScenes = shots.filter((s) => s.videoUrl).length + scenes.filter((s) => s.videoUrl).length;
  const totalScenes = shots.length + scenes.length;

  const menus = [
    { label: "文件", items: [
      { label: "新建项目", onClick: () => newProject() },
      { label: "从模板新建…", onClick: () => setShowTemplates(true) },
      { label: "克隆当前项目", onClick: () => cloneCurrent().catch(() => {}) },
      { label: "归档当前", onClick: () => toggleArchive(activeId) },
      { type: "separator" },
      { label: "导出工程包（含素材）…", onClick: () => exportPackage().catch(() => {}) },
      { label: "导入工程 / 工程包…", onClick: () => importFile() },
      { label: "导出工程 JSON", onClick: () => { exportProject().catch(() => {}); } },
      { label: "导出角色与场景（供 3D 导演台）…", onClick: () => { exportCastScenes().catch(() => {}); } },
      { type: "separator" },
      { label: "移入回收站", onClick: () => moveToTrash(activeId) },
      { label: "回收站…", onClick: () => openTrash().catch(() => {}) },
      { type: "separator" },
      { label: "永久删除当前", onClick: deleteProject },
    ] },
    { label: "视图", items: visibleTabs.map((t) => ({ label: t.t, onClick: () => setTab(t.k) })) },
    { label: "设置", items: [
      { label: "偏好设置…", onClick: () => setShowSettings(true) },
    ] },
    { label: "帮助", items: [
      { label: "用户手册", onClick: () => openUserManual() },
      { label: "关于 烬序・影墟", onClick: () => setPage("about") },
    ] },
  ];

  const isFullscreenCanvas = activeTab === "stage3d";

  return (
    <SessionProvider>
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg, #0b0f17)", fontFamily: "var(--font)" }}>
      <MenuBar menus={menus} />
      <TopBar
        title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={s.badge}>EXE</span><b>烬序・影墟</b></span>}
        actions={<span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--text-muted, #5d6779)", fontSize: 12 }}>{project?.title || "未命名项目"}</span>
          {/* 积分显示（已登录用户） */}
          {currentUser && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, fontSize: 12, color: "#f59e0b" }}>
              💰 {creditBalance} 积分
            </span>
          )}
          <button onClick={() => openPurchasePage("recharge")} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>💰 充值</button>
          {/* 会员状态显示（已登录用户） */}
          {currentUser && isVip && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(234,88,12,0.1))", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, fontSize: 11, color: "#f59e0b" }} title="在设置菜单中打开账户设置查看详情">
              💎 {membershipInfo?.plan_name || membershipInfo?.plan || "VIP会员"} · {membershipInfo?.days_remaining > 0 ? `剩${membershipInfo.days_remaining}天` : (membershipInfo ? "已过期" : "加载中...")}
            </span>
          )}
          {/* 登录/用户信息 */}
          {currentUser ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setShowAccountSettings(true)} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", background: "var(--panel, #161d2a)", color: "var(--text)", cursor: "pointer", fontSize: 12 }} title="账户设置">
                👤 账户
              </button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{currentUser.nickname || currentUser.phone}</span>
              <button onClick={handleLogout} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>退出</button>
            </span>
          ) : (
            <button onClick={() => openLogin("login")} style={{ border: "none", borderRadius: 6, padding: "4px 12px", background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>登录</button>
          )}
        </span>}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <DockNav items={dockItems} textOnly />
        <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
          {isFullscreenCanvas ? (
            <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>{center}</div>
          ) : (
          <ThreePane
            leftWidth={200}
            right={null}
            left={(
              <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 14 }}>
                <div style={s.sdHead}>项目</div>
                <select style={s.select} value={activeId || ""} onChange={(e) => switchProject(e.target.value)}>
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
                </select>
                <input style={{ ...s.select, marginTop: 10 }} value={project?.title || "未命名项目"} onChange={(e) => renameProject(e.target.value)} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={s.ghostBtn} onClick={newProject}>+ 新项目</button>
                  <button style={s.ghostBtnDanger} onClick={deleteProject}>删除</button>
                </div>
                <div style={{ borderTop: "1px solid var(--border, rgba(255,255,255,0.08))", margin: "14px 0", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted, #5d6779)", marginBottom: 8 }}>进度</div>
                  <div style={s.progressTrack}><div style={{ ...s.progressFill, width: `${totalScenes ? (doneScenes / totalScenes * 100) : 0}%` }} /></div>
                  <div style={{ fontSize: 11, color: "var(--text-muted, #5d6779)", marginTop: 4 }}>{doneScenes}/{totalScenes} 分场已出片</div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ borderTop: "1px solid var(--border, rgba(255,255,255,0.08))", paddingTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted, #5d6779)" }}>任务队列（{activeQueue.length} 进行中）</span>
                    {activeQueue.length > 0 && (
                      <button style={s.miniLink} onClick={batchCancelTasks}>全部取消</button>
                    )}
                  </div>
                  {(project?.tasks || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted, #5d6779)" }}>暂无任务</div>
                  ) : (
                    (project.tasks || []).map((t) => {
                      const pct = Math.max(0, Math.min(100, t.progress ?? 0));
                      const stColor = { pending: "#f59e0b", running: "#3b82f6", paused: "#a855f7", done: "#22c55e", failed: "#ef4444", canceled: "#64748b" }[t.status] || "#64748b";
                      return (
                        <div key={t.id} style={{ border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 8, padding: "8px 10px", marginBottom: 8, background: "var(--panel, #161d2a)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: "var(--text, #e8ecf3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{t.label}</span>
                            <span style={{ color: stColor, fontSize: 11, flex: "0 0 auto", marginLeft: 6 }}>{t.status === "running" ? "渲染中" : t.status === "pending" ? "排队" : t.status === "paused" ? "已暂停" : t.status === "done" ? "完成" : t.status === "failed" ? "失败" : t.status === "canceled" ? "已取消" : t.status}</span>
                          </div>
                          {["done", "failed", "canceled"].includes(t.status) && <div style={s.progressTrack}><div style={{ ...s.progressFill, width: pct + "%", background: stColor }} /></div>}
                          <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)", marginTop: 4, lineHeight: 1.4 }}>
                            {["pending", "running", "paused"].includes(t.status)
                              ? `已用 ${fmtElapsed(t)} · 开始 ${fmtClock(t.startedAt)}`
                              : t.status === "completed"
                              ? `耗时 ${fmtElapsed(t)} · 完成 ${fmtClock(t.finishedAt)}`
                              : t.status === "failed"
                              ? `失败于 ${fmtClock(t.finishedAt)}`
                              : t.status === "canceled"
                              ? `已取消 ${fmtClock(t.finishedAt)}`
                              : ""}
                          </div>
                          {t.status === "running" && t.detail && (
                            <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)", marginTop: 2 }}>状态：{t.detail}</div>
                          )}
                          {t.status === "failed" && (t.detail || t.error) && (
                            <div style={{ fontSize: 10, color: "var(--danger, #ef4444)", marginTop: 2, lineHeight: 1.4, maxHeight: 28, overflow: "hidden" }}>⚠ {t.detail || t.error}</div>
                          )}
                          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                            {["pending", "running"].includes(t.status) && <button style={s.miniBtn} onClick={() => cancelTask(t.id)}>取消</button>}
                            {t.status === "running" && <button style={s.miniBtn} onClick={() => pauseTask(t.id)}>暂停</button>}
                            {t.status === "paused" && <button style={s.miniBtn} onClick={() => resumeTask(t.id)}>继续</button>}
                            {t.status === "failed" && <button style={s.miniBtnOn} onClick={() => retryTask(t.id)}>重试</button>}
                            {t.url && (t.type === "video" || t.type === "audio") && (
                              <a style={{ ...s.miniBtn, textDecoration: "none", color: "#5ce1e6", textAlign: "center" }} href={t.url} target="_blank" rel="noreferrer">查看</a>
                            )}
                            {t.priority != null && <span style={{ fontSize: 10, color: "var(--text-muted, #5d6779)", alignSelf: "center" }}>优先级 {t.priority}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {getAppSetting("showGenerateLog", true) && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border, rgba(255,255,255,0.08))", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted, #5d6779)", marginBottom: 6 }}>状态日志（带时间）</div>
                  <div style={{ fontSize: 10, lineHeight: 1.5, color: "var(--text-muted, #8b95a7)", maxHeight: 160, overflowY: "auto", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", background: "var(--panel, #161d2a)", borderRadius: 6, padding: 6 }}>
                    {logLines.length === 0 ? "（暂无日志）" : logLines.slice(-12).join("\n")}
                  </div>
                </div>
                )}
              </div>
            )}
            center={center}
          />
          )}
        </div>
      </div>
      <StatusBar
        left={<><span>🎬 {project?.title || "未命名项目"}</span><span>{totalScenes} 分场 · 已出片 {doneScenes}</span></>}
        right={<><span>💾 自动保存中</span><span>🖥 本地数据已同步</span></>}
      />
      <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={onFilePicked} />
      {showSettings && (
        <CustomSettingsDialog open={showSettings} onClose={() => setShowSettings(false)} appName="烬序・影墟"
          theme={theme} onThemeChange={setTheme} />
      )}
      {showTemplates && (
        <TemplatePicker templates={PROJECT_TEMPLATES} onPick={(t) => { setShowTemplates(false); newProject(t); }} onClose={() => setShowTemplates(false)} />
      )}
      {showTrash && (
        <RecycleBin list={trashList} onRestore={restoreTrash} onPurge={purgeTrash} onEmpty={emptyTrash} onClose={() => setShowTrash(false)} />
      )}
      <BillingUI />
      {showRecharge && <RechargeModal onClose={() => setShowRecharge(false)} onSuccess={() => { if (window.refreshUserInfo) window.refreshUserInfo(); }} />}
      {showTemplateMarket && <TemplateMarket project={project} update={update} log={log} onClose={() => setShowTemplateMarket(false)} />}
      {showMembership && <MembershipModal isOpen={showMembership} onClose={() => setShowMembership(false)} onSubscribeSuccess={() => { setShowMembership(false); }} />}
      {showAuth && <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} onLoginSuccess={handleLoginSuccess} initialMode={authMode} />}

      {/* 账户设置弹窗 */}
      {showAccountSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setShowAccountSettings(false)}>
          <div style={{ width: "min(520px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: "var(--bg, #0b0f17)", border: "1px solid var(--border, rgba(255,255,255,0.12))", borderRadius: 12, padding: 24, color: "var(--text, #e8ecf3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>👤 账户设置</h3>
              <button onClick={() => setShowAccountSettings(false)} style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <div style={{ marginBottom: 20, padding: 16, background: "var(--panel, #161d2a)", borderRadius: 8 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}><b>昵称：</b>{currentUser?.nickname || "未设置"}</div>
              <div style={{ fontSize: 14 }}><b>手机号：</b>{currentUser?.phone || "未绑定"}</div>
            </div>
            <div style={{ marginBottom: 20, padding: 16, background: isVip ? "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(234,88,12,0.05))" : "var(--panel, #161d2a)", borderRadius: 8, border: isVip ? "1px solid rgba(245,158,11,0.3)" : "none" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: isVip ? "#f59e0b" : "var(--text)" }}>💎 会员状态</div>
              {isVip && membershipInfo ? (
                <>
                  <div style={{ fontSize: 13, marginBottom: 6 }}><b>套餐：</b>{membershipInfo.plan_name || membershipInfo.plan || "VIP会员"}</div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}><b>到期时间：</b>{membershipInfo.expired_at ? new Date(membershipInfo.expired_at).toLocaleString('zh-CN') : "永久"}</div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}><b>剩余天数：</b>{membershipInfo.days_remaining} 天</div>
                  <div style={{ fontSize: 13 }}><b>折扣率：</b>{Math.round(membershipInfo.discount_rate * 100)}%</div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  您还不是VIP会员，开通会员可享受专属功能和折扣。
                  <button onClick={() => { setShowAccountSettings(false); openPurchasePage("membership"); }} style={{ marginTop: 10, display: "block", padding: "8px 16px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #f59e0b, #ea580c)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>💎 开通会员</button>
                </div>
              )}
            </div>
            <div style={{ padding: 16, background: "var(--panel, #161d2a)", borderRadius: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>🔒 修改密码</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>原密码</label>
                <input type="password" value={changePwdForm.oldPassword} onChange={(e) => setChangePwdForm({ ...changePwdForm, oldPassword: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg, #0f141e)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} placeholder="请输入原密码" />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>新密码</label>
                <input type="password" value={changePwdForm.newPassword} onChange={(e) => setChangePwdForm({ ...changePwdForm, newPassword: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg, #0f141e)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} placeholder="请输入新密码（至少6位）" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>确认新密码</label>
                <input type="password" value={changePwdForm.confirmPassword} onChange={(e) => setChangePwdForm({ ...changePwdForm, confirmPassword: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg, #0f141e)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} placeholder="请再次输入新密码" />
              </div>
              {changePwdMsg && (
                <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, background: changePwdMsg.type === "success" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: changePwdMsg.type === "success" ? "#10b981" : "#ef4444" }}>{changePwdMsg.text}</div>
              )}
              <button onClick={handleChangePassword} disabled={changePwdLoading} style={{ width: "100%", padding: "10px", border: "none", borderRadius: 6, background: changePwdLoading ? "var(--text-muted)" : "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", cursor: changePwdLoading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>{changePwdLoading ? "修改中..." : "确认修改密码"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </SessionProvider>
  );
}

// 开发中占位组件
function DevOnly({ title }) {
  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", boxSizing: "border-box", color: "var(--text, #e8ecf3)", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
      <h2 style={{ margin: "0 0 8px" }}>{title}</h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary, #8b95a7)", maxWidth: 420, lineHeight: 1.7 }}>
        该功能正在开发中，敬请期待。
      </p>
    </div>
  );
}

// 首页：欢迎 / 快速开始 / 项目网格（搜索·标签·置顶·缩略图·模板库·快速任务看板）。
function HomePage({ projects, recentMap, activeId, allTags, activeQueue, failedQueue, onNew, onOpen, onEnter, onTogglePin, onToggleArchive, onClone, onTrash, onOpenTemplates, onOpenAssets }) {
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState("all");
  const recent = recentMap || new Map();

  // 过滤 + 置顶 + 最近打开排序（缺陷 §1：搜索 / 分类 / 置顶 / 最近）
  const filtered = projects
    .filter((p) => !p.archived)
    .filter((p) => (tag === "all" ? true : (p.tags || []).includes(tag)))
    .filter((p) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (p.title || "").toLowerCase().includes(s) || (p.tags || []).some((t) => t.toLowerCase().includes(s));
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (recent.get(b.id) || 0) - (recent.get(a.id) || 0) || (b.updatedAt || 0) - (a.updatedAt || 0));

  // 最近打开横条（取最近 4 个有打开记录的项目）
  const recentList = (recentMap ? Array.from(recentMap.entries()) : [])
    .map(([id, t]) => { const p = projects.find((x) => x.id === id); return p ? { ...p, lastOpened: t } : null; })
    .filter((p) => p && p.id && !p.archived)
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
    .slice(0, 4);

  const thumbStyle = (p) => {
    const hue = (p.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return { background: `linear-gradient(135deg, hsl(${hue} 60% 32%), hsl(${(hue + 40) % 360} 55% 22%))` };
  };
  const tplEmoji = (k) => ({ sweet: "🍬", revenge: "🔥", inlaw: "🏠", counter: "🚀", xuanhuan: "⚔️" }[k] || "🎬");

  return (
    <div style={{ padding: 40, overflowY: "auto", height: "100%", boxSizing: "border-box", color: "var(--text, #e8ecf3)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* 标题区域 */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src={jinsuLogoH} alt="烬序 JINSU" style={{ height: 60, marginBottom: 16, borderRadius: 12 }} />
          <div style={{ fontSize: 12, color: "var(--accent-2, #3b82f6)", letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>烬序・影墟</div>
          <h1 style={{ fontSize: 28, margin: "0 0 10px" }}>用 AI 把创意拍成竖屏短剧</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary, #8b95a7)", lineHeight: 1.7, margin: 0 }}>
            剧本生成 → 分镜拆分 → 生图 → 视频生成 → 配音 → 剪辑导出，全流程 AI 辅助
          </p>
        </div>

        {/* 主要按钮 */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 36 }}>
          <button style={{ ...hp.btnPrimary, padding: "12px 28px", fontSize: 14 }} onClick={() => onNew()}>＋ 新建项目</button>
          <button style={{ ...hp.btn, padding: "12px 28px", fontSize: 14 }} onClick={onOpenTemplates}>🎭 从模板新建</button>
        </div>

        {/* 最近打开 */}
        {recentList.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "var(--text-secondary, #8b95a7)" }}>🕘 最近打开</h3>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
              {recentList.map((p) => (
                <div key={p.id} onClick={() => onOpen(p.id)} style={{ flex: "0 0 auto", width: 150, cursor: "pointer", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 10, overflow: "hidden", background: "var(--panel, #161d2a)" }}>
                  <div style={hp.thumb} onClick={() => onOpen(p.id)}>
                    <span style={hp.thumbEmoji}>{tplEmoji(p.template)}</span>
                    <span style={hp.thumbTitle}>{p.title}</span>
                  </div>
                  <div style={{ padding: 8, fontSize: 11, color: "var(--text-muted, #5d6779)" }}>{relTime(p.lastOpened)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 项目列表 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>📂 我的项目（{filtered.length}）</h3>
          <input style={hp.search} placeholder="搜索项目…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted, #5d6779)", fontSize: 14 }}>
            还没有项目，点击上方「新建项目」开始创作
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 14 }}>
            {filtered.map((p) => (
              <div key={p.id} style={{ ...hp.card, ...(p.id === activeId ? hp.cardActive : {}) }}>
                <div style={{ ...hp.thumb, ...thumbStyle(p) }} onClick={() => onOpen(p.id)}>
                  <span style={hp.thumbEmoji}>{tplEmoji(p.template)}</span>
                  {p.pinned && <span style={hp.pin}>📌</span>}
                  <span style={hp.thumbTitle}>{p.title}</span>
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                    {(p.tags || []).slice(0, 2).map((t) => <span key={t} style={hp.tag}>{t}</span>)}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={hp.cardBtn} onClick={() => onOpen(p.id)}>打开</button>
                    <button style={hp.iconBtn} title="置顶" onClick={() => onTogglePin(p.id)}>{p.pinned ? "📌" : "📍"}</button>
                    <button style={hp.iconBtn} title="克隆" onClick={() => onClone(p.id)}>⧉</button>
                    <button style={hp.iconBtnDanger} title="删除" onClick={() => onTrash(p.id)}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 关于我们：真实简介面板（项目说明 / 版本 / 依赖 / 文档 / 自检）。
function AboutPage({ theme }) {
  const deps = [
    ["Tauri v2", "桌面壳层，本地数据存储与文件保存"],
    ["React 18 + Vite", "前端框架与构建工具"],
    ["@dual/ui", "共享 UI 组件包（ThreePane / DockNav / 主题等）"],
    ["ffmpeg.wasm", "运行时从 esm.sh CDN 动态加载，用于成片合并（离线不可用）"],
    ["Three.js", "3D 导演台渲染"],
    ["FastAPI + PostgreSQL", "后端API服务，用户/积分/会员/订单系统"],
    ["腾讯云COS", "对象存储，保存生成的图片/视频/音频文件"],
    ["阿里云百炼", "语音合成（cosyvoice-v1）、3D生成（Tripo-H3.1）、LLM（qwen-turbo）"],
    ["AutoDL + ComfyUI", "GPU云服务器，视频生成（MiniMax H3系列模型）"],
    ["Redis", "缓存与会话管理"],
  ];
  const shortcuts = [
    ["R / 0", "无限画布重置视图"],
    ["空格 + 左键拖拽", "无限画布平移"],
    ["滚轮", "无限画布缩放（0.1~10x）"],
    ["Ctrl/⌘ + Z", "撤销"],
    ["Ctrl/⌘ + Shift + Z / Y", "重做"],
    ["Delete", "删除选中画布节点"],
  ];
  const faq = [
    ["生成失败 / 一直排队？", "检查网络连接是否正常，云端GPU工人繁忙时会排队。视频生成失败可查看日志面板的具体错误信息，常见原因包括：参考图URL无效、时长超过限制、积分不足。"],
    ["积分如何获取？", "新用户注册赠送5积分，可在充值页面购买积分包（1元=5积分），VIP会员每月赠送额外积分。"],
    ["VIP会员有什么用？", "VIP可使用3D导演台全部功能和详细创建剧本（4步向导），并享受AI生成功能折扣（最高7折）。"],
    ["离线能用吗？", "本地功能（项目管理、素材库浏览、3D导演台预览）可用；AI生成功能（生图/生视频/配音/3D生成）需联网。"],
    ["数据会丢吗？", "工程存于本地IndexedDB，清理应用缓存会丢失；建议定期用「导出工程」备份。生成的图片/视频/音频保存在腾讯云COS。"],
    ["视频生成有哪几种模式？", "4种模式：T2V纯文本生成、I2V图生视频（支持人物参考图）、R2V首尾帧生成、IA2V全能参考（图片+音频+文本）。"],
    ["ffmpeg合并失败？", "桌面端已内置ffmpeg，离线可用；Web端依赖ffmpeg.wasm，首次需联网下载内核。"],
  ];
  const [diag, setDiag] = React.useState(null);
  const runDiag = () => {
    const checks = [
      ["Web Speech API（离线 TTS）", typeof window !== "undefined" && ("speechSynthesis" in window)],
      ["MediaRecorder（录制导出）", typeof window !== "undefined" && "MediaRecorder" in window],
      ["WebGL（3D 导演台）", (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch { return false; } })()],
      ["IndexedDB（本地存储）", typeof window !== "undefined" && "indexedDB" in window],
      ["WebView2 / 现代浏览器", typeof navigator !== "undefined" && /Edg|Chrome|Firefox/.test(navigator.userAgent)],
    ];
    setDiag(checks);
  };
  return (
    <div style={{ padding: 32, overflowY: "auto", height: "100%", boxSizing: "border-box", color: "var(--text, #e8ecf3)" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <img src={jinsuLogo} alt="烬序 JINSU" style={{ height: 84, marginBottom: 12, borderRadius: 14 }} />
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>关于 烬序・影墟</h1>
        <div style={{ fontSize: 12, color: "var(--accent-2, #5CE1E6)", marginBottom: 16 }}>版本 v0.3.0 · AI短剧全流程生成平台</div>
        <p style={{ fontSize: 14, color: "var(--text-secondary, #8b95a7)", lineHeight: 1.8 }}>
          烬序 · 影墟是一款面向竖屏短剧创作的AI全流程桌面工具，帮助创作者从剧本上传或AI生成出发，
          自动完成分集剧本、分镜拆分、分镜生图、角色管理、AI配音、视频生成（4种模式）、3D导演台、
          素材库管理、剪辑成片到导出的完整工作流。支持用户登录、积分计费、会员体系，所有工程数据本地保存。
        </p>

        <h3 style={{ fontSize: 15, margin: "22px 0 10px" }}>⌨️ 快捷键手册</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 8 }}>
          {shortcuts.map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10, fontSize: 13, padding: "8px 10px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 8, background: "var(--panel, #161d2a)" }}>
              <code style={{ background: "var(--input-bg, #0f141e)", padding: "2px 6px", borderRadius: 4, color: "var(--accent, #7c3aed)", whiteSpace: "nowrap" }}>{k}</code>
              <span style={{ color: "var(--text-secondary, #8b95a7)" }}>{v}</span>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 15, margin: "22px 0 10px" }}>🚀 新手教程</h3>
        <ol style={{ fontSize: 13, color: "var(--text-secondary, #8b95a7)", lineHeight: 1.9, paddingLeft: 20 }}>
          <li>首页「新建项目」，可选择快速创建（3积分）或详细创建（VIP专属，5积分），或直接上传已有剧本（1积分AI分析）。</li>
          <li>进入「分集剧本」，查看每集内容，点击「拆分当前集」生成分镜（3积分/集）。</li>
          <li>「分镜与生图」模块，按集显示分镜，可AI细化提示词（1积分/次），生成分镜图（3积分/张）。</li>
          <li>「角色管理」添加角色，生成角色描述（2积分/次）和角色参考图（3积分/张）。</li>
          <li>「视频生成」模块，支持4种模式：T2V纯文本、I2V图生视频、R2V首尾帧、IA2V全能参考，按分辨率和时长扣积分。</li>
          <li>「配音工作室」为台词生成AI配音（1积分/秒），支持添加/修改/删除台词，文字创建专属音色。</li>
          <li>「3D导演台」（VIP专属）搭建3D场景和人物，渲染首帧参考图，生成3D模型。</li>
          <li>「剪辑导出」按剪映风格排版，多轨道编辑，添加转场、特效，导出成片。</li>
          <li>「素材库」统一管理所有生成的视频、图片、音频、文本，支持收藏和分组。</li>
        </ol>

        <h3 style={{ fontSize: 15, margin: "22px 0 10px" }}>🛠 常见报错排查</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {faq.map(([q, a]) => (
            <div key={q} style={{ padding: "10px 12px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 8, background: "var(--panel, #161d2a)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #e8ecf3)" }}>{q}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary, #8b95a7)", marginTop: 4, lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 15, margin: "22px 0 10px" }}>🔍 一键环境检测</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "var(--accent-gradient, linear-gradient(135deg,#7c3aed,#3b82f6))", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }} onClick={runDiag}>
            {diag ? "重新检测" : "开始检测"}
          </button>
          <button
            style={{ padding: "8px 16px", border: "1px solid #10b981", borderRadius: 6, background: "transparent", color: "#10b981", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            onClick={() => openUserManual()}
          >
            📖 打开用户手册
          </button>
        </div>
        {diag && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {diag.map(([name, ok]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ color: ok ? "var(--success, #22c55e)" : "var(--danger, #ef4444)" }}>{ok ? "✓" : "✗"}</span>
                <span style={{ color: "var(--text-secondary, #8b95a7)" }}>{name}</span>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 15, margin: "22px 0 10px" }}>🧩 主要依赖</h3>
        <div style={{ border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: "var(--radius, 10px)", overflow: "hidden" }}>
          {deps.map(([name, desc], i) => (
            <div key={name} style={{ display: "flex", gap: 12, padding: "10px 14px", borderBottom: i === deps.length - 1 ? "none" : "1px solid var(--border, rgba(255,255,255,0.08))", background: i % 2 ? "transparent" : "var(--panel, #161d2a)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, minWidth: 130, color: "var(--text, #e8ecf3)" }}>{name}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary, #8b95a7)" }}>{desc}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 15, margin: "22px 0 10px" }}>📝 更新日志</h3>
        <div style={{ fontSize: 13, color: "var(--text-secondary, #8b95a7)", lineHeight: 1.8 }}>
          <div><b>v0.2.0</b>：场景生成强制纯场景无人物；四视图修复（背面视角生效、生成后不再丢失查看）；全链路按短剧类型（仿真人/动漫/半写实/漫剧）注入生成风格；小说转剧本新增目标集数且内容不足时 AI 自动补齐；视频生成自动参考上一场尾帧作首帧保证连贯；项目正式更名为「烬序・影墟」并提升版本号。</div>
          <div><b>v0.1.2</b>：移除片头功能；剪辑器新增视频片段拖拽 / 音频轨 / 字幕（台词生成·SRT·ASS 导入·语音识别）；补齐使用说明。</div>
          <div><b>v0.1.1</b>：无限画布支持多集 / 多节点 / 连线 / 撤回重做 / 导出；3D 导演台加入场景编辑器、机位预设、灯光天气、机位截图绑定、MD 拆镜；新增 4 套主题与「余额不足不再弹窗」开关。</div>
          <div><b>v0.1.0</b>：初版，分场剧本 / 画布 / 剪辑 / 3D 导演台 / 配音 / 素材库 / 计费骨架。</div>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted, #5d6779)", marginTop: 16 }}>
          反馈与客服：使用中遇到问题可在「设置 → 高级后端」自查配置，或前往品牌官网提交反馈。成片合并依赖 ffmpeg.wasm，首次使用需联网下载内核（约 30MB）。
        </p>
      </div>
    </div>
  );
}

// 模板库弹窗（缺陷 §1：无短剧模板库）
function TemplatePicker({ templates, onPick, onClose }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>🎭 选择短剧模板</h3>
          <button style={xBtn} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted, #5d6779)", margin: "0 0 14px" }}>模板会预填一句话梗概与分场剧本骨架，新建后即可改写。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 }}>
          {templates.map((t) => (
            <button key={t.key} onClick={() => onPick(t)} style={tplCard}>
              <div style={{ fontSize: 30 }}>{t.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 600, margin: "6px 0 4px" }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted, #5d6779)", lineHeight: 1.5 }}>{t.idea}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 回收站弹窗（缺陷 §3：缺回收站）
function RecycleBin({ list, onRestore, onPurge, onEmpty, onClose }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>🗑 回收站（{list.length}）</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={hp.miniBtnOn} disabled={!list.length} onClick={onEmpty}>清空回收站</button>
            <button style={xBtn} onClick={onClose}>✕</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted, #5d6779)", margin: "0 0 12px" }}>误删的工程可在此恢复；永久删除后将无法找回。</p>
        {list.length === 0 ? <div style={hp.ph}>回收站是空的。</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
            {list.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 8, background: "var(--panel, #161d2a)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text, #e8ecf3)" }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted, #5d6779)", marginTop: 2 }}>{r.trashAt ? new Date(r.trashAt).toLocaleString("zh-CN", { hour12: false }) : ""} 删除</div>
                </div>
                <button style={hp.miniBtnOn} onClick={() => onRestore(r.id)}>恢复</button>
                <button style={s.ghostBtnDanger} onClick={() => onPurge(r.id)}>永久删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal = { width: "min(680px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: "var(--bg, #0b0f17)", border: "1px solid var(--border, rgba(255,255,255,0.12))", borderRadius: "var(--radius, 12px)", padding: 20, color: "var(--text, #e8ecf3)" };
const xBtn = { border: "none", background: "transparent", color: "var(--text-muted, #5d6779)", fontSize: 16, cursor: "pointer" };
const tplCard = { textAlign: "left", padding: 14, border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: "var(--radius, 10px)", background: "var(--panel, #161d2a)", cursor: "pointer", color: "var(--text, #e8ecf3)" };

const hp = {
  btnPrimary: { padding: "10px 18px", border: "none", borderRadius: "var(--radius-sm, 6px)", background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  btn: { padding: "10px 18px", border: "1px solid var(--border, rgba(255,255,255,0.14))", borderRadius: "var(--radius-sm, 6px)", background: "var(--panel-2, #1c2433)", cursor: "pointer", fontSize: 14, color: "var(--text-secondary, #8b95a7)" },
  ph: { color: "var(--text-muted, #5d6779)", fontSize: 13, padding: 16 },
  recent: { textAlign: "left", padding: "12px 14px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: "var(--radius, 10px)", background: "var(--panel, #161d2a)", cursor: "pointer", color: "var(--text, #e8ecf3)" },
  recentActive: { borderColor: "var(--accent-2, #3b82f6)" },
  search: { flex: 1, minWidth: 140, maxWidth: 220, padding: "6px 12px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 16, fontSize: 13, boxSizing: "border-box", background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)" },
  chip: { padding: "4px 12px", border: "1px solid var(--border, rgba(255,255,255,0.14))", borderRadius: 14, background: "var(--panel-2, #1c2433)", cursor: "pointer", fontSize: 12, color: "var(--text-secondary, #8b95a7)" },
  chipOn: { background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", borderColor: "transparent" },
  board: { border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: "var(--radius, 10px)", background: "var(--panel, #161d2a)", padding: 12 },
  boardH: { fontSize: 13, fontWeight: 600, color: "var(--text, #e8ecf3)", marginBottom: 8 },
  boardEmpty: { fontSize: 12, color: "var(--text-muted, #5d6779)" },
  boardItem: { fontSize: 12, color: "var(--text-secondary, #8b95a7)", display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border, rgba(255,255,255,0.06))" },
  card: { border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: "var(--radius, 10px)", overflow: "hidden", background: "var(--panel, #161d2a)" },
  cardActive: { borderColor: "var(--accent-2, #3b82f6)" },
  thumb: { position: "relative", height: 110, cursor: "pointer", display: "flex", alignItems: "flex-end", padding: 10, overflow: "hidden" },
  thumbEmoji: { position: "absolute", top: 10, left: 12, fontSize: 30 },
  pin: { position: "absolute", top: 8, right: 10, fontSize: 14 },
  thumbTitle: { fontSize: 14, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)", zIndex: 1 },
  tag: { fontSize: 10, color: "var(--accent-2, #3b82f6)", background: "rgba(59,130,246,0.12)", borderRadius: 4, padding: "2px 6px" },
  cardBtn: { flex: 1, padding: "5px 0", fontSize: 12, borderRadius: 6, border: "none", background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", cursor: "pointer" },
  iconBtn: { width: 30, padding: "5px 0", fontSize: 12, borderRadius: 6, border: "1px solid var(--border, rgba(255,255,255,0.14))", background: "var(--panel-2, #1c2433)", color: "var(--text-secondary, #8b95a7)", cursor: "pointer" },
  iconBtnDanger: { width: 30, padding: "5px 0", fontSize: 12, borderRadius: 6, border: "1px solid var(--danger, #ef4444)", background: "transparent", color: "var(--danger, #ef4444)", cursor: "pointer" },
};

const s = {
  badge: {
    padding: "3px 8px", borderRadius: 4, background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))",
    color: "#fff", fontSize: 11, fontWeight: 700,
  },
  sdHead: { fontSize: 13, fontWeight: 700, color: "var(--text, #e8ecf3)", marginBottom: 10 },
  select: {
    padding: "7px 10px", fontSize: 13, borderRadius: "var(--radius-sm, 6px)",
    border: "1px solid var(--border, rgba(255,255,255,0.08))",
    background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)", outline: "none", width: "100%", boxSizing: "border-box",
  },
  ghostBtn: {
    flex: 1, padding: "6px 0", fontSize: 12, borderRadius: "var(--radius-sm, 6px)", cursor: "pointer",
    border: "1px solid var(--border, rgba(255,255,255,0.14))",
    background: "transparent", color: "var(--text-secondary, #8b95a7)",
  },
  ghostBtnDanger: {
    flex: 1, padding: "6px 0", fontSize: 12, borderRadius: "var(--radius-sm, 6px)", cursor: "pointer",
    border: "1px solid var(--danger, #ef4444)", background: "transparent", color: "var(--danger, #ef4444)",
  },
  miniLink: { background: "transparent", border: "none", color: "var(--accent-2, #3b82f6)", cursor: "pointer", fontSize: 11, padding: 0 },
  miniBtn: { padding: "3px 8px", fontSize: 11, borderRadius: 5, cursor: "pointer", border: "1px solid var(--border, rgba(255,255,255,0.14))", background: "var(--panel-2, #1c2433)", color: "var(--text-secondary, #8b95a7)" },
  miniBtnOn: { padding: "3px 8px", fontSize: 11, borderRadius: 5, cursor: "pointer", border: "none", background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", fontWeight: 600 },
  progressTrack: { height: 6, borderRadius: 3, background: "var(--panel-2, #1c2433)", overflow: "hidden" },
  progressFill: { height: "100%", background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", transition: "width .3s ease" },
};
