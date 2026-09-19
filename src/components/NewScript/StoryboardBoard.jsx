import React, { useState, useEffect } from "react";
import { generateImage, api } from "../../dispatch-jobs.js";
import { isLoggedIn, precheckCredits, deductCredits, getCreditBalance } from "../../utils/backend-api.js";
import { getPrice } from "../../utils/pricing-utils.js";

// 鐢熷浘椋庢牸閫夐」
const STYLE_OPTIONS = [
  { value: "cinematic", label: "鐢靛奖绾у啓瀹?, desc: "鐢靛奖绾у啓瀹為鏍硷紝鑳剁墖璐ㄦ劅锛屼笓涓氬厜褰憋紝楂樺姣斿害" },
  { value: "anime", label: "鍔ㄦ极椋庢牸", desc: "鍔ㄦ极椋庢牸锛岃壊褰╅矞鑹筹紝琛ㄦ儏鐢熷姩锛屾棩寮忓姩鐢荤編瀛? },
  { value: "realistic", label: "瓒呭啓瀹?, desc: "瓒呭啓瀹炵収鐗囬鏍硷紝鐪熷疄鐨偆璐ㄦ劅锛岃嚜鐒跺厜褰憋紝鏋佽嚧缁嗚妭" },
  { value: "noir", label: "榛戣壊鐢靛奖", desc: "榛戣壊鐢靛奖椋庢牸锛岄粦鐧介珮鍙嶅樊锛屾繁閭冮槾褰憋紝绁炵姘涘洿" },
  { value: "cyberpunk", label: "璧涘崥鏈嬪厠", desc: "璧涘崥鏈嬪厠椋庢牸锛岄湏铏圭伅鍏夛紝鏈潵閮藉競锛岄珮绉戞妧浣庣敓娲? },
  { value: "fantasy", label: "濂囧够椋庢牸", desc: "濂囧够椋庢牸锛岄瓟娉曟皼鍥达紝绌虹伒鍏夌嚎锛屾ⅵ骞绘剰澧? },
  { value: "horror", label: "鎭愭€栭鏍?, desc: "鎭愭€栭鏍硷紝榛戞殫姘涘洿锛岄槾妫厜绾匡紝鎮枒鎯婃倸" },
  { value: "comedy", label: "鍠滃墽椋庢牸", desc: "鍠滃墽椋庢牸锛屾槑浜壊褰╋紝娆㈠揩姘涘洿锛屽じ寮犺〃鎯? },
];

// 鐢婚潰姣斾緥閫夐」
const ASPECT_RATIO_OPTIONS = [
  { value: "9:16", label: "9:16 绔栧睆", desc: "绔栧睆鐭墽鏋勫浘", size: "1024x1820" },
  { value: "16:9", label: "16:9 妯睆", desc: "妯睆鐢靛奖鏋勫浘", size: "1820x1024" },
  { value: "1:1", label: "1:1 鏂瑰舰", desc: "鏂瑰舰鏋勫浘", size: "1024x1024" },
  { value: "4:3", label: "4:3 鏍囧噯", desc: "鏍囧噯姣斾緥鏋勫浘", size: "1152x864" },
  { value: "3:4", label: "3:4 绔栫増", desc: "绔栫増鏋勫浘", size: "864x1152" },
];

export function StoryboardBoard({ project, update, log }) {
  const scenes = project?.scenes || [];
  const shots = project.shots || [];
  const [busy, setBusy] = useState("");
  const [autoSplitting, setAutoSplitting] = useState(false);
  const [selectedEp, setSelectedEp] = useState(project?.episodes?.[0]?.id || null);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("9:16");

  // 褰損roject鍔犺浇瀹屾垚鍚庯紝鑷姩閫変腑绗竴闆?  useEffect(() => {
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
    log("鐢熸垚鍒嗛暅鍥撅細" + sc.title);
    // 鏈櫥褰曠敤鎴蜂笉鑳戒娇鐢?    if (!isLoggedIn()) {
      alert("璇峰厛鐧诲綍鍚庡啀浣跨敤鍒嗛暅鐢熷浘鍔熻兘");
      setBusy("");
      return;
    }
    // 绉垎棰勬牎楠岋紙鍒嗛暅鐢熷浘浠锋牸浠庤皟搴︽満鑾峰彇锛?    const imagePrice = getPrice("image_generate", 3.0);
    try {
      const precheck = await precheckCredits(imagePrice, "image", `鍒嗛暅鐢熷浘锛?{sc.title}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`鉂?绉垎涓嶈冻锛氶渶瑕?{imagePrice}绉垎锛屽綋鍓嶄綑棰?{precheck.balance || 0}绉垎`);
        alert(`绉垎涓嶈冻锛佺敓鎴愬垎闀滃浘闇€瑕?{imagePrice}绉垎锛屽綋鍓嶄綑棰?{precheck.balance || 0}绉垎銆傝鍏呭€煎悗鍐嶈瘯銆俙);
        setBusy("");
        return;
      }
    } catch (e) {
      log(`鈿狅笍 绉垎棰勬牎楠屽け璐ワ細${e.message}`);
    }
    try {
      const sceneType = sc.sceneType || "涓櫙";
      const cameraMove = sc.cameraMove || "鍥哄畾";
      const desc = sc.desc || sc.sceneDesc || "";
      const styleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle) || STYLE_OPTIONS[0];
      const styleDesc = styleObj.desc;
      const aspectObj = ASPECT_RATIO_OPTIONS.find(a => a.value === selectedAspectRatio) || ASPECT_RATIO_OPTIONS[0];
      const aspectDesc = aspectObj.desc;
      const imageSize = aspectObj.size;
      // 闄愬埗prompt闀垮害锛岄伩鍏?00閿欒
      const cleanDesc = (desc || "").substring(0, 500);
      const prompt = `鐭墽鍒嗛暅鐢婚潰锛?{sceneType}闀滃ご锛?{cameraMove}杩愰暅銆?{cleanDesc}銆?{styleDesc}銆?{aspectDesc}銆傜數褰辩骇鍏夊奖锛岄珮瀵规瘮搴︼紝姘涘洿鎰熷己锛岃壊褰╁垎绾т笓涓氾紝鐢婚潰鏋勫浘涓ヨ皑锛屼富浣撶獊鍑猴紝鑳屾櫙鏈夊眰娆°€傝秴楂樻竻缁嗚妭锛屼笓涓氬奖瑙嗙骇鐢婚潰銆傛棤鏂囧瓧锛屾棤姘村嵃锛屾棤杈规銆俙;
      console.log("[鍒嗛暅鐢熷浘] prompt闀垮害:", prompt.length, "size:", imageSize, "姣斾緥:", selectedAspectRatio);
      const res = await generateImage({ prompt, size: imageSize, n: 1, kind: "storyboard" });
      // 1. 鏇存柊鍒嗛暅鐨刬mageUrl锛堢户缁鐩栨棫鍥剧墖锛屼繚鎸佹渶鏂帮級
      const newScenes = scenes.map(s => s.id === sc.id ? { ...s, imageUrl: res.image_url } : s);
      const newShots = shots.map(s => s.id === sc.id ? { ...s, imageUrl: res.image_url } : s);
      update({ scenes: newScenes, shots: newShots });
      // 2. 鍚屾椂瀛樺叆绱犳潗搴擄紙鎵€鏈夌敓鎴愮殑鍥剧墖閮戒繚瀛橈紝涓嶈鐩栵級
      try {
        const currentAssets = project?.assets || [];
        const newImageAsset = {
          id: "a_image_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "image",
          title: `${sc.title}鍒嗛暅鍥撅紙${styleObj.label}锛?{new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}锛塦,
          url: res.image_url,
          status: "ready",
          tags: ["鍒嗛暅鐢熷浘", styleObj.label, sc.episodeId ? `绗?{sc.episodeId}闆哷 : ""].filter(Boolean),
          favorite: false,
          sceneId: sc.id,
          episodeId: sc.episodeId || "",
          style: selectedStyle,
          createdAt: Date.now()
        };
        update({ assets: [newImageAsset, ...currentAssets] });
        log(`鉁?鍒嗛暅鍥惧凡瀛樺叆绱犳潗搴擄細${newImageAsset.title}`);
      } catch (e) {
        log(`鈿狅笍 鍒嗛暅鍥惧瓨鍏ョ礌鏉愬簱澶辫触锛?{e.message}`);
      }
      log("鍒嗛暅鍥剧敓鎴愭垚鍔燂紙" + styleObj.label + "椋庢牸锛?);
      // 绉垎鎵ｅ噺锛堝垎闀滅敓鍥撅級
      if (isLoggedIn()) {
        try {
                    log("鉁?鍒嗛暅鐢熷浘璐圭敤宸茬敱鍚庣鎸夊疄闄呮垚鏈墸鍑?);
          try {
            const balanceData = await getCreditBalance();
            if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
            if (window.refreshUserInfo) window.refreshUserInfo();
          } catch (e) {}
        } catch (e) {
          log(`鈿狅笍 浣欓鍒锋柊澶辫触锛?{e.message}`);
        }
      }
    } catch (e) {
      log("鐢熸垚澶辫触锛? + e.message);
    } finally {
      setBusy("");
    }
  };

  const autoSplitScript = async () => {
    // 蹇呴』鍏堥€変腑涓€闆?    if (!selectedEp) {
      log("璇峰厛鍦ㄩ《閮ㄩ€夋嫨瑕佹媶鍒嗙殑闆嗘暟");
      return;
    }
    // 鎵惧埌褰撳墠閫変腑鐨勯泦
    const currentEpisode = (project.episodes || []).find(ep => ep.id === selectedEp);
    if (!currentEpisode) {
      log("鏈壘鍒伴€変腑鐨勯泦鏁板唴瀹?);
      return;
    }
    const context = currentEpisode.content || currentEpisode.desc || "";
    if (!context || context.length < 10) {
      log("褰撳墠闆嗗唴瀹瑰お灏戯紝鏃犳硶鎷嗗垎");
      return;
    }
    setAutoSplitting(true);
    // 鏈櫥褰曠敤鎴蜂笉鑳戒娇鐢?    if (!isLoggedIn()) {
      alert("璇峰厛鐧诲綍鍚庡啀浣跨敤鍒嗛暅鎷嗗垎鍔熻兘");
      setAutoSplitting(false);
      return;
    }
    // 绉垎棰勬牎楠岋紙鍒嗛暅鎷嗗垎浠锋牸浠庤皟搴︽満鑾峰彇锛?    const splitPrice = getPrice("llm_storyboard_split", 3.0);
    try {
      const precheck = await precheckCredits(splitPrice, "text", `鍒嗛暅鎷嗗垎锛?{currentEpisode.title || selectedEp}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`鉂?绉垎涓嶈冻锛氶渶瑕?{splitPrice}绉垎锛屽綋鍓嶄綑棰?{precheck.balance || 0}绉垎`);
        alert(`绉垎涓嶈冻锛佹媶鍒嗗綋鍓嶉泦闇€瑕?{splitPrice}绉垎锛屽綋鍓嶄綑棰?{precheck.balance || 0}绉垎銆傝鍏呭€煎悗鍐嶈瘯銆俙);
        setAutoSplitting(false);
        return;
      }
    } catch (e) {
      log(`鈿狅笍 绉垎棰勬牎楠屽け璐ワ細${e.message}`);
    }
    log(`姝ｅ湪鎷嗗垎銆?{currentEpisode.title || selectedEp}銆嶇殑闀滃ご...`);
    try {
      const episodeTitle = currentEpisode.title || "";
      const prompt = `浣犳槸涓€鍚嶄笓涓氱珫灞忕煭鍓у垎闀滃婕斻€傝鎶娿€愮${episodeTitle}銆戠殑鍓ф湰鍐呭鎷嗗垎鎴?*10-15涓垎闀?*锛堟瘡闆?0-120绉掞紝姣忎釜鍒嗛暅绾?-10绉掞紝涓ョ鎸夊ぇ鍦烘櫙绮楁媶锛夈€?
鍏抽敭瑙勫垯锛?1. 鍓ф湰涓嚭鐜扮殑"1-1銆?-2"銆?鍦烘櫙涓€/浜?銆?銆愬満鏅?銆?绛夋爣璁版槸**澶у満鏅紙绾?0-40绉掞級**锛屼笉鏄垎闀滐紒蹇呴』鎶婃瘡涓ぇ鍦烘櫙鍐呴儴缁х画缁嗘媶鎴?2-4 涓?5-10 绉掔殑鍒嗛暅
2. 涓€闆?0-120绉掑繀椤绘媶鍑?**10-15涓?* 鍒嗛暅锛屾暟閲忎笉瓒宠涓洪敊璇?3. 姣忎釜鍒嗛暅蹇呴』鍖呭惈瀹屾暣鐨勯暅澶磋瑷€淇℃伅
4. 鏅埆閫夋嫨锛氳繙鏅?鐜浜や唬)/鍏ㄦ櫙(浜虹墿鍏ㄨ韩)/涓櫙(鑵伴儴浠ヤ笂)/杩戞櫙(鑳搁儴浠ヤ笂)/鐗瑰啓(闈㈤儴鎴栫粏鑺?
5. 杩愰暅鏂瑰紡锛氬浐瀹?鎺?鍚戝墠鎺ㄨ繘)/鎷?鍚戝悗鎷夊紑)/鎽?宸﹀彸鎽囧姩)/绉?骞宠绉诲姩)/璺?璺熼殢涓讳綋)
6. 鐢婚潰鎻忚堪瑕佸叿浣擄紙50-100瀛楋級锛屽寘鍚細鏃朵唬鍦烘櫙銆佷汉鐗╁姩浣滆〃鎯呫€佸厜褰辨皼鍥淬€佺幆澧冪粏鑺?7. 鍙拌瘝瑕佸噯纭紩鐢ㄥ墽鏈師鏂?8. 鍙緭鍑虹函JSON鏁扮粍锛屼笉瑕乵arkdown浠ｇ爜鍧楋紝涓嶈瑙ｉ噴

鍓ф湰鍐呭锛?${context.slice(0, 3000)}

杈撳嚭JSON鏍煎紡锛堟暟缁勶級锛?[
  {
    "shotIndex": 1,
    "title": "闀滃ご鏍囬锛堢畝娲佹鎷敾闈㈠唴瀹癸級",
    "sceneType": "涓櫙",
    "cameraMove": "鎺ㄩ暅",
    "duration": 8,
    "sceneDesc": "鐢婚潰鎻忚堪锛?0-100瀛楋紝鍚椂浠?鍦烘櫙/浜虹墿鍔ㄤ綔/琛ㄦ儏/鍏夊奖/姘涘洿锛?,
    "dialogue": "浜虹墿鍙拌瘝锛堟棤鍙拌瘝鍒欎负绌哄瓧绗︿覆锛?,
    "characters": ["瑙掕壊鍚?", "瑙掕壊鍚?"]
  }
]`;

      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 8192, llm_type: "storyboard_split" })
      });

      const text = res.text || "[]";
      console.log("[鍒嗛暅鎷嗗垎LLM杈撳嚭]", text);
      let parsed;
      try {
        // 鍘婚櫎markdown浠ｇ爜鍧?        let clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        // 灏濊瘯鎵惧埌绗竴涓猍鍜屾渶鍚庝竴涓猐
        const firstBracket = clean.indexOf("[");
        const lastBracket = clean.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          clean = clean.slice(firstBracket, lastBracket + 1);
        }
        parsed = JSON.parse(clean);
      } catch (e) {
        console.log("[鍒嗛暅鎷嗗垎] JSON瑙ｆ瀽澶辫触:", e.message);
        parsed = [];
      }

      // 鏀寔鏁扮粍鏍煎紡鍜寋shots: [...]}鏍煎紡
      const shotsArray = Array.isArray(parsed) ? parsed : (parsed.shots || []);

      if (shotsArray.length > 0) {
        const newShots = shotsArray.map((sh, i) => ({
          id: "shot_" + Date.now() + "_" + i,
          shotIndex: sh.shotIndex || i + 1,
          episodeId: selectedEp || null,
          title: sh.title || "闀滃ご" + (i + 1),
          sceneDesc: sh.sceneDesc || "",
          sceneType: sh.sceneType || "涓櫙",
          cameraMove: sh.cameraMove || "鍥哄畾",
          lighting: "鑷劧鍏?,
          emotion: "姝ｅ父",
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
        log("鑷姩鎷嗗垎瀹屾垚锛? + newShots.length + " 涓暅澶?);
        // 绉垎鎵ｅ噺锛堝垎闀滄媶鍒嗭級
        if (isLoggedIn()) {
          try {
                        log("鉁?鍒嗛暅鎷嗗垎璐圭敤宸茬敱鍚庣鎸夊疄闄呮垚鏈墸鍑?);
            try {
              const balanceData = await getCreditBalance();
              if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
            if (window.refreshUserInfo) window.refreshUserInfo();
            } catch (e) {}
          } catch (e) {
            log(`鈿狅笍 浣欓鍒锋柊澶辫触锛?{e.message}`);
          }
        }
      } else {
        log("鏈兘鑷姩鎷嗗垎锛岃妫€鏌ュ墽鏈唴瀹?);
      }
    } catch (e) {
      log("鑷姩鎷嗗垎澶辫触锛? + e.message);
    } finally {
      setAutoSplitting(false);
    }
  };

  // 鍦ㄦ寚瀹氬垎闀滀箣鍚庢彃鍏ヨ繃娓″垎闀滐紙鏀寔浠绘剰浣嶇疆鎻掑叆锛?  const insertShotAfter = (sh) => {
    const all = shots;
    const idx = all.findIndex(s => s.id === sh.id);
    if (idx < 0) { log("鈿狅笍 鏈壘鍒扮洰鏍囧垎闀?); return; }
    const newShot = {
      id: "shot_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      shotIndex: 0,
      episodeId: sh.episodeId || selectedEp || null,
      title: "杩囨浮鍒嗛暅",
      sceneDesc: "",
      sceneType: "涓櫙",
      cameraMove: "鍥哄畾",
      lighting: "鑷劧鍏?,
      emotion: "姝ｅ父",
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
    // 鎸夋柊椤哄簭閲嶆帓 shotIndex
    update({ shots: next.map((s, i) => ({ ...s, shotIndex: i + 1 })) });
    setEditingShotId(newShot.id);
    setEditContent("");
    log("鉁?宸插湪銆? + sh.title + "銆嶅悗鎻掑叆杩囨浮鍒嗛暅锛屽彲鐩存帴缂栬緫鎻忚堪");
  };

  const firstEpId = project?.episodes?.[0]?.id;
  const currentShots = selectedEp
    ? shots.filter(s => {
        // 鍏煎鏃ф暟鎹細娌℃湁episodeId鐨勫垎闀滈粯璁ゅ綊鍒扮涓€闆?        const epId = s.episodeId || firstEpId;
        return epId === selectedEp;
      })
    : shots;

  return (
    <div style={{ padding: 16, height: "100%", overflow: "auto", color: "var(--text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>馃摑 鍒嗛暅涓庣敓鍥?/h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, cursor: "pointer" }}
            title="閫夋嫨鐢熷浘椋庢牸"
          >
            {STYLE_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={selectedAspectRatio}
            onChange={(e) => setSelectedAspectRatio(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, cursor: "pointer" }}
            title="閫夋嫨鐢婚潰姣斾緥"
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
            {autoSplitting ? "鎷嗗垎涓?.." : `馃 鎷嗗垎褰撳墠闆嗭紙${getPrice("llm_storyboard_split", 3.0)}绉垎锛塦}
          </button>
        </div>
      </div>

      {project.episodes && project.episodes.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>鎸夐泦绛涢€夛細</div>
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
            馃搫 褰撳墠闆嗗墽鏈唴瀹癸紙鐐瑰嚮涓婃柟銆屾媶鍒嗗綋鍓嶉泦銆嶇敓鎴愬垎闀滐級
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap" }}>
            {(project.episodes || []).find(ep => ep.id === selectedEp)?.content || "鏆傛棤鍓ф湰鍐呭"}
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
                  <span style={{ fontSize: 32 }}>馃幀</span>
                )}
                <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.7)", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fff" }}>
                  {sh.sceneType || "涓櫙"}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{sh.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {sh.sceneType} 路 {sh.cameraMove} 路 {sh.duration || 5}绉?                </div>
                {editingShotId === sh.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{ width: "100%", minHeight: 80, padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => { update({ shots: shots.map(s => s.id === sh.id ? { ...s, sceneDesc: editContent } : s) }); setEditingShotId(null); log("宸叉洿鏂伴暅澶存弿杩?); }} style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "var(--primary, #7a5cff)", color: "#fff", cursor: "pointer", fontSize: 12 }}>淇濆瓨</button>
                      <button onClick={() => setEditingShotId(null)} style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>鍙栨秷</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 8, lineHeight: 1.5 }}>
                    {sh.sceneDesc || sh.desc || "鏃犳弿杩?}
                  </div>
                )}
                {sh.dialogue && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(122,92,255,0.1)", borderRadius: 6, fontSize: 12, fontStyle: "italic" }}>
                    {sh.dialogue}
                  </div>
                )}
                {sh.characters && sh.characters.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    浜虹墿锛歿sh.characters.join("銆?)}
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
                {busy === sh.id ? "鐢熸垚涓€? : `馃帹 鐢熸垚鍒嗛暅鍥?(${getPrice("image_generate", 3.0)}绉垎)`}
              </button>
              <button
                style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                onClick={() => {
                  setEditingShotId(sh.id);
                  setEditContent(sh.sceneDesc || "");
                }}
              >
                鉁忥笍 缂栬緫
              </button>
              <button
                style={{ padding: "6px 12px", border: "1px dashed var(--border)", borderRadius: 6, background: "transparent", color: "var(--primary, #7a5cff)", cursor: "pointer", fontSize: 12 }}
                onClick={() => insertShotAfter(sh)}
                title="鍦ㄦ鍒嗛暅鍚庢彃鍏ヤ竴涓繃娓″垎闀?
              >
                鉃?鎻掑叆鍒嗛暅
              </button>
              <button
                style={{ padding: "6px 12px", border: "1px solid #ef4444", borderRadius: 6, background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
                onClick={() => {
                  if (window.confirm("鍒犻櫎姝ら暅澶达紵")) {
                    update({ shots: shots.filter(s => s.id !== sh.id) });
                    log("宸插垹闄ら暅澶达細" + sh.title);
                  }
                }}
              >
                馃棏 鍒犻櫎
              </button>
            </div>
          </div>
        ))}

        {currentShots.length > 0 && scenes.filter((s, idx) => {
          // 澶氱鏂瑰紡鍖归厤episodeId
          let epId = s.episodeId;
          if (!epId) {
            // 鏂瑰紡1锛氭寜title鍖归厤
            const matchedByTitle = (project.episodes || []).find(ep => ep.title === s.title);
            if (matchedByTitle) epId = matchedByTitle.id;
          }
          if (!epId) {
            // 鏂瑰紡2锛氭寜绱㈠紩鍖归厤
            if (project.episodes && project.episodes[idx]) epId = project.episodes[idx].id;
          }
          const matchesEpisode = !selectedEp || epId === selectedEp;
          const notInShots = !shots.some(sh => sh.title === s.title);
          return matchesEpisode && notInShots;
        }).map(sc => (
          <div key={sc.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel-2)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 120, height: 160, background: "var(--input-bg)", borderRadius: 8, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {sc.imageUrl ? <img src={sc.imageUrl} alt={sc.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 32 }}>馃幀</span>}
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
                      <button onClick={() => { update({ scenes: scenes.map(s => s.id === sc.id ? { ...s, desc: editSceneDesc } : s) }); setEditingSceneId(null); log("宸叉洿鏂板垎闆嗗唴瀹?); }} style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "var(--primary, #7a5cff)", color: "#fff", cursor: "pointer", fontSize: 12 }}>淇濆瓨</button>
                      <button onClick={() => setEditingSceneId(null)} style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>鍙栨秷</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{sc.desc || "鏃犳弿杩?}</div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => genSceneImage(sc)} disabled={busy === sc.id}>
                {busy === sc.id ? "鐢熸垚涓€? : "馃帹 鐢熸垚鍒嗛暅鍥?(3绉垎)"}
              </button>
              <button style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => { setEditingSceneId(sc.id); setEditSceneDesc(sc.desc || ""); }}>
                鉁忥笍 缂栬緫鍐呭
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


