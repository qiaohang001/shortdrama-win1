// shortdrama 通用工具：分场解析、脚本拼接、下载、项目默认值。

/**
 * 读取文本文件，自动检测 UTF-8 / GBK 编码，解决 Windows 下 txt 乱码问题。
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 解码后的文本内容
 */
export async function readTextFileAuto(file) {
  const buf = await file.arrayBuffer();
  // 先尝试 UTF-8（fatal 模式，遇到非法字节会抛错）
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(buf);
  } catch (_) {
    // UTF-8 解码失败，尝试 GBK（Windows 中文 txt 默认编码）
    try {
      const decoder = new TextDecoder("gbk");
      return decoder.decode(buf);
    } catch (_) {
      // GBK 也失败，回退到默认 UTF-8（非 fatal，不会抛错但可能有乱码）
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

// ── 视频生成分辨率预设（LTX-2.3 @ 48G 显存）──
// resolution 为 "宽x高"，aspect 仅用于 UI 标注。后端 ltx worker _resolve_size 会解析 resolution
// 并按 64 对齐（LTX assert_resolution 要求 %64==0），同时后端有 VAE 安全面积上限（MAX_AREA），
// 超过会自动按宽高比缩放到安全区，保证任意分辨率都不 OOM。
// 注意：LTX-2.3 的 VAE 解码在 48G 显存上按面积近似平方涨显存，704×1280(≈901K) 实测 OOM，
// 故默认 480p（≤420K）原生出片；720p 预设会被 worker 自动缩放到安全区（约 832×448），
// 不会崩但也不是满血 720p——要满血 720p 需更大显存或 VAE 转 CPU 解码（后续优化）。
export const VIDEO_SIZE_PRESETS = [
  { key: "p480",  label: "竖屏 480p · 480×832",  resolution: "480x832",  aspect: "9:16" },
  { key: "p720",  label: "竖屏 720p · 720×1280", resolution: "720x1280", aspect: "9:16" },
  { key: "l480",  label: "横屏 480p · 832×480",  resolution: "832x480",  aspect: "16:9" },
  { key: "l720",  label: "横屏 720p · 1280×720", resolution: "1280x720", aspect: "16:9" },
  { key: "s512",  label: "方形 512 · 512×512",   resolution: "512x512",  aspect: "1:1" },
];
export const DEFAULT_VIDEO_SIZE = "p480";
export function getVideoSize(key) {
  return (
    VIDEO_SIZE_PRESETS.find((p) => p.key === key) ||
    VIDEO_SIZE_PRESETS.find((p) => p.key === DEFAULT_VIDEO_SIZE)
  );
}

// 取角色参考图（用于视频生成时保持角色一致性）。
// 优先级：用户上传的整张 referenceSheet > AI 生成的四视图（正面/侧面/背面/特写）。
// 返回图片 URL/dataURL 数组（空数组表示无参考图）；调度机会透传给视频 worker 合成参考表。
export function characterReferenceImages(c) {
  if (!c) return [];
  if (c.referenceSheet) return [c.referenceSheet];
  if (Array.isArray(c.fourViews) && c.fourViews.length) {
    return c.fourViews.map((v) => v && v.url).filter(Boolean);
  }
  return [];
}

export function defaultProject(title = "新短剧") {
  return {
    id: "sd_" + Date.now(),
    title,
    idea: "",
    script: "",
    dramaType: "real",   // 短剧类型：real(仿真人)/anime(动漫)/semireal(半写实)/comic(漫剧)，全链路生成风格注入
    scenes: [],          // [{id,title,desc,imageUrl,videoUrl}]  （旧版扁平分场，保留兼容）
    // ── 新：分集→分镜→台词 三级结构化数据（#140）──
    episodes: [],        // [{id,title,summary,content,order}]
    shots: [],           // 分镜对象（canonical 字段）:
                          // { id, shotIndex, episodeId, title, sceneDesc,
                          //   sceneType(景别), cameraMove(运镜), lighting(灯光), emotion(情绪), effect(特效),
                          //   duration(秒), promptCn(中文Prompt), characters(人物名数组),
                          //   dialogue(口头台词), subtitle(字幕), innerMonologue(内心独白),
                          //   note(备注), foreshadow(伏笔标记), endPoint(镜头收束点), lastFrame,
                          //   imageUrl, videoUrl, status, progress }
                          // 兼容旧字段保留：shotType/camera/mood/vfx/cnPrompt
    dialogues: [],       // [{id,shotId,episodeId,character,text,ttsUrl,status}]
    sourceName: null,    // 导入的小说/剧本文件名
    sourceText: null,    // 导入的原文
    sourceType: null,    // "story"（小说/故事）| "script"（剧本）
    convertedAt: 0,      // 最近一次解析为骨架的时间
    novels: [],          // [{id,title,content,source:'upload'|'ai',createdAt}]
    scripts: [],         // [{id,title,content,source:'upload'|'novel',novelId,createdAt}]
    materials: { characters: [], scenes: [] }, // 素材库：角色/场景
    videoSize: DEFAULT_VIDEO_SIZE, // 视频生成分辨率预设 key（见 VIDEO_SIZE_PRESETS）
    assets: [],          // [{id,type,title,url,status}]
    tasks: [],           // [{id,label,status,progress,type,url}]
    canvas: [],          // [{sceneId,x,y}] 无限画布位置
    history: [],         // [{ts,type,summary}]
    createdAt: Date.now(),
  };
}

// 兼容旧工程：补齐新的结构化字段（不破坏既有 scenes 流程）。
export function normalizeProject(p) {
  const d = p || {};
  return {
    ...d,
    scenes: Array.isArray(d.scenes) ? d.scenes : [],
    episodes: Array.isArray(d.episodes) ? d.episodes : [],
    shots: Array.isArray(d.shots) ? d.shots : [],
    dialogues: Array.isArray(d.dialogues) ? d.dialogues : [],
    sourceName: d.sourceName || null,
    sourceText: d.sourceText || null,
    sourceType: d.sourceType || null,
    dramaType: d.dramaType || "real",
    convertedAt: d.convertedAt || 0,
    novels: Array.isArray(d.novels) ? d.novels : [],
    scripts: Array.isArray(d.scripts) ? d.scripts : [],
    materials: d.materials && typeof d.materials === "object" ? d.materials : { characters: [], scenes: [] },
    videoSize: d.videoSize || DEFAULT_VIDEO_SIZE,
    assets: Array.isArray(d.assets) ? d.assets : [],
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    canvas: Array.isArray(d.canvas) ? d.canvas : [],
    history: Array.isArray(d.history) ? d.history : [],
  };
}

// ── 中文数字转阿拉伯（支持"一~十/两/百/千/万"及"十"打头，如 三十→30、十二→12）──
export function cnNumToInt(s) {
  if (!s) return NaN;
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let result = 0, current = 0;
  for (const ch of s) {
    if (digits[ch] !== undefined) { current = digits[ch]; }
    else if (ch === "十") { current = current === 0 ? 10 : current * 10; result += current; current = 0; }
    else if (ch === "百") { current = current === 0 ? 100 : current * 100; result += current; current = 0; }
    else if (ch === "千") { current = current === 0 ? 1000 : current * 1000; result += current; current = 0; }
    else if (ch === "万") { result = (result + current) * 10000; current = 0; }
  }
  return result + current;
}

// ── 集标题（支持 阿拉伯/中文数字 + 集/章/卷/回/部）──
const EP_SPLIT_RE = /^\s*(第\s*[0-9一二三四五六七八九十百千万两]+\s*[集章卷回部](?:[：:\s|｜].*)?)\s*$/m;

// ── 元信息区标题（梗概/人物/类型等信息，不参与分集）──
const META_HEAD_RE = /^\s*(?:剧情梗概|故事梗概|剧本梗概|梗概|人物小传|角色小传|角色介绍|主要人物|主要角色|人物设定|类型|风格|标签|人设|单集时长|剧作基调|片名|剧名|作品名)\s*[:：|｜]?\s*.*$/;

// 非 AI 的解析骨架：把导入的小说/剧本原文拆成 分集→分镜→台词 三级结构。
// 真正的「小说→剧本」语义转换（LLM）留待云端模型部署后接入（见 #140 AI 部分）。
export function parseSourceToScript(raw) {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { meta: { synopsis: "", info: "" }, episodes: [], shots: [], dialogues: [] };

  // 0) 元信息区：第一个集标题之前的全部内容（梗概/人物小传/类型信息）
  let metaText = "";
  let restText = text;
  const m0 = text.match(EP_SPLIT_RE);
  if (m0 && m0.index > 0) {
    metaText = text.slice(0, m0.index).trim();
    restText = text.slice(m0.index).trim();
  }

  // 1) 切分「集」：按行扫描，遇到集标题行（第N集/第N章/Episode N/集N，阿拉伯+中文数字）开新集，
  //    其余行追加到当前集正文。逐行状态机，避免跨行正则被 \r\n 干扰。
  const EP_LINE_RE = /^(?:第\s*(?:\d+|[一二三四五六七八九十百千万两]+)\s*[集章卷回部]|[Ee]p(?:isode)?\.?\s*\d+|集\s*\d+)([：:\s|｜]?[^\n]*)$/;
  const blocks = [];
  let cur = null;
  for (const rawLn of restText.split(/\r?\n/)) {
    const ln = rawLn.trim();
    if (!ln) continue;
    const epM = ln.match(EP_LINE_RE);
    if (epM) {
      cur = { title: (epM[0] || "").replace(/^[:：|｜]\s*/, "").trim().slice(0, 60), body: "", order: 0 };
      blocks.push(cur);
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + ln;
    }
    // 集标题之前的行（异常时）忽略
  }
  if (blocks.length === 0) {
    blocks.push({ title: "第1集", body: restText.trim(), order: 0 });
  }
  blocks.forEach((b, i) => { b.order = i + 1; });

  const episodes = [];
  const shots = [];
  const dialogues = [];
  let epOrder = 0;
  let shotSeq = 0;
  for (const blk of blocks) {
    const epId = "ep_" + Date.now() + "_" + epOrder;
    episodes.push({ id: epId, title: blk.title, summary: blk.body.slice(0, 200), content: blk.body, order: blk.order || epOrder });
    epOrder++;

    // 2) 切分「场/镜头」：场景N / 镜头N / 分镜编号（1-1 / 1-2）/ 空行分段
    const sceneMarker = /^\s*(?:【?场景?\s*\d*】?|场景|镜头|场\s*\d+|SC\.?\s*\d+|\d+\s*[-–—]\s*\d+)\s*[:：|｜]?\s*/m;
    let scenesText = [];
    if (sceneMarker.test(blk.body)) {
      const segs = blk.body.split(sceneMarker).map((s) => s.trim()).filter(Boolean);
      segs.forEach((seg, i) => {
        const nl = seg.indexOf("\n");
        const title = ((nl > 0 ? seg.slice(0, nl) : seg).replace(/^[:：]\s*/, "").trim().slice(0, 30)) || ("镜头" + (i + 1));
        scenesText.push({ title, body: nl > 0 ? seg.slice(nl + 1) : seg });
      });
    } else {
      scenesText = blk.body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b, i) => ({ title: "镜头" + (i + 1), body: b }));
    }

    for (const sc of scenesText) {
      const shotId = "sh_" + Date.now() + "_" + shotSeq;
      shotSeq++;
      shots.push({
        id: shotId, episodeId: epId, title: sc.title, sceneDesc: sc.body.slice(0, 400),
        shotType: "", camera: "", lighting: "", costume: "", environment: "", mood: "", vfx: "", cnPrompt: "", aspectRatio: "9:16",
        prompt: "", imageUrl: null, videoUrl: null, duration: 5, status: "todo", progress: 0,
        shotIndex: shotSeq,
        sceneType: "", cameraMove: "", emotion: "", effect: "", promptCn: "",
        characters: [], dialogue: "", subtitle: "", innerMonologue: "", note: "",
        foreshadow: false, endPoint: "", lastFrame: null, characterImage: null, characterImages: {},
      });
      // 3) 切分「台词」：角色：台词
      const dlMarker = /^\s*([\u4e00-\u9fa5A-Za-z0-9·•\-_]{1,12})\s*[:：]\s*(.+)$/gm;
      let m;
      while ((m = dlMarker.exec(sc.body)) !== null) {
        dialogues.push({ id: "d_" + Date.now() + "_" + dialogues.length, shotId, episodeId: epId, character: m[1].trim(), text: m[2].trim(), ttsUrl: null, status: "todo" });
      }
    }
  }

  // 元信息细分：梗概区 / 人物区 / 其他
  let synopsis = "", charBlock = "", infoBlock = "";
  const metaLines = (metaText || "").split("\n");
  let curPart = "other";
  for (const ln of metaLines) {
    const t = ln.trim();
    if (!t) continue;
    if (/^(剧情|故事|剧本)梗概/.test(t)) { curPart = "synopsis"; continue; }
    if (/^(人物小传|角色小传|角色介绍|主要人物|主要角色|人物设定)/.test(t)) { curPart = "char"; continue; }
    if (/^(类型|风格|标签|人设|单集时长|剧作基调|片名|剧名|作品名)/.test(t)) { curPart = "info"; continue; }
    if (curPart === "synopsis") synopsis += (synopsis ? "\n" : "") + t;
    else if (curPart === "char") charBlock += (charBlock ? "\n" : "") + t;
    else if (curPart === "info") infoBlock += (infoBlock ? "\n" : "") + t;
  }

  return { meta: { synopsis, charBlock, infoBlock, raw: metaText }, episodes, shots, dialogues };
}

