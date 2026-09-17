import React, { useState } from "react";


// 常用设置项
const DEFAULT_SETTINGS = {
  autoSave: true,
  autoSaveInterval: 30, // 秒
  defaultResolution: "768p竖",
  defaultDuration: 5, // 秒
  defaultVideoMode: "I2V",
  generateQuality: "standard", // standard/high
  showGenerateLog: true,
  autoAddToAssets: true,
  notificationSound: true,
  language: "zh-CN",
  downloadDir: "",
};

export function CustomSettingsDialog({ open, onClose, theme, onThemeChange, appName }) {
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("APP_SETTINGS");
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  if (!open) return null;

  const updateSetting = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      localStorage.setItem("APP_SETTINGS", JSON.stringify(newSettings));
    } catch {}
  };


  const tabs = [
    { id: "general", label: "常用设置", icon: "⚙️" },
    { id: "about", label: "关于我们", icon: "ℹ️" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={() => onClose()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          overflow: "hidden",
          background: "var(--panel, #1a1a2e)",
          border: "1px solid var(--border, rgba(255,255,255,0.1))",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))",
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--text, #fff)" }}>
            ⚙️ {appName || "设置"}
          </h2>
          <button
            onClick={() => onClose()}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #888)",
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* 标签栏 */}
        <div style={{
          display: "flex",
          gap: 4,
          padding: "12px 24px",
          borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))",
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 8,
                background: activeTab === tab.id
                  ? "var(--accent, #7c3aed)"
                  : "transparent",
                color: activeTab === tab.id ? "#fff" : "var(--text-muted, #888)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: "all 0.2s",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {/* 常用设置 */}
          {activeTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SettingToggle
                label="自动保存"
                desc="编辑时自动保存项目到本地"
                checked={settings.autoSave}
                onChange={(v) => updateSetting("autoSave", v)}
              />
              {settings.autoSave && (
                <SettingSelect
                  label="自动保存间隔"
                  desc="自动保存的时间间隔（秒）"
                  value={settings.autoSaveInterval}
                  options={[
                    { value: 15, label: "15秒" },
                    { value: 30, label: "30秒" },
                    { value: 60, label: "1分钟" },
                    { value: 120, label: "2分钟" },
                  ]}
                  onChange={(v) => updateSetting("autoSaveInterval", Number(v))}
                />
              )}
              <SettingSelect
                label="默认视频分辨率"
                desc="新生成视频时的默认分辨率"
                value={settings.defaultResolution}
                options={[
                  { value: "480p竖", label: "480p 竖屏" },
                  { value: "768p竖", label: "768p 竖屏" },
                  { value: "1080p竖", label: "1080p 竖屏" },
                  { value: "480p横", label: "480p 横屏" },
                  { value: "768p横", label: "768p 横屏" },
                  { value: "1080p横", label: "1080p 横屏" },
                ]}
                onChange={(v) => updateSetting("defaultResolution", v)}
              />
              <SettingSelect
                label="默认视频时长"
                desc="新生成视频时的默认时长（秒）"
                value={settings.defaultDuration}
                options={[
                  { value: 3, label: "3秒" },
                  { value: 5, label: "5秒" },
                  { value: 8, label: "8秒" },
                  { value: 10, label: "10秒" },
                ]}
                onChange={(v) => updateSetting("defaultDuration", Number(v))}
              />
              <SettingSelect
                label="默认视频模式"
                desc="新生成视频时的默认模式"
                value={settings.defaultVideoMode}
                options={[
                  { value: "T2V", label: "T2V 纯文本" },
                  { value: "I2V", label: "I2V 图生视频" },
                  { value: "R2V", label: "R2V 首尾帧" },
                  { value: "IA2V", label: "IA2V 全能参考" },
                ]}
                onChange={(v) => updateSetting("defaultVideoMode", v)}
              />
              <SettingToggle
                label="显示生成日志"
                desc="生成视频时显示详细日志信息"
                checked={settings.showGenerateLog}
                onChange={(v) => updateSetting("showGenerateLog", v)}
              />
              <SettingToggle
                label="自动存入素材库"
                desc="生成的内容自动存入素材库"
                checked={settings.autoAddToAssets}
                onChange={(v) => updateSetting("autoAddToAssets", v)}
              />
              <SettingToggle
                label="通知提示音"
                desc="生成完成时播放提示音"
                checked={settings.notificationSound}
                onChange={(v) => updateSetting("notificationSound", v)}
              />
              <SettingDirPicker
                label="下载保存目录"
                desc="视频 / 图片 / 配音等下载文件的保存位置（不设置则保存到系统「下载」目录）"
                value={settings.downloadDir || ""}
                onChange={(v) => updateSetting("downloadDir", v)}
              />
              <SettingSelect
                label="语言"
                desc="界面显示语言"
                value={settings.language}
                options={[
                  { value: "zh-CN", label: "简体中文" },
                  { value: "en-US", label: "English" },
                ]}
                onChange={(v) => updateSetting("language", v)}
              />
            </div>
          )}

          {/* 关于我们 */}
          {activeTab === "about" && (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 20, color: "var(--text, #fff)" }}>
                烬序·影墟
              </h3>
              <div style={{ fontSize: 12, color: "var(--accent-2, #5CE1E6)", marginBottom: 16 }}>
                版本 v0.3.0 · AI短剧全流程生成平台
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary, #8b95a7)", lineHeight: 1.8, maxWidth: 500, margin: "0 auto 20px" }}>
                烬序·影墟是一款面向竖屏短剧创作的AI全流程桌面工具，
                帮助创作者从剧本上传或AI生成出发，自动完成分集剧本、分镜拆分、
                分镜生图、角色管理、AI配音、视频生成、3D导演台、素材库管理、
                剪辑成片到导出的完整工作流。
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 8,
                maxWidth: 400,
                margin: "0 auto",
                textAlign: "left",
              }}>
                <div style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>品牌：烬序 JINSU</div>
                <div style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>官网：jinsuai.cn</div>
                <div style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>技术栈：Tauri + React</div>
                <div style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>更新日期：2026-08-24</div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "12px 24px",
          borderTop: "1px solid var(--border, rgba(255,255,255,0.1))",
        }}>
          <button
            onClick={() => onClose()}
            style={{
              padding: "8px 24px",
              border: "none",
              borderRadius: 8,
              background: "var(--accent, #7c3aed)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

// 设置项：开关
function SettingToggle({ label, desc, checked, onChange }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 16px",
      background: "var(--panel-2, #15152a)",
      borderRadius: 8,
    }}>
      <div>
        <div style={{ fontSize: 13, color: "var(--text, #fff)", fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted, #888)", marginTop: 2 }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: "none",
          background: checked ? "var(--accent, #7c3aed)" : "var(--border, #333)",
          cursor: "pointer",
          position: "relative",
          transition: "all 0.2s",
        }}
      >
        <div style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          transition: "all 0.2s",
        }} />
      </button>
    </div>
  );
}

