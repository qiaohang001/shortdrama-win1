import React, { useState, useRef, useEffect } from 'react';
import {
  isLoggedIn,
  precheckCredits,
  deductCredits,
  getCreditBalance,
} from '../utils/backend-api.js';
import { saveBlob } from '../utils.js';

// ========== MiniMax TTS 音色配置 ==========
// 中文（普通话）基础音色（8种）
const VOICE_CN_BASIC = [
  {
    id: 'male-qn-qingse',
    name: '青涩青年',
    gender: '男',
    style: '青涩少年',
    desc: '适合少年、青年角色',
  },
  {
    id: 'male-qn-jingying',
    name: '精英青年',
    gender: '男',
    style: '沉稳磁性',
    desc: '适合男主、大叔、精英',
  },
  {
    id: 'male-qn-badao',
    name: '霸道青年',
    gender: '男',
    style: '霸道总裁',
    desc: '适合霸总、反派',
  },
  {
    id: 'male-qn-daxuesheng',
    name: '大学生',
    gender: '男',
    style: '阳光开朗',
    desc: '适合学生、青年',
  },
  {
    id: 'female-shaonv',
    name: '少女',
    gender: '女',
    style: '甜美可爱',
    desc: '适合少女、萝莉',
  },
  {
    id: 'female-yujie',
    name: '御姐',
    gender: '女',
    style: '成熟御姐',
    desc: '适合女主、御姐',
  },
  {
    id: 'female-chengshu',
    name: '成熟女性',
    gender: '女',
    style: '温柔知性',
    desc: '适合旁白、成熟女性',
  },
  {
    id: 'female-tianmei',
    name: '甜美女性',
    gender: '女',
    style: '活泼开朗',
    desc: '适合搞笑、活泼角色',
  },
];
// 中文（普通话）精品音色-beta（8种）
const VOICE_CN_PREMIUM = [
  {
    id: 'male-qn-qingse-jingpin',
    name: '青涩青年(精品)',
    gender: '男',
    style: '青涩少年',
    desc: '精品版，音质更好',
  },
  {
    id: 'male-qn-jingying-jingpin',
    name: '精英青年(精品)',
    gender: '男',
    style: '沉稳磁性',
    desc: '精品版，音质更好',
  },
  {
    id: 'male-qn-badao-jingpin',
    name: '霸道青年(精品)',
    gender: '男',
    style: '霸道总裁',
    desc: '精品版，音质更好',
  },
  {
    id: 'male-qn-daxuesheng-jingpin',
    name: '大学生(精品)',
    gender: '男',
    style: '阳光开朗',
    desc: '精品版，音质更好',
  },
  {
    id: 'female-shaonv-jingpin',
    name: '少女(精品)',
    gender: '女',
    style: '甜美可爱',
    desc: '精品版，音质更好',
  },
  {
    id: 'female-yujie-jingpin',
    name: '御姐(精品)',
    gender: '女',
    style: '成熟御姐',
    desc: '精品版，音质更好',
  },
  {
    id: 'female-chengshu-jingpin',
    name: '成熟女性(精品)',
    gender: '女',
    style: '温柔知性',
    desc: '精品版，音质更好',
  },
  {
    id: 'female-tianmei-jingpin',
    name: '甜美女性(精品)',
    gender: '女',
    style: '活泼开朗',
    desc: '精品版，音质更好',
  },
];
// 中文（普通话）角色音色（10种）
const VOICE_CN_CHARACTER = [
  {
    id: 'bingjiao_didi',
    name: '病娇弟弟',
    gender: '男',
    style: '病娇',
    desc: '适合病娇、腹黑角色',
  },
  {
    id: 'junlang_nanyou',
    name: '俊朗男友',
    gender: '男',
    style: '俊朗',
    desc: '适合男友、男主角色',
  },
  {
    id: 'chunzhen_xuedi',
    name: '纯真学弟',
    gender: '男',
    style: '纯真',
    desc: '适合学弟、少年角色',
  },
  {
    id: 'lengdan_xiongzhang',
    name: '冷淡学长',
    gender: '男',
    style: '冷淡',
    desc: '适合学长、高冷角色',
  },
  {
    id: 'badao_shaoye',
    name: '霸道少爷',
    gender: '男',
    style: '霸道',
    desc: '适合少爷、霸总角色',
  },
  {
    id: 'tianxin_xiaoling',
    name: '甜心小玲',
    gender: '女',
    style: '甜心',
    desc: '适合甜心、可爱角色',
  },
  {
    id: 'qiaopi_mengmei',
    name: '俏皮萌妹',
    gender: '女',
    style: '俏皮',
    desc: '适合萌妹、俏皮角色',
  },
  {
    id: 'wumei_yujie',
    name: '妩媚御姐',
    gender: '女',
    style: '妩媚',
    desc: '适合御姐、妩媚角色',
  },
  {
    id: 'diadia_xuemei',
    name: '嗲嗲学妹',
    gender: '女',
    style: '嗲嗲',
    desc: '适合学妹、嗲嗲角色',
  },
  {
    id: 'danya_xuejie',
    name: '淡雅学姐',
    gender: '女',
    style: '淡雅',
    desc: '适合学姐、淡雅角色',
  },
];
// 中文（普通话）儿童/卡通音色（4种）
const VOICE_CN_CHILD = [
  {
    id: 'clever_boy',
    name: '聪明男童',
    gender: '男',
    style: '聪明伶俐',
    desc: '适合儿童角色、动画',
  },
  {
    id: 'cute_boy',
    name: '可爱男童',
    gender: '男',
    style: '可爱呆萌',
    desc: '适合儿童角色、动画',
  },
  {
    id: 'lovely_girl',
    name: '萌萌女童',
    gender: '女',
    style: '萌萌可爱',
    desc: '适合儿童角色、动画',
  },
  {
    id: 'cartoon_pig',
    name: '卡通猪小琪',
    gender: '卡通',
    style: '卡通搞笑',
    desc: '适合卡通、搞笑角色',
  },
];
// 中文（普通话）特色音色（20种）
const VOICE_CN_SPECIAL = [
  {
    id: 'Chinese (Mandarin)_Reliable_Executive',
    name: '沉稳高管',
    gender: '男',
    style: '沉稳',
    desc: '适合高管、商务角色',
  },
  {
    id: 'Chinese (Mandarin)_News_Anchor',
    name: '新闻女声',
    gender: '女',
    style: '专业',
    desc: '适合新闻、旁白',
  },
  {
    id: 'Chinese (Mandarin)_Mature_Woman',
    name: '傲娇御姐',
    gender: '女',
    style: '傲娇',
    desc: '适合御姐、傲娇角色',
  },
  {
    id: 'Chinese (Mandarin)_Unrestrained_Young_Man',
    name: '不羁青年',
    gender: '男',
    style: '不羁',
    desc: '适合不羁、叛逆角色',
  },
  {
    id: 'Arrogant_Miss',
    name: '嚣张小姐',
    gender: '女',
    style: '嚣张',
    desc: '适合大小姐、嚣张角色',
  },
  {
    id: 'Robot_Armor',
    name: '机械战甲',
    gender: '机械',
    style: '机械',
    desc: '适合机器人、机械角色',
  },
  {
    id: 'Chinese (Mandarin)_Kind-hearted_Antie',
    name: '热心大婶',
    gender: '女',
    style: '热心',
    desc: '适合大婶、热心角色',
  },
  {
    id: 'Chinese (Mandarin)_HK_Flight_Attendant',
    name: '港普空姐',
    gender: '女',
    style: '港普',
    desc: '适合空姐、港普角色',
  },
  {
    id: 'Chinese (Mandarin)_Humorous_Elder',
    name: '搞笑大爷',
    gender: '男',
    style: '搞笑',
    desc: '适合大爷、搞笑角色',
  },
  {
    id: 'Chinese (Mandarin)_Gentleman',
    name: '温润男声',
    gender: '男',
    style: '温润',
    desc: '适合绅士、温润角色',
  },
  {
    id: 'Chinese (Mandarin)_Warm_Bestie',
    name: '温暖闺蜜',
    gender: '女',
    style: '温暖',
    desc: '适合闺蜜、温暖角色',
  },
  {
    id: 'Chinese (Mandarin)_Male_Announcer',
    name: '播报男声',
    gender: '男',
    style: '专业',
    desc: '适合播报、旁白',
  },
  {
    id: 'Chinese (Mandarin)_Sweet_Lady',
    name: '甜美女声',
    gender: '女',
    style: '甜美',
    desc: '适合甜美、可爱角色',
  },
  {
    id: 'Chinese (Mandarin)_Southern_Young_Man',
    name: '南方小哥',
    gender: '男',
    style: '南方口音',
    desc: '适合南方小哥角色',
  },
  {
    id: 'Chinese (Mandarin)_Wise_Women',
    name: '阅历姐姐',
    gender: '女',
    style: '阅历丰富',
    desc: '适合成熟、阅历丰富角色',
  },
  {
    id: 'Chinese (Mandarin)_Gentle_Youth',
    name: '温润青年',
    gender: '男',
    style: '温润',
    desc: '适合温润青年角色',
  },
  {
    id: 'Chinese (Mandarin)_Warm_Girl',
    name: '温暖少女',
    gender: '女',
    style: '温暖',
    desc: '适合温暖少女角色',
  },
  {
    id: 'Chinese (Mandarin)_Kind-hearted_Elder',
    name: '花甲奶奶',
    gender: '女',
    style: '慈祥',
    desc: '适合奶奶、慈祥角色',
  },
  {
    id: 'Chinese (Mandarin)_Cute_Spirit',
    name: '憨憨萌兽',
    gender: '卡通',
    style: '憨憨',
    desc: '适合萌兽、卡通角色',
  },
  {
    id: 'Chinese (Mandarin)_Radio_Host',
    name: '电台男主播',
    gender: '男',
    style: '专业',
    desc: '适合电台、主持角色',
  },
];
// 中文（普通话）清新音色（8种）
const VOICE_CN_FRESH = [
  {
    id: 'Chinese (Mandarin)_Lyrical_Voice',
    name: '抒情男声',
    gender: '男',
    style: '抒情',
    desc: '适合抒情、温柔角色',
  },
  {
    id: 'Chinese (Mandarin)_Straightforward_Boy',
    name: '率真弟弟',
    gender: '男',
    style: '率真',
    desc: '适合率真、弟弟角色',
  },
  {
    id: 'Chinese (Mandarin)_Sincere_Adult',
    name: '真诚青年',
    gender: '男',
    style: '真诚',
    desc: '适合真诚、青年角色',
  },
  {
    id: 'Chinese (Mandarin)_Gentle_Senior',
    name: '温柔学姐',
    gender: '女',
    style: '温柔',
    desc: '适合温柔、学姐角色',
  },
  {
    id: 'Chinese (Mandarin)_Stubborn_Friend',
    name: '嘴硬竹马',
    gender: '男',
    style: '嘴硬',
    desc: '适合竹马、嘴硬角色',
  },
  {
    id: 'Chinese (Mandarin)_Crisp_Girl',
    name: '清脆少女',
    gender: '女',
    style: '清脆',
    desc: '适合清脆、少女角色',
  },
  {
    id: 'Chinese (Mandarin)_Pure-hearted_Boy',
    name: '清澈邻家弟弟',
    gender: '男',
    style: '清澈',
    desc: '适合清澈、邻家弟弟角色',
  },
  {
    id: 'Chinese (Mandarin)_Soft_Girl',
    name: '柔和少女',
    gender: '女',
    style: '柔和',
    desc: '适合柔和、少女角色',
  },
];
// 中文（粤语）音色（6种）
const VOICE_CANTONESE = [
  {
    id: 'Cantonese_ProfessionalHost（F)',
    name: '专业女主持',
    gender: '女',
    style: '专业',
    desc: '适合粤语主持、旁白',
  },
  {
    id: 'Cantonese_GentleLady',
    name: '温柔女声',
    gender: '女',
    style: '温柔',
    desc: '适合粤语温柔角色',
  },
  {
    id: 'Cantonese_ProfessionalHost（M)',
    name: '专业男主持',
    gender: '男',
    style: '专业',
    desc: '适合粤语主持、旁白',
  },
  {
    id: 'Cantonese_PlayfulMan',
    name: '活泼男声',
    gender: '男',
    style: '活泼',
    desc: '适合粤语活泼角色',
  },
  {
    id: 'Cantonese_CuteGirl',
    name: '可爱女孩',
    gender: '女',
    style: '可爱',
    desc: '适合粤语可爱角色',
  },
  {
    id: 'Cantonese_KindWoman',
    name: '善良女声',
    gender: '女',
    style: '善良',
    desc: '适合粤语善良角色',
  },
];
// 英文音色（16种）
const VOICE_EN = [
  {
    id: 'Santa_Claus',
    name: 'Santa Claus',
    gender: '男',
    style: '圣诞',
    desc: '圣诞老人音色',
  },
  {
    id: 'Grinch',
    name: 'Grinch',
    gender: '男',
    style: '古怪',
    desc: '格林奇音色',
  },
  {
    id: 'Rudolph',
    name: 'Rudolph',
    gender: '男',
    style: '驯鹿',
    desc: '鲁道夫音色',
  },
  {
    id: 'Arnold',
    name: 'Arnold',
    gender: '男',
    style: '强壮',
    desc: '阿诺德音色',
  },
  {
    id: 'Charming_Santa',
    name: 'Charming Santa',
    gender: '男',
    style: '迷人',
    desc: '迷人圣诞老人',
  },
  {
    id: 'Charming_Lady',
    name: 'Charming Lady',
    gender: '女',
    style: '迷人',
    desc: '迷人女士',
  },
  {
    id: 'Sweet_Girl',
    name: 'Sweet Girl',
    gender: '女',
    style: '甜美',
    desc: '甜美女孩',
  },
  {
    id: 'Cute_Elf',
    name: 'Cute Elf',
    gender: '卡通',
    style: '可爱',
    desc: '可爱精灵',
  },
  {
    id: 'Attractive_Girl',
    name: 'Attractive Girl',
    gender: '女',
    style: '迷人',
    desc: '迷人女孩',
  },
  {
    id: 'Serene_Woman',
    name: 'Serene Woman',
    gender: '女',
    style: '宁静',
    desc: '宁静女士',
  },
  {
    id: 'English_Trustworthy_Man',
    name: 'Trustworthy Man',
    gender: '男',
    style: '可靠',
    desc: '可靠男士',
  },
  {
    id: 'English_Graceful_Lady',
    name: 'Graceful Lady',
    gender: '女',
    style: '优雅',
    desc: '优雅女士',
  },
  {
    id: 'English_Aussie_Bloke',
    name: 'Aussie Bloke',
    gender: '男',
    style: '澳洲',
    desc: '澳洲小伙',
  },
  {
    id: 'English_Whispering_girl',
    name: 'Whispering Girl',
    gender: '女',
    style: '耳语',
    desc: '耳语女孩',
  },
  {
    id: 'English_Diligent_Man',
    name: 'Diligent Man',
    gender: '男',
    style: '勤奋',
    desc: '勤奋男士',
  },
  {
    id: 'English_Gentle-voiced_man',
    name: 'Gentle-voiced Man',
    gender: '男',
    style: '温柔',
    desc: '温柔男声',
  },
];
// 所有系统音色
const VOICE_OPTIONS = [
  ...VOICE_CN_BASIC,
  ...VOICE_CN_PREMIUM,
  ...VOICE_CN_CHARACTER,
  ...VOICE_CN_CHILD,
  ...VOICE_CN_SPECIAL,
  ...VOICE_CN_FRESH,
  ...VOICE_CANTONESE,
  ...VOICE_EN,
];