export function relTime(ts) {
  if (!ts) return "";
  const d = Date.now() - ts, m = 60000, h = 3600000, dn = 86400000;
  if (d < m) return "刚刚";
  if (d < h) return Math.floor(d / m) + " 分钟前";
  if (d < dn) return Math.floor(d / h) + " 小时前";
  if (d < 7 * dn) return Math.floor(d / dn) + " 天前";
  return new Date(ts).toLocaleDateString();
}

// 把 LLM 返回的分场剧本解析为 scenes 数组
export function parseScenes(text) {
  const lines = (text || "").split(/\r?\n/);
  const scenes = [];
  let cur = null;
  const marker = /^\s*(?:【?场景?】?|场景|第\s*\d+\s*场)\s*(\d+)?\s*[:：|｜]?\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(marker);
    if (m) {
      if (cur) scenes.push(cur);
      const idx = m[1] || scenes.length + 1;
      cur = { id: "s_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).slice(2, 6), title: (m[2] || "").trim() || ("场景" + idx), desc: "" };
    } else if (cur) {
      cur.desc += (cur.desc ? "\n" : "") + line;
    }
  }
  if (cur) scenes.push(cur);
  if (scenes.length === 0) {
    const blocks = (text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    blocks.forEach((b, i) => scenes.push({ id: "s_" + Date.now() + "_" + i, title: "场景" + (i + 1), desc: b }));
  }
  return scenes.map((s) => ({ ...s, imageUrl: null, videoUrl: null }));
}

// 由 scenes 拼出可读剧本全文
export function buildScriptText(scenes) {
  return scenes.map((s, i) => `【场景${i + 1}】${s.title}\n${s.desc || ""}`).join("\n\n");
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ── Tauri 桌面端保存文件（Rust save_file command，默认保存到系统「下载」目录）──
// 浏览器环境回退为 <a download>。所有下载/导出统一走这里。
// opts: { dir?: string（自定义下载目录，空=系统下载目录）, log?: function（写入软件日志） }

// 读取用户设置的下载目录（未设置返回 ""，即系统「下载」目录）
export function getDownloadDir() {
  try {
    const saved = localStorage.getItem("APP_SETTINGS");
    if (saved) {
      const s = JSON.parse(saved);
      return (s && typeof s.downloadDir === "string" && s.downloadDir.trim()) || "";
    }
  } catch (e) { console.warn("[utils] 读取下载目录失败:", e); }
  return "";
}

export async function saveBlob(filename, blob, opts = {}) {
  const dir = (opts && opts.dir) || getDownloadDir();
  const logger = (opts && opts.log) || null;
  // Android：无系统「下载」对话框，本地 blob 转 ObjectURL 触发 WebView 下载
  const isAndroidApp = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isAndroidApp) {
    downloadBlob(filename, blob);
    if (logger) logger(`✅ 已开始下载：${filename}`);
    return { ok: true, path: "" };
  }
  // Tauri 2 环境检测：标准内部标志 __TAURI_INTERNALS__（比 window.__TAURI__ 更可靠，不依赖 withGlobalTauri）
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const data = btoa(binary);
      const path = await invoke("save_file", { dir, filename, data });
      if (logger) logger(`✅ 已保存到：${path}`);
      else if (typeof window !== "undefined" && window.alert) window.alert(`✅ 已保存到：${path}`);
      return { ok: true, path };
    } catch (e) {
      console.warn("Tauri save_file 失败，回退浏览器下载:", e);
      downloadBlob(filename, blob);
      if (logger) logger(`⚠️ 保存失败，已改为浏览器下载：${filename}`);
      else if (typeof window !== "undefined" && window.alert) window.alert("已开始下载：" + filename);
      return { ok: false, err: String((e && e.message) || e) };
    }
  }
  downloadBlob(filename, blob);
  if (logger) logger(`✅ 已开始下载：${filename}`);
  else if (typeof window !== "undefined" && window.alert) window.alert("已开始下载：" + filename);
  return { ok: true };
}