// 设置项：下拉选择
function SettingSelect({ label, desc, value, options, onChange }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 16px",
      background: "var(--panel-2, #15152a)",
      borderRadius: 8,
    }}>
      <div style={{ flex: 1, marginRight: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text, #fff)", fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted, #888)", marginTop: 2 }}>{desc}</div>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 12px",
          border: "1px solid var(--border, rgba(255,255,255,0.1))",
          borderRadius: 6,
          background: "var(--input-bg, #0f141e)",
          color: "var(--text, #fff)",
          fontSize: 12,
          cursor: "pointer",
          minWidth: 120,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// 设置项：下载目录选择（Tauri 目录选择器 + 手动输入 + 恢复默认）
function SettingDirPicker({ label, desc, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const pickDir = async () => {
    try {
      const mod = await import("@tauri-apps/plugin-dialog");
      const dir = await mod.open({ directory: true, multiple: false, title: "选择下载保存目录" });
      if (typeof dir === "string" && dir) {
        onChange(dir);
        setDraft(dir);
        setEditing(false);
      }
    } catch (e) {
      console.warn("[Settings] 打开目录选择器失败:", e);
      alert("目录选择器不可用，请直接手动输入目录路径。\n\n(" + String((e && e.message) || e) + ")");
      setEditing(true);
    }
  };
  const submitDraft = () => {
    onChange((draft || "").trim());
    setEditing(false);
  };
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 16px",
      background: "var(--panel-2, #15152a)",
      borderRadius: 8,
      flexWrap: "wrap",
      gap: 8,
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, color: "var(--text, #fff)", fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted, #888)", marginTop: 2 }}>{desc}</div>}
        {value && !editing && (
          <div style={{ fontSize: 11, color: "var(--accent-2, #5CE1E6)", marginTop: 4, wordBreak: "break-all" }}>
            📁 {value}
          </div>
        )}
        {!value && !editing && (
          <div style={{ fontSize: 11, color: "var(--text-muted, #666)", marginTop: 4 }}>未设置（保存到系统「下载」目录）</div>
        )}
        {editing && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="例如 D:\\Downloads"
              style={{
                flex: 1,
                padding: "6px 10px",
                border: "1px solid var(--border, rgba(255,255,255,0.1))",
                borderRadius: 6,
                background: "var(--input-bg, #0f141e)",
                color: "var(--text, #fff)",
                fontSize: 12,
              }}
            />
            <button onClick={submitDraft} style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "var(--accent, #7c3aed)", color: "#fff", cursor: "pointer", fontSize: 12 }}>确定</button>
            <button onClick={() => setEditing(false)} style={{ padding: "6px 12px", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 6, background: "transparent", color: "var(--text-muted, #888)", cursor: "pointer", fontSize: 12 }}>取消</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={pickDir}
          style={{
            padding: "6px 14px",
            border: "1px solid var(--border, rgba(255,255,255,0.15))",
            borderRadius: 6,
            background: "var(--input-bg, #0f141e)",
            color: "var(--text, #fff)",
            cursor: "pointer",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          📂 选择目录
        </button>
        <button
          onClick={() => { onChange(""); setDraft(""); setEditing(false); }}
          style={{
            padding: "6px 10px",
            border: "1px solid var(--border, rgba(255,255,255,0.1))",
            borderRadius: 6,
            background: "transparent",
            color: "var(--text-muted, #888)",
            cursor: "pointer",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
          title="恢复为系统「下载」目录"
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}

export default CustomSettingsDialog;