// ========== 情绪选项 ==========
const EMOTION_OPTIONS = [
  { id: '', name: '默认（自动）' },
  { id: 'happy', name: '开心' },
  { id: 'sad', name: '悲伤' },
  { id: 'angry', name: '愤怒' },
  { id: 'calm', name: '平静' },
  { id: 'fear', name: '恐惧' },
  { id: 'surprise', name: '惊讶' },
  { id: 'disgust', name: '厌恶' },
];

// ========== 模型选项 ==========
const MODEL_OPTIONS = [
  { id: 'speech-2.8-hd', name: '高清（HD）', desc: '音质更好，速度稍慢' },
  { id: 'speech-2.8-turbo', name: '快速（Turbo）', desc: '速度更快，音质稍逊' },
];

// 声音描述模板
const VOICE_PROMPT_TEMPLATES = [
  {
    label: '温柔女主',
    prompt: '温柔的年轻女性声音，语速适中，情感丰富，略带沙哑，说话节奏缓慢',
  },
  {
    label: '沉稳男主',
    prompt: '沉稳的中年男性声音，低沉有磁性，语速偏慢，语气坚定有力',
  },
  {
    label: '阳光少年',
    prompt: '阳光开朗的少年男性声音，清亮有活力，语速偏快，充满朝气',
  },
  {
    label: '冷艳御姐',
    prompt: '冷艳高贵的成熟女性声音，略带沙哑，语速适中，气场强大',
  },
  {
    label: '阴狠反派',
    prompt: '阴狠狡诈的男性声音，低沉阴冷，语速偏慢，语气中带着威胁感',
  },
  {
    label: '甜美少女',
    prompt: '甜美的少女声音，清亮可爱，语速偏快，充满活力和青春感',
  },
  {
    label: '沧桑老人',
    prompt: '沧桑的老年男性声音，低沉沙哑，语速偏慢，带着岁月的痕迹',
  },
  {
    label: '活泼搞笑',
    prompt: '活泼搞笑的年轻男性声音，语速快，语调夸张，充满喜剧感',
  },
];

