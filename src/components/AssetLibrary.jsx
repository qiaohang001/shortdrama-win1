import React, { useState } from "react";
import { downloadUrl, saveBlob, dramaModifier, repairAndParse, pushHistory } from "../utils.js";
import { invoke } from "@tauri-apps/api/core";

// 生图风格选项
const STYLE_OPTIONS = [
  { value: "cinematic", label: "电影级写实", desc: "电影级写实风格，胶片质感，专业光影，高对比度" },
  { value: "anime", label: "动漫风格", desc: "动漫风格，色彩鲜艳，表情生动，日式动画美学" },
  { value: "realistic", label: "超写实", desc: "超写实照片风格，真实皮肤质感，自然光影，极致细节" },
  { value: "noir", label: "黑色电影", desc: "黑色电影风格，黑白高反差，深邃阴影，神秘氛围" },
  { value: "cyberpunk", label: "赛博朋克", desc: "赛博朋克风格，霓虹灯光，未来都市，高科技低生活" },
  { value: "fantasy", label: "奇幻风格", desc: "奇幻风格，魔法氛围，空灵光线，梦幻意境" },
  { value: "horror", label: "恐怖风格", desc: "恐怖风格，黑暗氛围，阴森光线，悬疑惊悚" },
  { value: "comedy", label: "喜剧风格", desc: "喜剧风格，明亮色彩，欢快氛围，夸张表情" },
];

// 画面比例选项
const ASPECT_RATIO_OPTIONS = [
  { value: "1:1", label: "1:1 方形", size: "1328x1328" },
  { value: "16:9", label: "16:9 横屏", size: "1672x941" },
  { value: "9:16", label: "9:16 竖屏", size: "1024x1820" },
  { value: "4:3", label: "4:3 标准", size: "1152x864" },
  { value: "3:4", label: "3:4 竖版", size: "864x1152" },
];
import { DispatchGlmClient } from "@dual/glm-client";
import { generateImage, img2imgImage, api } from "../dispatch-jobs.js";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ImageLightbox } from "./ImageLightbox.jsx";

// 素材库：角色 / 场景 / 全部。
// 角色：AI 生成角色四视图、生成角色 3D 模型（本地 GTX 960 无法真实生成，先管理占位与导出元数据）。
// 场景：生成场景图、生成场景 3D 模型（同理占位）。
const TYPES = [
  ["all", "全部"], ["image", "🖼 图片"], ["video", "🎬 视频"],
  ["audio", "🔊 音效"], ["music", "🎵 音乐"], ["sticker", "🌟 贴纸"], ["text", "📝 文字"],
];

const SECTIONS = [
  { k: "all", label: "全部素材" },
  { k: "characters", label: "🎭 角色" },
  { k: "scenes", label: "🎪 场景" },
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ── 简易程序化解码：从描述中抓取颜色/性别/高矮等关键词，生成 Three.js 程序人偶 GLB ──
function parseDescColor(desc, fallback) {
  const colors = { 红: 0xcc4444, 黄: 0xeebb44, 蓝: 0x4466cc, 绿: 0x44aa66, 黑: 0x222222, 白: 0xf5f5f5, 灰: 0x888888, 紫: 0x8844cc, 粉: 0xee88aa, 棕: 0x8b5a2b, 橙: 0xee8844, 米: 0xdcc8a8, 青: 0x44aaaa };
  for (const [k, v] of Object.entries(colors)) {
    if ((desc || "").includes(k)) return v;
  }
  return fallback;
}

// ArrayBuffer → base64（用于跨进程共享：blob URL 在另一个 exe 内无效，base64 可随 JSON 传递）
async function generateCloud3D({ desc, kind }) {
  // 调用后端 3D 代理（阿里云百炼 Tripo，密钥在后端，扣用户积分）
  const res = await api("/api/3d/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: desc, kind }),
  });
  if (!res || !res.task_id) {
    throw new Error((res && res.detail) || "3D 任务创建失败");
  }
  const taskId = res.task_id;
  // 轮询任务状态（最长约 10 分钟）
  let final = null;
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    let t;
    try { t = await api(`/api/3d/task/${taskId}`); } catch (e) { continue; }
    if (t.status === "SUCCEEDED") { final = t; break; }
    if (t.status === "FAILED") {
      const msg = (t.raw && (t.raw.message || t.raw.code)) || "3D 生成失败";
      throw new Error(msg);
    }
  }
  if (!final) throw new Error("3D 生成超时（10分钟）");
  if (!final.model_url) throw new Error("3D 生成未返回模型地址");
  // 下载 GLB 模型
  const resp = await fetch(final.model_url);
  if (!resp.ok) throw new Error("模型下载失败");
  const ab = await resp.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([ab], { type: "model/gltf-binary" }));
  return { blobUrl, b64: arrayBufferToBase64(ab), rendered: final.rendered_image_url || "" };
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// 把 Three.js 场景导出为 GLB ArrayBuffer
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, (gltf) => resolve(gltf), (err) => reject(err), { binary: true });
  });
}

function createCharacterGLB(desc) {
  const d = (desc || "").toLowerCase();
  const female = d.includes("女") || d.includes("actress") || d.includes("lady") || d.includes("girl");
  const male = !female && (d.includes("男") || d.includes("man") || d.includes("boy"));
  const height = d.includes("高") || d.includes("tall") ? 1.85 : (d.includes("矮") || d.includes("short") ? 1.55 : 1.7);
  const skin = parseDescColor(desc, 0xf5d0b0);
  const top = parseDescColor((desc || "") + " 衣", female ? 0xd67fb4 : 0x3a6a9e);
  const bottom = parseDescColor((desc || "") + " 裤", female ? 0x4a4a5a : 0x2e3b4e);

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);

  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const topMat = new THREE.MeshStandardMaterial({ color: top, roughness: 0.7 });
  const bottomMat = new THREE.MeshStandardMaterial({ color: bottom, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x221100, roughness: 0.9 });

  const s = height / 1.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 24, 24), skinMat);
  head.position.y = 1.55 * s; group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 24, 24), hairMat);
  hair.position.y = 1.6 * s; hair.scale.set(1, 0.8, 1); group.add(hair);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.15 * s, 0.55 * s, 16), topMat);
  torso.position.y = 1.18 * s; group.add(torso);
  const armGeo = new THREE.CylinderGeometry(0.05 * s, 0.04 * s, 0.55 * s, 12);
  const leftArm = new THREE.Mesh(armGeo, skinMat); leftArm.position.set(-0.25 * s, 1.18 * s, 0); group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, skinMat); rightArm.position.set(0.25 * s, 1.18 * s, 0); group.add(rightArm);
  const legGeo = new THREE.CylinderGeometry(0.07 * s, 0.06 * s, 0.75 * s, 12);
  const leftLeg = new THREE.Mesh(legGeo, bottomMat); leftLeg.position.set(-0.1 * s, 0.45 * s, 0); group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, bottomMat); rightLeg.position.set(0.1 * s, 0.45 * s, 0); group.add(rightLeg);

  return exportGLB(scene);
}

