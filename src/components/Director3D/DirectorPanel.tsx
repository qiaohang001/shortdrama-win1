import { useState } from 'react';
import { api } from '../../dispatch-jobs.js';
import { isLoggedIn } from '../../utils/backend-api.js';
import { saveBlob } from '../../utils.js';
import {
  User,
  Box,
  Camera,
  Settings,
  Plus,
  Trash2,
  Move,
  Eye,
  Download,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useDirectorStore } from './store';
import { ASPECT_RATIOS, CAMERA_MOVEMENTS, CHARACTER_TEMPLATES, SCENE_TEMPLATES } from './types';

function PanelHeader({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: any;
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid #2a2a3a', marginBottom: '8px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          cursor: 'pointer',
          background: '#1a1a2e',
        }}
      >
        {open ? (
          <ChevronDown size={14} style={{ marginRight: 6 }} />
        ) : (
          <ChevronRight size={14} style={{ marginRight: 6 }} />
        )}
        <Icon size={14} style={{ marginRight: 6, color: '#4facfe' }} />
        <span style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>
          {title}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontSize: '11px',
              background: '#2a2a4a',
              padding: '1px 6px',
              borderRadius: '8px',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {open && <div style={{ padding: '8px 12px' }}>{children}</div>}
    </div>
  );
}

function Vector3Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  onChange: (v: { x: number; y: number; z: number }) => void;
}) {
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} style={{ flex: 1 }}>
            <input
              type="number"
              step={0.1}
              value={value[axis]}
              onChange={(e) =>
                onChange({ ...value, [axis]: parseFloat(e.target.value) || 0 })
              }
              style={{
                width: '100%',
                background: '#0f0f1a',
                border: '1px solid #2a2a3a',
                borderRadius: '4px',
                padding: '3px 4px',
                color: '#fff',
                fontSize: '11px',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}


// 轮询后端 3D 任务直到完成，返回模型 URL（扣分统一在后端）
async function poll3DTask(taskId: string, timeoutMs = 600000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    let t: any;
    try { t = await api(`/api/3d/task/${taskId}`); } catch (e) { continue; }
    if (t.status === "SUCCEEDED") return t.model_url || "";
    if (t.status === "FAILED") throw new Error(t.error || "3D 生成失败");
  }
  throw new Error("3D 生成超时");
}