// 下载远程资源（成片导出）。opts: { dir?: string, log?: function }
export async function downloadUrl(url, filename, opts = {}) {
  const dir = (opts && opts.dir) || getDownloadDir();
  const logger = (opts && opts.log) || null;
  // Android：直接交给系统浏览器打开（COS 永久 URL），用户可预览/保存/分享
  const isAndroidApp = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isAndroidApp) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-shell");
      await openUrl(url);
      if (logger) logger(`✅ 已开始下载：${filename}`);
      return true;
    } catch (e) {
      console.warn("Android openUrl 失败，回退 window.open:", e);
      window.open(url, "_blank");
      if (logger) logger(`✅ 已开始下载：${filename}`);
      return true;
    }
  }
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke("download_url", { url, filename, dir });
      console.log("已下载到:", path);
      if (logger) logger(`✅ 已下载到：${path}`);
      else if (typeof window !== "undefined" && window.alert) window.alert(`✅ 已保存到：${path}`);
      return true;
    } catch (e) {
      // Rust 下载失败（URL 不可达 / 实例未开等），明确报错而不是静默打开空白页
      const msg = (e && (e.message || e)) || "下载失败";
      console.warn("Tauri download_url 失败:", msg);
      if (logger) {
        logger(`❌ 下载失败：${msg}`);
      } else if (typeof window !== "undefined" && window.alert) {
        window.alert(`下载失败：${msg}\n请确认视频/图片地址可访问（实例或服务是否已关闭）`);
      }
      return false;
    }
  }
  try {
    const r = await fetch(url);
    if (!r.ok) {
      if (logger) logger(`❌ 下载失败：HTTP ${r.status}，请确认资源地址可访问`);
      else if (window.alert) window.alert(`下载失败：HTTP ${r.status}，请确认资源地址可访问`);
      return false;
    }
    const b = await r.blob();
    const res = await saveBlob(filename, b, { dir, log: logger });
    return !!res.ok;
  } catch (e) {
    // 跨域或被拦截时，退化为直接打开
    window.open(url, "_blank");
    if (logger) logger(`⚠️ 下载失败（已尝试打开链接）：${filename}`);
    return false;
  }
}

