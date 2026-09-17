import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_ANDROID } from "../../lib/platform.js";
import { getDownloadDir } from "../../utils.js";

// ========== 常量配置 ==========
const PIXELS_PER_SECOND = 50;
const TRACK_HEIGHT = 48;
const TIMELINE_HEIGHT = 260;

// 比例选项
const ASPECT_RATIOS = [  { id: "16:9", label: "16:9 横屏", w: 1920, h: 1080 },
  { id: "9:16", label: "9:16 竖屏", w: 1080, h: 1920 },
  { id: "1:1", label: "1:1 方形", w: 1080, h: 1080 },
  { id: "4:3", label: "4:3 标准", w: 1440, h: 1080 },
  { id: "3:4", label: "3:4 竖版", w: 1080, h: 1440 },
];

// 字体选项（值 = ASS/CSS 字体族名，Windows 系统自带，导出 libass 可直接渲染）
const FONT_OPTIONS = [
  { value: "", label: "默认" },
  { value: "SimHei", label: "黑体" },
  { value: "SimSun", label: "宋体" },
  { value: "KaiTi", label: "楷体" },
  { value: "FangSong", label: "仿宋" },
  { value: "Microsoft YaHei", label: "微软雅黑" },
  { value: "DengXian", label: "等线" },
];
// 文本背景色选项
const TEXT_BG_COLORS = ["#000000", "#1e1e1e", "#ffffff", "#ff0000", "#7a5cff", "#f59e0b", "#0ea5e9", "#16a085"];

// 滤镜选项
const FILTERS = [
  { id: "none", name: "原图", css: "" },
  { id: "grayscale", name: "黑白", css: "grayscale(100%)" },
  { id: "sepia", name: "复古", css: "sepia(80%)" },
  { id: "bright", name: "清新", css: "brightness(1.15) saturate(1.2)" },
  { id: "warm", name: "暖色", css: "sepia(30%) saturate(1.3) brightness(1.05)" },
  { id: "cool", name: "冷色", css: "hue-rotate(180deg) saturate(0.8)" },
  { id: "contrast", name: "电影", css: "contrast(1.2) brightness(0.95) saturate(1.1)" },
  { id: "fade", name: "褪色", css: "contrast(0.8) brightness(1.1) saturate(0.7)" },
];

// 转场类型
const TRANSITIONS = [
  { id: "none", name: "无转场", icon: "✖" },
  { id: "fade", name: "淡入淡出", icon: "🌅" },
  { id: "dissolve", name: "溶解", icon: "💧" },
  { id: "wipe", name: "擦除", icon: "➡️" },
  { id: "zoom", name: "缩放", icon: "🔍" },
  { id: "slide", name: "滑动", icon: "↔️" },
  { id: "circle", name: "圆形", icon: "⭕" },
];

// 变速选项
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
};

const getVideoDuration = async (url) => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { resolve(video.duration || 5); video.remove(); };
    video.onerror = () => { resolve(5); video.remove(); };
    video.src = url;
  });
};

const getAudioDuration = (url) => {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => { resolve(a.duration || 5); a.src = ""; };
    a.onerror = () => resolve(5);
    a.src = url;
  });
};

// 素材原始时长（未变速）。变速后时间线时长 = srcDuration / speed。
const baseDuration = (clip) => clip.srcDuration || (clip.duration || 5) * (clip.speed || 1);

// 浏览器自动播放策略会拒绝无用户手势的 play()；失败时降级为静音播放，保证画面不卡死。
const safePlay = (el) => {
  if (!el) return;
  try {
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        el.muted = true;
        const p2 = el.play();
        if (p2 && typeof p2.catch === "function") p2.catch(() => {});
      });
    }
  } catch {
    /* 忽略 */
  }
};

