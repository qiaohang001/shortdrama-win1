import React, { useState, useEffect } from "react";
import { generateImage, api } from "../../dispatch-jobs.js";
import { isLoggedIn, precheckCredits, deductCredits, getCreditBalance } from "../../utils/backend-api.js";
import { getPrice } from "../../utils/pricing-utils.js";

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
  { value: "9:16", label: "9:16 竖屏", desc: "竖屏短剧构图", size: "1024x1820" },
  { value: "16:9", label: "16:9 横屏", desc: "横屏电影构图", size: "1820x1024" },
  { value: "1:1", label: "1:1 方形", desc: "方形构图", size: "1024x1024" },
  { value: "4:3", label: "4:3 标准", desc: "标准比例构图", size: "1152x864" },
  { value: "3:4", label: "3:4 竖版", desc: "竖版构图", size: "864x1152" },
];

export function StoryboardBoard({ project, update, log }) {
  const scenes = project?.scenes || [];
  const shots = project.shots || [];
  const [busy, setBusy] = useState("");
  const [autoSplitting, setAutoSplitting] = useState(false);
  const [selectedEp, setSelectedEp] = useState(project?.episodes?.[0]?.id || null);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("9:16");

  // 当project加载完成后，自动选中第一集
  useEffect(() => {
    if (project?.episodes?.length > 0 && !selectedEp) {
      setSelectedEp(project.episodes[0].id);
    }
  }, [project?.episodes, selectedEp]);

  const [editingShotId, setEditingShotId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editingSceneId, setEditingSceneId] = useState(null);
  const [editSceneDesc, setEditSceneDesc] = useState("");

  const genSceneImage = async (sc) => {
    setBusy(sc.id);
    log("生成分镜图：" + sc.title);
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用分镜生图功能");
      setBusy("");
      return;
    }
    // 积分预校验（分镜生图价格从调度机获取）
    const imagePrice = getPrice("image_generate", 3.0);
    try {
      const precheck = await precheckCredits(imagePrice, "image", `分镜生图：${sc.title}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${imagePrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！生成分镜图需要${imagePrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        setBusy("");
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    try {
      const sceneType = sc.sceneType || "中景";
      const cameraMove = sc.cameraMove || "固定";
      const desc = sc.desc || sc.sceneDesc || "";
      const styleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle) || STYLE_OPTIONS[0];
      const styleDesc = styleObj.desc;
      const aspectObj = ASPECT_RATIO_OPTIONS.find(a => a.value === selectedAspectRatio) || ASPECT_RATIO_OPTIONS[0];
      const aspectDesc = aspectObj.desc;
      const imageSize = aspectObj.size;
      // 限制prompt长度，避免400错误
      const cleanDesc = (desc || "").substring(0, 500);
      const prompt = `短剧分镜画面，${sceneType}镜头，${cameraMove}运镜。${cleanDesc}。${styleDesc}。${aspectDesc}。电影级光影，高对比度，氛围感强，色彩分级专业，画面构图严谨，主体突出，背景有层次。超高清细节，专业影视级画面。无文字，无水印，无边框。`;
      console.log("[分镜生图] prompt长度:", prompt.length, "size:", imageSize, "比例:", selectedAspectRatio);
      const res = await generateImage({ prompt, size: imageSize, n: 1, kind: "storyboard" });
      // 1. 更新分镜的imageUrl（继续覆盖旧图片，保持最新）
      const newScenes = scenes.map(s => s.id === sc.id ? { ...s, imageUrl: res.image_url } : s);
      const newShots = shots.map(s => s.id === sc.id ? { ...s, imageUrl: res.image_url } : s);
      update({ scenes: newScenes, shots: newShots });
      // 2. 同时存入素材库（所有生成的图片都保存，不覆盖）
      try {
        const currentAssets = project?.assets || [];
        const newImageAsset = {
          id: "a_image_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "image",
          title: `${sc.title}分镜图（${styleObj.label}，${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
          url: res.image_url,
          status: "ready",
          tags: ["分镜生图", styleObj.label, sc.episodeId ? `第${sc.episodeId}集` : ""].filter(Boolean),
          favorite: false,
          sceneId: sc.id,
          episodeId: sc.episodeId || "",
          style: selectedStyle,
          createdAt: Date.now()
        };
        update({ assets: [newImageAsset, ...currentAssets] });
        log(`✅ 分镜图已存入素材库：${newImageAsset.title}`);
      } catch (e) {
        log(`⚠️ 分镜图存入素材库失败：${e.message}`);
      }
      log("分镜图生成成功（" + styleObj.label + "风格）");
      // 积分扣减（分镜生图）
      if (isLoggedIn()) {
        try {
                    log("✅ 分镜生图费用已由后端按实际成本扣减");
          try {
            const balanceData = await getCreditBalance();
            if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
            if (window.refreshUserInfo) window.refreshUserInfo();
          } catch (e) {}
        } catch (e) {
          log(`⚠️ 余额刷新失败：${e.message}`);
        }
      }
    } catch (e) {
      log("生成失败：" + e.message);
    } finally {
      setBusy("");
    }
  };

  const autoSplitScript = async () => {
    // 必须先选中一集
    if (!selectedEp) {
      log("请先在顶部选择要拆分的集数");
      return;
    }
    // 找到当前选中的集
    const currentEpisode = (project.episodes || []).find(ep => ep.id === selectedEp);
    if (!currentEpisode) {
      log("未找到选中的集数内容");
      return;
    }
    const context = currentEpisode.content || currentEpisode.desc || "";
    if (!context || context.length < 10) {
      log("当前集内容太少，无法拆分");
      return;
    }
    setAutoSplitting(true);
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用分镜拆分功能");
      setAutoSplitting(false);
      return;
    }
    // 积分预校验（分镜拆分价格从调度机获取）
    const splitPrice = getPrice("llm_storyboard_split", 3.0);
    try {
      const precheck = await precheckCredits(splitPrice, "text", `分镜拆分：${currentEpisode.title || selectedEp}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${splitPrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！拆分当前集需要${splitPrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        setAutoSplitting(false);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    log(`正在拆分「${currentEpisode.title || selectedEp}」的镜头...`);
    try {
      const episodeTitle = currentEpisode.title || "";
      const prompt = `你是一名专业竖屏短剧分镜导演。请把【第${episodeTitle}】的剧本内容拆分成**10-15个分镜**（每集90-120秒，每个分镜约5-10秒，严禁按大场景粗拆）。

关键规则：
1. 剧本中出现的"1-1、1-2"、"场景一/二"、"【场景1】"等标记是**大场景（约30-40秒）**，不是分镜！必须把每个大场景内部继续细拆成 2-4 个 5-10 秒的分镜
2. 一集90-120秒必须拆出 **10-15个** 分镜，数量不足视为错误
3. 每个分镜必须包含完整的镜头语言信息
4. 景别选择：远景(环境交代)/全景(人物全身)/中景(腰部以上)/近景(胸部以上)/特写(面部或细节)
5. 运镜方式：固定/推(向前推进)/拉(向后拉开)/摇(左右摇动)/移(平行移动)/跟(跟随主体)
6. 画面描述要具体（50-100字），包含：时代场景、人物动作表情、光影氛围、环境细节
7. 台词要准确引用剧本原文
8. 只输出纯JSON数组，不要markdown代码块，不要解释

剧本内容：
${context.slice(0, 3000)}

输出JSON格式（数组）：
[
  {
    "shotIndex": 1,
    "title": "镜头标题（简洁概括画面内容）",
    "sceneType": "中景",
    "cameraMove": "推镜",
    "duration": 8,
    "sceneDesc": "画面描述（50-100字，含时代/场景/人物动作/表情/光影/氛围）",
    "dialogue": "人物台词（无台词则为空字符串）",
    "characters": ["角色名1", "角色名2"]
  }
]`;

      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 8192, llm_type: "storyboard_split" })
      });

      const text = res.text || "[]";
      console.log("[分镜拆分LLM输出]", text);
      let parsed;
      try {
        // 去除markdown代码块
        let clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        // 尝试找到第一个[和最后一个]
        const firstBracket = clean.indexOf("[");
        const lastBracket = clean.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          clean = clean.slice(firstBracket, lastBracket + 1);
        }
        parsed = JSON.parse(clean);
      } catch (e) {
        console.log("[分镜拆分] JSON解析失败:", e.message);
        parsed = [];
      }

      // 支持数组格式和{shots: [...]}格式
      const shotsArray = Array.isArray(parsed) ? parsed : (parsed.shots || []);

      if (shotsArray.length > 0) {
        const newShots = shotsArray.map((sh, i) => ({
          id: "shot_" + Date.now() + "_" + i,
          shotIndex: sh.shotIndex || i + 1,
          episodeId: selectedEp || null,
          title: sh.title || "镜头" + (i + 1),
          sceneDesc: sh.sceneDesc || "",
          sceneType: sh.sceneType || "中景",
          cameraMove: sh.cameraMove || "固定",
          lighting: "自然光",
          emotion: "正常",
          duration: Math.min(10, Math.max(3, Math.round(Number(sh.duration) || (currentEpisode.duration || 120) / Math.max(shotsArray.length, 1)))),
          promptCn: sh.sceneDesc || "",
          characters: sh.characters || [],
          dialogue: sh.dialogue || "",
          subtitle: "",
          innerMonologue: "",
          note: "",
          imageUrl: null,
          videoUrl: null,
          status: "pending",
          progress: 0
        }));
        update({ shots: [...newShots, ...shots] });
        log("自动拆分完成：" + newShots.length + " 个镜头");
        // 积分扣减（分镜拆分）
        if (isLoggedIn()) {
          try {
                        log("✅ 分镜拆分费用已由后端按实际成本扣减");
            try {
              const balanceData = await getCreditBalance();
              if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
            if (window.refreshUserInfo) window.refreshUserInfo();
            } catch (e) {}
          } catch (e) {
            log(`⚠️ 余额刷新失败：${e.message}`);
          }
        }
      } else {
        log("未能自动拆分，请检查剧本内容");
      }
    } catch (e) {
      log("自动拆分失败：" + e.message);
    } finally {
      setAutoSplitting(false);
    }
  };

  // 在指定分镜之后插入过渡分镜（支持任意位置插入）
  const insertShotAfter = (sh) => {
    const all = shots;
    const idx = all.findIndex(s => s.id === sh.id);
    if (idx < 0) { log("⚠️ 未找到目标分镜"); return; }
    const newShot = {
      id: "shot_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      shotIndex: 0,
      episodeId: sh.episodeId || selectedEp || null,
      title: "过渡分镜",
      sceneDesc: "",
      sceneType: "中景",
      cameraMove: "固定",
      lighting: "自然光",
      emotion: "正常",
      duration: 5,
      promptCn: "",
      characters: sh.characters || [],
      dialogue: "",
      subtitle: "",
      innerMonologue: "",
      note: "",
      imageUrl: null,
      videoUrl: null,
      status: "pending",
      progress: 0
    };
    const next = [...all];
    next.splice(idx + 1, 0, newShot);
    // 按新顺序重排 shotIndex
    update({ shots: next.map((s, i) => ({ ...s, shotIndex: i + 1 })) });
    setEditingShotId(newShot.id);
    setEditContent("");
    log("✅ 已在「" + sh.title + "」后插入过渡分镜，可直接编辑描述");
  };

  const firstEpId = project?.episodes?.[0]?.id;
  const currentShots = selectedEp
    ? shots.filter(s => {
        // 兼容旧数据：没有episodeId的分镜默认归到第一集
        const epId = s.episodeId || firstEpId;
        return epId === selectedEp;
      })
    : shots;

  return (
    <div style={{ padding: 16, height: "100%", overflow: "auto", color: "var(--text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📝 分镜与生图</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, cursor: "pointer" }}
            title="选择生图风格"
          >
            {STYLE_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={selectedAspectRatio}
            onChange={(e) => setSelectedAspectRatio(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, cursor: "pointer" }}
            title="选择画面比例"
          >
            {ASPECT_RATIO_OPTIONS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <button
            style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #7A5CFF, #5CE1E6)", color: "#fff", cursor: "pointer", fontSize: 13 }}
            onClick={autoSplitScript}
            disabled={autoSplitting || (!project.script && !project.outline?.synopsis)}
          >
            {autoSplitting ? "拆分中..." : `🤖 拆分当前集（${getPrice("llm_storyboard_split", 3.0)}积分）`}
          </button>
        </div>
      </div>

      {project.episodes && project.episodes.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>按集筛选：</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {project.episodes.map((ep, i) => (
              <button
                key={i}
                style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 4, background: selectedEp === ep.id ? "rgba(122,92,255,0.3)" : "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                onClick={() => setSelectedEp(ep.id)}
              >{ep.title}</button>
            ))}
          </div>
        </div>
      )}

      {currentShots.length === 0 && (
        <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel-2)", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
            📄 当前集剧本内容（点击上方「拆分当前集」生成分镜）
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap" }}>
            {(project.episodes || []).find(ep => ep.id === selectedEp)?.content || "暂无剧本内容"}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {currentShots.map((sh) => (
          <div key={sh.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel-2)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 120, height: 160, background: "var(--input-bg)", borderRadius: 8, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                {sh.imageUrl ? (
                  <img src={sh.imageUrl} alt={sh.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 32 }}>🎬</span>
                )}
                <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.7)", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fff" }}>
                  {sh.sceneType || "中景"}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{sh.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {sh.sceneType} · {sh.cameraMove} · {sh.duration || 5}秒
                </div>
                {editingShotId === sh.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{ width: "100%", minHeight: 80, padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => { update({ shots: shots.map(s => s.id === sh.id ? { ...s, sceneDesc: editContent } : s) }); setEditingShotId(null); log("已更新镜头描述"); }} style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "var(--primary, #7a5cff)", color: "#fff", cursor: "pointer", fontSize: 12 }}>保存</button>
                      <button onClick={() => setEditingShotId(null)} style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 8, lineHeight: 1.5 }}>
                    {sh.sceneDesc || sh.desc || "无描述"}
                  </div>
                )}
                {sh.dialogue && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(122,92,255,0.1)", borderRadius: 6, fontSize: 12, fontStyle: "italic" }}>
                    {sh.dialogue}
                  </div>
                )}
                {sh.characters && sh.characters.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    人物：{sh.characters.join("、")}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                onClick={() => genSceneImage({ ...sh, id: sh.id })}
                disabled={busy === sh.id}
              >
                {busy === sh.id ? "生成中…" : `🎨 生成分镜图 (${getPrice("image_generate", 3.0)}积分)`}
              </button>
              <button
                style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                onClick={() => {
                  setEditingShotId(sh.id);
                  setEditContent(sh.sceneDesc || "");
                }}
              >
                ✏️ 编辑
              </button>
              <button
                style={{ padding: "6px 12px", border: "1px dashed var(--border)", borderRadius: 6, background: "transparent", color: "var(--primary, #7a5cff)", cursor: "pointer", fontSize: 12 }}
                onClick={() => insertShotAfter(sh)}
                title="在此分镜后插入一个过渡分镜"
              >
                ➕ 插入分镜
              </button>
              <button
                style={{ padding: "6px 12px", border: "1px solid #ef4444", borderRadius: 6, background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
                onClick={() => {
                  if (window.confirm("删除此镜头？")) {
                    update({ shots: shots.filter(s => s.id !== sh.id) });
                    log("已删除镜头：" + sh.title);
                  }
                }}
              >
                🗑 删除
              </button>
            </div>
          </div>
        ))}

        {currentShots.length > 0 && scenes.filter((s, idx) => {
          // 多种方式匹配episodeId
          let epId = s.episodeId;
          if (!epId) {
            // 方式1：按title匹配
            const matchedByTitle = (project.episodes || []).find(ep => ep.title === s.title);
            if (matchedByTitle) epId = matchedByTitle.id;
          }
          if (!epId) {
            // 方式2：按索引匹配
            if (project.episodes && project.episodes[idx]) epId = project.episodes[idx].id;
          }
          const matchesEpisode = !selectedEp || epId === selectedEp;
          const notInShots = !shots.some(sh => sh.title === s.title);
          return matchesEpisode && notInShots;
        }).map(sc => (
          <div key={sc.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel-2)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 120, height: 160, background: "var(--input-bg)", borderRadius: 8, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {sc.imageUrl ? <img src={sc.imageUrl} alt={sc.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 32 }}>🎬</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{sc.title}</div>
                {editingSceneId === sc.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={editSceneDesc}
                      onChange={(e) => setEditSceneDesc(e.target.value)}
                      style={{ width: "100%", minHeight: 100, padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => { update({ scenes: scenes.map(s => s.id === sc.id ? { ...s, desc: editSceneDesc } : s) }); setEditingSceneId(null); log("已更新分集内容"); }} style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "var(--primary, #7a5cff)", color: "#fff", cursor: "pointer", fontSize: 12 }}>保存</button>
                      <button onClick={() => setEditingSceneId(null)} style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{sc.desc || "无描述"}</div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => genSceneImage(sc)} disabled={busy === sc.id}>
                {busy === sc.id ? "生成中…" : "🎨 生成分镜图 (3积分)"}
              </button>
              <button style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => { setEditingSceneId(sc.id); setEditSceneDesc(sc.desc || ""); }}>
                ✏️ 编辑内容
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