export function pushHistory(history, type, summary) {
  return [{ ts: Date.now(), type, summary }, ...(history || [])].slice(0, 100);
}

// ───────────────────────────────────────────────────────────
// 短剧模板库（缺陷 §1：新建项目空白、无模板库）
// ───────────────────────────────────────────────────────────
export const PROJECT_TEMPLATES = [
  {
    key: "sweet", name: "甜宠", emoji: "🍬",
    idea: "一对欢喜冤家从相遇到相爱的轻松甜宠日常。",
    script: "【场景1】初遇：咖啡馆里意外相撞，咖啡泼了一身，两人互不相让。\n\n【场景2】再遇：公司新来的合伙人竟是那个“泼咖啡的”。\n\n【场景3】心动：雨夜共伞，暧昧悄然发芽。",
  },
  {
    key: "revenge", name: "复仇", emoji: "🔥",
    idea: "女主隐忍多年，以全新身份归来，向当年背叛她的人一一清算。",
    script: "【场景1】归来：她以集团顾问身份踏入旧宅，旧人皆未认出。\n\n【场景2】交锋：与反派首次正面过招，不动声色埋下隐患。\n\n【场景3】翻盘：关键证据曝光，局势彻底逆转。",
  },
  {
    key: "inlaw", name: "婆媳", emoji: "🏠",
    idea: "新媳妇如何用智慧化解强势婆婆的刁难，把小家经营得有声有色。",
    script: "【场景1】进门：第一次全家宴，气氛微妙暗流涌动。\n\n【场景2】冲突：育儿观念之争在饭桌上爆发。\n\n【场景3】和解：一次意外让两代人终于读懂彼此。",
  },
  {
    key: "counter", name: "逆袭", emoji: "🚀",
    idea: "底层小人物抓住时代机遇，一路逆风翻盘。",
    script: "【场景1】低谷：被合伙人背刺，负债累累走投无路。\n\n【场景2】转机：一份旧合同里藏着翻盘的关键。\n\n【场景3】高光：站在发布会聚光灯下，昔人哗然。",
  },
  {
    key: "xuanhuan", name: "玄幻", emoji: "⚔️",
    idea: "废柴少年觉醒血脉，踏上逆天修行的热血之路。",
    script: "【场景1】觉醒：体内封印松动，灵气灌体惊动全族。\n\n【场景2】试炼：踏入秘境遭遇妖兽，绝境中领悟剑意。\n\n【场景3】逆袭：一剑破天，曾经轻视他的人俯首。",
  },
];