export function EditExport({ project, update, log, incomingAssets = [], onConsumeAssets }) {
  console.log("[EditExport] 组件渲染");
  const [timelineClips, setTimelineClips] = useState([]);
  const [audioClips, setAudioClips] = useState([]); // 音频轨道片段
  const [textClips, setTextClips] = useState([]); // 文本轨道片段
  const [availableShots, setAvailableShots] = useState([]);
  const [availableAudios, setAvailableAudios] = useState([]); // 可用音频素材
  const [availableTexts, setAvailableTexts] = useState([]); // 可用文本素材
  const [draggingType, setDraggingType] = useState("video"); // 拖动的类型
  const [isDragging, setIsDragging] = useState(false); // 是否正在拖动
  const [isOverTimeline, setIsOverTimeline] = useState(false); // 是否在时间线上
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState("video"); // 当前选中的轨道类型
  const [draggingShot, setDraggingShot] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [durations, setDurations] = useState({});
  const [activeTab, setActiveTab] = useState("media");
  const [selectedTransition, setSelectedTransition] = useState("none");
  const [busy, setBusy] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgBlur, setBgBlur] = useState(0);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [exportResolution, setExportResolution] = useState("1080p");
  const [exportFps, setExportFps] = useState(30);
  const [exportBitrate, setExportBitrate] = useState("8M");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showProperties, setShowProperties] = useState(true);

  const videoRef = useRef(null);
  const audioRef = useRef(null); // 音频轨道播放元素（此前完全没有，音频轨只是画在轨道上的方块）
  const timelineRef = useRef(null);
  const playIntervalRef = useRef(null);
  const dragStateRef = useRef(null);

  // ── 播放引擎相关 ref ────────────────────────────────────────────────
  // 时间线时间的「权威值」放在 ref 里：播放时由 rAF 每帧更新，不经过 React，
  // 避免每帧重渲染整个时间线（上千个节点）。state 只做低频同步。
  const timeRef = useRef(0);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const lastSyncRef = useRef(0);
  const playingRef = useRef(false);
  const clipsRef = useRef([]);
  const audiosRef = useRef([]);
  const mountedVideoIdRef = useRef(null);
  const mountedAudioIdRef = useRef(null);
  const playheadRef = useRef(null);
  const timeTextRef = useRef(null);
  const zoomRef = useRef(1);
  const contentEndRef = useRef(0); // 内容真实结束时间（不含时间线尾部留白）

  // 历史记录
  const pushHistory = useCallback((clips, time) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ clips: JSON.parse(JSON.stringify(clips)), time });
      return newHistory.slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const state = history[newIndex];
    if (state) {
      setTimelineClips(JSON.parse(JSON.stringify(state.clips)));
      setCurrentTime(state.time);
      setHistoryIndex(newIndex);
      log?.("撤销");
    }
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const state = history[newIndex];
    if (state) {
      setTimelineClips(JSON.parse(JSON.stringify(state.clips)));
      setCurrentTime(state.time);
      setHistoryIndex(newIndex);
      log?.("重做");
    }
  };

  // 初始化可用镜头（只显示已生成视频的）
  useEffect(() => {
    const shots = (project?.shots || []).filter((s) => s.videoUrl);
    setAvailableShots(shots.map((s) => ({
      id: s.id, title: s.title || "未命名镜头", url: s.videoUrl,
      desc: s.description || s.desc || "", imageUrl: s.imageUrl || null,
    })));
    shots.forEach(async (s) => {
      const dur = await getVideoDuration(s.videoUrl);
      setDurations(prev => ({ ...prev, [s.id]: dur }));
    });
    
    // 初始化可用音频素材（从项目assets中获取音频类型）
    // 元数据里的 duration 常常缺失/不准，这里异步实测一次并回填，
    // 保证拖到时间线上的片段时长（以及变速换算）是正确的。
    const audios = (project?.assets || []).filter((a) => a.type === "audio" && a.url);
    setAvailableAudios(audios.map((a, i) => ({
      id: a.id || `audio_${i}`, title: a.title || `音频${i+1}`, url: a.url,
      duration: a.duration || 5,
    })));
    audios.forEach(async (a, i) => {
      const id = a.id || `audio_${i}`;
      const dur = await getAudioDuration(a.url);
      setAvailableAudios((prev) => prev.map((x) => (x.id === id ? { ...x, duration: dur } : x)));
    });
    
    // 初始化可用文本素材（从分镜的台词中获取）
    const texts = [];
    (project?.shots || []).forEach((shot, si) => {
      const dialogues = shot.dialogues || (shot.dialogue ? [{ character: shot.characters?.[0] || "角色", text: shot.dialogue }] : []);
      dialogues.forEach((d, di) => {
        if (d.text || d.content) {
          texts.push({
            id: `text_${si}_${di}`, character: d.character || "角色",
            text: d.text || d.content || "", shotId: shot.id, shotTitle: shot.title || `镜头${si+1}`,
          });
        }
      });
    });
    setAvailableTexts(texts);
  }, [project?.shots, project?.assets]);

  // 内容真实结束时间（视频/音频/文本三条轨道取最大值）。
  // 之前直接 Math.max(..., 300) 把时间线撑到至少 5 分钟，导致：
  //   1) 播放完最后一段还要「空转」到 300s 才停；
  //   2) 标尺+网格要渲染 300+ 个刻度 × 3 条轨道 ≈ 上千个 DOM 节点，每次重渲染都卡。
  // 这里只给尾部留 30s 余量用于摆放新素材。
  const contentEnd = Math.max(
    timelineClips.reduce((max, c) => Math.max(max, c.start + c.duration), 0),
    audioClips.reduce((max, c) => Math.max(max, c.start + c.duration), 0),
    textClips.reduce((max, c) => Math.max(max, c.start + c.duration), 0),
    0
  );
  const totalDuration = Math.max(contentEnd + 30, 60);
  const timelineWidth = Math.max(totalDuration * PIXELS_PER_SECOND * zoom, 600);

  // 标尺刻度间隔自适应：目标约每 70px 一个标签，避免渲染成百上千个节点。
  const markInterval = useMemo(() => {
    const pxPerSec = PIXELS_PER_SECOND * zoom;
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    return steps.find((s) => s * pxPerSec >= 70) || 300;
  }, [zoom]);
  // 根据选中的轨道类型查找对应的片段
  const selectedClip = selectedTrack === "audio" 
    ? audioClips.find(c => c.id === selectedClipId)
    : selectedTrack === "text"
    ? textClips.find(c => c.id === selectedClipId)
    : timelineClips.find(c => c.id === selectedClipId);

  // ===== 播放引擎 =====
  // 旧实现的致命问题：setInterval 每 100ms 推进 currentTime，再由 useEffect 调
  // playCurrentClip() 回写 video.currentTime —— 等于每 100ms 强制 seek 一次。
  // 视频每次 seek 都要重新定位关键帧，必然卡顿，且音画全毁。
  // 新实现：<video> 自行连续播放，rAF 只「读」video.currentTime 换算时间线位置，
  // 只在切换片段时换 src / seek；播放头直接改 DOM，不触发每帧重渲染。

  // 把最新数据镜像到 ref，rAF 循环读 ref，避免闭包读到过期值
  useEffect(() => { clipsRef.current = timelineClips; }, [timelineClips]);
  useEffect(() => { audiosRef.current = audioClips; }, [audioClips]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { contentEndRef.current = contentEnd; }, [contentEnd]);

  const findClipAt = useCallback(
    (list, t) => (list || []).find((c) => t >= c.start && t < c.start + c.duration) || null,
    []
  );

  // 播放头 + 时间码直接改 DOM（60fps 顺滑，不经过 React）
  const renderPlayhead = useCallback((t) => {
    const px = t * PIXELS_PER_SECOND * zoomRef.current + 60;
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${px}px)`;
    if (timeTextRef.current) timeTextRef.current.textContent = formatTime(t);
  }, []);

  // 装载视频片段：只有片段切换才换 src，切换后 seek 一次，之后交给浏览器连续播放
  const mountVideo = useCallback((clip, t, autoplay) => {
    const v = videoRef.current;
    if (!v || !clip) return;
    const speed = clip.speed || 1;
    if (mountedVideoIdRef.current !== clip.id) {
      mountedVideoIdRef.current = clip.id;
      v.src = clip.url;
    }
    v.muted = !!clip.muted;
    v.volume = clip.muted ? 0 : Math.max(0, Math.min(1, (clip.volume ?? 100) / 100));
    const apply = () => {
      v.playbackRate = speed;
      const target = Math.max(0, (t - clip.start) * speed);
      if (Math.abs(v.currentTime - target) > 0.05) {
        try { v.currentTime = target; } catch { /* 尚不可 seek */ }
      }
      if (autoplay) safePlay(v); else v.pause();
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener("loadedmetadata", apply, { once: true });
  }, []);

  // 音频轨道：此前根本没有 audio 元素，音频轨只是画在轨道上的方块，从不发声。
  // 这里按时间线位置装载/续播，并应用变速（playbackRate 保持音高不变调）。
  const syncAudio = useCallback((t, autoplay) => {
    const a = audioRef.current;
    if (!a) return;
    const hit = findClipAt(audiosRef.current, t);
    if (!hit) {
      if (mountedAudioIdRef.current) { a.pause(); mountedAudioIdRef.current = null; }
      return;
    }
    const speed = hit.speed || 1;
    if (mountedAudioIdRef.current !== hit.id) {
      mountedAudioIdRef.current = hit.id;
      a.src = hit.url;
    }
    a.playbackRate = speed;
    a.muted = !!hit.muted;
    a.volume = hit.muted ? 0 : Math.max(0, Math.min(1, (hit.volume ?? 100) / 100));
    const apply = () => {
      const want = Math.max(0, (t - hit.start) * speed);
      // 只在明显跑偏时校正，避免抖动导致反复 seek
      if (Math.abs(a.currentTime - want) > 0.25) {
        try { a.currentTime = want; } catch { /* noop */ }
      }
      if (autoplay) safePlay(a); else a.pause();
    };
    if (a.readyState >= 1) apply();
    else a.addEventListener("loadedmetadata", apply, { once: true });
  }, [findClipAt]);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setCurrentTime(timeRef.current);
  }, []);

  const stepRef = useRef(null);
  const step = useCallback((ts) => {
    if (!playingRef.current) return;
    const list = clipsRef.current;
    let t = timeRef.current;
    const clip = findClipAt(list, t);

    if (clip) {
      const v = videoRef.current;
      const speed = clip.speed || 1;
      if (v && mountedVideoIdRef.current === clip.id && v.readyState >= 2) {
        // 属性可能被实时改动，持续同步（赋同值浏览器会忽略，开销可忽略）
        v.playbackRate = speed;
        v.muted = !!clip.muted;
        v.volume = clip.muted ? 0 : Math.max(0, Math.min(1, (clip.volume ?? 100) / 100));
        // 视频内部时间 → 时间线时间（除以变速倍率）
        t = clip.start + v.currentTime / speed;
        if (v.ended || v.currentTime >= baseDuration(clip) - 0.03) {
          const next = list.filter((c) => c.start > clip.start).sort((a, b) => a.start - b.start)[0];
          if (next) {
            t = next.start;
          } else {
            const end = contentEndRef.current;
            timeRef.current = end; stopPlayback(); renderPlayhead(end); return;
          }
        }
      }
    } else {
      // 片段间空隙：靠墙钟推进，直到进入下一段
      const dt = lastTsRef.current ? Math.min((ts - lastTsRef.current) / 1000, 0.25) : 0;
      t += dt;
      const next = list.filter((c) => c.start > t).sort((a, b) => a.start - b.start)[0];
      if (!next) {
        const end = contentEndRef.current;
        timeRef.current = end; stopPlayback(); renderPlayhead(end); return;
      }
      if (t >= next.start) t = next.start;
    }
    lastTsRef.current = ts;

    const limit = contentEndRef.current;
    if (t >= limit) { timeRef.current = limit; stopPlayback(); renderPlayhead(limit); return; }
    timeRef.current = t;

    // 跨到新片段才换源
    const nowClip = findClipAt(list, t);
    if (nowClip && mountedVideoIdRef.current !== nowClip.id) mountVideo(nowClip, t, true);
    syncAudio(t, true);

    renderPlayhead(t);
    // 低频同步到 state（≈12Hz），供字幕等依赖 currentTime 的 UI 使用
    if (ts - lastSyncRef.current > 80) { lastSyncRef.current = ts; setCurrentTime(t); }

    rafRef.current = requestAnimationFrame(stepRef.current);
  }, [findClipAt, mountVideo, syncAudio, renderPlayhead, stopPlayback]);
  useEffect(() => { stepRef.current = step; }, [step]);

  const startPlayback = useCallback(() => {
    const list = clipsRef.current;
    if (!list.length) { log?.("时间线上没有视频片段"); return; }
    let t = timeRef.current;
    if (t >= contentEndRef.current - 0.05) t = 0;
    if (!findClipAt(list, t)) {
      const next = list.filter((c) => c.start > t).sort((a, b) => a.start - b.start)[0];
      t = next ? next.start : 0;
    }
    timeRef.current = t;
    setCurrentTime(t);
    renderPlayhead(t);
    playingRef.current = true;
    setIsPlaying(true);
    mountVideo(findClipAt(list, t), t, true);
    syncAudio(t, true);
    lastTsRef.current = 0;
    lastSyncRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(stepRef.current);
  }, [findClipAt, mountVideo, syncAudio, renderPlayhead]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) stopPlayback(); else startPlayback();
  }, [startPlayback, stopPlayback]);

  // 点击/拖动定位
  const seekTo = useCallback((t, autoplay = false) => {
    const clamped = Math.max(0, Math.min(t, contentEndRef.current));
    timeRef.current = clamped;
    setCurrentTime(clamped);
    renderPlayhead(clamped);
    const clip = findClipAt(clipsRef.current, clamped);
    if (clip) mountVideo(clip, clamped, autoplay);
    else {
      if (videoRef.current) videoRef.current.pause();
      mountedVideoIdRef.current = null;
    }
    syncAudio(clamped, autoplay);
  }, [findClipAt, mountVideo, syncAudio, renderPlayhead]);

  // 暂停状态下：时间/片段变化 → 同步预览定格画面
  useEffect(() => {
    if (playingRef.current) return;
    const clip = findClipAt(clipsRef.current, currentTime);
    if (clip) mountVideo(clip, currentTime, false);
    else {
      if (videoRef.current) videoRef.current.pause();
      mountedVideoIdRef.current = null;
    }
    syncAudio(currentTime, false);
    renderPlayhead(currentTime);
  }, [currentTime, timelineClips, mountVideo, syncAudio, renderPlayhead, findClipAt]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
  }, []);
  
  // 使用全局事件监听实现拖放，确保在Tauri环境下也能工作
  useEffect(() => {
    console.log("[全局拖放] useEffect执行");
    
    // 全局阻止dragover默认行为，确保整个文档都允许拖放，不会出现🚫禁止符号
    const handleGlobalDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
      
      // 检查鼠标是否在时间线上
      const timeline = timelineRef.current;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const over = e.clientX >= rect.left && e.clientX <= rect.right && 
                   e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (over) {
        if (!window._globalDragOverLogged) {
          console.log("[全局拖放] dragover在时间线上触发");
          window._globalDragOverLogged = true;
          setTimeout(() => { window._globalDragOverLogged = false; }, 1000);
        }
        setIsOverTimeline(true);
        setIsDragging(true);
      } else {
        setIsOverTimeline(false);
      }
    };
    
    const handleGlobalDrop = (e) => {
      const timeline = timelineRef.current;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const over = e.clientX >= rect.left && e.clientX <= rect.right && 
                   e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (over) {
        e.preventDefault();
        e.stopPropagation();
        console.log("[全局拖放] drop在时间线上触发, draggingShot:", draggingShot?.title || draggingShot?.id);
        setIsOverTimeline(false);
        setIsDragging(false);
        
        if (!draggingShot) {
          console.log("[全局拖放] draggingShot为空，返回");
          return;
        }
        
        const x = e.clientX - rect.left - 60;
        const startTime = Math.max(0, x / (PIXELS_PER_SECOND * zoom));
        console.log("[全局拖放] 放置位置:", startTime, "秒");
        
        if (draggingType === "audio") {
          const duration = draggingShot.duration || 5;
          const newClip = {
            id: `audio_${Date.now()}`, title: draggingShot.title || "音频",
            url: draggingShot.url, start: startTime, duration, srcDuration: duration, speed: 1, volume: 100,
          };
          setAudioClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
          setDraggingShot(null);
          log?.(`已添加音频「${newClip.title}」到音频轨道（${formatTime(newClip.start)}）`);
        } else if (draggingType === "text") {
          const duration = 3;
          const newClip = {
            id: `text_${Date.now()}`, character: draggingShot.character || "角色",
            text: draggingShot.text || draggingShot.content || "", start: startTime, duration,
            fontSize: 24, color: "#ffffff", position: "bottom",
          };
          setTextClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
          setDraggingShot(null);
          log?.(`已添加文本「${newClip.character}：${newClip.text.substring(0, 10)}...」到文本轨道（${formatTime(newClip.start)}）`);
        } else {
          const duration = durations[draggingShot.id] || 5;
          const newClip = {
            id: `clip_${Date.now()}`, shotId: draggingShot.id, title: draggingShot.title,
            url: draggingShot.url, start: startTime, duration, thumb: draggingShot.imageUrl,
            transition: selectedTransition !== "none" ? selectedTransition : undefined,
            speed: 1, srcDuration: duration, volume: 100, filter: "none", brightness: 100, contrast: 100, saturation: 100,
          };
          setTimelineClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
          setSelectedClipId(newClip.id);
          setDraggingShot(null);
          log?.(`已添加「${draggingShot.title}」到时间线（${formatTime(newClip.start)}）`);
        }
      }
    };
    
    // 添加全局事件监听（使用window而不是document，确保在Tauri环境下也能工作）
    window.addEventListener("dragover", handleGlobalDragOver);
    window.addEventListener("drop", handleGlobalDrop);
    console.log("[全局拖放] 已添加全局事件监听（window级别）");
    
    return () => {
      window.removeEventListener("dragover", handleGlobalDragOver);
      window.removeEventListener("drop", handleGlobalDrop);
      console.log("[全局拖放] 已移除全局事件监听");
    };
  }, [draggingShot, draggingType, zoom, selectedTransition, durations]);
  
  // 保留原来的时间线原生事件监听（备用）
  useEffect(() => {
    console.log("[原生拖放] useEffect执行，timelineRef.current:", timelineRef.current ? "已设置" : "为null");
    
    const timer = setTimeout(() => {
      const timeline = timelineRef.current;
      if (!timeline) {
        console.error("[原生拖放] timelineRef.current为null，无法添加事件监听");
        return;
      }
      console.log("[原生拖放] 开始添加原生事件监听到时间线");
    
    const handleNativeDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
      setIsOverTimeline(true);
      setIsDragging(true);
      console.log("[原生拖放] dragover触发");
    };
    
    const handleNativeDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOverTimeline(true);
      console.log("[原生拖放] dragenter触发");
    };
    
    const handleNativeDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 检查是否真的离开了时间线
      const rect = timeline.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setIsOverTimeline(false);
        console.log("[原生拖放] dragleave触发（真的离开了）");
      }
    };
    
    const handleNativeDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[原生拖放] drop触发, draggingShot:", draggingShot?.title || draggingShot?.id);
      setIsOverTimeline(false);
      setIsDragging(false);
      
      if (!draggingShot) {
        console.log("[原生拖放] draggingShot为空，返回");
        return;
      }
      
      const rect = timeline.getBoundingClientRect();
      const x = e.clientX - rect.left - 60;
      const startTime = Math.max(0, x / (PIXELS_PER_SECOND * zoom));
      console.log("[原生拖放] 放置位置:", startTime, "秒");
      
      if (draggingType === "audio") {
        const duration = draggingShot.duration || 5;
        const newClip = {
          id: `audio_${Date.now()}`, title: draggingShot.title || "音频",
          url: draggingShot.url, start: startTime, duration, srcDuration: duration, speed: 1, volume: 100,
        };
        setAudioClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
        setDraggingShot(null);
        log?.(`已添加音频「${newClip.title}」到音频轨道（${formatTime(newClip.start)}）`);
      } else if (draggingType === "text") {
        const duration = 3;
        const newClip = {
          id: `text_${Date.now()}`, character: draggingShot.character || "角色",
          text: draggingShot.text || draggingShot.content || "", start: startTime, duration,
          fontSize: 24, color: "#ffffff", position: "bottom",
        };
        setTextClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
        setDraggingShot(null);
        log?.(`已添加文本「${newClip.character}：${newClip.text.substring(0, 10)}...」到文本轨道（${formatTime(newClip.start)}）`);
      } else {
        const duration = durations[draggingShot.id] || 5;
        const newClip = {
          id: `clip_${Date.now()}`, shotId: draggingShot.id, title: draggingShot.title,
          url: draggingShot.url, start: startTime, duration, thumb: draggingShot.imageUrl,
          transition: selectedTransition !== "none" ? selectedTransition : undefined,
          speed: 1, srcDuration: duration, volume: 100, filter: "none", brightness: 100, contrast: 100, saturation: 100,
        };
        setTimelineClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
        setSelectedClipId(newClip.id);
        setDraggingShot(null);
        log?.(`已添加「${draggingShot.title}」到时间线（${formatTime(newClip.start)}）`);
      }
    };
    
      // 添加原生事件监听
      timeline.addEventListener("dragover", handleNativeDragOver);
      timeline.addEventListener("dragenter", handleNativeDragEnter);
      timeline.addEventListener("dragleave", handleNativeDragLeave);
      timeline.addEventListener("drop", handleNativeDrop);
      
      console.log("[原生拖放] 已添加原生事件监听到时间线");
    }, 100);
    
    return () => {
      clearTimeout(timer);
      const timeline = timelineRef.current;
      if (timeline) {
        timeline.removeEventListener("dragover", handleNativeDragOver);
        timeline.removeEventListener("dragenter", handleNativeDragEnter);
        timeline.removeEventListener("dragleave", handleNativeDragLeave);
        timeline.removeEventListener("drop", handleNativeDrop);
      }
      console.log("[原生拖放] 已移除原生事件监听");
    };
  }, []);

  // 更新片段并记录历史
  const updateClips = (updater, recordHistory = true) => {
    setTimelineClips(prev => {
      const next = updater(prev);
      if (recordHistory) pushHistory(next, currentTime);
      return next;
    });
  };

  // 拖拽
  const handleDragStart = (item, type, e) => { 
    console.log("[拖动] 开始拖动:", item.title || item.character || item.id, "类型:", type);
    console.log("[拖动] 拖动源元素:", e.target.tagName, e.target.className);
    setDraggingShot(item); 
    setDraggingType(type);
    setIsDragging(true);
    try {
      e.dataTransfer.effectAllowed = "copy"; 
      e.dataTransfer.setData("text/plain", item.id || "clip");
      console.log("[拖动] dataTransfer设置成功");
    } catch (err) {
      console.error("[拖动] dataTransfer设置失败:", err);
    }
  };
  const handleDragOver = (e) => { 
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "copy";
    if (!window._dragOverLogged) {
      console.log("[拖动] handleDragOver触发，目标元素:", e.target.tagName, e.target.className?.substring?.(0, 50));
      window._dragOverLogged = true;
      setTimeout(() => { window._dragOverLogged = false; }, 1000);
    }
  };
  
  // 拖动进入时间线
  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
    console.log("[拖动] 进入时间线区域");
  };
  
  // 拖动离开时间线
  const handleDragLeave = (e) => {
    e.preventDefault();
    // 检查是否真的离开了时间线（而不是进入了子元素）
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
      console.log("[拖动] 离开时间线区域");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    console.log("[拖动] 放置到时间线，draggingShot:", draggingShot?.title || draggingShot?.id);
    setIsDragging(false);
    if (!draggingShot) return;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - 60;
    const startTime = Math.max(0, x / (PIXELS_PER_SECOND * zoom));
    
    if (draggingType === "audio") {
      // 音频片段
      const duration = draggingShot.duration || 5;
      const newClip = {
        id: `audio_${Date.now()}`, title: draggingShot.title || "音频",
        url: draggingShot.url, start: startTime, duration, srcDuration: duration, speed: 1, volume: 100,
      };
      setAudioClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
      setDraggingShot(null);
      log?.(`已添加音频「${newClip.title}」到音频轨道（${formatTime(newClip.start)}）`);
    } else if (draggingType === "text") {
      // 文本片段
      const duration = 3; // 默认3秒
      const newClip = {
        id: `text_${Date.now()}`, character: draggingShot.character || "角色",
        text: draggingShot.text || draggingShot.content || "", start: startTime, duration,
        fontSize: 24, color: "#ffffff", position: "bottom",
      };
      setTextClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
      setDraggingShot(null);
      log?.(`已添加文本「${newClip.character}：${newClip.text.substring(0, 10)}...」到文本轨道（${formatTime(newClip.start)}）`);
    } else {
      // 视频片段
      const duration = durations[draggingShot.id] || 5;
      const newClip = {
        id: `clip_${Date.now()}`, shotId: draggingShot.id, title: draggingShot.title,
        url: draggingShot.url, start: startTime, duration, thumb: draggingShot.imageUrl,
        transition: selectedTransition !== "none" ? selectedTransition : undefined,
        speed: 1, srcDuration: duration, volume: 100, filter: "none", brightness: 100, contrast: 100, saturation: 100,
      };
      setTimelineClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
      setDraggingShot(null);
      setSelectedClipId(newClip.id);
      log?.(`已添加「${draggingShot.title}」到时间线（${formatTime(newClip.start)}）`);
    }
    setDraggingType("video");
    setDraggingShot(null);
    setIsDragging(false);
  };
  
  // 拖动结束（无论是否成功放置）
  const handleDragEnd = (e) => {
    console.log("[拖动] 拖动结束");
    setIsDragging(false);
    setDraggingShot(null);
  };
  
  // ===== 鼠标事件拖放（替代HTML5拖放API）=====
  
  // 点击添加素材到时间线末尾
  // overrideDuration：素材库送来的片段没进过 durations 表，由调用方实测后直接传入，
  // 避免落到时间线上时用 5 秒兜底导致时长不准。
  const handleItemClick = (item, type, overrideDuration) => {
    console.log("[点击添加] 素材:", item.title || item.character || item.id, "类型:", type);
    // 计算时间线末尾位置
    let maxEnd = 0;
    if (type === "audio") {
      audioClips.forEach(c => { maxEnd = Math.max(maxEnd, c.start + c.duration); });
    } else if (type === "text") {
      textClips.forEach(c => { maxEnd = Math.max(maxEnd, c.start + c.duration); });
    } else {
      timelineClips.forEach(c => { maxEnd = Math.max(maxEnd, c.start + c.duration); });
    }
    const startTime = maxEnd;
    
    if (type === "audio") {
      const duration = overrideDuration || item.duration || 5;
      const newClip = {
        id: `audio_${Date.now()}`, title: item.title || "音频",
        url: item.url, start: startTime, duration, srcDuration: duration, speed: 1, volume: 100,
      };
      setAudioClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
      log?.(`已添加音频「${newClip.title}」到音频轨道（${formatTime(newClip.start)}）`);
    } else if (type === "text") {
      const duration = 3;
      const newClip = {
        id: `text_${Date.now()}`, character: item.character || "角色",
        text: item.text || item.content || "", start: startTime, duration,
        fontSize: 24, color: "#ffffff", position: "bottom",
      };
      setTextClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
      log?.(`已添加文本「${newClip.character}：${newClip.text.substring(0, 10)}...」到文本轨道（${formatTime(newClip.start)}）`);
    } else {
      const duration = overrideDuration || durations[item.id] || 5;
      const newClip = {
        id: `clip_${Date.now()}`, shotId: item.id, title: item.title,
        url: item.url, start: startTime, duration, thumb: item.imageUrl,
        transition: selectedTransition !== "none" ? selectedTransition : undefined,
        speed: 1, srcDuration: duration, volume: 100, filter: "none", brightness: 100, contrast: 100, saturation: 100,
      };
      setTimelineClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
      setSelectedClipId(newClip.id);
      log?.(`已添加「${item.title}」到时间线（${formatTime(newClip.start)}）`);
    }
  };

  // 素材库「加入剪辑」送来的素材：实测时长后落到对应轨道，再通知父级清空，
  // 避免同一批素材在后续渲染中被重复添加。
  useEffect(() => {
    if (!incomingAssets || incomingAssets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let a of incomingAssets) {
        const type = a.type === "audio" ? "audio" : a.type === "text" ? "text" : "video";
        let measured = 0;
        if (type === "video" && a.url && !durations[a.id]) {
          measured = await getVideoDuration(a.url);
        } else if (type === "audio" && a.url && !a.duration) {
          measured = await getAudioDuration(a.url);
        }
        if (cancelled) return;
        handleItemClick(a, type, measured || 0);
      }
      if (!cancelled) onConsumeAssets && onConsumeAssets();
    })();
    return () => { cancelled = true; };
    // 只在 incomingAssets 变化时消费一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingAssets]);
  
  

  // 片段拖拽移动
  const handleClipMouseDown = (clip, e) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = { clipId: clip.id, startX: e.clientX, origStart: clip.start, rectLeft: rect.left + 60 };
    const handleMouseMove = (ev) => {
      const state = dragStateRef.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      const newStart = Math.max(0, state.origStart + dx / (PIXELS_PER_SECOND * zoom));
      const clipId = state.clipId;
      setTimelineClips(prev => prev.map(c => c.id === clipId ? { ...c, start: newStart } : c).sort((a, b) => a.start - b.start));
    };
    const handleMouseUp = () => {
      if (dragStateRef.current) {
        pushHistory(timelineClips, currentTime);
        dragStateRef.current = null;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 通用片段拖动（支持视频、音频、文本）
  const handleAnyClipMouseDown = (clip, trackType, e) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    setSelectedTrack(trackType);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = { clipId: clip.id, trackType, startX: e.clientX, origStart: clip.start, rectLeft: rect.left + 60 };
    const handleMouseMove = (ev) => {
      const state = dragStateRef.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      const newStart = Math.max(0, state.origStart + dx / (PIXELS_PER_SECOND * zoom));
      const clipId = state.clipId;
      const track = state.trackType;
      if (track === "video") {
        setTimelineClips(prev => prev.map(c => c.id === clipId ? { ...c, start: newStart } : c).sort((a, b) => a.start - b.start));
      } else if (track === "audio") {
        setAudioClips(prev => prev.map(c => c.id === clipId ? { ...c, start: newStart } : c).sort((a, b) => a.start - b.start));
      } else if (track === "text") {
        setTextClips(prev => prev.map(c => c.id === clipId ? { ...c, start: newStart } : c).sort((a, b) => a.start - b.start));
      }
    };
    const handleMouseUp = () => {
      if (dragStateRef.current) {
        pushHistory(timelineClips, currentTime);
        dragStateRef.current = null;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTimelineClick = (e) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - 60;
    seekTo(x / (PIXELS_PER_SECOND * zoom));
  };

  // 分割
  const splitClip = () => {
    if (!selectedClipId) { log?.("请先选中要分割的片段"); return; }
    const clip = timelineClips.find(c => c.id === selectedClipId);
    if (!clip) return;
    if (currentTime <= clip.start || currentTime >= clip.start + clip.duration) {
      log?.("播放头需要在选中片段内才能分割"); return;
    }
    const splitPoint = currentTime - clip.start;
    // 同步拆分素材时长基准：否则两段都带着整段素材的 srcDuration，
    // 播放时会越过各自的时间线边界一直播到素材结束。
    const speed = clip.speed || 1;
    const srcTotal = clip.srcDuration || clip.duration * speed;
    const leftSrc = Math.max(0.1, splitPoint * speed);
    const rightSrc = Math.max(0.1, srcTotal - leftSrc);
    const leftClip = { ...clip, duration: splitPoint, srcDuration: leftSrc };
    const rightClip = { ...clip, id: `clip_${Date.now()}`, start: clip.start + splitPoint, duration: clip.duration - splitPoint, srcDuration: rightSrc };
    updateClips(prev => prev.filter(c => c.id !== clip.id).concat(leftClip, rightClip).sort((a, b) => a.start - b.start));
    setSelectedClipId(rightClip.id);
    log?.(`已在 ${formatTime(currentTime)} 处分割片段`);
  };

  // 复制片段
  const copyClip = () => {
    if (!selectedClip) return;
    const newClip = { ...selectedClip, id: `clip_${Date.now()}`, start: selectedClip.start + selectedClip.duration + 0.1 };
    updateClips(prev => [...prev, newClip].sort((a, b) => a.start - b.start));
    setSelectedClipId(newClip.id);
    log?.(`已复制片段「${selectedClip.title}」`);
  };

  // 删除选中片段（支持视频、音频、文本）
  const deleteSelectedClip = () => {
    if (!selectedClipId) return;
    let clipTitle = "";
    if (selectedTrack === "audio") {
      const clip = audioClips.find(c => c.id === selectedClipId);
      clipTitle = clip?.title || "音频";
      setAudioClips(prev => prev.filter(c => c.id !== selectedClipId));
    } else if (selectedTrack === "text") {
      const clip = textClips.find(c => c.id === selectedClipId);
      clipTitle = clip?.character ? `${clip.character}：${clip.text}`.substring(0, 20) : "文本";
      setTextClips(prev => prev.filter(c => c.id !== selectedClipId));
    } else {
      const clip = timelineClips.find(c => c.id === selectedClipId);
      clipTitle = clip?.title || "视频";
      updateClips(prev => prev.filter(c => c.id !== selectedClipId));
    }
    setSelectedClipId(null);
    log?.(`已删除片段「${clipTitle}」`);
  };

  // 全选
  const selectAll = () => {
    if (timelineClips.length > 0) {
      setSelectedClipId(timelineClips[0].id);
      log?.(`已选中 ${timelineClips.length} 个片段`);
    }
  };

  // 清空
  const clearTimeline = () => {
    if (timelineClips.length === 0) return;
    updateClips(() => []);
    setCurrentTime(0); setSelectedClipId(null);
    log?.("已清空时间线");
  };

  // 自动排列
  const autoArrange = () => {
    let cursor = 0;
    updateClips(prev => prev.map(c => { const nc = { ...c, start: cursor }; cursor += nc.duration; return nc; }));
    log?.("已自动排列所有片段（无缝拼接）");
  };

  // 更新选中片段属性
  const updateSelectedClip = (updates) => {
    if (!selectedClipId) return;
    updateClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, ...updates } : c));
  };

  // 变速（视频）
  // 旧实现用「当前 duration / 新 speed」反复换算，改几次速度后时长会累积漂移。
  // 改为始终以素材原始时长 srcDuration 为基准：时长 = srcDuration / speed。
  const changeSpeed = (speed) => {
    if (!selectedClip) return;
    const base = baseDuration(selectedClip);
    updateSelectedClip({ speed, srcDuration: base, duration: base / speed });
    log?.(`「${selectedClip.title}」变速为 ${speed}x，时长 ${formatTime(base / speed)}`);
  };

  // 变速（音频）：此前音频轨道既没有 speed 字段也没有入口，这里补齐。
  const changeAudioSpeed = (speed) => {
    const clip = audioClips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const base = baseDuration(clip);
    setAudioClips((prev) => prev.map((c) => (c.id === selectedClipId
      ? { ...c, speed, srcDuration: base, duration: base / speed }
      : c)));
    log?.(`「${clip.title}」音频变速为 ${speed}x，时长 ${formatTime(base / speed)}`);
  };

  // 倒放
  const toggleReverse = () => {
    if (!selectedClip) return;
    updateSelectedClip({ reverse: !selectedClip.reverse });
    log?.(`「${selectedClip.title}」${!selectedClip.reverse ? "开启" : "关闭"}倒放`);
  };

  // 定格
  const toggleFreeze = () => {
    if (!selectedClip) return;
    updateSelectedClip({ freeze: !selectedClip.freeze });
    log?.(`「${selectedClip.title}」${!selectedClip.freeze ? "开启" : "关闭"}定格`);
  };

  // 静音
  const toggleMute = () => {
    if (!selectedClip) return;
    updateSelectedClip({ muted: !selectedClip.muted });
    log?.(`「${selectedClip.title}」${!selectedClip.muted ? "静音" : "取消静音"}`);
  };

  // 导出
  // 素材不再在前端 fetch+base64（大视频会 Failed to fetch / 内存爆炸），
  // 改为直接把 URL 交给 Rust export_timeline，由 Rust 侧流式下载后再合成。
  const exportVideo = async () => {
    if (timelineClips.length === 0) { log?.("时间线上没有视频片段，无法导出"); return; }
    setBusy("video");
    try {
      const ratio = ASPECT_RATIOS.find(r => r.id === aspectRatio);
      log?.("正在准备素材…");

      const clips = [];
      for (const c of [...timelineClips].sort((a, b) => a.start - b.start)) {
        clips.push({
          url: c.url || "",
          data: "",
          start: c.start || 0,
          duration: c.duration || 0,
          speed: c.speed || 1,
          volume: (c.muted ? 0 : (c.volume ?? 100)) / 100,
          transition: c.transition || "none",
          brightness: c.brightness ?? 100,
          contrast: c.contrast ?? 100,
          saturation: c.saturation ?? 100,
        });
      }

      const audios = [];
      for (const a of [...audioClips].sort((x, y) => x.start - y.start)) {
        audios.push({
          url: a.url || "",
          data: "",
          start: a.start || 0,
          duration: a.duration || 0,
          speed: a.speed || 1,
          volume: (a.muted ? 0 : (a.volume ?? 100)) / 100,
        });
      }

      // 字号换算：预览画面高度 → 导出高度（保持视觉占比一致）
      const previewH = videoRef.current?.getBoundingClientRect?.()?.height || 540;
      const scale = Math.max(0.1, (ratio?.h || 1080) / Math.max(1, previewH));
      const texts = textClips.map((t) => ({
        start: t.start || 0,
        duration: t.duration || 3,
        text: `${t.character ? t.character + "：" : ""}${t.text || ""}`,
        fontSize: Math.round((t.fontSize || 20) * scale),
        color: t.color || "#ffffff",
        position: t.position || "bottom",
        hAlign: t.hAlign || "center",
        fontFamily: t.fontFamily || "",
        bold: !!t.bold,
        bgColor: t.bgColor || "#000000",
        bgOpacity: t.bgOpacity ?? 70,
      }));

      log?.(`正在合成 ${clips.length} 段视频 + ${audios.length} 段音频…`);
      // Android：无本地 ffmpeg，合并/合成走调度机服务端（扣积分），返回 COS 永久 URL 后交给系统浏览器保存/分享
      if (IS_ANDROID) {
        const base = (localStorage.getItem("DISPATCH_BASE_URL") || "https://api.jinsuai.cn").replace(/\/$/, "");
        const tk = localStorage.getItem("DISPATCH_TOKEN") || "";
        const r = await fetch(base + "/api/video/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(tk ? { Authorization: "Bearer " + tk } : {}) },
          body: JSON.stringify({
            mode: "timeline",
            timeline: {
              clips, audios, texts,
              width: ratio?.w || 1920,
              height: ratio?.h || 1080,
              fps: exportFps || 30,
              bitrate: exportBitrate || "8M",
              bg_color: bgColor || "#000000",
            },
            filename: `烬序成片_${Date.now()}.mp4`,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = data.detail || data.message || `导出失败 HTTP ${r.status}`;
          throw new Error(r.status === 402 ? "余额不足，请先充值" : msg);
        }
        log?.(`✅ 导出成功：${data.url}`);
        const { openUrl } = await import("@tauri-apps/plugin-shell");
        await openUrl(data.url);
        setBusy("");
        setShowExportSettings(false);
        return;
      }
      const path = await invoke("export_timeline", {
        clips, audios, texts,
        width: ratio?.w || 1920,
        height: ratio?.h || 1080,
        fps: exportFps || 30,
        bitrate: exportBitrate || "8M",
        bg_color: bgColor || "#000000",
        filename: `烬序成片_${Date.now()}.mp4`,
        dir: getDownloadDir(),
      });
      log?.(`✅ 导出成功：${path}`);
    } catch (e) {
      log?.(`❌ 导出失败：${e?.message || e}`);
    } finally {
      setBusy("");
      setShowExportSettings(false);
    }
  };

  const currentClip = timelineClips.find(c => currentTime >= c.start && currentTime < c.start + c.duration);
  const currentFilter = currentClip?.filter && currentClip.filter !== "none" ? FILTERS.find(f => f.id === currentClip.filter)?.css : "";
  // 刻度数量受 markInterval 控制（通常几十个），不再是一秒一个的上千节点
  const rulerMarks = [];
  for (let t = 0; t <= Math.ceil(totalDuration || 10); t += markInterval) rulerMarks.push(t);

  // 轨道背景网格改用 CSS 重复渐变，替代每条轨道几百个 <div> 竖线
  const gridBackground = useMemo(() => {
    const px = PIXELS_PER_SECOND * zoom;
    return {
      backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px ${px}px)`,
    };
  }, [zoom]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (selectedClipId) { e.preventDefault(); deleteSelectedClip(); } }
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "b" || e.key === "B") { splitClip(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "a") { e.preventDefault(); selectAll(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); copyClip(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedClipId, timelineClips, isPlaying, history, historyIndex, togglePlay]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a1a2e", color: "#fff" }}>
      {/* 顶部工具栏 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", height: 44, borderBottom: "1px solid #2a2a4a", background: "#16162a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, marginRight: 8 }}>✂️ 剪辑</span>
          <button onClick={undo} disabled={historyIndex <= 0} title="撤销 Ctrl+Z" style={iconBtn}>↩️</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} title="重做 Ctrl+Y" style={iconBtn}>↪️</button>
          <div style={{ width: 1, height: 20, background: "#2a2a4a", margin: "0 4px" }} />
          <button onClick={autoArrange} title="自动排列" style={iconBtn}>🔗</button>
          <button onClick={splitClip} disabled={!selectedClipId} title="分割 B" style={{ ...iconBtn, opacity: selectedClipId ? 1 : 0.4 }}>✂️</button>
          <button onClick={copyClip} disabled={!selectedClipId} title="复制 Ctrl+D" style={{ ...iconBtn, opacity: selectedClipId ? 1 : 0.4 }}>📋</button>
          <button onClick={deleteSelectedClip} disabled={!selectedClipId} title="删除 Del" style={{ ...iconBtn, opacity: selectedClipId ? 1 : 0.4 }}>🗑️</button>
          <div style={{ width: 1, height: 20, background: "#2a2a4a", margin: "0 4px" }} />
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} style={selectStyle} title="画布比例">
            {ASPECT_RATIOS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <input id="bgColor" name="bgColor" type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ width: 28, height: 24, border: "none", borderRadius: 4, cursor: "grab", background: "transparent" }} title="背景颜色" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#888" }}>{timelineClips.length}片段 · {formatTime(contentEnd)}</span>
          <button onClick={() => setShowExportSettings(true)} style={{ padding: "5px 14px", border: "none", borderRadius: 6, background: timelineClips.length > 0 ? "linear-gradient(135deg, #7a5cff, #5ce1e6)" : "#333", color: "#fff", cursor: timelineClips.length > 0 ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600 }}>
            🎬 导出
          </button>
        </div>
      </div>

      {/* 主体：左侧素材库 + 中间预览 + 右侧属性 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 左侧素材库 */}
        <div style={{ width: 220, borderRight: "1px solid #2a2a4a", background: "#16162a", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #2a2a4a" }}>
            {[
              { id: "media", name: "媒体", icon: "🎬" },
              { id: "audio", name: "音频", icon: "🎵" },
              { id: "text", name: "文本", icon: "📝" },
              { id: "transition", name: "转场", icon: "✨" },
              { id: "filter", name: "滤镜", icon: "🎨" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "8px 0", border: "none", background: activeTab === tab.id ? "#1e1e35" : "transparent", color: activeTab === tab.id ? "#5ce1e6" : "#888", cursor: "grab", fontSize: 10, borderBottom: activeTab === tab.id ? "2px solid #5ce1e6" : "2px solid transparent" }}>
                {tab.icon}<br/>{tab.name}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
            {activeTab === "media" && (
              <>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>可用镜头（{availableShots.length}）</div>
                {availableShots.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 24, color: "#555", fontSize: 11 }}><div style={{ fontSize: 28, marginBottom: 6 }}>🎬</div>暂无已生成视频</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {availableShots.map(shot => (
                      <div key={shot.id} onClick={() => handleItemClick(shot, "video")} style={{ display: "flex", gap: 6, padding: 4, border: "1px solid #2a2a4a", borderRadius: 4, background: "#1e1e35", cursor: "pointer" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7a5cff"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a4a"; }}>
                        <div style={{ width: 48, height: 32, background: "#000", borderRadius: 3, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                          {shot.imageUrl ? <img src={shot.imageUrl} alt="" draggable="false" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🎬</div>}
                          <div style={{ position: "absolute", bottom: 0, right: 1, background: "rgba(0,0,0,0.7)", padding: "0 2px", borderRadius: 2, fontSize: 7, fontFamily: "monospace" }}>{durations[shot.id] ? formatTime(durations[shot.id]) : "--"}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shot.title}</div>
                          <div style={{ fontSize: 8, color: "#666", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shot.desc || "点击添加"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {activeTab === "audio" && (
  <div>
    <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>可用音频（{availableAudios.length}）</div>
    {availableAudios.length === 0 ? (
      <div style={{ textAlign: "center", padding: 24, color: "#555", fontSize: 11 }}><div style={{ fontSize: 28, marginBottom: 6 }}>🎵</div>暂无音频素材<br/><span style={{ fontSize: 9 }}>请先在配音模块生成配音</span></div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {availableAudios.map(audio => (
          <div key={audio.id} onClick={() => handleItemClick(audio, "audio")} style={{ display: "flex", gap: 6, padding: 4, border: "1px solid #2a2a4a", borderRadius: 4, background: "#1e1e35", cursor: "pointer" }}>
            <div style={{ width: 32, height: 32, background: "rgba(16,185,129,0.2)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎵</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{audio.title || audio.name || "音频"}</div>
              <div style={{ fontSize: 8, color: "#666", marginTop: 1 }}>{audio.duration ? `${audio.duration}秒` : "点击添加"}</div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
            {activeTab === "text" && (
  <div>
    <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>可用文本（{availableTexts.length}）</div>
    {availableTexts.length === 0 ? (
      <div style={{ textAlign: "center", padding: 24, color: "#555", fontSize: 11 }}><div style={{ fontSize: 28, marginBottom: 6 }}>📝</div>暂无文本素材<br/><span style={{ fontSize: 9 }}>请先在分镜中添加台词</span></div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {availableTexts.map(text => (
          <div key={text.id} onClick={() => handleItemClick(text, "text")} style={{ display: "flex", gap: 6, padding: 4, border: "1px solid #2a2a4a", borderRadius: 4, background: "#1e1e35", cursor: "pointer" }}>
            <div style={{ width: 32, height: 32, background: "rgba(245,158,11,0.2)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📝</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text.character || "台词"}</div>
              <div style={{ fontSize: 8, color: "#666", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text.text || text.content || "点击添加"}</div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
            {activeTab === "transition" && (
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>转场（选中后新片段生效）</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {TRANSITIONS.map(t => (
                    <button key={t.id} onClick={() => setSelectedTransition(t.id)} style={{ padding: "8px 2px", border: selectedTransition === t.id ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 4, background: selectedTransition === t.id ? "rgba(92,225,230,0.1)" : "#1e1e35", color: selectedTransition === t.id ? "#5ce1e6" : "#aaa", cursor: "grab", fontSize: 10 }}>
                      <div style={{ fontSize: 16, marginBottom: 1 }}>{t.icon}</div>{t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "filter" && (
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>滤镜（点击应用到选中片段）</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {FILTERS.map(f => (
                    <button key={f.id} onClick={() => selectedClip && updateSelectedClip({ filter: f.id })} disabled={!selectedClip} style={{ padding: "8px 2px", border: selectedClip?.filter === f.id ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 4, background: selectedClip?.filter === f.id ? "rgba(92,225,230,0.1)" : "#1e1e35", color: selectedClip?.filter === f.id ? "#5ce1e6" : "#aaa", cursor: selectedClip ? "pointer" : "not-allowed", fontSize: 10, opacity: selectedClip ? 1 : 0.5 }}>
                      {f.name}
                    </button>
                  ))}
                </div>
                {!selectedClip && <div style={{ fontSize: 9, color: "#555", marginTop: 8, textAlign: "center" }}>请先选中片段</div>}
              </div>
            )}
          </div>
        </div>

        {/* 中间预览 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a15" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", background: bgColor }}>
            {/* video 元素必须常驻 DOM：旧写法在没有 currentClip 时整个卸载，
                videoRef 变成 null，播放器直接失效。src 由播放引擎 imperative 设置，
                不再交给 React（避免每次 currentTime 变化都触发重新加载）。 */}
            {/* 视频画面 wrapper：aspectRatio 锚定实际画面区域，字幕/文本相对画面定位，不会跑出视频外 */}
            <div style={{ position: "relative", aspectRatio: `${ASPECT_RATIOS.find(r => r.id === aspectRatio)?.w || 16} / ${ASPECT_RATIOS.find(r => r.id === aspectRatio)?.h || 9}`, maxWidth: "100%", maxHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              style={{ width: "100%", height: "100%", objectFit: "fill", filter: currentFilter || "none", display: currentClip ? "block" : "none" }}
            />
            {/* 音频轨道播放元素（此前缺失，音频轨从未真正发声） */}
            <audio ref={audioRef} preload="auto" style={{ display: "none" }} />
            {!currentClip && (
              <div style={{ textAlign: "center", color: "#444" }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🎬</div>
                <div style={{ fontSize: 14 }}>从左侧点击镜头添加到时间线</div>
                <div style={{ fontSize: 11, marginTop: 6, color: "#333" }}>快捷键：空格播放 · B分割 · Ctrl+Z撤销</div>
              </div>
            )}
            {currentClip && <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.6)", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>{currentClip.title}</div>}
            
            {/* 显示当前时间的文本字幕（相对视频画面定位：top/middle/bottom + left/center/right，强制换行防溢出） */}
            {textClips.filter(tc => currentTime >= tc.start && currentTime < tc.start + tc.duration).map(tc => {
              const vPos = tc.position === "top" ? "6%" : tc.position === "middle" ? "50%" : "88%";
              const hAlignVal = tc.hAlign === "left" ? "8%" : tc.hAlign === "right" ? "92%" : "50%";
              const hTransform = tc.hAlign === "left" ? "translate(0,-50%)" : tc.hAlign === "right" ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
              const hTextAlign = tc.hAlign === "left" ? "left" : tc.hAlign === "right" ? "right" : "center";
              const bgHex = tc.bgColor || "#000000";
              const bgOp = tc.bgOpacity ?? 70;
              const bgR = parseInt(bgHex.slice(1, 3), 16) || 0;
              const bgG = parseInt(bgHex.slice(3, 5), 16) || 0;
              const bgB = parseInt(bgHex.slice(5, 7), 16) || 0;
              return (
                <div key={tc.id} style={{
                  position: "absolute",
                  left: hAlignVal,
                  top: vPos,
                  transform: hTransform,
                  background: bgOp > 0 ? `rgba(${bgR},${bgG},${bgB},${(bgOp / 100).toFixed(2)})` : "transparent",
                  color: tc.color || "#ffffff",
                  fontSize: tc.fontSize || 20,
                  fontFamily: tc.fontFamily || undefined,
                  fontWeight: tc.bold ? 700 : 600,
                  padding: bgOp > 0 ? "6px 16px" : "2px 6px",
                  borderRadius: 6,
                  maxWidth: "92%",
                  textAlign: hTextAlign,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.4,
                  textShadow: bgOp > 0 ? "none" : "0 1px 3px rgba(0,0,0,0.9)",
                  zIndex: 5,
                }}>
                  {tc.character && <span style={{ color: "#5ce1e6", marginRight: 8 }}>{tc.character}：</span>}
                  {tc.text}
                </div>
              );
            })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid #2a2a4a", background: "#16162a" }}>
            <button onClick={() => seekTo(currentTime - 5)} style={playBtn}>⏮</button>
            <button onClick={togglePlay} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: isPlaying ? "#ef4444" : "#7a5cff", color: "#fff", cursor: "grab", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{isPlaying ? "⏸" : "▶"}</button>
            <button onClick={() => seekTo(currentTime + 5)} style={playBtn}>⏭</button>
            {/* 时间码由 rAF 直接写 textContent（60fps），React 只负责初始值 */}
            <div ref={timeTextRef} style={{ fontFamily: "monospace", fontSize: 13, color: "#5ce1e6", minWidth: 80 }}>{formatTime(currentTime)}</div>
            <div style={{ fontSize: 11, color: "#555" }}>/ {formatTime(contentEnd)}</div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "#666" }}>缩放</span>
            <input id="timelineZoom" name="timelineZoom" type="range" min="0.25" max="3" step="0.25" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: 80 }} />
            <span style={{ fontSize: 10, color: "#666", minWidth: 24 }}>{zoom}x</span>
          </div>
        </div>

        {/* 右侧属性面板 */}
        {selectedClip && showProperties && (
          <div style={{ width: 200, borderLeft: "1px solid #2a2a4a", background: "#16162a", overflow: "auto" }}>
            <div style={{ padding: "10px 8px", borderBottom: "1px solid #2a2a4a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>属性</span>
              <button onClick={() => setShowProperties(false)} style={{ background: "none", border: "none", color: "#888", cursor: "grab", fontSize: 14 }}>×</button>
            </div>
            <div style={{ padding: 8 }}>
              <div style={{ fontSize: 11, color: "#5ce1e6", marginBottom: 6, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedTrack === "text" ? `文本：${selectedClip.character || ""}` : selectedTrack === "audio" ? `音频：${selectedClip.title || ""}` : selectedClip.title}
              </div>
              
              {/* 文本属性编辑 */}
              {selectedTrack === "text" && (
                <>
                  {/* 合并文本编辑（角色名：文本内容） */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>文本内容（格式：角色名：台词）</div>
                    <textarea 
                      value={`${selectedClip.character || ""}：${selectedClip.text || ""}`}
                      onChange={(e) => {
                        const val = e.target.value;
                        const sepIndex = val.indexOf("：");
                        if (sepIndex >= 0) {
                          const character = val.substring(0, sepIndex);
                          const text = val.substring(sepIndex + 1);
                          setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, character, text } : c));
                        } else {
                          setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, character: "", text: val } : c));
                        }
                      }}
                      style={{ width: "100%", padding: "4px 6px", background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 4, color: "#fff", fontSize: 11, minHeight: 80, resize: "vertical" }}
                      placeholder="角色名：台词内容"
                    />
                  </div>
                  
                  {/* 字体大小 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>字体大小：{selectedClip.fontSize || 20}px</div>
                    <input 
                      type="range" 
                      min="12" 
                      max="48" 
                      value={selectedClip.fontSize || 20} 
                      onChange={(e) => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, fontSize: parseInt(e.target.value) } : c))}
                      style={{ width: "100%" }}
                    />
                  </div>

                  {/* 字体 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>字体</div>
                    <select
                      value={selectedClip.fontFamily || ""}
                      onChange={(e) => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, fontFamily: e.target.value } : c))}
                      style={{ width: "100%", padding: "4px 6px", background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 4, color: "#fff", fontSize: 11 }}
                    >
                      {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>

                  {/* 加粗 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>加粗</div>
                    <button
                      onClick={() => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, bold: !c.bold } : c))}
                      style={{ width: "100%", padding: "4px 0", border: selectedClip.bold ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 4, background: selectedClip.bold ? "rgba(92,225,230,0.1)" : "#1e1e35", color: selectedClip.bold ? "#5ce1e6" : "#aaa", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                    >B 粗体{selectedClip.bold ? " ✓" : ""}</button>
                  </div>

                  {/* 背景色 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>背景色</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={() => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, bgColor: "#000000", bgOpacity: 0 } : c))}
                        style={{ width: 20, height: 20, border: "1px dashed #888", borderRadius: 3, cursor: "pointer", background: "transparent", fontSize: 9, color: "#888", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="无背景"
                      >无</button>
                      {TEXT_BG_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, bgColor: color, bgOpacity: (c.bgOpacity ?? 70) || 70 } : c))}
                          style={{ width: 20, height: 20, background: color, border: (selectedClip.bgColor || "#000000") === color && (selectedClip.bgOpacity ?? 70) > 0 ? "2px solid #5ce1e6" : "1px solid #444", borderRadius: 3, cursor: "pointer" }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 背景不透明度 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>背景不透明度：{selectedClip.bgOpacity ?? 70}%</div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={selectedClip.bgOpacity ?? 70}
                      onChange={(e) => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, bgOpacity: parseInt(e.target.value) } : c))}
                      style={{ width: "100%" }}
                    />
                  </div>
                  
                  {/* 字体颜色 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>字体颜色</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {["#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#f59e0b"].map(color => (
                        <button 
                          key={color} 
                          onClick={() => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, color } : c))}
                          style={{ width: 20, height: 20, background: color, border: selectedClip.color === color ? "2px solid #5ce1e6" : "1px solid #444", borderRadius: 3, cursor: "pointer" }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {/* 垂直位置：顶部/中部/底部 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>垂直位置</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["top", "顶部"], ["middle", "中部"], ["bottom", "底部"]].map(([val, label]) => (
                        <button 
                          key={val} 
                          onClick={() => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, position: val } : c))}
                          style={{ flex: 1, padding: "4px 0", border: (selectedClip.position || "bottom") === val ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 4, background: (selectedClip.position || "bottom") === val ? "rgba(92,225,230,0.1)" : "#1e1e35", color: (selectedClip.position || "bottom") === val ? "#5ce1e6" : "#aaa", fontSize: 10, cursor: "pointer" }}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 水平对齐：左/中/右 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>水平对齐</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["left", "左"], ["center", "中"], ["right", "右"]].map(([val, label]) => (
                        <button 
                          key={val} 
                          onClick={() => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, hAlign: val } : c))}
                          style={{ flex: 1, padding: "4px 0", border: (selectedClip.hAlign || "center") === val ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 4, background: (selectedClip.hAlign || "center") === val ? "rgba(92,225,230,0.1)" : "#1e1e35", color: (selectedClip.hAlign || "center") === val ? "#5ce1e6" : "#aaa", fontSize: 10, cursor: "pointer" }}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 时长 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>时长：{selectedClip.duration || 3}秒</div>
                    <input 
                      type="range" 
                      min="1" 
                      max="30" 
                      value={selectedClip.duration || 3} 
                      onChange={(e) => setTextClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, duration: parseInt(e.target.value) } : c))}
                      style={{ width: "100%" }}
                    />
                  </div>
                </>
              )}
              
              {/* 音频属性编辑 */}
              {selectedTrack === "audio" && (
                <>
                  {/* 变速：新增。改变播放速率的同时按 srcDuration/speed 重算时长，
                      保证「变速即变长/变短」，与时间线占位一致 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>变速：{selectedClip.speed || 1}x</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {SPEED_OPTIONS.map(s => (
                        <button key={s} onClick={() => changeAudioSpeed(s)} style={{ padding: "3px 6px", border: (selectedClip.speed || 1) === s ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 3, background: (selectedClip.speed || 1) === s ? "rgba(92,225,230,0.1)" : "#1e1e35", color: (selectedClip.speed || 1) === s ? "#5ce1e6" : "#aaa", cursor: "pointer", fontSize: 9 }}>{s}x</button>
                      ))}
                    </div>
                  </div>

                  {/* 音量 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "#888" }}>音量</span>
                      <button onClick={() => setAudioClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, muted: !c.muted } : c))} style={{ background: "none", border: "none", color: selectedClip.muted ? "#ef4444" : "#888", cursor: "pointer", fontSize: 12 }}>{selectedClip.muted ? "🔇" : "🔊"}</button>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={selectedClip.volume ?? 100} 
                      onChange={(e) => setAudioClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, volume: parseInt(e.target.value) } : c))}
                      style={{ width: "100%" }} 
                      disabled={selectedClip.muted}
                    />
                    <div style={{ fontSize: 9, color: "#666", textAlign: "right" }}>{selectedClip.volume ?? 100}%</div>
                  </div>
                  
                  {/* 时长：裁剪素材本体，轨道占位 = 素材时长 / 速度 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>
                      素材时长：{(selectedClip.srcDuration ?? selectedClip.duration ?? 5).toFixed(1)}秒 · 轨道占位 {formatTime(selectedClip.duration || 5)}
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="120"
                      step="0.5"
                      value={Math.min(120, selectedClip.srcDuration ?? selectedClip.duration ?? 5)}
                      onChange={(e) => setAudioClips(prev => prev.map(c => c.id === selectedClipId
                        ? { ...c, srcDuration: parseFloat(e.target.value), duration: parseFloat(e.target.value) / (c.speed || 1) }
                        : c))}
                      style={{ width: "100%" }}
                    />
                  </div>
                </>
              )}
              
              {/* 视频属性编辑 */}
              {selectedTrack === "video" && (
                <>
              {/* 变速 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>变速：{(selectedClip.speed || 1)}x</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {SPEED_OPTIONS.map(s => (
                    <button key={s} onClick={() => changeSpeed(s)} style={{ padding: "3px 6px", border: selectedClip.speed === s ? "1px solid #5ce1e6" : "1px solid #2a2a4a", borderRadius: 3, background: selectedClip.speed === s ? "rgba(92,225,230,0.1)" : "#1e1e35", color: selectedClip.speed === s ? "#5ce1e6" : "#aaa", cursor: "grab", fontSize: 9 }}>{s}x</button>
                  ))}
                </div>
              </div>

              {/* 倒放/定格 */}
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                <button onClick={toggleReverse} style={{ flex: 1, padding: "5px 0", border: selectedClip.reverse ? "1px solid #f59e0b" : "1px solid #2a2a4a", borderRadius: 4, background: selectedClip.reverse ? "rgba(245,158,11,0.1)" : "#1e1e35", color: selectedClip.reverse ? "#f59e0b" : "#aaa", cursor: "grab", fontSize: 10 }}>🔄 倒放</button>
                <button onClick={toggleFreeze} style={{ flex: 1, padding: "5px 0", border: selectedClip.freeze ? "1px solid #f59e0b" : "1px solid #2a2a4a", borderRadius: 4, background: selectedClip.freeze ? "rgba(245,158,11,0.1)" : "#1e1e35", color: selectedClip.freeze ? "#f59e0b" : "#aaa", cursor: "grab", fontSize: 10 }}>❄️ 定格</button>
              </div>

              {/* 音量 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: "#888" }}>音量</span>
                  <button onClick={toggleMute} style={{ background: "none", border: "none", color: selectedClip.muted ? "#ef4444" : "#888", cursor: "grab", fontSize: 12 }}>{selectedClip.muted ? "🔇" : "🔊"}</button>
                </div>
                <input id="clipVolume" name="clipVolume" type="range" min="0" max="200" value={selectedClip.volume ?? 100} onChange={(e) => updateSelectedClip({ volume: parseInt(e.target.value) })} style={{ width: "100%" }} disabled={selectedClip.muted} />
                <div style={{ fontSize: 9, color: "#666", textAlign: "right" }}>{selectedClip.volume ?? 100}%</div>
              </div>

              {/* 调节 */}
              <div style={{ marginBottom: 10, paddingTop: 8, borderTop: "1px solid #2a2a4a" }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 6, fontWeight: 600 }}>画面调节</div>
                {[
                  { key: "brightness", label: "亮度", min: 0, max: 200 },
                  { key: "contrast", label: "对比度", min: 0, max: 200 },
                  { key: "saturation", label: "饱和度", min: 0, max: 200 },
                ].map(item => (
                  <div key={item.key} style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#888", marginBottom: 1 }}>
                      <span>{item.label}</span><span>{selectedClip[item.key] ?? 100}</span>
                    </div>
                    <input id={`clipAdjust_${item.key}`} name={`clipAdjust_${item.key}`} type="range" min={item.min} max={item.max} value={selectedClip[item.key] ?? 100} onChange={(e) => updateSelectedClip({ [item.key]: parseInt(e.target.value) })} style={{ width: "100%" }} />
                  </div>
                ))}
              </div>

              {/* 时长 */}
              <div style={{ paddingTop: 8, borderTop: "1px solid #2a2a4a" }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>片段时长</div>
                <div style={{ fontSize: 14, color: "#5ce1e6", fontFamily: "monospace", fontWeight: 600 }}>{formatTime(selectedClip.duration)}</div>
                <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>起始：{formatTime(selectedClip.start)}</div>
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部时间线 */}
      <div ref={timelineRef} onDragOver={handleDragOver} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={handleTimelineClick} style={{ height: TIMELINE_HEIGHT, borderTop: isOverTimeline ? "2px solid #7a5cff" : "2px solid #2a2a4a", background: isOverTimeline ? "rgba(122, 92, 255, 0.1)" : "#16162a", overflowX: "auto", overflowY: "hidden", position: "relative", cursor: isDragging ? "copy" : "text", transition: "all 0.2s" }}>
        <div onDragOver={(e) => e.preventDefault()} style={{ width: timelineWidth + 60, position: "relative", height: "100%" }}>
          {/* 时间标尺 */}
          <div onDragOver={(e) => e.preventDefault()} style={{ height: 22, borderBottom: "1px solid #2a2a4a", position: "relative", background: "#12121f", marginLeft: 60 }}>
            {rulerMarks.map(t => (
              <div key={t} style={{ position: "absolute", left: t * PIXELS_PER_SECOND * zoom, top: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ width: 1, height: 6, background: "#444" }} />
                <span style={{ fontSize: 8, color: "#666", marginLeft: 2, marginTop: 1, fontFamily: "monospace" }}>{formatTime(t)}</span>
              </div>
            ))}
          </div>

          {/* 轨道 */}
          {[
            { id: "video", name: "🎬 视频", color: "rgba(122,92,255,0.03)" },
            { id: "audio", name: "🎵 音频", color: "rgba(16,185,129,0.03)" },
            { id: "text", name: "📝 文本", color: "rgba(245,158,11,0.03)" },
          ].map((track, idx) => (
            <div key={track.id} onDragOver={(e) => e.preventDefault()} style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: idx * TRACK_HEIGHT, width: 60, height: TRACK_HEIGHT, background: "#12121f", borderRight: "1px solid #2a2a4a", borderTop: idx > 0 ? "1px solid #2a2a4a" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#888", zIndex: 2 }}>{track.name}</div>
              <div onDragOver={(e) => e.preventDefault()} style={{ position: "absolute", left: 60, top: idx * TRACK_HEIGHT, height: TRACK_HEIGHT, width: timelineWidth, background: track.color, borderTop: idx > 0 ? "1px solid #2a2a4a" : "none", ...gridBackground }}>
                {track.id === "video" && timelineClips.map(clip => (
                  <div key={clip.id} onMouseDown={(e) => handleClipMouseDown(clip, e)} onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }} style={{ position: "absolute", left: clip.start * PIXELS_PER_SECOND * zoom, top: 3, width: Math.max(clip.duration * PIXELS_PER_SECOND * zoom, 24), height: TRACK_HEIGHT - 6, background: selectedClipId === clip.id ? "linear-gradient(135deg, rgba(122,92,255,0.7), rgba(92,225,230,0.5))" : "linear-gradient(135deg, rgba(122,92,255,0.35), rgba(92,225,230,0.2))", border: selectedClipId === clip.id ? "2px solid #5ce1e6" : "1px solid rgba(122,92,255,0.5)", borderRadius: 4, cursor: "grab", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 6px", userSelect: "none", zIndex: selectedClipId === clip.id ? 3 : 1 }}>
                    {clip.thumb && <img src={clip.thumb} alt="" style={{ height: 28, width: 36, objectFit: "cover", borderRadius: 2, marginRight: 6, flexShrink: 0 }} />}
                    <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip.title}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>{formatTime(clip.duration)}{clip.speed !== 1 ? ` · ${clip.speed}x` : ""}{clip.reverse ? " · 倒放" : ""}{clip.filter && clip.filter !== "none" ? ` · ${FILTERS.find(f => f.id === clip.filter)?.name}` : ""}</div>
                    </div>
                  </div>
                ))}
                {track.id === "audio" && audioClips.map(clip => (
                  <div key={clip.id} onMouseDown={(e) => handleAnyClipMouseDown(clip, "audio", e)} onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); setSelectedTrack("audio"); }} style={{ position: "absolute", left: clip.start * PIXELS_PER_SECOND * zoom, top: 3, width: Math.max(clip.duration * PIXELS_PER_SECOND * zoom, 24), height: TRACK_HEIGHT - 6, background: selectedClipId === clip.id && selectedTrack === "audio" ? "linear-gradient(135deg, rgba(16,185,129,0.7), rgba(92,225,230,0.5))" : "linear-gradient(135deg, rgba(16,185,129,0.35), rgba(92,225,230,0.2))", border: selectedClipId === clip.id && selectedTrack === "audio" ? "2px solid #5ce1e6" : "1px solid rgba(16,185,129,0.5)", borderRadius: 4, cursor: "grab", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 6px", userSelect: "none" }}>
                    <div style={{ fontSize: 12, marginRight: 4 }}>🎵</div>
                    <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip.title}{clip.muted ? " 🔇" : ""}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>{formatTime(clip.duration)}{clip.speed && clip.speed !== 1 ? ` · ${clip.speed}x` : ""}</div>
                    </div>
                  </div>
                ))}
                {track.id === "text" && textClips.map(clip => (
                  <div key={clip.id} onMouseDown={(e) => handleAnyClipMouseDown(clip, "text", e)} onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); setSelectedTrack("text"); }} style={{ position: "absolute", left: clip.start * PIXELS_PER_SECOND * zoom, top: 3, width: Math.max(clip.duration * PIXELS_PER_SECOND * zoom, 24), height: TRACK_HEIGHT - 6, background: selectedClipId === clip.id && selectedTrack === "text" ? "linear-gradient(135deg, rgba(245,158,11,0.7), rgba(92,225,230,0.5))" : "linear-gradient(135deg, rgba(245,158,11,0.35), rgba(92,225,230,0.2))", border: selectedClipId === clip.id && selectedTrack === "text" ? "2px solid #5ce1e6" : "1px solid rgba(245,158,11,0.5)", borderRadius: 4, cursor: "grab", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 6px", userSelect: "none" }}>
                    <div style={{ fontSize: 12, marginRight: 4 }}>📝</div>
                    <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip.character}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip.text}</div>
                    </div>
                  </div>
                ))}
                {track.id !== "video" && track.id !== "audio" && track.id !== "text" && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 10, color: "#333" }}>{track.name.replace(/[🎬🎵📝]/g, "").trim()}轨道（开发中）</div>}
              </div>
            </div>
          ))}

          {/* 播放头：用 transform 位移，rAF 每帧直接改 DOM（React 只提供初始/兜底位置） */}
          <div ref={playheadRef} style={{ position: "absolute", left: 0, top: 0, height: "100%", width: 2, background: "#ef4444", zIndex: 10, pointerEvents: "none", transform: `translateX(${currentTime * PIXELS_PER_SECOND * zoom + 60}px)` }}>
            <div style={{ position: "absolute", top: -1, left: -5, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid #ef4444" }} />
          </div>
        </div>
      </div>

      {/* 导出设置弹窗 */}
      {showExportSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => !busy && setShowExportSettings(false)}>
          <div style={{ width: 360, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 12, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>🎬 导出设置</h3>
              <button onClick={() => setShowExportSettings(false)} style={{ background: "none", border: "none", color: "#888", cursor: "grab", fontSize: 18 }}>×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>分辨率</div>
              <select value={exportResolution} onChange={(e) => setExportResolution(e.target.value)} style={exportSelect}>
                <option value="480p">480p (标清)</option>
                <option value="720p">720p (高清)</option>
                <option value="1080p">1080p (全高清)</option>
                <option value="2k">2K (超高清)</option>
                <option value="4k">4K (超清)</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>帧率</div>
              <select value={exportFps} onChange={(e) => setExportFps(parseInt(e.target.value))} style={exportSelect}>
                <option value={24}>24 fps (电影)</option>
                <option value={25}>25 fps (PAL)</option>
                <option value={30}>30 fps (标准)</option>
                <option value={60}>60 fps (流畅)</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>码率</div>
              <select value={exportBitrate} onChange={(e) => setExportBitrate(e.target.value)} style={exportSelect}>
                <option value="4M">4 Mbps (低质量)</option>
                <option value="8M">8 Mbps (标准)</option>
                <option value="12M">12 Mbps (高质量)</option>
                <option value="20M">20 Mbps (极高)</option>
              </select>
            </div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 16, padding: "8px 10px", background: "#12121f", borderRadius: 6 }}>
              画布比例：{ASPECT_RATIOS.find(r => r.id === aspectRatio)?.label}<br/>
              片段数：{timelineClips.length} · 总时长：{formatTime(totalDuration)}
            </div>
            <button onClick={exportVideo} disabled={busy === "video"} style={{ width: "100%", padding: "12px 0", border: "none", borderRadius: 8, background: busy === "video" ? "#555" : "linear-gradient(135deg, #7a5cff, #5ce1e6)", color: "#fff", cursor: busy === "video" ? "wait" : "pointer", fontSize: 14, fontWeight: 600 }}>
              {busy === "video" ? "合成中..." : "🎬 开始导出"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = { width: 28, height: 28, border: "1px solid #2a2a4a", borderRadius: 4, background: "#1e1e35", color: "#aaa", cursor: "grab", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" };
const playBtn = { width: 30, height: 30, borderRadius: "50%", border: "1px solid #2a2a4a", background: "#1e1e35", color: "#aaa", cursor: "grab", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" };
const selectStyle = { padding: "4px 8px", border: "1px solid #2a2a4a", borderRadius: 4, background: "#1e1e35", color: "#aaa", cursor: "grab", fontSize: 11 };
const exportSelect = { width: "100%", padding: "8px 10px", border: "1px solid #2a2a4a", borderRadius: 6, background: "#12121f", color: "#fff", fontSize: 13 };

export default EditExport;
