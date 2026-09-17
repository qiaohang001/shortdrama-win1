import React, { useEffect } from "react";
import { downloadUrl, saveBlob } from "../utils.js";
// 悬浮查看原图：点击缩略图后全屏浮层展示原图（解决「生成图看不清」）。
// 用法：父组件持有 lightboxSrc 状态，<ImageLightbox src={...} alt={...} onClose={...} log={...} />
export function ImageLightbox({ src, alt, onClose, log }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 下载原图（使用fetch+Blob，避免打开浏览器/系统图片查看器）
  const handleDownload = async () => {
    if (!src) return;
    const filename = (alt || "image") + ".png";
    // 对于blob:或data:开头的URL，直接下载
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        await saveBlob(filename, blob, { log });
      } catch (e) {
        if (log) log(`❌ 下载失败：${String((e && e.message) || e)}`);
        else alert("下载失败：" + e.message);
      }
    } else {
      // 远程URL用downloadUrl（fetch+Blob）
      const success = await downloadUrl(src, filename, { log });
      if (!success) {
        if (confirm("直接下载失败，是否在浏览器中打开？")) {
          window.open(src, "_blank");
        }
      }
    }
  };

  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(6,8,16,0.86)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", maxWidth: "92vw", maxHeight: "92vh", display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <img
          src={src}
          alt={alt || ""}
          style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 12px 48px rgba(0,0,0,0.6)", background: "#000" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            onClick={handleDownload}
            style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent-gradient, linear-gradient(135deg,#7c3aed,#3b82f6))", color: "#fff", fontSize: 13, border: "none", cursor: "pointer", fontWeight: 600 }}
          >⬇ 下载原图</button>
          <button
            onClick={onClose}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#e8ecf3", fontSize: 13, cursor: "pointer" }}
          >✕ 关闭（Esc）</button>
        </div>
        {alt && <div style={{ color: "var(--text-secondary,#8b95a7)", fontSize: 12, marginTop: 8, textAlign: "center" }}>{alt}</div>}
      </div>
    </div>
  );
}
