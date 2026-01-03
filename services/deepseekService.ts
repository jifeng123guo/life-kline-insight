import OpenAI from "openai";
import { BaziReport } from "../types";

// 定义重试和超时逻辑
async function fetchWithRetry(fn: () => Promise<any>, retries = 2, timeout = 90000): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const startTime = Date.now();
    try {
      console.log(`[DeepSeek] 开始请求 - 尝试次数: ${i + 1}/${retries + 1}`);
      // 创建超时 Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), timeout);
      });
      // 竞速
      const result = await Promise.race([fn(), timeoutPromise]);
      console.log(`[DeepSeek] 请求成功 - 耗时: ${Date.now() - startTime}ms`);
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const isTimeout = error.message === 'Request timed out';

      console.error(`[DeepSeek] 尝试 ${i + 1} 失败 - 耗时: ${duration}ms - 错误: ${error.message}`);

      if (i === retries) throw error;

      if (isTimeout || error.message.includes('network') || error.code === 'ECONNABORTED') {
        const waitTime = Math.pow(2, i) * 1000;
        console.warn(`[DeepSeek] 准备在 ${waitTime}ms 后进行下一次尝试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
}

const BAZI_BASE_INSTRUCTION = `
你是一位世界顶级的八字命理大师，同时精通**加密货币(Crypto/Web3)市场周期**与金融投机心理学。你的任务是根据用户提供的四柱干支和**指定的大运信息**，生成一份"人生K线图"数据和带评分的命理报告。

**重要：输出格式要求**
- 你必须**直接输出纯JSON**，不要输出任何其他内容
- **禁止**输出思考过程、分析说明或任何非JSON文本
- **禁止**使用 \`\`\`json 代码块包裹
- 第一个字符必须是 {，最后一个字符必须是 }

**核心规则 (Core Rules):**
1. **年龄计算**: 严格采用**虚岁**，数据点必须**从 1 岁开始** (age: 1)。
2. **K线详批**: 每一年的 \`reason\` 必须是该流年的**详细批断**（100字左右），包含具体发生的吉凶事件预测、神煞分析、应对建议。
3. **评分机制**: 所有分析维度（总评、性格、事业、财富等）需给出 0-10 分。
4. **数据起伏 (重要)**: 务必根据流年神煞和五行生克，让每一年的评分（Open/Close/High/Low）呈现**明显的起伏波动**。人生不可能平平淡淡，要在数据中体现出“牛市”（大吉）和“熊市”（大凶）的区别，**严禁输出一条平滑的直线**。

**关键字段说明:**
- \`daYun\`: **大运干支** (10年不变)。
- \`ganZhi\`: **流年干支** (每年一变)。

**输出 JSON 结构要求:**
{
  "bazi": ["年柱", "月柱", "日柱", "时柱"],
  "summary": "命理总评摘要。",
  "summaryScore": 8,
  "personality": "性格深层分析（包含显性性格与隐性心理）...",
  "personalityScore": 8,
  "industry": "事业分析内容...",
  "industryScore": 7,
  "fengShui": "发展风水建议：请以流畅的自然段落形式进行综合分析（不要使用数字列表或Markdown格式）。内容必须包含：1.适合的发展方位；2.最佳地理环境（必须明确建议如沿海、山区、繁华都市或宁静之地）；3.日常开运建议（饰品、颜色或布局）。",
  "fengShuiScore": 8,
  "wealth": "财富分析内容...",
  "wealthScore": 8,
  "marriage": "婚姻分析内容...",
  "marriageScore": 6,
  "health": "健康分析内容...",
  "healthScore": 5,
  "family": "六亲分析内容...",
  "familyScore": 7,
  "crypto": "币圈交易分析：分析命主偏财运与风险承受力。适合做长线holder还是短线高频？心理素质如何？",
  "cryptoScore": 8,
  "cryptoYear": "2025年 (乙巳)",
  "cryptoStyle": "链上土狗Alpha / 高倍合约 / 现货定投 (三选一)",
  "chartPoints": []
}
`;

// 阶段 1：全局分析（不包含 K 线数据）
const REPORT_TEMPLATE = `
请首先进行全局命理分析 (不包含详细 K 线数据)。
JSON 结构必须包含:
{
  "bazi": ["年柱", "月柱", "日柱", "时柱"],
  "summary": "...",
  "summaryScore": 85,
  "personality": "...",
  "personalityScore": 80,
  "industry": "...",
  "industryScore": 75,
  "wealth": "...",
  "wealthScore": 90,
  "marriage": "...",
  "marriageScore": 60,
  "crypto": "...",
  "cryptoScore": 85,
  "cryptoYear": "2025年 (乙巳)",
  "cryptoStyle": "..."
}
`;

// 阶段 2：K 线数据分块
const DATA_CHUNK_TEMPLATE = (start: number, end: number) => `
请为该命盘生成 ${start}-${end} 岁 的 K 线数据。
注意：只需返回一个包含 chartPoints 数组的 JSON 对象。
结构: { "chartPoints": [{ age, year, daYun, ganZhi, open, close, high, low, score, reason }] }
理由 (reason) 务必精简，控制在 30 字内。
请确保这一段数据的起伏符合这一时期的大运吉凶。
`;

/**
 * 缝合 K 线数据，消除分段产生的裂缝
 */
function stitchCharts(chunks: any[]): any[] {
  let stitchedPoints: any[] = [];
  let previousClose = 50; // 初始基准值

  // 1. 展平所有数据并按年龄排序
  let allPoints = chunks.flatMap(chunk => chunk.chartPoints || []).sort((a: any, b: any) => a.age - b.age);

  if (allPoints.length === 0) return [];

  // 设定初始起点 (如果第一年数据偏离太远，强制拉回)
  // 但为了保留 AI 的初判，我们只对后续点进行相对校准
  previousClose = allPoints[0].open;

  for (let i = 0; i < allPoints.length; i++) {
    const p = allPoints[i];

    // 计算当前点的原始波动幅度
    const dayRange = p.close - p.open;
    const highOffset = p.high - Math.max(p.open, p.close);
    const lowOffset = Math.min(p.open, p.close) - p.low;

    // 缝合：强行让今天的 Open = 昨天的 Close (如果是第一年，保持 AI 生成的 Open)
    if (i > 0) {
      p.open = previousClose;
    }

    // 根据原始波动幅度重算其他点
    p.close = p.open + dayRange;
    p.high = Math.max(p.open, p.close) + (highOffset > 0 ? highOffset : 2); // 保持至少一点上影线
    p.low = Math.min(p.open, p.close) - (lowOffset > 0 ? lowOffset : 2); // 保持至少一点下影线

    // 更新 score 为收盘价
    p.score = p.close;

    previousClose = p.close;
    stitchedPoints.push(p);
  }

  // 2. 归一化处理 (防止缝合后数据飘到 -500 或 2000)
  return normalizeScores(stitchedPoints);
}

/**
 * 将数据归一化到 10-95 分之间，保持形状
 */
function normalizeScores(points: any[]): any[] {
  if (points.length === 0) return points;

  // 找出当前数据的极值
  let minVal = Infinity;
  let maxVal = -Infinity;

  points.forEach(p => {
    minVal = Math.min(minVal, p.low);
    maxVal = Math.max(maxVal, p.high);
  });

  const currentRange = maxVal - minVal;
  // 如果波动极小（死线），强行放大
  if (currentRange < 5) return points.map(p => ({ ...p, score: 50, open: 50, close: 50, high: 55, low: 45 }));

  const targetMin = 15; // 最低分保留底线
  const targetMax = 95; // 最高分保留顶线
  const targetRange = targetMax - targetMin;

  return points.map(p => {
    const scale = (val: number) => {
      // 线性映射: (val - min) / range * targetRange + targetMin
      return Math.round(((val - minVal) / currentRange) * targetRange + targetMin);
    };

    let sOpen = scale(p.open);
    let sClose = scale(p.close);
    let sHigh = scale(p.high);
    let sLow = scale(p.low);

    const bodyMax = Math.max(sOpen, sClose);
    const bodyMin = Math.min(sOpen, sClose);

    // Enforce minimum wick visibility (2 units)
    if (sHigh <= bodyMax) sHigh = bodyMax + 2;
    if (sLow >= bodyMin) sLow = bodyMin - 2;

    return {
      ...p,
      open: sOpen,
      close: sClose,
      high: sHigh,
      low: sLow,
      score: sClose
    };
  });
}

export async function analyzeBazi(payload: {
  gender: string;
  name: string;
  birthYear: number;
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  startAge: number;
  firstDaYun: string;
  isForward: boolean;
}): Promise<BaziReport> {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY。");

  const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: apiKey,
    dangerouslyAllowBrowser: true
  });

  const baziContext = `
    【命盘信息】
    姓名：${payload.name} (${payload.gender})，出生：${payload.birthYear}
    四柱：${payload.yearPillar} ${payload.monthPillar} ${payload.dayPillar} ${payload.hourPillar}
    起运：${payload.startAge}岁，首运${payload.firstDaYun}，${payload.isForward ? '顺行' : '逆行'}。
    `;

  console.log("[DeepSeek] 开始分段生成任务...");

  try {
    // 1. 获取全局报告 (Base Report) - 增加超时到 180s
    // 这个请求只返回文字分析，不包含繁重的 chartPoints，理应很快
    const baseReportPromise = fetchWithRetry(async () => {
      const res = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: BAZI_BASE_INSTRUCTION + REPORT_TEMPLATE },
          { role: "user", content: baziContext }
        ],
        response_format: { type: 'json_object' }
      });
      return JSON.parse(res.choices[0].message.content!.replace(/```json\n?|\n?```/g, '').trim());
    }, 2, 180000);

    // 2. 并行获取 K 线数据 (1-100岁拆分为4块)
    const chunks = [
      { s: 1, e: 25 },
      { s: 26, e: 50 },
      { s: 51, e: 75 },
      { s: 76, e: 100 }
    ];

    const chartDataPromise = Promise.all(chunks.map(async (c) => {
      return await fetchWithRetry(async () => {
        const res = await openai.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: BAZI_BASE_INSTRUCTION + DATA_CHUNK_TEMPLATE(c.s, c.e) },
            { role: "user", content: baziContext }
          ],
          response_format: { type: 'json_object' }
        });
        return JSON.parse(res.choices[0].message.content!.replace(/```json\n?|\n?```/g, '').trim());
      }, 2, 180000); // 每个分块也给 3 分钟，防止拥堵
    }));

    // 等待所有请求完成
    console.log("[DeepSeek] 并发请求中...");
    const [baseReport, chunkResults] = await Promise.all([baseReportPromise, chartDataPromise]);

    console.log("[DeepSeek] 数据获取成功，正在缝合 K 线...");

    // 3. 缝合 & 归一化数据
    const stitchedPoints = stitchCharts(chunkResults);

    const finalReport: BaziReport = {
      ...baseReport,
      chartPoints: stitchedPoints
    };

    return finalReport;

  } catch (e: any) {
    console.error("[DeepSeek] 生成失败:", e);
    throw new Error("推演中止: " + (e.message || "请稍后重试"));
  }
}