export function DirectorPanel({ project, update, log }: { project?: any; update?: (key: string, value: any) => void; log?: (message: string) => void }) {
  const [sceneList, setSceneList] = useState<{name: string; description: string}[]>([]);
  const [extractingScenes, setExtractingScenes] = useState(false);
  const [generatingSceneImg, setGeneratingSceneImg] = useState(false);
  const [generatingScene3D, setGeneratingScene3D] = useState(false);
  const [selectedSceneTemplate, setSelectedSceneTemplate] = useState<string>('empty');
  const [showImportCharModal, setShowImportCharModal] = useState(false);
  const {
    characters,
    props,
    cameras,
    activeCameraId,
    selectedCharacterId,
    selectedPropId,
    scene,
    showGrid,
    addCharacter,
    updateCharacter,
    removeCharacter,
    selectCharacter,
    addProp,
    updateProp,
    removeProp,
    selectProp,
    addCamera,
    updateCamera,
    removeCamera,
    setActiveCamera,
    updateScene,
    applySceneTemplate,
    toggleGrid,
    exportScene,
    exportCameraReference,
  } = useDirectorStore();

  const selectedChar = characters.find((c) => c.id === selectedCharacterId);
  const selectedPropItem = props.find((p) => p.id === selectedPropId);
  const activeCamera = cameras.find((c) => c.id === activeCameraId);

  const handleAddCameraFromView = () => {
    // 从当前视角添加机位（简化版，用默认位置）
    addCamera(
      { x: 8, y: 6, z: 8 },
      { x: 0, y: 1, z: 0 }
    );
  };

  return (
    <div
      style={{
        width: '280px',
        height: '100%',
        background: '#12121f',
        borderRight: '1px solid #2a2a3a',
        overflowY: 'auto',
        color: '#fff',
      }}
    >
      {/* 顶部标题 */}
      <div
        style={{
          padding: '12px',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          fontWeight: 700,
          fontSize: '14px',
        }}
      >
        🎬 3D 导演台
      </div>

      {/* 角色管理 */}
      <PanelHeader icon={User} title="角色" count={characters.length}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            onClick={() => addCharacter()}
            style={{
              flex: 1,
              padding: '6px',
              background: '#2a2a4a',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Plus size={12} /> 添加
          </button>
          <button
            onClick={() => {
              const projectChars = project?.materials?.characters || project?.characters || project?.outline?.characters || [];
              if (projectChars.length === 0) {
                log?.('项目中没有角色，请先在人物管理中添加角色');
                alert('项目中没有角色，请先在人物管理中添加角色');
                return;
              }
              setShowImportCharModal(true);
            }}
            style={{
              flex: 1,
              padding: '6px',
              background: 'linear-gradient(135deg, #7A5CFF, #5CE1E6)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            📥 导入角色
          </button>
        </div>
        {characters.map((c) => (
          <div
            key={c.id}
            onClick={() => selectCharacter(c.id)}
            style={{
              padding: '6px 8px',
              background:
                selectedCharacterId === c.id ? '#2a3a5a' : '#1a1a2e',
              borderRadius: '4px',
              marginBottom: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: c.color,
              }}
            />
            <span style={{ fontSize: '12px', flex: 1 }}>{c.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeCharacter(c.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#f5576c',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {selectedChar && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px',
              background: '#0f0f1a',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '6px' }}>
              编辑：{selectedChar.name}
            </div>
            <input
              type="text"
              value={selectedChar.name}
              onChange={(e) =>
                updateCharacter(selectedChar.id, { name: e.target.value })
              }
              style={{
                width: '100%',
                background: '#0f0f1a',
                border: '1px solid #2a2a3a',
                borderRadius: '4px',
                padding: '4px',
                color: '#fff',
                fontSize: '11px',
                marginBottom: '6px',
              }}
            />
            <Vector3Input
              label="位置"
              value={selectedChar.position}
              onChange={(v) => updateCharacter(selectedChar.id, { position: v })}
            />
            <Vector3Input
              label="旋转"
              value={selectedChar.rotation}
              onChange={(v) => updateCharacter(selectedChar.id, { rotation: v })}
            />
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                缩放: {selectedChar.scale.toFixed(1)}
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={selectedChar.scale}
                onChange={(e) =>
                  updateCharacter(selectedChar.id, {
                    scale: parseFloat(e.target.value),
                  })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                人物模板
              </div>
              <select
                value={selectedChar.template || 'male_standard'}
                onChange={(e) => {
                  const tpl = CHARACTER_TEMPLATES.find(t => t.value === e.target.value);
                  // 根据模板设置所有相关属性，让人物有明显区别
                  const templateConfig: any = {
                    male_standard: { scale: 1.0, color: '#4a90d9', outfit: '#2c3e50', hairColor: '#2d1810' },
                    female_standard: { scale: 0.92, color: '#e8a0bf', outfit: '#c0392b', hairColor: '#4a2c1a' },
                    male_athletic: { scale: 1.1, color: '#d4a574', outfit: '#1a1a2e', hairColor: '#1a1a1a' },
                    female_elegant: { scale: 0.88, color: '#f5c6d6', outfit: '#8e44ad', hairColor: '#1a1a1a' },
                    child: { scale: 0.65, color: '#ffd93d', outfit: '#6bcb77', hairColor: '#4a2c1a' },
                  };
                  const config = templateConfig[e.target.value] || templateConfig.male_standard;
                  updateCharacter(selectedChar.id, { 
                    template: e.target.value as any, 
                    gender: tpl?.gender || 'male',
                    scale: config.scale,
                    color: config.color,
                    outfit: config.outfit,
                    hairColor: config.hairColor,
                  });
                }}
                style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px' }}
              >
                {CHARACTER_TEMPLATES.map(t => (
                  <option key={t.value} value={t.value}>{t.label} - {t.desc}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                服装颜色
              </div>
              <input
                type="color"
                value={selectedChar.outfit || selectedChar.color}
                onChange={(e) => updateCharacter(selectedChar.id, { outfit: e.target.value })}
                style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                发色
              </div>
              <input
                type="color"
                value={selectedChar.hairColor || '#2d1810'}
                onChange={(e) => updateCharacter(selectedChar.id, { hairColor: e.target.value })}
                style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                颜色（备用）
              </div>
              <input
                type="color"
                value={selectedChar.color}
                onChange={(e) => updateCharacter(selectedChar.id, { color: e.target.value })}
                style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
              />
            </div>
            {/* 3D模型上传 */}
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2a2a3a' }}>
              <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '6px', fontWeight: 600 }}>
                🎲 3D人物模型
              </div>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>
                当前：{selectedChar.modelType === 'custom' ? '自定义模型' : '程序化模型'}
              </div>
              <input
                type="file"
                accept=".glb,.gltf,.obj"
                style={{ display: 'none' }}
                id={`char-model-${selectedChar.id}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    updateCharacter(selectedChar.id, { modelUrl: url, modelType: 'custom' });
                  }
                }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => document.getElementById(`char-model-${selectedChar.id}`)?.click()}
                  style={{ flex: 1, padding: '5px', background: '#2a4a6a', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
                >
                  📁 上传模型
                </button>
                {selectedChar.modelType === 'custom' && (
                  <button
                    onClick={() => updateCharacter(selectedChar.id, { modelUrl: undefined, modelType: 'procedural' })}
                    style={{ padding: '5px 8px', background: '#4a2a2a', border: 'none', borderRadius: '4px', color: '#f5576c', cursor: 'pointer', fontSize: '11px' }}
                  >
                    清除
                  </button>
                )}
              </div>
              <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>
                支持 GLB / GLTF / OBJ 格式
              </div>
            </div>

            {/* 人物四视图生成 + 3D模型生成 */}
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2a2a3a' }}>
              <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '6px', fontWeight: 600 }}>
                🎨 AI生成四视图 + 3D模型
              </div>

              {/* 四视图显示 */}
              {selectedChar.fourViews && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                  {['front', 'left', 'back', 'right'].map((view) => (
                    <div key={view} style={{ position: 'relative', aspectRatio: '1', background: '#0f0f1a', borderRadius: '4px', overflow: 'hidden', border: '1px solid #2a2a3a' }}>
                      {selectedChar.fourViews?.[view] ? (
                        <img src={selectedChar.fourViews[view]} alt={view} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#555' }}>
                          {view === 'front' ? '正面' : view === 'left' ? '左面' : view === 'back' ? '后面' : '右面'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 角色参考图显示 */}
              {selectedChar.imageUrl && (
                <div style={{ marginBottom: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>角色参考图（从人物管理导入）</div>
                  <img src={selectedChar.imageUrl} alt="角色参考图" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #2a2a3a' }} />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  onClick={async () => {
                    if (!selectedChar) return;
                    // 未登录用户不能使用
                    if (!isLoggedIn()) {
                      alert("请先登录后再使用3D四视图生成功能");
                      return;
                    }
                    try {
                      const hasRefImage = !!selectedChar.imageUrl;
                      const charDesc = `动漫风格角色，角色「${selectedChar.name}」，${selectedChar.outfit || "日常服装"}，${selectedChar.hairColor ? `发色${selectedChar.hairColor}` : "黑色头发"}`;
                      log?.(`正在为「${selectedChar.name}」生成四视图${hasRefImage ? '（参考角色图）' : ''}...`);
                      const views = [
                        { key: "front", label: "正面全身照，正视角，纯色背景" },
                        { key: "left", label: "左侧全身照，左90度视角，纯色背景" },
                        { key: "back", label: "背面全身照，背视角，纯色背景" },
                        { key: "right", label: "右侧全身照，右90度视角，纯色背景" },
                      ];
                      const fourViews: any = {};
                      for (const v of views) {
                        const imgRes = await api("/api/image/generate", {
                          method: "POST",
                          body: JSON.stringify({ prompt: `${charDesc}，${v.label}`, model: "Qwen/Qwen-Image", n: 1 }),
                        });
                        if (!imgRes?.image_url) throw new Error("四视图图片生成失败");
                        fourViews[v.key] = imgRes.image_url;
                      }
                      updateCharacter(selectedChar.id, { fourViews });
                      log?.(`「${selectedChar.name}」四视图生成完成${hasRefImage ? '（参考角色图）' : ''}`);
                    } catch (e: any) {
                      log?.(`四视图生成失败: ${e.message}`);
                    }
                  }}
                  style={{ width: '100%', padding: '6px', background: selectedChar.imageUrl ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #7A5CFF, #5CE1E6)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
                >
                  {selectedChar.imageUrl ? '🎨 参考图生成四视图（8积分）' : '🎨 生成角色四视图（8积分）'}
                </button>

                <button
                  disabled={!selectedChar.fourViews?.front}
                  onClick={async () => {
                    if (!selectedChar?.fourViews?.front) return;
                    // 未登录用户不能使用
                    if (!isLoggedIn()) {
                      alert("请先登录后再使用3D模型生成功能");
                      return;
                    }
                    try {
                      log?.(`正在为「${selectedChar.name}」生成3D模型...`);
                      const desc = `动漫角色「${selectedChar.name}」，${selectedChar.outfit || "日常服装"}，${selectedChar.hairColor ? `发色${selectedChar.hairColor}` : "黑色头发"}`;
                      const genBody: any = { prompt: desc, kind: "character" };
                      if (selectedChar.fourViews?.front) genBody.image_url = selectedChar.fourViews.front; // 有正面图优先图生3D
                      const gen = await api("/api/3d/generate", { method: "POST", body: JSON.stringify(genBody) });
                      if (!gen || !gen.task_id) throw new Error((gen && gen.detail) || "3D 任务创建失败");
                      const modelUrl = await poll3DTask(gen.task_id);
                      if (!modelUrl) throw new Error("未返回模型URL");
                      updateCharacter(selectedChar.id, { modelUrl, modelType: 'ai-generated' });
                      log?.(`「${selectedChar.name}」3D模型生成完成`);
                    } catch (e: any) {
                      log?.(`3D模型生成失败: ${e.message}`);
                    }
                  }}
                  style={{ width: '100%', padding: '6px', background: selectedChar.fourViews?.front ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: selectedChar.fourViews?.front ? 'pointer' : 'not-allowed', fontSize: '11px' }}
                >
                  🎲 生成3D模型（30积分，Tripo-H3.1）
                </button>
              </div>
              <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>
                先生成四视图，再生成3D模型
              </div>
            </div>
          </div>
        )}
      </PanelHeader>

      {/* 道具管理 */}
      <PanelHeader icon={Box} title="道具" count={props.length}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
          {(['box', 'sphere', 'cylinder', 'plane'] as const).map((type) => (
            <button
              key={type}
              onClick={() => addProp(type)}
              style={{
                padding: '5px',
                background: '#2a2a4a',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              + {type}
            </button>
          ))}
        </div>
        {props.map((p) => (
          <div
            key={p.id}
            onClick={() => selectProp(p.id)}
            style={{
              padding: '6px 8px',
              background: selectedPropId === p.id ? '#2a3a5a' : '#1a1a2e',
              borderRadius: '4px',
              marginBottom: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Box size={12} color={p.color} />
            <span style={{ fontSize: '12px', flex: 1 }}>{p.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeProp(p.id);
              }}
              style={{ background: 'none', border: 'none', color: '#f5576c', cursor: 'pointer', padding: 0 }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {selectedPropItem && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#0f0f1a', borderRadius: '4px' }}>
            <Vector3Input
              label="位置"
              value={selectedPropItem.position}
              onChange={(v) => updateProp(selectedPropItem.id, { position: v })}
            />
            <Vector3Input
              label="缩放"
              value={selectedPropItem.scale}
              onChange={(v) => updateProp(selectedPropItem.id, { scale: v })}
            />
          </div>
        )}
      </PanelHeader>

      {/* 机位管理 */}
      <PanelHeader icon={Camera} title="机位" count={cameras.length}>
        <button
          onClick={handleAddCameraFromView}
          style={{
            width: '100%',
            padding: '6px',
            background: '#2a2a4a',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <Camera size={12} /> 从当前视角新增机位
        </button>
        {cameras.map((cam) => (
          <div
            key={cam.id}
            onClick={() => setActiveCamera(cam.id)}
            style={{
              padding: '6px 8px',
              background: activeCameraId === cam.id ? '#3a3a1a' : '#1a1a2e',
              borderRadius: '4px',
              marginBottom: '4px',
              cursor: 'pointer',
              border: activeCameraId === cam.id ? '1px solid #ffd700' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Camera size={12} color={activeCameraId === cam.id ? '#ffd700' : '#888'} />
              <span style={{ fontSize: '12px', flex: 1 }}>{cam.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeCamera(cam.id);
                }}
                style={{ background: 'none', border: 'none', color: '#f5576c', cursor: 'pointer', padding: 0 }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
              {cam.aspect} · {CAMERA_MOVEMENTS.find((m) => m.value === cam.movement)?.label}
            </div>
          </div>
        ))}
        {activeCamera && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#0f0f1a', borderRadius: '4px' }}>
            <div style={{ fontSize: '11px', color: '#ffd700', marginBottom: '6px' }}>
              编辑机位：{activeCamera.name}
            </div>
            <input
              type="text"
              value={activeCamera.name}
              onChange={(e) => updateCamera(activeCamera.id, { name: e.target.value })}
              style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px', marginBottom: '6px' }}
            />
            <Vector3Input
              label="机位位置"
              value={activeCamera.position}
              onChange={(v) => updateCamera(activeCamera.id, { position: v })}
            />
            <Vector3Input
              label="注视点"
              value={activeCamera.target}
              onChange={(v) => updateCamera(activeCamera.id, { target: v })}
            />
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>画幅</div>
              <select
                value={activeCamera.aspect}
                onChange={(e) => updateCamera(activeCamera.id, { aspect: e.target.value })}
                style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px' }}
              >
                {ASPECT_RATIOS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>运镜方式</div>
              <select
                value={activeCamera.movement}
                onChange={(e) => updateCamera(activeCamera.id, { movement: e.target.value as any })}
                style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px' }}
              >
                {CAMERA_MOVEMENTS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                焦距: {activeCamera.fov}°
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={activeCamera.fov}
                onChange={(e) => updateCamera(activeCamera.id, { fov: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <button
              onClick={() => {
                const ref = exportCameraReference(activeCamera.id);
                console.log('机位参考数据:', ref);
                alert('机位参考数据已输出到控制台，可对接生图/生视频API');
              }}
              style={{ width: '100%', padding: '6px', background: 'linear-gradient(135deg, #4facfe, #00f2fe)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px', marginTop: '4px' }}
            >
              📤 导出机位参考（对接生图）
            </button>
          </div>
        )}
      </PanelHeader>

      {/* 场景设置 */}
      <PanelHeader icon={Settings} title="场景设置">
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '4px', fontWeight: 600 }}>
            🏛️ 场景模板
          </div>
          <select
            value={selectedSceneTemplate}
            onChange={(e) => {
              setSelectedSceneTemplate(e.target.value);
              applySceneTemplate(e.target.value as any);
            }}
            style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '5px', color: '#fff', fontSize: '11px' }}
          >
            {SCENE_TEMPLATES.map(t => (
              <option key={t.value} value={t.value}>{t.label} - {t.desc}</option>
            ))}
          </select>
          <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>
            一键切换场景灯光氛围
          </div>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>背景色</div>
          <input
            type="color"
            value={scene.background}
            onChange={(e) => updateScene({ background: e.target.value })}
            style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>地面色</div>
          <input
            type="color"
            value={scene.groundColor}
            onChange={(e) => updateScene({ groundColor: e.target.value })}
            style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
          显示网格
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={scene.fogEnabled}
            onChange={(e) => updateScene({ fogEnabled: e.target.checked })}
          />
          场景雾效
        </label>
        {/* AI场景生成 - 完整流程 */}
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #2a2a3a' }}>
          <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '8px', fontWeight: 600 }}>
            🏞️ AI场景生成（完整流程）
          </div>

          {/* 步骤1：选择当前集 */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>① 选择当前集</div>
            <select
              value={scene.selectedEpisodeId || ''}
              onChange={(e) => { updateScene({ selectedEpisodeId: e.target.value }); setSceneList([]); }}
              style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px' }}
            >
              <option value="">请选择集数</option>
              {(project?.episodes || []).map((ep: any, i: number) => (
                <option key={ep.id} value={ep.id}>{ep.title || `第${i + 1}集`}</option>
              ))}
            </select>
          </div>

          {/* 步骤2：AI提取场景列表 */}
          <div style={{ marginBottom: '8px' }}>
            <button
              disabled={!scene.selectedEpisodeId || extractingScenes}
              onClick={async () => {
                if (!scene.selectedEpisodeId) return;
                // 未登录用户不能使用
                if (!isLoggedIn()) {
                  alert("请先登录后再使用AI提取场景功能");
                  return;
                }
                setExtractingScenes(true);
                try {
                  log?.('正在AI从剧本提取场景列表...');
                  const episode = (project?.episodes || []).find((ep: any) => ep.id === scene.selectedEpisodeId);
                  const episodeContent = episode?.content || episode?.script || '';
                  const prompt = `从以下剧本内容中提取所有故事发生的**空场景**（环境/地点），不要提取包含人物的场景。每个场景只描述环境本身，不描述人物动作或对话。

要求：
1. 只提取场景环境（地点、建筑、空间），不要提取人物场景
2. 场景描述要详细，包含：建筑结构、室内/室外、道具陈设、氛围、光线、时间（白天/夜晚）、天气等
3. 不要描述人物、人物动作、人物对话
4. 返回JSON格式：[{"name":"场景名称","description":"详细的空场景环境描述，包含建筑、道具、氛围、光影、时间、天气等，不包含人物"}]

剧本内容：
${episodeContent.substring(0, 3000)}`;
                  // 走调度机调用LLM API（qwen-turbo模型）
                  const res = await api("/api/llm/chat", {
                    method: "POST",
                    body: JSON.stringify({
                      model: "qwen-turbo",
                      messages: [{ role: "user", content: prompt }],
                      max_tokens: 8192,
                      llm_type: "scene_extract"
                    })
                  });
                  const content = res.text || "[]";
                  const parsed = JSON.parse(content);
                  const scenes = Array.isArray(parsed) ? parsed : (parsed.scenes || parsed.list || []);
                  setSceneList(scenes);
                  log?.(`提取到 ${scenes.length} 个场景`);
                } catch (e: any) {
                  log?.(`场景提取失败: ${e.message}`);
                } finally {
                  setExtractingScenes(false);
                }
              }}
              style={{ width: '100%', padding: '6px', background: scene.selectedEpisodeId && !extractingScenes ? 'linear-gradient(135deg, #10b981, #059669)' : '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: scene.selectedEpisodeId && !extractingScenes ? 'pointer' : 'not-allowed', fontSize: '11px' }}
            >
              {extractingScenes ? '提取中...' : '🤖 ② AI提取场景列表（1积分）'}
            </button>
          </div>

          {/* 步骤3：选择场景 */}
          {sceneList.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>③ 选择场景</div>
              <select
                value={scene.selectedSceneName || ''}
                onChange={(e) => {
                  const sceneItem = sceneList.find(s => s.name === e.target.value);
                  updateScene({ selectedSceneName: e.target.value, scenePrompt: sceneItem?.description || '' });
                }}
                style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px' }}
              >
                <option value="">请选择场景</option>
                {sceneList.map((s, i) => (
                  <option key={i} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 步骤4：场景提示词（可编辑） */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>④ 场景提示词（可编辑）</div>
            <textarea
              value={scene.scenePrompt || ''}
              onChange={(e) => updateScene({ scenePrompt: e.target.value })}
              placeholder="场景描述，用于生成场景概念图"
              style={{ width: '100%', background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: '4px', padding: '4px', color: '#fff', fontSize: '11px', minHeight: '50px', resize: 'vertical' }}
            />
          </div>

          {/* 步骤5：生成场景概念图 */}
          <div style={{ marginBottom: '6px' }}>
            <button
              disabled={!scene.scenePrompt || generatingSceneImg}
              onClick={async () => {
                if (!scene.scenePrompt) return;
                // 未登录用户不能使用
                if (!isLoggedIn()) {
                  alert("请先登录后再使用场景概念图生成功能");
                  return;
                }
                setGeneratingSceneImg(true);
                try {
                  log?.('正在生成场景概念图...');
                  const imgRes = await api("/api/image/generate", {
                    method: "POST",
                    body: JSON.stringify({ prompt: scene.scenePrompt, model: "Qwen/Qwen-Image", n: 1 }),
                  });
                  if (!imgRes?.image_url) throw new Error("未返回图片URL");
                  updateScene({ sceneImageUrl: imgRes.image_url });
                  log?.('场景概念图生成完成');
                } catch (e: any) {
                  log?.(`场景图生成失败: ${e.message}`);
                } finally {
                  setGeneratingSceneImg(false);
                }
              }}
              style={{ width: '100%', padding: '6px', background: scene.scenePrompt && !generatingSceneImg ? 'linear-gradient(135deg, #7A5CFF, #5CE1E6)' : '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: scene.scenePrompt && !generatingSceneImg ? 'pointer' : 'not-allowed', fontSize: '11px' }}
            >
              {generatingSceneImg ? '生成中...' : '🎨 ⑤ 生成场景概念图（3积分）'}
            </button>
          </div>

          {/* 步骤6：生成3D场景 */}
          <div style={{ marginBottom: '8px' }}>
            <button
              disabled={!scene.sceneImageUrl || generatingScene3D}
              onClick={async () => {
                if (!scene.sceneImageUrl) return;
                // 未登录用户不能使用
                if (!isLoggedIn()) {
                  alert("请先登录后再使用3D场景生成功能");
                  return;
                }
                setGeneratingScene3D(true);
                try {
                  log?.('正在生成3D场景模型...');
                  const genBody: any = { kind: "scene" };
                  if (scene.sceneImageUrl) genBody.image_url = scene.sceneImageUrl;
                  else if (scene.scenePrompt) genBody.prompt = scene.scenePrompt;
                  else throw new Error("缺少场景图或场景描述");
                  const gen = await api("/api/3d/generate", { method: "POST", body: JSON.stringify(genBody) });
                  if (!gen || !gen.task_id) throw new Error((gen && gen.detail) || "3D 任务创建失败");
                  const modelUrl = await poll3DTask(gen.task_id);
                  if (!modelUrl) throw new Error("未返回模型URL");
                  updateScene({ sceneModelUrl: modelUrl });
                  log?.('3D场景模型生成完成');
                } catch (e: any) {
                  log?.(`3D场景生成失败: ${e.message}`);
                } finally {
                  setGeneratingScene3D(false);
                }
              }}
              style={{ width: '100%', padding: '6px', background: scene.sceneImageUrl && !generatingScene3D ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#333', border: 'none', borderRadius: '4px', color: '#fff', cursor: scene.sceneImageUrl && !generatingScene3D ? 'pointer' : 'not-allowed', fontSize: '11px' }}
            >
              {generatingScene3D ? '生成中...' : '🎲 ⑥ 生成3D场景（40积分，Tripo-H3.1）'}
            </button>
          </div>

          {/* 场景图显示 */}
          {scene.sceneImageUrl && (
            <div style={{ marginBottom: '8px' }}>
              <img src={scene.sceneImageUrl} alt="场景概念图" style={{ width: '100%', borderRadius: '4px', border: '1px solid #2a2a3a' }} />
            </div>
          )}

          {scene.sceneModelUrl && (
            <div style={{ fontSize: '10px', color: '#10b981', marginBottom: '4px' }}>
              ✓ 3D场景模型已生成：{scene.selectedSceneName || '未命名场景'}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            const data = exportScene();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            void saveBlob('director-scene.json', blob, { log });
          }}
          style={{ width: '100%', padding: '6px', background: '#2a2a4a', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
        >
          <Download size={12} /> 导出场景配置
        </button>
      </PanelHeader>

      {/* 导入角色模态框 */}
      {showImportCharModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999,
        }} onClick={() => setShowImportCharModal(false)}>
          <div style={{
            background: '#1a1a2e', borderRadius: '8px', padding: '16px',
            width: '400px', maxHeight: '80vh', overflow: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>选择要导入的角色</h3>
              <button onClick={() => setShowImportCharModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
              点击角色即可导入（一个一个导入）
            </div>
            {(project?.materials?.characters || project?.characters || project?.outline?.characters || []).map((pc: any, index: number) => {
              const exists = characters.find((c: any) => c.name === pc.name);
              return (
                <div
                  key={index}
                  onClick={() => {
                    if (exists) {
                      alert(`角色「${pc.name}」已存在，无需重复导入`);
                      return;
                    }
                    const template = pc.gender === '女' ? 'female_standard' : 'male_standard';
                    addCharacter(pc.name, template as any);
                    // 延迟更新额外属性
                    setTimeout(() => {
                      const char = useDirectorStore.getState().characters.find((c: any) => c.name === pc.name);
                      if (char) {
                        updateCharacter(char.id, {
                          description: pc.description || pc.desc || pc.appearance || '',
                          imageUrl: pc.imageUrl || pc.avatar || pc.image || null,
                        });
                      }
                    }, 100);
                    log?.(`导入角色：${pc.name}`);
                    alert(`成功导入角色：${pc.name}`);
                  }}
                  style={{
                    padding: '10px', marginBottom: '8px', borderRadius: '4px',
                    background: exists ? '#2a2a3a' : '#2a2a4a',
                    cursor: exists ? 'not-allowed' : 'pointer',
                    border: '1px solid #3a3a5a',
                    opacity: exists ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {pc.imageUrl || pc.avatar || pc.image ? (
                      <img src={pc.imageUrl || pc.avatar || pc.image} alt={pc.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4a5568', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px' }}>
                        {pc.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{pc.name}</div>
                      <div style={{ color: '#888', fontSize: '11px' }}>{pc.gender || '未知'} · {pc.role || pc.personality || '无描述'}</div>
                      {exists && <div style={{ color: '#f59e0b', fontSize: '10px', marginTop: '2px' }}>已导入</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