// ========== MiniMax配置已移至调度机端 ==========

// ========== 语音合成 ==========
// 调度机API基础URL
const DISPATCH_BASE_URL = 'https://api.jinsuai.cn';

// 获取认证token
function getAuthToken() {
  return (
    localStorage.getItem('DISPATCH_TOKEN') ||
    localStorage.getItem('dispatch_token') ||
    localStorage.getItem('token') ||
    ''
  );
}

// 调用调度机的TTS合成接口（解决CORS问题，返回持久化URL）
async function synthesizeSpeech(
  text,
  voiceId,
  speed = 1.0,
  emotion = '',
  model = '',
  voiceDescription = '',
) {
  try {
    const token = getAuthToken();
    const response = await fetch(`${DISPATCH_BASE_URL}/api/tts/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text: text,
        voice_id: voiceId,
        speed: speed,
        emotion: emotion,
        model: (model && model.toLowerCase().includes('turbo')) ? 'speech-2.8-turbo' : 'speech-2.8-hd',
        format: 'mp3',
        voice_prompt: voiceDescription,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`TTS API错误: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (data.audio_url) {
      console.log(
        '[TTS] 音频合成成功:',
        data.audio_url,
        '使用积分:',
        data.credits_used,
      );
      return data.audio_url;
    }
    throw new Error('TTS合成失败：未返回音频URL');
  } catch (e) {
    console.error('[TTS] 合成失败:', e);
    if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
      throw new Error(
        'TTS API请求失败（网络错误）。请检查网络连接或稍后重试。',
      );
    }
    throw e;
  }
}

