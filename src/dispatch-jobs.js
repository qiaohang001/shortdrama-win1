/**
 * 短剧端对接调度机 Jobs API 的通用封装。
 *
 * 流程：precheck → submit → poll /api/jobs/{id}
 * 需要用户在「设置」里登录调度机（localStorage DISPATCH_TOKEN）。
 * 未登录时所有方法直接抛错，调用方可自行回退到 Agnes 本地直连。
 */

function baseUrl() {
  return ((typeof localStorage !== "undefined" && localStorage.getItem("DISPATCH_BASE_URL")) || "https://api.jinsuai.cn").replace(/\/$/, "");
}

function token() {
  return (typeof localStorage !== "undefined" && localStorage.getItem("DISPATCH_TOKEN")) || "";
}

function headers() {
  const h = { "Content-Type": "application/json" };
  const t = token();
  if (t) h.Authorization = "Bearer " + t;
  return h;
}

class DispatchError extends Error {
  constructor(message, { status, needRecharge } = {}) {
    super(message);
    this.status = status;
    this.needRecharge = needRecharge;
  }
}

// 静默重新登录已移除：原实现依赖 localStorage 里的明文密码（DISPATCH_PASS）换 token，
// 而密码已不再落盘。现在 401 直接向上抛「未登录调度机」，由 UI 引导用户重新登录。

// 自动重新登录（使用保存的账号密码）
async function autoRelogin() {
  const username = localStorage.getItem("DISPATCH_USER");
  const password = localStorage.getItem("DISPATCH_PASS");
  if (!username || !password) return false;
  try {
    const res = await fetch(baseUrl() + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem("DISPATCH_TOKEN", data.token);
      console.log("[调度机] 自动重新登录成功");
      return true;
    }
  } catch (e) {
    console.error("[调度机] 自动重新登录失败:", e.message);
  }
  return false;
}