// 由模板生成一个带梗概/剧本骨架的新工程。
export function templateProject(tpl, title) {
  const base = defaultProject(title || (tpl.name + "短剧"));
  base.idea = tpl.idea || "";
  base.script = tpl.script || "";
  base.template = tpl.key;
  base.tags = [tpl.name];
  return base;
}

// ───────────────────────────────────────────────────────────
// 短剧类型（缺陷 §：首页选择「动漫 / 仿真人」等，全链路注入生成风格）
// 选中后所有图片 / 视频生成按该类型出图。
// ───────────────────────────────────────────────────────────
export const DRAMA_TYPES = [
  { key: "real", name: "仿真人", emoji: "🧑", note: "写实真人演员风格，东方中国人面貌" },
  { key: "anime", name: "动漫", emoji: "🎨", note: "二次元动画风格，日系/国漫画风" },
  { key: "semireal", name: "半写实", emoji: "✨", note: "介于写实与动漫之间的风格化渲染" },
  { key: "comic", name: "漫剧", emoji: "📜", note: "漫画分镜动态化，线条+上色" },
];

// 返回该短剧类型对应的「整体生成风格」修饰语（拼接进文生图/生视频提示词）。
export function dramaModifier(type) {
  switch (type) {
    case "anime":
      return "整体为二次元动漫风格，动画赛璐璐上色，日系/国漫画风，鲜明轮廓线与大面积平涂色块，角色为动漫人物（非真人），东方亚洲动漫面孔；";
    case "semireal":
      return "整体为半写实风格化渲染，介于真人与动漫之间，柔和笔触结合写实光影，角色为风格化人物；";
    case "comic":
      return "整体为漫剧风格，漫画分镜动态化，清晰黑色描边线条、平涂上色、速度线与对话框质感，角色为漫画人物；";
    case "real":
    default:
      return "整体为写实真人影视风格，真人演员出演，超写实皮肤与材质，电影级打光与景深，无二次元/漫画化痕迹；";
  }
}