// ========== 自定义音色持久化 ==========
// 加载用户已保存的自定义音色
async function loadCustomVoices() {
  try {
    const token = getAuthToken();
    if (!token) return [];
    const response = await fetch(`${DISPATCH_BASE_URL}/api/tts/voices`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (Array.isArray(data)) {
      return data
        .map((v) => ({
          id: v.voice_id || `saved_${v.id}`,
          name: v.name,
          gender: '自定义',
          style: (v.voice_design || '').substring(0, 20) + '...',
          desc: '已保存的自定义音色',
          prompt: v.voice_design,
          isCustom: true,
          savedId: v.id,
        }))
        .filter((v) => v.id && v.id !== `saved_${v.savedId}`);
    }
    return [];
  } catch (e) {
    console.error('[TTS] 加载自定义音色失败:', e);
    return [];
  }
}
// 保存自定义音色到调度机
async function saveCustomVoice(name, voiceDesign, voiceId) {
  try {
    const token = getAuthToken();
    if (!token) return null;
    const response = await fetch(`${DISPATCH_BASE_URL}/api/tts/voices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: name,
        voice_design: voiceDesign,
        voice_id: voiceId,
      }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[TTS] 保存自定义音色失败:', e);
    return null;
  }
}
// ========== 声音设计（文字创建音色） ==========
async function createVoiceByPrompt(
  voicePrompt,
  previewText,
  preferredName = 'custom',
) {
  try {
    const token = getAuthToken();
    const response = await fetch(`${DISPATCH_BASE_URL}/api/tts/voice-design`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        voice_prompt: voicePrompt,
        preview_text: previewText,
        preferred_name: preferredName,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`声音设计失败: ${response.status} - ${err}`);
    }

    const data = await response.json();
    if (data.success) {
      return {
        voiceId: data.voice_id,
        targetModel: data.target_model,
        requestId: data.request_id,
      };
    }
    throw new Error('声音设计失败：未返回voice_id');
  } catch (e) {
    if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
      throw new Error('网络请求失败。请检查网络连接或稍后重试。');
    }
    throw e;
  }
}

// ========== 从分镜中提取台词 ==========
function extractDialogues(project) {
  const dialogues = [];
  const shots = project?.shots || [];
  shots.forEach((shot, shotIndex) => {
    // 用分镜自身 id 而不是数组下标生成台词 id：分镜增删或改序时 id 不再整体平移，
    // 已生成的配音就不会错位挂到别的台词上。
    // legacyId 保留旧的下标格式，用于迁移历史项目里已保存的 dubbingData。
    const shotKey = shot.id || `idx${shotIndex}`;
    // 情况1：分镜有 dialogues 数组（标准格式）
    const shotDialogues = shot.dialogues || [];
    if (shotDialogues.length > 0) {
      shotDialogues.forEach((d, dIndex) => {
        dialogues.push({
          id: `dlg_${shotKey}_${dIndex}`,
          legacyId: `dlg_${shotIndex}_${dIndex}`,
          shotId: shot.id,
          shotTitle: shot.title || `镜头${shotIndex + 1}`,
          character: d.character || '未知',
          text: d.text || d.content || '',
          voiceId: null,
          emotion: '',
          audioUrl: null,
          status: 'pending',
        });
      });
    }
    // 情况2：分镜有 dialogue 字符串（单条台词）
    else if (shot.dialogue && shot.dialogue.trim()) {
      const character =
        shot.characters && shot.characters.length > 0
          ? shot.characters[0]
          : '角色';
      dialogues.push({
        id: `dlg_${shotKey}_0`,
        legacyId: `dlg_${shotIndex}_0`,
        shotId: shot.id,
        shotTitle: shot.title || `镜头${shotIndex + 1}`,
        character: character,
        text: shot.dialogue,
        voiceId: null,
        emotion: '',
        audioUrl: null,
        status: 'pending',
      });
    }
  });
  return dialogues;
}

// ========== 主组件 ==========
export function DubbingBoard({ project, update, log, incomingChunk = "", incomingAudio = null, chunkNonce = 0 }) {
  const [dialogues, setDialogues] = useState(() => extractDialogues(project));
  const [selectedDialogueIds, setSelectedDialogueIds] = useState([]); // 批量生成选择的台词ID
  const [selectedVoice, setSelectedVoice] = useState('female-yujie');
  const [speed, setSpeed] = useState(1.0);
  const [emotion, setEmotion] = useState('');
  const [ttsModel, setTtsModel] = useState('speech-2.8-hd');
  const [generatingId, setGeneratingId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [characterVoices, setCharacterVoices] = useState({});
  const [filterCharacter, setFilterCharacter] = useState('all');
  const [customVoices, setCustomVoices] = useState([]);
  const [showVoiceDesigner, setShowVoiceDesigner] = useState(false);
  const [voicePrompt, setVoicePrompt] = useState('');
  const [voiceDescription, setVoiceDescription] = useState('');
  const [previewText, setPreviewText] =
    useState('大家好，这是我用文字创建的专属音色。');
  const [voiceName, setVoiceName] = useState('');
  const [creatingVoice, setCreatingVoice] = useState(false);
  const audioRef = useRef(null);

  // 编辑/添加台词相关状态
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editingCharacterId, setEditingCharacterId] = useState(null);
  const [editCharacter, setEditCharacter] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addCharacter, setAddCharacter] = useState('');
  const [addText, setAddText] = useState('');

  useEffect(() => {
    // 合并已有的audioUrl和status，避免重置时丢失已生成的配音
    // 同时从project.dubbingData恢复持久化的配音数据
    const newDialogues = extractDialogues(project);
    const savedDubbingData = project?.dubbingData || {};
    setDialogues((prev) => {
      const prevMap = new Map(prev.map((d) => [d.id, d]));
      return newDialogues.map((d) => {
        const prevDlg = prevMap.get(d.id) || prevMap.get(d.legacyId);
        // 新 id 查不到时回退到旧下标 id，保证老项目已生成的配音不会丢
        const savedDlg = savedDubbingData[d.id] || savedDubbingData[d.legacyId];
        // 优先使用已有的audioUrl，其次从持久化数据恢复
        const audioUrl = prevDlg?.audioUrl || savedDlg?.audioUrl;
        if (audioUrl) {
          return {
            ...d,
            audioUrl,
            status: 'done',
            voiceId: prevDlg?.voiceId || savedDlg?.voiceId,
            emotion: prevDlg?.emotion || savedDlg?.emotion,
          };
        }
        return d;
      });
    });
    // 加载用户已保存的自定义音色
    const loadVoices = async () => {
      const savedVoices = await loadCustomVoices();
      if (savedVoices.length > 0) {
        setCustomVoices((prev) => {
          // 合并已保存的音色和当前音色，避免重复
          const existingIds = new Set(prev.map((v) => v.id));
          const newVoices = savedVoices.filter((v) => !existingIds.has(v.id));
          return [...prev, ...newVoices];
        });
      }
    };
    loadVoices();
  }, [project?.shots]);

  const characters = [
    ...new Set(dialogues.map((d) => d.character).filter(Boolean)),
  ];
  const filteredDialogues =
    filterCharacter === 'all'
      ? dialogues
      : dialogues.filter((d) => d.character === filterCharacter);

  // 所有可用音色（系统音色 + 自定义音色）
  const allVoices = [...VOICE_OPTIONS, ...customVoices];

  // ========== 台词管理功能 ==========
  // 添加新台词（合并输入：角色名：台词内容）
  const handleAddDialog = () => {
    // 解析合并输入：角色名：台词内容 或 角色名:台词内容
    let charName = '自定义';
    let dialogText = addText.trim();
    const colonIndex = addText.indexOf('：');
    const colonIndexEn = addText.indexOf(':');
    const splitIndex = colonIndex !== -1 ? colonIndex : colonIndexEn;
    if (splitIndex > 0 && splitIndex < addText.length - 1) {
      charName = addText.substring(0, splitIndex).trim();
      dialogText = addText.substring(splitIndex + 1).trim();
    }
    if (!dialogText) {
      alert('请填写台词内容（格式：角色名：台词内容）');
      return;
    }
    const newDialog = {
      id:
        'dlg_custom_' +
        Date.now() +
        '_' +
        Math.random().toString(36).substring(2, 8),
      character: charName,
      text: dialogText,
      shotTitle: '自定义',
      shotId: null,
      status: 'pending',
      audioUrl: null,
      isCustom: true,
    };
    setDialogues((prev) => [...prev, newDialog]);
    setAddCharacter('');
    setAddText('');
    setShowAddDialog(false);
    log(`✅ 已添加自定义台词：${charName} - ${dialogText.substring(0, 20)}...`);
  };

  // 素材库「送入配音」送来的文本：转成一条自定义台词加入列表。
  // chunkNonce 每次送入都会自增，用它作为触发信号；为 0 表示从未送入，跳过。
  useEffect(() => {
    if (!chunkNonce) return;
    const raw = String(incomingChunk || '').trim();
    if (!raw) return;
    const m = raw.match(/^【素材·(.+?)】\s*([\s\S]*)$/);
    const charName = m ? m[1].trim() : '素材';
    const body = (m ? m[2] : raw).trim() || charName;
    const newDialog = {
      id: 'dlg_asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      character: charName,
      text: body,
      shotTitle: '素材库',
      shotId: null,
      status: 'pending',
      audioUrl: incomingAudio || null,
      isCustom: true,
    };
    setDialogues((prev) => [...prev, newDialog]);
    log?.(`✅ 已加入素材台词：${charName} - ${body.substring(0, 20)}...`);
    // 只在 nonce 变化时消费一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkNonce]);

  // 开始编辑台词
  const handleStartEdit = (dlg) => {
    setEditingId(dlg.id);
    setEditText(dlg.text);
  };

  // 保存编辑
  const handleSaveEdit = (dlgId) => {
    if (!editText.trim()) {
      alert('台词内容不能为空');
      return;
    }
    setDialogues((prev) =>
      prev.map((d) =>
        d.id === dlgId
          ? {
              ...d,
              text: editText.trim(),
              status: d.audioUrl ? d.status : 'pending',
            }
          : d,
      ),
    );
    setEditingId(null);
    setEditText('');
    log(`✅ 台词已更新`);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // 开始编辑角色名
  const handleStartEditCharacter = (dlg) => {
    setEditingCharacterId(dlg.id);
    setEditCharacter(dlg.character);
  };

  // 保存角色名编辑
  const handleSaveEditCharacter = (dlgId) => {
    if (!editCharacter.trim()) {
      alert('角色名不能为空');
      return;
    }
    setDialogues((prev) =>
      prev.map((d) =>
        d.id === dlgId ? { ...d, character: editCharacter.trim() } : d,
      ),
    );
    setEditingCharacterId(null);
    setEditCharacter('');
    log(`✅ 角色名已更新为：${editCharacter.trim()}`);
  };

  // 取消角色名编辑
  const handleCancelEditCharacter = () => {
    setEditingCharacterId(null);
    setEditCharacter('');
  };

  // 删除台词
  const handleDeleteDialog = (dlgId) => {
    if (!confirm('确定要删除这条台词吗？')) return;
    setDialogues((prev) => prev.filter((d) => d.id !== dlgId));
    log(`🗑️ 台词已删除`);
  };

  // 生成单条配音
  const generateOne = async (dlg) => {
    if (!dlg.text.trim()) {
      log(`⚠️「${dlg.character}」台词为空，跳过`);
      return;
    }
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert('请先登录后再使用配音生成功能');
      return;
    }
    setGeneratingId(dlg.id);
    setDialogues((prev) =>
      prev.map((d) => (d.id === dlg.id ? { ...d, status: 'generating' } : d)),
    );
    log(`正在为「${dlg.character}」生成配音：${dlg.text.substring(0, 20)}...`);
    try {
      // 优先使用每段台词自己的音色和情绪设置，否则使用角色映射或全局设置
      const voiceId =
        dlg.voiceId || characterVoices[dlg.character] || selectedVoice;
      const dialogueEmotion =
        dlg.emotion !== undefined && dlg.emotion !== '' ? dlg.emotion : emotion;
      const audioUrl = await synthesizeSpeech(
        dlg.text,
        voiceId,
        speed,
        dialogueEmotion,
        ttsModel,
        voiceDescription,
      );
      setDialogues((prev) =>
        prev.map((d) =>
          d.id === dlg.id
            ? {
                ...d,
                audioUrl,
                status: audioUrl ? 'done' : 'failed',
                voiceId,
                emotion: dialogueEmotion,
              }
            : d,
        ),
      );
      // 同时存入素材库和持久化配音数据到project
      if (audioUrl) {
        try {
          const currentAssets = project?.assets || [];
          const newAudioAsset = {
            id:
              'a_audio_' +
              Date.now() +
              '_' +
              Math.random().toString(36).substring(2, 8),
            type: 'audio',
            title: `${dlg.character}配音（${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}）`,
            url: audioUrl,
            status: 'ready',
            tags: ['配音生成', dlg.character, voiceId],
            favorite: false,
            dialogueId: dlg.id,
            character: dlg.character,
            voiceId: voiceId,
            text: dlg.text,
            createdAt: Date.now(),
          };
          // 持久化配音数据到project.dubbingData
          const currentDubbingData = project?.dubbingData || {};
          const newDubbingData = {
            ...currentDubbingData,
            [dlg.id]: {
              audioUrl,
              voiceId,
              emotion: dialogueEmotion,
              character: dlg.character,
              text: dlg.text,
              createdAt: Date.now(),
            },
          };
          update({
            assets: [newAudioAsset, ...currentAssets],
            dubbingData: newDubbingData,
          });
          log(`✅ 配音已存入素材库：${newAudioAsset.title}`);
        } catch (e) {
          log(`⚠️ 配音存入素材库失败：${e.message}`);
        }
      }
      log(`✅「${dlg.character}」配音生成成功`);
      // 刷新用户积分余额（TTS代理接口已自动扣费）
      if (isLoggedIn()) {
        try {
          const balanceData = await getCreditBalance();
          if (window.onCreditUpdate)
            window.onCreditUpdate(
              balanceData.balance || balanceData.credits || 0,
            );
          if (window.refreshUserInfo) window.refreshUserInfo();
        } catch (e) {}
      }
    } catch (e) {
      setDialogues((prev) =>
        prev.map((d) => (d.id === dlg.id ? { ...d, status: 'failed' } : d)),
      );
      log(`❌「${dlg.character}」配音生成失败：${e.message}`);
    } finally {
      setGeneratingId(null);
    }
  };

  // 批量生成（只生成用户选择的台词，如果没有选择则生成所有未完成的）
  const generateAll = async () => {
    let pending;
    if (selectedDialogueIds.length > 0) {
      pending = filteredDialogues.filter(
        (d) => selectedDialogueIds.includes(d.id) && d.text.trim(),
      );
      log(`开始批量生成选中的配音，共${pending.length}条...`);
    } else {
      pending = filteredDialogues.filter(
        (d) => d.status !== 'done' && d.text.trim(),
      );
      log(`开始批量生成所有未完成的配音，共${pending.length}条...`);
    }
    for (const dlg of pending) {
      await generateOne(dlg);
    }
    log(`✅ 批量配音生成完成`);
  };

  // 切换台词选择状态
  const toggleDialogueSelection = (id) => {
    setSelectedDialogueIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const pendingIds = filteredDialogues
      .filter((d) => d.status !== 'done' && d.text.trim())
      .map((d) => d.id);
    if (
      selectedDialogueIds.length === pendingIds.length &&
      pendingIds.length > 0
    ) {
      setSelectedDialogueIds([]);
    } else {
      setSelectedDialogueIds(pendingIds);
    }
  };

  // 播放
  const playAudio = (dlg) => {
    if (!dlg.audioUrl) return;
    if (playingId === dlg.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    audioRef.current = new Audio(dlg.audioUrl);
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play();
    setPlayingId(dlg.id);
  };

  // 设置角色音色
  const setCharacterVoice = (character, voiceId) => {
    setCharacterVoices((prev) => ({ ...prev, [character]: voiceId }));
    const voice = allVoices.find((v) => v.id === voiceId);
    log(`已设置「${character}」的音色为：${voice?.name || voiceId}`);
  };

  // 创建自定义音色
  const handleCreateVoice = async () => {
    if (!voicePrompt.trim()) {
      log('⚠️ 请输入声音描述');
      return;
    }
    if (!previewText.trim()) {
      log('⚠️ 请输入预览文本');
      return;
    }
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert('请先登录后再使用文字创建音色功能');
      return;
    }
    setCreatingVoice(true);
    log(`正在用文字创建音色：${voicePrompt.substring(0, 20)}...`);
    try {
      const result = await createVoiceByPrompt(
        voicePrompt,
        previewText,
        voiceName.trim() || `custom_${Date.now()}`,
      );
      const newVoice = {
        id: result.voiceId,
        name: voiceName.trim() || `自定义音色${customVoices.length + 1}`,
        gender: '自定义',
        style: voicePrompt.substring(0, 20) + '...',
        desc: '文字创建的专属音色',
        prompt: voicePrompt,
        isCustom: true,
      };
      setCustomVoices((prev) => [...prev, newVoice]);
      log(`✅ 音色创建成功：${newVoice.name}（ID: ${result.voiceId}）`);
      // 自动保存音色到调度机
      try {
        await saveCustomVoice(newVoice.name, voicePrompt, result.voiceId);
        log(`✅ 音色已保存到云端`);
      } catch (e) {
        log(`⚠️ 音色保存到云端失败：${e.message}`);
      }
      // 音色创建费用由后端成功后扣（60积分），此处仅刷新余额
      try {
        const balanceData = await getCreditBalance();
        if (window.onCreditUpdate)
          window.onCreditUpdate(
            balanceData.balance || balanceData.credits || 0,
          );
        if (window.refreshUserInfo) window.refreshUserInfo();
        log(`✅ 音色创建费用已由后端扣除（60积分），余额已刷新`);
      } catch (e) {
        log(`⚠️ 余额刷新失败：${e.message}`);
      }
      setShowVoiceDesigner(false);
      setVoicePrompt('');
      setVoiceName('');
    } catch (e) {
      log(`❌ 音色创建失败：${e.message}`);
    } finally {
      setCreatingVoice(false);
    }
  };

  // 导出配音数据
  const exportDubbing = async () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      customVoices,
      characterVoices,
      dialogues: dialogues
        .filter((d) => d.audioUrl)
        .map((d) => ({
          shotId: d.shotId,
          character: d.character,
          text: d.text,
          audioUrl: d.audioUrl,
        })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    await saveBlob(`${project?.title || 'dubbing'}_配音数据.json`, blob, { log });
    log(`✅ 已导出配音数据（${data.dialogues.length}条）`);
  };

  const stats = {
    total: dialogues.length,
    done: dialogues.filter((d) => d.status === 'done').length,
    pending: dialogues.filter((d) => d.status === 'pending').length,
    failed: dialogues.filter((d) => d.status === 'failed').length,
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--bg, #0f0f1a)',
      }}
    >
      {/* 左侧控制面板 */}
      <div
        style={{
          width: 280,
          background: 'var(--panel, #1a1a2e)',
          borderRight: '1px solid var(--border, #2a2a4a)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid var(--border, #2a2a4a)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text, #fff)' }}>
              🎙️ 配音工作室
            </h2>
            <button
              onClick={() => setShowAddDialog(true)}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: 6,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ➕ 添加台词
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                padding: 8,
                background: 'rgba(122,92,255,0.1)',
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 600, color: '#7a5cff' }}>
                {stats.total}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #888)' }}>
                总台词
              </div>
            </div>
            <div
              style={{
                padding: 8,
                background: 'rgba(16,185,129,0.1)',
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 600, color: '#10b981' }}>
                {stats.done}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #888)' }}>
                已完成
              </div>
            </div>
          </div>
        </div>

        {/* 全局音色设置 */}
        <div
          style={{
            padding: 12,
            borderBottom: '1px solid var(--border, #2a2a4a)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>
              默认音色
            </span>
          </div>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 6,
              background: 'var(--input-bg, #15152a)',
              color: 'var(--text, #fff)',
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            <optgroup label="中文-基础音色">
              {VOICE_CN_BASIC.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="中文-精品音色(Beta)">
              {VOICE_CN_PREMIUM.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="中文-角色音色">
              {VOICE_CN_CHARACTER.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="中文-特色音色">
              {VOICE_CN_SPECIAL.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="中文-清新音色">
              {VOICE_CN_FRESH.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="中文-儿童/卡通音色">
              {VOICE_CN_CHILD.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="中文(粤语)音色">
              {VOICE_CANTONESE.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            <optgroup label="英文音色">
              {VOICE_EN.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.gender}）- {v.style}
                </option>
              ))}
            </optgroup>
            {customVoices.length > 0 && (
              <optgroup label="自定义音色">
                {customVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}（自定义）
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {/* 自定义音色描述（可选）：填写后优先使用，不填则使用上方所选音色 */}
          <input
            type="text"
            value={voiceDescription}
            onChange={(e) => setVoiceDescription(e.target.value)}
            placeholder="自定义音色描述（可选）：如 温柔的女性声音，语速缓慢，略带沙哑"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 6,
              background: 'var(--input-bg, #15152a)',
              color: 'var(--text, #fff)',
              fontSize: 12,
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted, #888)',
              marginBottom: 4,
            }}
          >
            语速：{speed.toFixed(1)}x
          </div>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%', marginBottom: 12 }}
          />
          {/* 情绪选择 */}
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted, #888)',
              marginBottom: 4,
            }}
          >
            情绪
          </div>
          <select
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 6,
              background: 'var(--input-bg, #15152a)',
              color: 'var(--text, #fff)',
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {EMOTION_OPTIONS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {/* 模型选择 */}
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted, #888)',
              marginBottom: 4,
            }}
          >
            音质模型
          </div>
          <select
            value={ttsModel}
            onChange={(e) => setTtsModel(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 6,
              background: 'var(--input-bg, #15152a)',
              color: 'var(--text, #fff)',
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} - {m.desc}
              </option>
            ))}
          </select>
          {/* 批量选择控制 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={toggleSelectAll}
              style={{
                flex: 1,
                padding: '6px 0',
                border: '1px solid var(--border, #2a2a4a)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--text, #aaa)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {selectedDialogueIds.length ===
                filteredDialogues.filter(
                  (d) => d.status !== 'done' && d.text.trim(),
                ).length &&
              filteredDialogues.filter(
                (d) => d.status !== 'done' && d.text.trim(),
              ).length > 0
                ? '取消全选'
                : '全选'}
            </button>
            <div
              style={{
                flex: 1,
                padding: '6px 0',
                textAlign: 'center',
                fontSize: 11,
                color: 'var(--text-muted, #888)',
              }}
            >
              已选 {selectedDialogueIds.length} 条
            </div>
          </div>
          <button
            onClick={generateAll}
            disabled={generatingId !== null}
            style={{
              width: '100%',
              padding: '10px 0',
              border: 'none',
              borderRadius: 8,
              background: generatingId
                ? '#555'
                : 'linear-gradient(135deg, #7a5cff, #5ce1e6)',
              color: '#fff',
              cursor: generatingId ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {generatingId
              ? '生成中...'
              : `🎬 批量生成${selectedDialogueIds.length > 0 ? `（已选${selectedDialogueIds.length}条）` : `（全部${stats.pending + stats.failed}条）`}`}
          </button>
          <button
            onClick={exportDubbing}
            disabled={stats.done === 0}
            style={{
              width: '100%',
              padding: '8px 0',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 6,
              background: 'transparent',
              color: stats.done === 0 ? '#555' : 'var(--text, #aaa)',
              cursor: stats.done === 0 ? 'not-allowed' : 'pointer',
              fontSize: 12,
            }}
          >
            📦 导出配音数据
          </button>
        </div>

        {/* 角色音色映射 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted, #888)',
              marginBottom: 8,
            }}
          >
            角色音色映射
          </div>
          {characters.length === 0 && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted, #666)',
                textAlign: 'center',
                padding: 20,
              }}
            >
              暂无角色台词
              <br />
              请先在分镜中添加台词
            </div>
          )}
          {characters.map((char) => (
            <div
              key={char}
              style={{
                marginBottom: 8,
                padding: 8,
                border: '1px solid var(--border, #2a2a4a)',
                borderRadius: 6,
                background: 'var(--panel-2, #15152a)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text, #fff)',
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                {char}
              </div>
              <select
                value={characterVoices[char] || selectedVoice}
                onChange={(e) => setCharacterVoice(char, e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid var(--border, #2a2a4a)',
                  borderRadius: 4,
                  background: 'var(--input-bg, #1a1a2e)',
                  color: 'var(--text, #fff)',
                  fontSize: 11,
                }}
              >
                <optgroup label="中文-基础音色">
                  {VOICE_CN_BASIC.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文-精品音色(Beta)">
                  {VOICE_CN_PREMIUM.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文-角色音色">
                  {VOICE_CN_CHARACTER.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文-特色音色">
                  {VOICE_CN_SPECIAL.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文-清新音色">
                  {VOICE_CN_FRESH.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文-儿童/卡通音色">
                  {VOICE_CN_CHILD.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文(粤语)音色">
                  {VOICE_CANTONESE.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="英文音色">
                  {VOICE_EN.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                {customVoices.length > 0 && (
                  <optgroup label="自定义音色">
                    {customVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧台词列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setFilterCharacter('all')}
            style={{
              padding: '4px 12px',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 16,
              background:
                filterCharacter === 'all'
                  ? 'rgba(122,92,255,0.2)'
                  : 'transparent',
              color:
                filterCharacter === 'all' ? '#7a5cff' : 'var(--text, #aaa)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            全部
          </button>
          {characters.map((char) => (
            <button
              key={char}
              onClick={() => setFilterCharacter(char)}
              style={{
                padding: '4px 12px',
                border: '1px solid var(--border, #2a2a4a)',
                borderRadius: 16,
                background:
                  filterCharacter === char
                    ? 'rgba(122,92,255,0.2)'
                    : 'transparent',
                color:
                  filterCharacter === char ? '#7a5cff' : 'var(--text, #aaa)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {char}
            </button>
          ))}
        </div>

        {filteredDialogues.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 60,
              color: 'var(--text-muted, #666)',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
            <div style={{ fontSize: 14 }}>暂无台词</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              请先在分镜模块中添加角色台词
            </div>
          </div>
        )}

        {filteredDialogues.map((dlg, index) => (
          <div
            key={dlg.id}
            style={{
              marginBottom: 10,
              padding: 12,
              border: selectedDialogueIds.includes(dlg.id)
                ? '2px solid #7a5cff'
                : '1px solid var(--border, #2a2a4a)',
              borderRadius: 8,
              background: selectedDialogueIds.includes(dlg.id)
                ? 'rgba(122,92,255,0.05)'
                : 'var(--panel-2, #15152a)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedDialogueIds.includes(dlg.id)}
                  onChange={() => toggleDialogueSelection(dlg.id)}
                  style={{
                    width: 16,
                    height: 16,
                    cursor: 'pointer',
                    accentColor: '#7a5cff',
                  }}
                  title="选择此台词用于批量生成"
                />
                <span
                  style={{ fontSize: 11, color: 'var(--text-muted, #666)' }}
                >
                  #{index + 1}
                </span>
                {editingCharacterId === dlg.id ? (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <input
                      value={editCharacter}
                      onChange={(e) => setEditCharacter(e.target.value)}
                      style={{
                        padding: '2px 6px',
                        border: '1px solid #7a5cff',
                        borderRadius: 4,
                        background: 'rgba(122,92,255,0.1)',
                        color: '#fff',
                        fontSize: 11,
                        width: 80,
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEditCharacter(dlg.id);
                        if (e.key === 'Escape') handleCancelEditCharacter();
                      }}
                    />
                    <button
                      onClick={() => handleSaveEditCharacter(dlg.id)}
                      style={{
                        padding: '2px 6px',
                        border: 'none',
                        borderRadius: 3,
                        background: '#10b981',
                        color: '#fff',
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={handleCancelEditCharacter}
                      style={{
                        padding: '2px 6px',
                        border: '1px solid var(--border, #2a2a4a)',
                        borderRadius: 3,
                        background: 'transparent',
                        color: 'var(--text-muted, #888)',
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      ✗
                    </button>
                  </div>
                ) : (
                  <span
                    onClick={() => handleStartEditCharacter(dlg)}
                    style={{
                      padding: '2px 8px',
                      background: 'rgba(122,92,255,0.15)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#7a5cff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px dashed transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.borderColor = '#7a5cff';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.borderColor = 'transparent';
                    }}
                    title="点击编辑角色名"
                  >
                    {dlg.character} ✏️
                  </span>
                )}
                <span
                  style={{ fontSize: 11, color: 'var(--text-muted, #666)' }}
                >
                  {dlg.shotTitle}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {dlg.status === 'done' && (
                  <span style={{ fontSize: 11, color: '#10b981' }}>
                    ✓ 已完成
                  </span>
                )}
                {dlg.status === 'failed' && (
                  <span style={{ fontSize: 11, color: '#ef4444' }}>✗ 失败</span>
                )}
                {dlg.status === 'generating' && (
                  <span style={{ fontSize: 11, color: '#f59e0b' }}>
                    生成中...
                  </span>
                )}
                {dlg.status === 'pending' && (
                  <span
                    style={{ fontSize: 11, color: 'var(--text-muted, #666)' }}
                  >
                    待生成
                  </span>
                )}
              </div>
            </div>
            {/* 台词文本（可编辑） */}
            {editingId === dlg.id ? (
              <div style={{ marginBottom: 10 }}>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #7a5cff',
                    borderRadius: 6,
                    background: 'rgba(122,92,255,0.1)',
                    color: '#fff',
                    fontSize: 13,
                    resize: 'vertical',
                    minHeight: 60,
                    fontFamily: 'inherit',
                  }}
                  placeholder="请输入台词内容..."
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => handleSaveEdit(dlg.id)}
                    style={{
                      padding: '4px 12px',
                      border: 'none',
                      borderRadius: 4,
                      background: '#10b981',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    ✓ 保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      padding: '4px 12px',
                      border: '1px solid var(--border, #2a2a4a)',
                      borderRadius: 4,
                      background: 'transparent',
                      color: 'var(--text, #aaa)',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    ✗ 取消
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => handleStartEdit(dlg)}
                style={{
                  fontSize: 13,
                  color: 'var(--text, #ddd)',
                  lineHeight: 1.6,
                  marginBottom: 10,
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px dashed transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = '#7a5cff';
                  e.target.style.background = 'rgba(122,92,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = 'transparent';
                  e.target.style.background = 'rgba(0,0,0,0.2)';
                }}
                title="点击编辑台词"
              >
                "{dlg.text}"
                <span
                  style={{
                    fontSize: 10,
                    color: '#7a5cff',
                    marginLeft: 8,
                    opacity: 0.7,
                  }}
                >
                  ✏️ 点击编辑
                </span>
              </div>
            )}
            {/* 每段台词独立的音色和情绪选择 */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>
                音色：
              </span>
              <select
                value={dlg.voiceId || ''}
                onChange={(e) => {
                  const newVoiceId = e.target.value || null;
                  setDialogues((prev) =>
                    prev.map((d) =>
                      d.id === dlg.id ? { ...d, voiceId: newVoiceId } : d,
                    ),
                  );
                }}
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border, #2a2a4a)',
                  borderRadius: 4,
                  background: 'var(--input-bg, #1a1a2e)',
                  color: 'var(--text, #ddd)',
                  fontSize: 11,
                  cursor: 'pointer',
                  minWidth: 140,
                }}
              >
                <option value="">使用全局/角色映射</option>
                <optgroup label="中文基础">
                  {VOICE_CN_BASIC.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="中文精品">
                  {VOICE_CN_PREMIUM.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="角色音色">
                  {VOICE_CN_CHARACTER.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="特殊音色">
                  {VOICE_CN_SPECIAL.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="新音色">
                  {VOICE_CN_FRESH.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="童声">
                  {VOICE_CN_CHILD.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="粤语">
                  {VOICE_CANTONESE.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="英文">
                  {VOICE_EN.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted, #888)',
                  marginLeft: 8,
                }}
              >
                情绪：
              </span>
              <select
                value={dlg.emotion || ''}
                onChange={(e) => {
                  const newEmotion = e.target.value;
                  setDialogues((prev) =>
                    prev.map((d) =>
                      d.id === dlg.id ? { ...d, emotion: newEmotion } : d,
                    ),
                  );
                }}
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border, #2a2a4a)',
                  borderRadius: 4,
                  background: 'var(--input-bg, #1a1a2e)',
                  color: 'var(--text, #ddd)',
                  fontSize: 11,
                  cursor: 'pointer',
                  minWidth: 100,
                }}
              >
                {EMOTION_OPTIONS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => generateOne(dlg)}
                disabled={generatingId !== null}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: 6,
                  background: generatingId ? '#555' : '#7a5cff',
                  color: '#fff',
                  cursor: generatingId ? 'wait' : 'pointer',
                  fontSize: 12,
                }}
              >
                {generatingId === dlg.id
                  ? '生成中...'
                  : `🎤 生成配音（${ttsModel.includes('turbo') ? 1.5 : 2.5}积分）`}
              </button>
              {dlg.audioUrl && (
                <>
                  <button
                    onClick={() => playAudio(dlg)}
                    style={{
                      padding: '6px 14px',
                      border: '1px solid #10b981',
                      borderRadius: 6,
                      background:
                        playingId === dlg.id
                          ? 'rgba(16,185,129,0.2)'
                          : 'transparent',
                      color: '#10b981',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {playingId === dlg.id ? '⏸ 暂停' : '▶ 播放'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const r = await fetch(dlg.audioUrl);
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        const b = await r.blob();
                        await saveBlob(`${dlg.character}_${index + 1}.mp3`, b, { log });
                      } catch (e) {
                        if (log) log(`❌ 配音下载失败：${String((e && e.message) || e)}`);
                        else alert('下载失败，请重试或检查网络');
                      }
                    }}
                    style={{
                      padding: '6px 14px',
                      border: '1px solid var(--border, #2a2a4a)',
                      borderRadius: 6,
                      background: 'transparent',
                      color: 'var(--text, #aaa)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    ⬇ 下载
                  </button>
                </>
              )}
              {/* 编辑和删除按钮 */}
              {editingId !== dlg.id && (
                <>
                  <button
                    onClick={() => handleStartEdit(dlg)}
                    style={{
                      padding: '6px 14px',
                      border: '1px solid #f59e0b',
                      borderRadius: 6,
                      background: 'transparent',
                      color: '#f59e0b',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    ✏️ 编辑
                  </button>
                  <button
                    onClick={() => handleDeleteDialog(dlg.id)}
                    style={{
                      padding: '6px 14px',
                      border: '1px solid #ef4444',
                      borderRadius: 6,
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    🗑️ 删除
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 添加台词弹窗 */}
      {showAddDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowAddDialog(false)}
        >
          <div
            style={{
              width: 520,
              maxWidth: '90%',
              background: 'var(--panel, #1a1a2e)',
              border: '1px solid var(--border, #2a2a4a)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h3
                style={{ margin: 0, fontSize: 18, color: 'var(--text, #fff)' }}
              >
                ➕ 添加自定义台词
              </h3>
              <button
                onClick={() => setShowAddDialog(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #888)',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--text-muted, #888)',
                  marginBottom: 6,
                }}
              >
                台词内容（格式：角色名：台词内容）
              </label>
              <textarea
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder="例如：男主：你快走，不要管我！&#10;女主：不，我不会丢下你的！"
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border, #2a2a4a)',
                  borderRadius: 8,
                  background: 'var(--input-bg, #15152a)',
                  color: 'var(--text, #fff)',
                  fontSize: 13,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted, #666)',
                  marginTop: 6,
                }}
              >
                提示：用冒号（：或:）分隔角色名和台词，不写角色名默认"自定义"
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleAddDialog}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  border: 'none',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                ✓ 添加台词
              </button>
              <button
                onClick={() => setShowAddDialog(false)}
                style={{
                  padding: '12px 24px',
                  border: '1px solid var(--border, #2a2a4a)',
                  borderRadius: 10,
                  background: 'transparent',
                  color: 'var(--text, #aaa)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default DubbingBoard;