function createSceneGLB(desc) {
  const d = (desc || "").toLowerCase();
  const floorColor = parseDescColor(desc, 0x5a5a5a);
  const wallColor = parseDescColor((desc || "") + " 墙", 0x8b8b8b);
  const scene = new THREE.Scene();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall1 = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }));
  wall1.position.set(0, 2, -4); scene.add(wall1);
  const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }));
  wall2.rotation.y = Math.PI / 2; wall2.position.set(-4, 2, 0); scene.add(wall2);
  return exportGLB(scene);
}

export function AssetLibrary({ project, update, log, onUseDub, onUseEdit }) {
  const assets = project?.assets || [];
  const trash = project?.assetTrash || [];
  const materials = project?.materials || { characters: [], scenes: [] };
  const characters = materials.characters || [];
  const scenes = materials.scenes || [];

  const [section, setSection] = useState("all");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sel, setSel] = useState({});
  const [showTrash, setShowTrash] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("image");
  const [newUrl, setNewUrl] = useState("");
  const [newFile, setNewFile] = useState(null);
  const [importingChar3d, setImportingChar3d] = useState(null);
  const [importingScene3d, setImportingScene3d] = useState(null);
  const [uploadingView, setUploadingView] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("1:1");
  // 场景风格参考图：选中已有场景图后，生成场景图走 X99 图生图（IPAdapter 风格迁移）保持风格一致；空 = 文生图
  const [sceneRefId, setSceneRefId] = useState("");
  const fileRef = React.useRef(null);
  const char3dRef = React.useRef(null);
  const scene3dRef = React.useRef(null);
  const fourViewRef = React.useRef(null);
  const sheetRef = React.useRef(null);

  const setAssets = (next) => update({ assets: next });
  const setTrash = (next) => update({ assetTrash: next });
  const setMaterials = (next) => update({ materials: { ...materials, ...next } });

  // #404 AI 分析角色与场景：从项目全文抽取角色/场景模板，去重并入素材库。
  const analyzeMaterials = async () => {
    // 取项目全文：优先 sourceText/idea，回退拼接各分镜标题与描述
    const srcText = (project.sourceText || project.idea || "").trim();
    const fallback = (project.shots || [])
      .map((s) => `${s.title || ""}。${s.sceneDesc || ""} ${s.cnPrompt || ""}`)
      .join("\n")
      .trim();
    const text = srcText || fallback;
    if (!text) { if (log) log("暂无可用文本：请先导入小说/剧本或填写故事梗概/分镜描述。"); return; }
    setAnalyzeBusy(true);
    if (log) log("正在用 AI 分析全文中的角色与场景…");
    try {
      const prompt = `你是一名短剧视觉策划。请阅读以下故事/剧本，提取主要角色与关键场景，输出严格 JSON。
要求：
1. characters 数组：至少提取 1-3 位主要角色，每位包含：
   - name（姓名/称呼）
   - role（身份定位，如主角/反派/导师）
   - appearance（外貌：脸型五官、发型、身材、年龄性别、穿着）
   - desc（综合描述 50-100 字，给人类看，涵盖 外貌/身份/性格/服饰）
   - era（时代：古代/现代/民国/玄幻/未来）
   - prompt（给 AI 图像生成用的详细提示词 80-150 字中文，必须包含：时代、年龄、性别、脸型五官、发型、上衣、下装/裙装、鞋履、配饰、体态、表情神态、整体色调）
2. scenes 数组：至少提取 1-3 个关键场景，每个包含：
   - name（场景名）
   - environment（环境：建筑/自然/地点）
   - atmosphere（氛围）
   - era（时段/时代，如清晨/黄昏/雨夜/现代）
   - prompt（给 AI 图像生成用的详细场景提示词 80-150 字中文，必须包含：时代/地点、时间/天气、建筑/自然元素、主要道具、光线、色调、氛围、画面风格）
3. 只输出 JSON 对象，不要解释，不要 markdown 代码块。

原文（前 12000 字）：
${text.slice(0, 12000)}`;
      const client = new DispatchGlmClient();
      const res = await client.chat(prompt, { maxTokens: 4000, temperature: 0.7 });
      let data = repairAndParse(res, "角色场景 JSON");
      if (Array.isArray(data) && data.length === 2 && Array.isArray(data[0]) && Array.isArray(data[1])) {
        data = { characters: data[0], scenes: data[1] };
      }
      const curChars = materials.characters || [];
      const curScenes = materials.scenes || [];
      // 按 name 去重（保留已存在条目），补全默认字段使四视图生成器可用
      const mergedChars = [...curChars];
      let addedChars = 0;
      (data.characters || []).forEach((c, i) => {
        const name = (c.name || "").trim();
        if (!name || mergedChars.some((x) => (x.name || "").trim() === name)) return;
        mergedChars.push({
          id: "char_" + Date.now() + "_" + i + "_" + addedChars,
          name, role: c.role || "", desc: c.desc || c.description || "",
          appearance: c.appearance || c.looks || "", era: c.era || "", prompt: c.prompt || "",
          fourViews: [], referenceSheet: "", model3d: { status: "none" }, createdAt: Date.now(),
        });
        addedChars++;
      });
      const mergedScenes = [...curScenes];
      let addedScenes = 0;
      (data.scenes || []).forEach((s, i) => {
        const name = (s.name || "").trim();
        if (!name || mergedScenes.some((x) => (x.name || "").trim() === name)) return;
        mergedScenes.push({
          id: "scn_" + Date.now() + "_" + i + "_" + addedScenes,
          name, desc: s.desc || s.description || "", environment: s.environment || "",
          atmosphere: s.atmosphere || s.mood || "", era: s.era || "", prompt: s.prompt || "",
          imageUrl: "", model3d: { status: "none" }, createdAt: Date.now(),
        });
        addedScenes++;
      });
      setMaterials({ characters: mergedChars, scenes: mergedScenes });
      update({ history: pushHistory(project.history, "AI 分析角色场景", `角色 ${addedChars} / 场景 ${addedScenes}`) });
      if (log) log(`分析完成：新增 ${addedChars} 位角色、${addedScenes} 个场景（已去重并入素材库，可在「角色/场景」中生成参考图）。`);
    } catch (e) {
      console.error(e);
      if (log) log("分析失败：" + (e && e.message ? e.message : e));
    } finally {
      setAnalyzeBusy(false);
    }
  };

  const addCharacter = () => {
    const c = { id: "char_" + Date.now(), name: "新角色 " + (characters.length + 1), desc: "", appearance: "", prompt: "", era: "", fourViews: [], referenceSheet: "", model3d: { status: "none" }, createdAt: Date.now() };
    setMaterials({ characters: [c, ...characters] });
  };
  const patchCharacter = (id, patch) => setMaterials({ characters: characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const delCharacter = (id) => { if (!window.confirm("删除该角色？")) return; setMaterials({ characters: characters.filter((c) => c.id !== id) }); };

  const addScene = () => {
    const s = { id: "scn_" + Date.now(), name: "新场景 " + (scenes.length + 1), desc: "", prompt: "", atmosphere: "", era: "", imageUrl: "", model3d: { status: "none" }, createdAt: Date.now() };
    setMaterials({ scenes: [s, ...scenes] });
  };
  const patchScene = (id, patch) => setMaterials({ scenes: scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const delScene = (id) => { if (!window.confirm("删除该场景？")) return; setMaterials({ scenes: scenes.filter((s) => s.id !== id) }); };

  // 所有人物图片/视频默认东方中国人面貌的提示词后缀（仿真人类型使用）
  const EASTERN_MODIFIER = "东方中国人面貌，汉族五官特征，自然肤色，黑色或深棕色头发，亚洲人面部结构。";

  // 不同短剧类型下的人脸/角色修饰语（动漫类型换脸型为二次元角色）
  const faceModifier = (type) => {
    if (type === "anime") return "二次元动漫角色，东方亚洲动漫面孔，大眼睛、鲜明轮廓线、赛璐璐上色，夸张而精致的发型；";
    if (type === "semireal") return "半写实风格化角色，东方亚洲面孔，柔和笔触与写实光影结合；";
    if (type === "comic") return "漫画风格角色，东方亚洲漫画面孔，清晰黑色描边线条、平涂上色；";
    return EASTERN_MODIFIER;
  };

  const buildFourViewPrompt = (base, view, type) => {
    const core = (base || "").trim() || "一位年轻的中国演员，现代影视短剧造型。";
    const viewSpec = {
      "正面": "正面站立，完整全身，面部正对镜头，双臂自然垂于身体两侧，双腿并拢站立",
      "侧面": "90度侧面站立，完整全身，面部朝向画面左侧或右侧均可，双臂自然下垂，双腿并拢站立",
      "背面": "严格从人物正后方拍摄的背面视角：后脑勺与整个背部正对镜头，面部绝不可见，双臂自然下垂，双腿并拢站立，完整展现背部服装、发型与衣摆细节。这是背面定妆照，绝不是正面也不是侧面，画面中不得出现该角色的面部。",
      "特写": "面部特写/上半身近景，正对镜头，肩膀以上，清晰展现五官、表情、眼神、发型、服装领口与配饰细节"
    }[view] || view;
    return `【强制要求】只生成「人物参考图」，绝对禁止出现任何背景、场景、环境、道具、地面、家具、装饰物、光影氛围或文字；画面里仅呈现该角色人物本身，使用纯色或透明背景，无阴影污染。\n根据以下角色描述，判断其时代背景（古代/现代/民国/玄幻等）并据此生成对应服饰、发型与道具。\n角色描述：${core}\n${faceModifier(type)}\n要求：${viewSpec}。单张独立图片，画面里只出现一个人物，不裁切，自然放松，均匀柔和正面光源，高清写实，影视短剧/角色定妆照风格，面部特征、发型、服装、身材比例与同一角色其他视角完全一致，无文字、无水印、无边框、无拼贴、无四格排版、无网格布局、无任何背景元素。${dramaModifier(type)}`;
  };

  const genFourView = async (c) => {
    const base = c.prompt || c.desc || c.appearance || window.prompt("请描述该角色外貌、服装、气质（越详细越一致）：", "年轻中国女性，长发及肩，穿米色风衣，都市职场气质");
    if (!base) return;
    patchCharacter(c.id, { prompt: base, desc: c.desc || base, fourViews: [], model3d: { ...(c.model3d || {}), status: "generating_fourview" } });
    try {
      const views = ["正面", "侧面", "背面", "特写"];
      const urls = [];
      let frontUrl = null; // 首视图（正面）定锚
      for (let i = 0; i < views.length; i++) {
        const view = views[i];
        const prompt = buildFourViewPrompt(base, view, project.dramaType);
        const res = await generateImage({ prompt, model: "Qwen/Qwen-Image", size: "1328x1328", n: 1 });
        if (!res.image_url) throw new Error(view + " 视图生成未返回图片 URL");
        urls.push({ view, url: res.image_url, at: Date.now() });
        if (i === 0) frontUrl = res.image_url;
        patchCharacter(c.id, { fourViews: urls });
      }
      // 关键修复：显式回写已累积的 fourViews，避免被陈旧闭包中 model3d patch 覆盖导致生成后四视图消失
      patchCharacter(c.id, { fourViews: urls, model3d: { ...(c.model3d || {}), status: "none" } });
      window.alert(`角色「${c.name}」参考图已生成完毕（共 ${urls.length} 张视角，纯人物无背景）。`);
    } catch (e) {
      console.error(e);
      patchCharacter(c.id, { model3d: { ...(c.model3d || {}), status: "fourview_error", error: e.message } });
      window.alert("参考图生成失败：" + e.message);
    }
  };
  const genChar3D = async (c) => {
    const desc = c.prompt || c.desc || c.appearance || window.prompt("请输入角色描述，用于生成 3D 模型：", "年轻中国女性，长发，穿米色风衣，都市职场气质");
    if (!desc) return;
    patchCharacter(c.id, { prompt: desc, desc: c.desc || desc, model3d: { ...(c.model3d || {}), status: "generating_3d" } });
    try {
      const { blobUrl, b64 } = await generateCloud3D({ desc, kind: "character" });
      patchCharacter(c.id, { model3d: { status: "exported", url: blobUrl, b64, exportedAt: Date.now() } });
      exportSharedAssets();
      window.alert(`角色「${c.name}」云端 3D 模型已生成并导出，可在「3D 导演台」查看。`);
    } catch (e) {
      console.error(e);
      patchCharacter(c.id, { model3d: { ...(c.model3d || {}), status: "error_3d", error: e.message } });
      window.alert("3D 模型生成失败：" + e.message);
    }
  };
  const importChar3D = async (c, file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      const base64 = dataUrl.split(",")[1] || "";
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
      patchCharacter(c.id, { model3d: { status: "exported", url: blobUrl, b64: base64, exportedAt: Date.now() } });
      exportSharedAssets();
    } catch (e) { window.alert("导入失败：" + e.message); }
  };

  // 上传单个四视图（正面/侧面/背面/特写），与 AI 生成的四视图共存
  const FOUR_VIEW_ORDER = ["正面", "侧面", "背面", "特写"];
  const uploadFourView = async (c, view, file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      const existing = Array.isArray(c.fourViews) ? c.fourViews.filter((v) => v.view !== view) : [];
      const next = [...existing, { view, url: dataUrl, at: Date.now() }];
      // 按固定顺序重排，保证显示稳定
      next.sort((a, b) => FOUR_VIEW_ORDER.indexOf(a.view) - FOUR_VIEW_ORDER.indexOf(b.view));
      patchCharacter(c.id, { fourViews: next, model3d: { ...(c.model3d || {}), status: "none" } });
    } catch (e) { window.alert(`上传${view}失败：` + e.message); }
  };

  // 上传整张「角色参考图」（用户自备的四视图合图 / 角色设定表），直接作为角色参考图使用
  const uploadReferenceSheet = async (c, file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      patchCharacter(c.id, { referenceSheet: dataUrl, model3d: { ...(c.model3d || {}), status: "none" } });
      window.alert(`角色「${c.name}」的整张参考图已导入。`);
    } catch (e) { window.alert("上传整张参考图失败：" + e.message); }
  };

  const genSceneImage = async (s) => {
    const desc = s.prompt || s.desc || window.prompt("请输入场景描述：", "现代都市客厅，浅灰沙发，落地窗，午后阳光");
    if (!desc) return;
    patchScene(s.id, { prompt: desc, desc: s.desc || desc, model3d: { ...(s.model3d || {}), status: "generating_image" } });
    try {
      // 风格参考图：若用户在上方选中了已有场景图，走 X99 图生图（IPAdapter 风格迁移）保持风格一致
      const refScene = sceneRefId ? scenes.find((x) => x.id === sceneRefId && x.imageUrl) : null;
      const styleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle) || STYLE_OPTIONS[0];
      const styleDesc = styleObj.desc;
      const aspectObj = ASPECT_RATIO_OPTIONS.find(a => a.value === selectedAspectRatio) || ASPECT_RATIO_OPTIONS[0];
      const imageSize = aspectObj.size;
      const prompt = `纯场景空镜/环境概念图，绝对禁止出现任何人物、人形、剪影、角色或拟人形象，画面里只呈现环境、建筑、自然、道具与氛围。\n根据以下场景描述，判断时代背景（古代/现代/民国/玄幻等）并生成对应环境。\n场景描述：${desc}\n要求：${styleDesc}，影视短剧空镜/场景概念图风格，高清写实，构图完整，氛围鲜明，光影细腻，色彩协调，空无一人的纯粹场景，无人物主体、无人形、无剪影、无角色、无任何与人类相关的元素，无文字、无水印、无边框。${dramaModifier(project.dramaType)}`;
      let res;
      if (refScene) {
        if (log) log(`🎨 参考场景图「${refScene.name}」生成（X99 风格迁移，保持风格一致）…`);
        res = await img2imgImage({
          image_url: refScene.imageUrl,
          prompt,
          negative_prompt: "",
          seed: Math.floor(Math.random() * 2147483647),
        });
        patchScene(s.id, { imageUrl: res.image_url, model3d: { ...(s.model3d || {}), status: "none" } });
        if (log) log(`✅ 场景「${s.name}」已参考「${refScene.name}」生成，风格保持一致`);
      } else {
        res = await generateImage({ prompt, model: "Qwen/Qwen-Image", size: imageSize, n: 1 });
        patchScene(s.id, { imageUrl: res.image_url, model3d: { ...(s.model3d || {}), status: "none" } });
      }
    } catch (e) {
      patchScene(s.id, { model3d: { ...(s.model3d || {}), status: "error_image", error: e.message } });
      window.alert("场景图生成失败：" + e.message);
    }
  };
  const genScene3D = async (s) => {
    const desc = s.prompt || s.desc || window.prompt("请输入场景描述，用于生成 3D 场景：", "现代都市客厅，浅灰墙面，木地板");
    if (!desc) return;
    patchScene(s.id, { prompt: desc, desc: s.desc || desc, model3d: { ...(s.model3d || {}), status: "generating_3d" } });
    try {
      const { blobUrl, b64 } = await generateCloud3D({ desc, kind: "scene" });
      patchScene(s.id, { model3d: { status: "exported", url: blobUrl, b64, exportedAt: Date.now() } });
      exportSharedAssets();
      window.alert(`场景「${s.name}」云端 3D 场景已生成并导出，可在「3D 导演台」查看。`);
    } catch (e) {
      patchScene(s.id, { model3d: { ...(s.model3d || {}), status: "error_3d", error: e.message } });
      window.alert("3D 场景生成失败：" + e.message);
    }
  };
  const importScene3D = async (s, file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      const base64 = dataUrl.split(",")[1] || "";
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
      patchScene(s.id, { model3d: { status: "exported", url: blobUrl, b64: base64, exportedAt: Date.now() } });
      exportSharedAssets();
    } catch (e) { window.alert("导入失败：" + e.message); }
  };

  const exportSharedAssets = () => {
    const data = {
      kind: "jinsu-shared-assets",
      version: 1,
      exportedAt: Date.now(),
      characters: characters.map((c) => ({ id: c.id, name: c.name, type: "character", enabled: (c.model3d?.status === "exported"), url: c.model3d?.url || "", modelB64: c.model3d?.b64 || "" })),
      scenes: scenes.map((s) => ({ id: s.id, name: s.name, type: "scene", enabled: (s.model3d?.status === "exported"), url: s.model3d?.url || "", modelB64: s.model3d?.b64 || "" })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    void saveBlob("jinsu-shared-assets.json", blob, { log });
    // 同时写入共享目录，供 3D 导演台启动后自动载入（无需手动导出/导入）
    invoke("save_shared_assets", { contents: JSON.stringify(data) }).catch(() => {});
  };

  const onGroupChange = (id, v) => {
    if (v === "__new") {
      const g = window.prompt("输入新分组名称：");
      if (g && g.trim()) setGroup(id, g.trim());
      return;
    }
    setGroup(id, v);
  };

  const allTags = Array.from(new Set(assets.flatMap((a) => a.tags || []))).filter(Boolean);
  const allGroups = Array.from(new Set(assets.map((a) => a.group).filter(Boolean)));

  const list = assets.filter((a) => {
    if (filter !== "all" && a.type !== filter) return false;
    if (tagFilter && !(a.tags || []).includes(tagFilter)) return false;
    if (q && !((a.title || "").toLowerCase().includes(q.toLowerCase()) || (a.tags || []).some((t) => t.toLowerCase().includes(q.toLowerCase())))) return false;
    return true;
  });

  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const toggleSel = (id) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const clearSel = () => setSel({});
  const patchAsset = (id, patch) => setAssets(assets.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const toggleFav = (id) => { const a = assets.find((x) => x.id === id); patchAsset(id, { favorite: !a.favorite }); };
  const addTag = (id, tag) => { const a = assets.find((x) => x.id === id); if (!a || !tag) return; patchAsset(id, { tags: Array.from(new Set([...(a.tags || []), tag])) }); };
  const removeTag = (id, tag) => { const a = assets.find((x) => x.id === id); if (!a) return; patchAsset(id, { tags: (a.tags || []).filter((t) => t !== tag) }); };
  const setGroup = (id, g) => patchAsset(id, { group: g || undefined });

  const batchDelete = () => {
    const move = assets.filter((a) => selIds.includes(a.id));
    const rest = assets.filter((a) => !selIds.includes(a.id));
    setTrash([...trash, ...move.map((a) => ({ ...a, _trashAt: Date.now() }))]);
    setAssets(rest); clearSel();
  };
  const batchFav = () => { setAssets(assets.map((a) => (selIds.includes(a.id) ? { ...a, favorite: true } : a))); clearSel(); };

  const restoreAsset = (id) => {
    const a = trash.find((x) => x.id === id); if (!a) return;
    const { _trashAt, ...rest } = a;
    setAssets([...assets, rest]);
    setTrash(trash.filter((x) => x.id !== id));
  };
  const purgeAsset = (id) => setTrash(trash.filter((x) => x.id !== id));
  const emptyTrash = () => setTrash([]);

  const doAdd = async () => {
    if (!newTitle.trim() && !newFile) return;
    let url = newUrl;
    if (newFile) { try { url = await fileToDataUrl(newFile); } catch { url = ""; } }
    const a = { id: "a_" + Date.now(), type: newType, title: newTitle.trim() || (newFile ? newFile.name : "素材"), url: url || "", status: url ? "ready" : "pending", tags: [], favorite: false };
    setAssets([a, ...assets]);
    setAdding(false); setNewTitle(""); setNewUrl(""); setNewFile(null);
  };

  const onDragStart = (e, a) => { e.dataTransfer.setData("application/x-asset-id", a.id); e.dataTransfer.effectAllowed = "copy"; };

  if (showTrash) {
    return (
      <div style={wrap}>
        <div style={headRow}>
          <h3 style={h3}>🗑 素材回收站（{trash.length}）</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnDanger} disabled={!trash.length} onClick={emptyTrash}>清空</button>
            <button style={btn} onClick={() => setShowTrash(false)}>返回素材库</button>
          </div>
        </div>
        {trash.length === 0 ? <div style={ph}>回收站为空。</div> : (
          <div style={grid}>
            {trash.map((a) => (
              <div key={a.id} style={card}>
                {a.type === "video" ? <video src={a.url} style={thumb} controls /> : a.url ? <img src={a.url} style={thumb} alt={a.title} /> : <div style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{(TYPES.find((t) => t[0] === a.type) || [, "📦"])[1]}</div>}
                <div style={title}>{a.title}</div>
                <div style={btnRow}>
                  <button style={miniBtnOn} onClick={() => restoreAsset(a.id)}>恢复</button>
                  <button style={miniBtnD} onClick={() => purgeAsset(a.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={headRow}>
        <h3 style={h3}>🗂 素材库</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnPrimary} disabled={analyzeBusy} onClick={analyzeMaterials}>{analyzeBusy ? "分析中…" : "🤖 AI 分析角色与场景"}</button>
          <button style={btn} onClick={() => setShowTrash(true)}>🗑 回收站（{trash.length}）</button>
          {section === "all" && <button style={btnPrimary} onClick={() => setAdding(true)}>＋ 添加素材</button>}
          {section === "characters" && <button style={btnPrimary} onClick={addCharacter}>＋ 添加角色</button>}
          {section === "scenes" && <button style={btnPrimary} onClick={addScene}>＋ 添加场景</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))", paddingBottom: 10 }}>
        {SECTIONS.map((s) => (
          <button key={s.k} style={{ ...sectionBtn, ...(section === s.k ? sectionBtnOn : {}) }} onClick={() => { setSection(s.k); setFilter("all"); }}>{s.label}</button>
        ))}
      </div>

      {section === "all" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            {TYPES.map(([k, t]) => (
              <button key={k} style={{ ...chip, ...(filter === k ? chipOn : {}) }} onClick={() => setFilter(k)}>{t}</button>
            ))}
            <input style={search} placeholder="搜索标题 / 标签…" value={q} onChange={(e) => setQ(e.target.value)} />
            {allTags.length > 0 && (
              <select style={miniSelect} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="">标签: 全部</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>

          {selIds.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", padding: "6px 10px", background: "var(--panel-2, #1c2433)", borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary, #8b95a7)" }}>已选 {selIds.length}</span>
              <button style={miniBtnOn} onClick={batchFav}>批量收藏</button>
              <button style={miniBtnD} onClick={batchDelete}>批量移入回收站</button>
              <button style={miniBtn} onClick={clearSel}>取消选择</button>
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--text-muted, #5d6779)", marginBottom: 8 }}>
            拖拽卡片到「无限画布」可放置素材节点；或用下方按钮一键送入配音 / 剪辑。
          </div>

          {adding && (
            <div style={addBox}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>添加素材</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <input style={inp} placeholder="标题" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                <select style={inp} value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {TYPES.filter((t) => t[0] !== "all").map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
                <button style={btn} onClick={() => fileRef.current?.click()}>📁 选择文件</button>
                {newFile && <span style={{ fontSize: 12, color: "var(--success, #22c55e)" }}>{newFile.name}</span>}
              </div>
              <input style={inp} placeholder="或粘贴资源 URL（图片/视频）" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => setNewFile(e.target.files && e.target.files[0])} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button style={btnPrimary} onClick={doAdd}>添加</button>
                <button style={btn} onClick={() => setAdding(false)}>取消</button>
              </div>
            </div>
          )}

          {list.length === 0 && <div style={ph}>没有匹配的素材。点「添加素材」上传，或从创作流程生成。</div>}
          <div style={grid}>
            {list.map((a) => (
              <div key={a.id} draggable onDragStart={(e) => onDragStart(e, a)} style={{ ...card, ...(sel[a.id] ? cardSel : {}) }}>
                <div style={{ position: "relative" }}>
                  {a.type === "video" ? <video src={a.url} style={thumb} controls /> : a.url ? <img src={a.url} style={thumb} alt={a.title} /> : <div style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{(TYPES.find((t) => t[0] === a.type) || [, "📦"])[1]}</div>}
                  <input type="checkbox" checked={!!sel[a.id]} onChange={() => toggleSel(a.id)} style={{ position: "absolute", top: 6, left: 6 }} />
                  <button style={{ ...favBtn, ...(a.favorite ? favOn : {}) }} title="收藏" onClick={() => toggleFav(a.id)}>{a.favorite ? "★" : "☆"}</button>
                </div>
                <div style={title}>{a.title}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)", padding: "0 8px" }}>{a.type}{a.group ? " · " + a.group : ""}</div>
                <div style={tagRow}>
                  {(a.tags || []).map((t) => (
                    <span key={t} style={tagPill}>{t}<button style={tagX} onClick={() => removeTag(a.id, t)}>×</button></span>
                  ))}
                  <input style={tagInput} placeholder="+标签" onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { addTag(a.id, e.target.value.trim()); e.target.value = ""; } }} />
                </div>
                <div style={{ padding: "0 8px 6px" }}>
                  <select style={miniSelect} value={a.group || ""} onChange={(e) => onGroupChange(a.id, e.target.value)}>
                    <option value="">分组: 无</option>
                    {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="__new">+ 新分组…</option>
                  </select>
                </div>
                <div style={btnRow}>
                  {a.url && <button style={miniBtn} onClick={() => downloadUrl(a.url, (a.title || "asset") + (a.type === "video" ? ".mp4" : a.type === "image" ? ".png" : ""), { log })}>⬇ 下载</button>}
                  <button style={miniBtn} disabled={!onUseDub} onClick={() => onUseDub && onUseDub(a)}>🎙 配音</button>
                  <button style={miniBtn} disabled={!onUseEdit || a.type !== "video"} onClick={() => onUseEdit && onUseEdit(a)}>🎬 剪辑</button>
                  <button style={miniBtnD} onClick={() => { setTrash([...trash, { ...a, _trashAt: Date.now() }]); setAssets(assets.filter((x) => x.id !== a.id)); }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {section === "characters" && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted, #5d6779)", marginBottom: 8 }}>
            角色库：填写角色描述后，可生成「角色参考图」（Agnes 生图，纯人物无背景，不耗 GPU），或上传自备的四视图合图；也可生成程序化 3D 人偶 GLB 导入 3D 导演台。生成的角色参考图会在视频生成时自动用于保持角色一致性。
          </div>
          {characters.length === 0 && <div style={ph}>暂无角色。点击右上角「添加角色」。</div>}
          <div style={grid}>
            {characters.map((c) => (
              <div key={c.id} style={card}>
                <div style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🎭</div>
                <input style={title} value={c.name} onChange={(e) => patchCharacter(c.id, { name: e.target.value })} />
                <textarea style={{ ...title, minHeight: 54, fontSize: 12, resize: "none", lineHeight: 1.5, margin: "0 8px 8px", width: "calc(100% - 16px)", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, padding: 6, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)" }} value={c.desc || ""} onChange={(e) => patchCharacter(c.id, { desc: e.target.value })} placeholder="角色描述：外貌、服装、气质、时代背景（古代/现代）。从全文分析会自动填入详细提示词。" />
                <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <button style={miniBtn} disabled={c.model3d?.status === "generating_fourview"} onClick={() => genFourView(c)}>{c.model3d?.status === "generating_fourview" ? "生成参考图中…" : "🖼 生成角色参考图"}</button>
                  <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)", marginTop: 2 }}>分视角上传（正面/侧面/背面/特写）：</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {["正面", "侧面", "背面", "特写"].map((view) => (
                      <button
                        key={view}
                        style={{ ...miniBtn, fontSize: 11, padding: "3px 6px", flex: "1 1 auto" }}
                        onClick={() => { setUploadingView({ charId: c.id, view }); fourViewRef.current?.click(); }}
                      >传{view}</button>
                    ))}
                  </div>
                  <button style={miniBtn} onClick={() => sheetRef.current?.click()}>📁 上传整张参考图</button>
                  <input
                    ref={fourViewRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      const u = uploadingView;
                      if (f && u) uploadFourView(characters.find((x) => x.id === u.charId), u.view, f);
                      setUploadingView(null);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={sheetRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadReferenceSheet(characters.find((x) => x.id === c.id), f);
                      e.target.value = "";
                    }}
                  />
                  <button style={miniBtnOn} disabled={c.model3d?.status === "generating_3d"} onClick={() => genChar3D(c)}>{c.model3d?.status === "generating_3d" ? "生成3D中…" : "🧍 生成角色 3D 模型"}</button>
                  <button style={miniBtn} onClick={() => { setImportingChar3d(c.id); char3dRef.current?.click(); }}>📁 导入 GLB 模型</button>
                  <input ref={char3dRef} type="file" accept=".glb,.gltf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f && importingChar3d) { importChar3D(characters.find((x) => x.id === importingChar3d), f); setImportingChar3d(null); } e.target.value = ""; }} />
                  <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)" }}>3D状态：{c.model3d?.status === "exported" ? "已导出" : c.model3d?.status === "generating_3d" ? "生成3D中…" : c.model3d?.status === "generating_fourview" ? "生成参考图中…" : c.model3d?.status === "fourview_error" ? "参考图失败" : c.model3d?.status === "error_3d" ? "3D失败" : c.model3d?.status === "need_gpu" ? "需云端GPU" : "未生成"}</div>
                  {c.referenceSheet && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)", marginBottom: 2 }}>整张角色参考图（用于视频角色一致性）：</div>
                      <img
                        src={c.referenceSheet}
                        alt={`${c.name} 角色参考图`}
                        onClick={() => setLightbox({ src: c.referenceSheet, alt: `${c.name} · 角色参考图` })}
                        style={{ width: "100%", borderRadius: 6, border: "1px solid var(--electric, #7A5CFF)", cursor: "zoom-in" }}
                        title="点击查看原图"
                      />
                      <button style={{ ...miniBtn, fontSize: 10, marginTop: 3 }} onClick={() => patchCharacter(c.id, { referenceSheet: "" })}>移除整张参考图</button>
                    </div>
                  )}
                  {c.fourViews && c.fourViews.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 4, overflowX: "auto" }}>
                      {c.fourViews.map((v) => (
                        <div key={v.view} style={{ position: "relative", flex: "0 0 auto", width: 72 }}>
                          <img
                            src={v.url}
                            alt={v.view}
                            onClick={() => setLightbox({ src: v.url, alt: `${c.name} · ${v.view}` })}
                            style={{ width: 72, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border, rgba(255,255,255,0.08))", cursor: "zoom-in" }}
                            title="点击查看原图"
                          />
                          <div style={{ position: "absolute", bottom: 4, left: 4, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 5px", borderRadius: 4 }}>{v.view}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button style={miniBtnD} onClick={() => delCharacter(c.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {section === "scenes" && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted, #5d6779)", marginBottom: 8 }}>
            场景库：填写场景描述后，可生成场景图（Agnes 生图，不耗 GPU），或生成程序化 3D 场景 GLB 导入 3D 导演台；也支持导入外部 GLB。
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted, #5d6779)" }}>生图风格</span>
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                style={{ padding: "6px 10px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)", fontSize: 12, cursor: "pointer" }}
                title="选择生图风格"
              >
                {STYLE_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted, #5d6779)" }}>画面比例</span>
              <select
                value={selectedAspectRatio}
                onChange={(e) => setSelectedAspectRatio(e.target.value)}
                style={{ padding: "6px 10px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)", fontSize: 12, cursor: "pointer" }}
                title="选择画面比例"
              >
                {ASPECT_RATIO_OPTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted, #5d6779)" }}>风格参考</span>
              <select
                value={sceneRefId}
                onChange={(e) => setSceneRefId(e.target.value)}
                style={{ padding: "6px 10px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)", fontSize: 12, cursor: "pointer", maxWidth: 220 }}
                title="参考已有场景图生成（X99 IPAdapter 风格迁移，保持风格一致）；不选则普通文生图"
              >
                <option value="">不参考（文生图）</option>
                {scenes.filter((x) => x.imageUrl).map((x) => (
                  <option key={x.id} value={x.id}>🖼 {x.name || x.desc?.slice(0, 16) || "场景"}</option>
                ))}
              </select>
            </div>
          </div>
          {scenes.length === 0 && <div style={ph}>暂无场景。点击右上角「添加场景」。</div>}
          <div style={grid}>
            {scenes.map((s) => (
              <div key={s.id} style={card}>
                {s.imageUrl ? <img src={s.imageUrl} alt={s.name} style={{ ...thumb, objectFit: "cover" }} /> : <div style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🎪</div>}
                <input style={title} value={s.name} onChange={(e) => patchScene(s.id, { name: e.target.value })} />
                <textarea style={{ ...title, minHeight: 54, fontSize: 12, resize: "none", lineHeight: 1.5, margin: "0 8px 8px", width: "calc(100% - 16px)", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, padding: 6, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)" }} value={s.desc || ""} onChange={(e) => patchScene(s.id, { desc: e.target.value })} placeholder="场景描述：环境、色调、风格、时代背景。从全文分析会自动填入详细提示词。" />
                <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <button style={miniBtn} disabled={s.model3d?.status === "generating_image"} onClick={() => genSceneImage(s)}>{s.model3d?.status === "generating_image" ? "生成场景中…" : "🖼 生成场景图"}</button>
                  <button style={miniBtnOn} disabled={s.model3d?.status === "generating_3d"} onClick={() => genScene3D(s)}>{s.model3d?.status === "generating_3d" ? "生成3D中…" : "🏛 生成场景 3D 模型"}</button>
                  <button style={miniBtn} onClick={() => { setImportingScene3d(s.id); scene3dRef.current?.click(); }}>📁 导入 GLB 场景</button>
                  <input ref={scene3dRef} type="file" accept=".glb,.gltf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f && importingScene3d) { importScene3D(scenes.find((x) => x.id === importingScene3d), f); setImportingScene3d(null); } e.target.value = ""; }} />
                  <div style={{ fontSize: 10, color: "var(--text-muted, #5d6779)" }}>3D状态：{s.model3d?.status === "exported" ? "已导出" : s.model3d?.status === "generating_3d" ? "生成3D中…" : s.model3d?.status === "generating_image" ? "生图中…" : s.model3d?.status === "error_3d" ? "3D失败" : s.model3d?.status === "error_image" ? "生图失败" : s.model3d?.status === "need_gpu" ? "需云端GPU" : "未生成"}</div>
                  <button style={miniBtnD} onClick={() => delScene(s.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} log={log} />}
    </div>
  );
}

const wrap = { padding: 16, overflowY: "auto", height: "100%", boxSizing: "border-box", color: "var(--text, #e8ecf3)" };
const headRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 };
const h3 = { fontSize: 15, margin: 0 };
const sectionBtn = { padding: "6px 14px", border: "1px solid var(--border, rgba(255,255,255,0.14))", borderRadius: "var(--radius-sm, 6px)", background: "var(--panel-2, #1c2433)", cursor: "pointer", fontSize: 13, color: "var(--text-secondary, #8b95a7)" };
const sectionBtnOn = { background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", borderColor: "transparent" };
const search = { flex: 1, minWidth: 120, padding: 6, border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 14, fontSize: 12, boxSizing: "border-box", background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)" };
const chip = { padding: "4px 12px", border: "1px solid var(--border, rgba(255,255,255,0.14))", borderRadius: 14, background: "var(--panel-2, #1c2433)", cursor: "pointer", fontSize: 12, color: "var(--text-secondary, #8b95a7)" };
const chipOn = { background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", borderColor: "transparent" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 };
const card = { border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: "var(--radius, 10px)", overflow: "hidden", background: "var(--panel, #161d2a)", cursor: "grab" };
const cardSel = { borderColor: "var(--accent-2, #3b82f6)" };
const thumb = { width: "100%", height: 120, objectFit: "cover", display: "block", background: "var(--panel-2, #1c2433)" };
const title = { padding: "6px 8px 0", fontSize: 13, fontWeight: 500, color: "var(--text, #e8ecf3)", border: "none", background: "transparent", width: "100%", boxSizing: "border-box" };
const tagRow = { display: "flex", gap: 4, flexWrap: "wrap", padding: "6px 8px 0", alignItems: "center" };
const tagPill = { fontSize: 10, color: "var(--accent-2, #3b82f6)", background: "rgba(59,130,246,0.12)", borderRadius: 4, padding: "2px 6px", display: "inline-flex", alignItems: "center", gap: 2 };
const tagX = { border: "none", background: "transparent", color: "var(--accent-2, #3b82f6)", cursor: "pointer", fontSize: 11, padding: 0 };
const tagInput = { width: 56, fontSize: 10, border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 4, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)", padding: "2px 4px" };
const miniSelect = { fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border, rgba(255,255,255,0.08))", background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)" };
const btnRow = { display: "flex", gap: 4, padding: "6px 6px 8px" };
const miniBtn = { flex: 1, padding: "5px 0", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, background: "var(--panel-2, #1c2433)", cursor: "pointer", fontSize: 11, color: "var(--text-secondary, #8b95a7)" };
const miniBtnOn = { padding: "5px 10px", border: "none", borderRadius: 6, background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 };
const miniBtnD = { padding: "5px 10px", border: "1px solid var(--danger, #ef4444)", borderRadius: 6, background: "transparent", color: "var(--danger, #ef4444)", cursor: "pointer", fontSize: 11 };
const favBtn = { position: "absolute", top: 6, right: 6, border: "none", background: "rgba(0,0,0,0.4)", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#fff", padding: "2px 6px" };
const favOn = { color: "#f59e0b" };
const ph = { color: "var(--text-muted, #5d6779)", fontSize: 13, padding: 20, textAlign: "center", background: "var(--panel, #161d2a)", borderRadius: "var(--radius, 10px)", border: "1px dashed var(--border, rgba(255,255,255,0.14))" };
const btn = { padding: "7px 12px", border: "1px solid var(--border, rgba(255,255,255,0.14))", borderRadius: "var(--radius-sm, 6px)", background: "var(--panel-2, #1c2433)", cursor: "pointer", fontSize: 12, color: "var(--text-secondary, #8b95a7)" };
const btnPrimary = { padding: "7px 14px", border: "none", borderRadius: "var(--radius-sm, 6px)", background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #3b82f6))", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 };
const btnDanger = { padding: "7px 12px", border: "1px solid var(--danger, #ef4444)", borderRadius: "var(--radius-sm, 6px)", background: "transparent", color: "var(--danger, #ef4444)", cursor: "pointer", fontSize: 12 };
const addBox = { border: "1px solid var(--border, rgba(255,255,255,0.12))", borderRadius: "var(--radius, 10px)", padding: 12, marginBottom: 12, background: "var(--panel, #161d2a)" };
const inp = { padding: "6px 10px", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 6, fontSize: 12, background: "var(--input-bg, #0f141e)", color: "var(--text, #e8ecf3)", minWidth: 140 };