// 克隆项目（缺陷 §3：缺少项目复制/克隆）
export function cloneProject(project, newTitle) {
  const copy = JSON.parse(JSON.stringify(project || {}));
  delete copy._trashAt;
  copy.id = "sd_" + Date.now();
  copy.title = newTitle || ((project && project.title) || "项目") + " 副本";
  copy.createdAt = Date.now();
  return copy;
}

// 工程包导出（缺陷 §3：JSON 导出不能打包素材资产）。
// 把整个工程打成一个带类型标记的对象，便于迁移时识别；
// 资产以 url 形式随包携带（blob: 链接在导入端会失效，需重新本地化，已在界面提示）。
export function packageProject(project) {
  return {
    __type: "jinsu-sd-package",
    version: 1,
    exportedAt: Date.now(),
    app: "shortdrama",
    project,
  };
}

export function isPackage(obj) {
  return obj && obj.__type === "jinsu-sd-package" && obj.project;
}

// 从工程数据抽取首页/侧栏需要的元数据（tags/pinned/archived…）。
export function metaOf(data) {
  return {
    title: data.title || "未命名",
    tags: Array.isArray(data.tags) ? data.tags : [],
    pinned: !!data.pinned,
    archived: !!data.archived,
    template: data.template || "",
    thumbnail: data.thumbnail || null,
    createdAt: data.createdAt || Date.now(),
  };
}