async function api(path, opts = {}, _retry = false) {
  const url = baseUrl() + path;
  // 请求超时：默认300秒（LLM/视频等长任务），网络挂起时及时报错；可传 timeout(ms) 覆盖
  const { timeout = 300000, signal: externalSignal, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let res;
  try {
    res = await fetch(url, { ...fetchOpts, headers: { ...headers(), ...(opts.headers || {}) }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    // 未登录 / token 过期：自动尝试重新登录
    if (res.status === 401 && !_retry) {
      const reloginOk = await autoRelogin();
      if (reloginOk) {
        return api(path, opts, true);
      }
      const err = new DispatchError("未登录调度机，请先登录。", { status: 401, needAuth: true });
      throw err;
    }
    if (res.status === 401) {
      const err = new DispatchError("未登录调度机，请先登录。", { status: 401, needAuth: true });
      throw err;
    }
    const needRecharge = res.status === 402 || res.headers.get("X-Need-Recharge") === "1" || !!data.need_recharge;
    throw new DispatchError(data.detail || data.message || `HTTP ${res.status}`, { status: res.status, needRecharge });
  }
  return data;
}

export async function precheck(type, params = {}) {
  return await api("/api/jobs/precheck", { method: "POST", body: JSON.stringify({ type, params }) });
}

export async function submitJob(type, payload = {}) {
  return await api("/api/jobs/submit", { method: "POST", body: JSON.stringify({ type, payload }) });
}

export async function getJob(jobId) {
  return await api(`/api/jobs/${jobId}`, { method: "GET" });
}

/**
 * 长视频分段续接：提取一段视频的最后一帧（作为下一段 i2v 的首帧）
 * @param {string} videoUrl 已生成段落的视频 URL
 * @returns {Promise<{frame_url: string}>} 尾帧图片 COS 永久 URL
 */
export async function extractTail(videoUrl) {
  return await api("/api/longvideo/extract_tail", { method: "POST", body: JSON.stringify({ video_url: videoUrl }) });
}

/**
 * 长视频分段续接：把 N 段已生成视频拼接为一个长视频
 * @param {string[]} videoUrls 按顺序排列的段落视频 URL 列表
 * @returns {Promise<{video_url: string, segments: number}>} 拼接后视频 URL
 */
export async function concatVideos(videoUrls) {
  return await api("/api/longvideo/concat", { method: "POST", body: JSON.stringify({ video_urls: videoUrls }) });
}

/**
 * 归一化工人返回的 result_url，保证客户端一定能访问到：
 *  - 服务端把 base_url 配成 localhost / 127.0.0.1（默认配置）时，把 host 换成客户端配置的调度机地址；
 *  - 相对路径（/static/...）补上调度机地址前缀；
 * 否则原样返回。
 */
export function normalizeResultUrl(url) {
  if (!url || typeof url !== "string") return url;
  const base = baseUrl().replace(/\/$/, "");
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "0.0.0.0") {
      return base + u.pathname + u.search + u.hash;
    }
    return url;
  } catch {
    if (url.startsWith("/")) return base + url;
    return base + "/" + url;
  }
}

/**
 * 提交并轮询一个 GPU 任务，直到成功/失败/超时。
 *
 * @param {Object} options
 * @param {string} options.type - "video" | "tts" | "intro"
 * @param {Object} options.payload - 工人实际需要的参数
 * @param {Function} options.onProgress - (percent, statusText) => void
 * @param {number} options.pollInterval - 默认 5000 ms
 * @param {number} options.timeoutMs - 默认 20 分钟（1200000 ms）
 * @returns {Promise<{result_url, ...}>}
 */
export async function runDispatchJob({ type, payload, onProgress = () => {}, pollInterval = 5000, timeoutMs = 1200000 }) {
  const t = token();
  if (!t) {
    throw new DispatchError("未登录调度机，请先在「设置」中登录。", { status: 401 });
  }

  // 1) 预校验余额
  const pre = await precheck(type, payload);
  if (!pre.sufficient) {
    const err = new DispatchError(`余额不足：需要 ${pre.required_credits} 积分，当前 ${pre.balance} 积分`, { status: 402, needRecharge: true });
    throw err;
  }
  onProgress(5, `余额校验通过，需 ${pre.required_credits} 积分`);

  // 2) 提交任务
  const job = await submitJob(type, payload);
  const jobId = job.job_id || job.id; // 兼容调度机返回的 job_id 字段
  onProgress(10, `任务已提交 ${jobId}`);

  // 3) 轮询
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getJob(jobId);
    const progress = status.progress || 0;
    const statusText = status.status || "unknown";
    const queuePosition = status.queue_position || 0;
    
    // 构建状态文本，包含排队信息
    let displayText = statusText;
    if (statusText === "queued" && queuePosition > 0) {
      displayText = `排队中（第${queuePosition}位）`;
    } else if (statusText === "running") {
      displayText = `生成中（${progress}%）`;
    }
    
    onProgress(Math.max(10, Math.min(99, progress)), displayText, { queuePosition, status: statusText, progress });

    if (status.status === "succeeded") {
      if (!status.result_url) throw new DispatchError("任务完成但未返回结果地址");
      onProgress(100, "完成", { queuePosition: 0, status: "succeeded", progress: 100 });
      return { jobId, resultUrl: normalizeResultUrl(status.result_url), rawResultUrl: status.result_url, ...status };
    }
    if (status.status === "failed") {
      throw new DispatchError(status.error || "任务失败");
    }
    if (status.status === "canceled") {
      throw new DispatchError("任务已取消");
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new DispatchError("任务轮询超时");
}

/**
 * 图像生成：调用后端 /api/image/generate，自动计费。
 * @param {Object} params
 * @param {string} params.prompt - 生图提示词
 * @param {string} [params.model] - "Qwen/Qwen-Image"，默认 Qwen/Qwen-Image
 * @param {string} [params.size]  - "1328x1328" | "1024x1024"，按 model 默认
 * @param {number} [params.n]     - 生成张数，默认 1
 * @returns {Promise<{image_url: string, credits_used: number}>}
 */
export async function generateImage({ prompt, model = "Qwen/Qwen-Image", size = "", n = 1, kind = "" }) {
  if (!token()) {
    throw new DispatchError("未登录调度机，请先在「设置」中登录。", { status: 401 });
  }
  const payload = { prompt, model, size, n, kind };
  return await api("/api/image/generate", { method: "POST", body: JSON.stringify(payload) });
}

/**
 * 图生图（X99-IPAdapter风格迁移）：参考图 + 提示词，自动计费。
 * @param {Object} params
 * @param {string} params.image_url      - 参考图 URL（必传）
 * @param {string} params.prompt         - 正向提示词
 * @param {string} [params.negative_prompt] - 负向提示词
 * @param {number} [params.seed]         - 种子
 * @returns {Promise<{image_url: string, credits_used: number}>}
 */
export async function img2imgImage({ image_url, prompt, negative_prompt = "", seed = 0 }) {
  if (!token()) {
    throw new DispatchError("未登录调度机，请先在「设置」中登录。", { status: 401 });
  }
  if (!image_url || !prompt) {
    throw new DispatchError("图生图需要参考图与提示词", { status: 422 });
  }
  const payload = { image_url, prompt, negative_prompt, seed };
  return await api("/api/image/img2img", { method: "POST", body: JSON.stringify(payload) });
}

export { DispatchError };
export { api };

// ========== 会员相关函数 ==========

/**
 * 获取当前用户信息（包含会员状态）
 */
export async function getCurrentUser() {
  return await api("/api/auth/me", { method: "GET" });
}

/**
 * 开通会员
 * @param {number} tier - 会员档位：29(月卡) / 79(季卡) / 268(年卡)
 */
export async function subscribeMembership(tier) {
  return await api("/api/billing/membership", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

/**
 * 会员档位配置
 */
export const MEMBERSHIP_TIERS = {
  29: { level: 1, name: "月卡", quota: 95, days: 30, discount: 0.9 },
  79: { level: 2, name: "季卡", quota: 345, days: 90, discount: 0.85 },
  268: { level: 3, name: "年卡", quota: 1288, days: 365, discount: 0.8 },
};

export const MEMBERSHIP_NAMES = {
  0: "免费用户",
  1: "月卡",
  2: "季卡",
  3: "年卡",
};

/**
 * 创建充值订单
 * @param {number} tier - 充值金额：30/60/90/100
 * @param {string} channel - 支付渠道：wechat / alipay
 * @returns {Promise<{ok: boolean, order_id: string, channel: string, qr_content: string, qr_data_url: string, yuan: number, credits: number, mock: boolean}>}
 */
export async function createRechargeOrder(tier, channel) {
  return await api("/api/billing/recharge", {
    method: "POST",
    body: JSON.stringify({ tier, channel }),
  });
}

/**
 * 创建会员购买支付订单
 * @param {number} tier - 会员档位价格：29/79/268
 * @param {string} channel - 支付渠道：wechat / alipay
 * @returns {Promise<{ok: boolean, order_id: string, channel: string, qr_content: string, yuan: number, mock: boolean, membership_name: string}>}
 */
export async function createMembershipOrder(tier, channel) {
  return await api("/api/billing/membership/pay", {
    method: "POST",
    body: JSON.stringify({ tier, channel }),
  });
}

/**
 * 查询订单状态
 * @param {string} orderNo - 订单号
 * @returns {Promise<{order_no: string, status: string, yuan: number, credits: number, channel: string, paid_at: string}>}
 */
export async function getOrderStatus(orderNo) {
  return await api(`/api/billing/order/${orderNo}`, { method: "GET" });
}