/** 容错解析 LLM 返回的 JSON：剥离代码块、栈抽取首个对象/数组、去除尾逗号、修复未闭合字符串与括号、截断时取最长有效前缀。 */
export function repairAndParse(text, label = "JSON") {
  if (!text) throw new Error("AI 未返回" + label);
  try { return JSON.parse(text); } catch (_) {}
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // 用栈精确抽取最外层 JSON
  let cand = extractOuterJson(s);
  if (!cand) cand = s;
  cand = cand.replace(/\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(cand); } catch (_) {}
  cand = fixUnterminatedString(cand);
  cand = balanceBrackets(cand);
  cand = cand.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(cand); } catch (_) {}
  const prefix = longestValidJsonPrefix(cand);
  if (prefix) return prefix;
  try {
    const double = cand.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3').replace(/:\s*'([^']*)'/g, ': "$1"');
    return JSON.parse(double);
  } catch (_) {}
  throw new Error(`AI 返回的${label}格式有误，已尝试自动修复仍失败，请重试或换个模型。`);
}

function extractOuterJson(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "[") {
      const stack = [c === "{" ? "}" : "]"];
      let inStr = false;
      for (let j = i + 1; j < s.length; j++) {
        const ch = s[j];
        if (ch === "\\") { j++; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
        else if (ch === "}" || ch === "]") {
          if (stack[stack.length - 1] === ch) stack.pop();
          if (stack.length === 0) return s.slice(i, j + 1);
        }
      }
    }
  }
  return "";
}

function longestValidJsonPrefix(s) {
  for (let i = s.length; i > 0; i--) {
    const ch = s[i - 1];
    if (ch === "}" || ch === "]" || ch === '"') {
      const sub = s.slice(0, i);
      try { return JSON.parse(sub); } catch (_) {}
    }
  }
  return null;
}

function fixUnterminatedString(s) {
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') inStr = !inStr;
  }
  if (!inStr) return s;
  return s + '"';
}

function balanceBrackets(s) {
  let braces = 0, brackets = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") braces++;
    else if (c === "}") braces--;
    else if (c === "[") brackets++;
    else if (c === "]") brackets--;
  }
  let tail = "";
  while (brackets-- > 0) tail += "]";
  while (braces-- > 0) tail += "}";
  return s + tail;
}

/** 把 AI 返回的短剧 JSON 结构转换为项目三级结构。 */
export function aiScriptToProject(json) {
  const episodes = [];
  const shots = [];
  const dialogues = [];
  let epOrder = 0, shotSeq = 0;
  const eps = Array.isArray(json) ? json : (Array.isArray(json.episodes) ? json.episodes : []);
  for (const ep of eps) {
    const epId = "ep_" + Date.now() + "_" + epOrder;
    episodes.push({ id: epId, title: ep.title || ("第" + (epOrder + 1) + "集"), summary: ep.summary || "", order: epOrder });
    epOrder++;
    const scs = Array.isArray(ep.shots) ? ep.shots : (Array.isArray(ep.scenes) ? ep.scenes : []);
    for (const sc of scs) {
      const shotId = "sh_" + Date.now() + "_" + shotSeq;
      shotSeq++;
      shots.push({
        id: shotId, episodeId: epId, title: sc.title || ("镜头" + shotSeq),
        sceneDesc: sc.description || sc.sceneDesc || sc.desc || "",
        shotType: sc.shotType || sc.shot_type || "",
        camera: sc.camera || sc.movement || "",
        lighting: sc.lighting || "",
        costume: sc.costume || "",
        environment: sc.environment || sc.env || "",
        mood: sc.mood || sc.emotion || "",
        vfx: sc.vfx || sc.specialEffects || sc.effects || "",
        cnPrompt: sc.cnPrompt || sc.cn_prompt || sc.chinesePrompt || "",
        aspectRatio: "9:16",
        prompt: sc.prompt || sc.imagePrompt || "",
        imageUrl: null, videoUrl: null, duration: sc.duration || 5, status: "todo", progress: 0,
        shotIndex: shotSeq,
        sceneType: sc.sceneType || sc.shotType || sc.shot_type || "",
        cameraMove: sc.cameraMove || sc.camera || sc.movement || "",
        emotion: sc.emotion || sc.mood || "",
        effect: sc.effect || sc.vfx || sc.specialEffects || sc.effects || "",
        promptCn: sc.promptCn || sc.cnPrompt || sc.cn_prompt || sc.chinesePrompt || "",
        characters: Array.isArray(sc.characters) ? sc.characters : [],
        dialogue: sc.dialogue || "",
        subtitle: sc.subtitle || "",
        innerMonologue: sc.innerMonologue || "",
        note: sc.note || "",
        foreshadow: sc.foreshadow || false,
        endPoint: "",
        lastFrame: null,
        characterImage: null,
        characterImages: {},
      });
      const dls = Array.isArray(sc.dialogues) ? sc.dialogues : (Array.isArray(sc.lines) ? sc.lines : []);
      for (const d of dls) {
        dialogues.push({
          id: "d_" + Date.now() + "_" + dialogues.length, shotId, episodeId: epId,
          character: d.character || d.role || "角色", text: d.text || d.line || "", ttsUrl: null, status: "todo",
        });
      }
    }
  }
  return { episodes, shots, dialogues };
}

// ───────────────────────────────────────────────────────────
// 分镜镜头收束点（endPoint）与 背景继承 辅助
// ───────────────────────────────────────────────────────────

// 由景别/运镜选择「镜头停法」，写在 promptCn 结尾，保证与下一镜衔接。
export function computeShotEndPoint(sh = {}) {
  const st = String(sh.sceneType || sh.shotType || "").toLowerCase();
  const cm = String(sh.cameraMove || sh.camera || "").toLowerCase();
  if (cm.includes("环绕") || cm.includes("环")) return "镜头环绕后缓缓停下，定格在人物正面，方便下一镜头接续";
  if (st.includes("慢动作") || (st + cm).includes("打斗")) return "动作结束，镜头稳定定格在人物姿态，为下一镜镜头衔接做准备";
  if (st.includes("特写")) return "镜头缓慢拉远，回到人物所处环境，为下一镜中景做衔接";
  if (st.includes("中景") || st.includes("近景")) return "镜头缓缓向内聚焦，最终落至人物上半身，为下一个特写镜头预留画面切口";
  if (st.includes("远景")) return "镜头缓慢向前推镜，最终停在人物所在区域，为下一个中景镜头做衔接";
  return "镜头缓慢收束，停在主体，为下一镜头衔接";
}

// 复用上一镜的 景别/灯光/情绪/地点，拼成「背景延续」片段，避免地点跳变。
export function backgroundInheritText(prevShot) {
  if (!prevShot) return "";
  const scene = prevShot.sceneType || prevShot.shotType || prevShot.environment || prevShot.sceneDesc || "";
  const lighting = prevShot.lighting || "";
  const tone = prevShot.emotion || prevShot.mood || "";
  const location = prevShot.environment || prevShot.sceneDesc || "";
  const parts = [scene, lighting, tone, location].filter(Boolean);
  if (!parts.length) return "";
  return ` 背景延续上一镜头：${parts.join("，")}，不改变地点`;
}
