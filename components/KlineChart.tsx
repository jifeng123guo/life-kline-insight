import React from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
  LabelList
} from 'recharts';
import { ChartPoint } from '../types';

interface Props {
  data: ChartPoint[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartPoint;
    // For red/green logic: standard finance is Green Up, Red Down. 
    // But in Chinese context usually Red is Up/Good, Green is Down/Bad. 
    // However, the prompt says "isUp" (Close >= Open). 
    // Let's stick to the visual style of the reference: 
    // green-100/green-700 for Up (吉), red-100/red-700 for Down (凶).
    const isUp = data.close >= data.open;
    return (
      <div className="bg-white/95 backdrop-blur-sm p-5 rounded-xl shadow-2xl border border-gray-200 z-50 w-[90vw] max-w-[320px] md:max-w-[400px]">
        {/* Header */}
        <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
          <div>
            <p className="text-xl font-bold text-gray-800 font-serif-sc">
              {data.year} {data.ganZhi}年 <span className="text-base text-gray-500 font-sans">({data.age}岁)</span>
            </p>
            <p className="text-sm text-indigo-600 font-medium mt-1">
              大运：{data.daYun || '未知'}
            </p>
          </div>
          <div className={`text-base font-bold px-2 py-1 rounded ${isUp ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {isUp ? '吉 ▲' : '凶 ▼'}
          </div>
        </div>

        {/* Data Grid */}
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 mb-4 bg-gray-50 p-2 rounded">
          <div className="text-center">
            <span className="block scale-90">开盘</span>
            <span className="font-mono text-gray-700 font-bold">{data.open}</span>
          </div>
          <div className="text-center">
            <span className="block scale-90">收盘</span>
            <span className="font-mono text-gray-700 font-bold">{data.close}</span>
          </div>
          <div className="text-center">
            <span className="block scale-90">最高</span>
            <span className="font-mono text-gray-700 font-bold">{data.high}</span>
          </div>
          <div className="text-center">
            <span className="block scale-90">最低</span>
            <span className="font-mono text-gray-700 font-bold">{data.low}</span>
          </div>
        </div>

        {/* Detailed Reason */}
        <div className="text-sm text-gray-700 leading-relaxed text-justify max-h-[200px] overflow-y-auto custom-scrollbar">
          {data.reason}
        </div>
      </div>
    );
  }
  return null;
};

// CandleShape with cleaner wicks
const CandleShape = (props: any) => {
  const { x, y, width, height, payload, yAxis } = props;

  // In Chinese Stock Market: Red is Up, Green is Down.
  // Code uses: isUp = close >= open.
  const isUp = payload.close >= payload.open;
  const color = isUp ? '#ef4444' : '#22c55e'; // Red Up, Green Down
  const strokeColor = isUp ? '#b91c1c' : '#15803d';

  let highY = y;
  let lowY = y + height;

  if (yAxis && typeof yAxis.scale === 'function') {
    try {
      highY = yAxis.scale(payload.high);
      lowY = yAxis.scale(payload.low);
    } catch (e) {
      highY = y;
      lowY = y + height;
    }
  }

  const center = x + width / 2;
  const renderHeight = height < 2 ? 2 : height;

  return (
    <g>
      <line x1={center} y1={highY} x2={center} y2={lowY} stroke={strokeColor} strokeWidth={2} />
      <rect
        x={x}
        y={y}
        width={width}
        height={renderHeight}
        fill={color}
        stroke={strokeColor}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
};

// Custom Label Component for the Peak Star
const PeakLabel = (props: any) => {
  const { x, y, width, value, maxHigh } = props;

  // Only render if this value equals the global max high
  if (value !== maxHigh) return null;

  return (
    <g>
      {/* Red Star Icon */}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        transform={`translate(${x + width / 2 - 6}, ${y - 24}) scale(0.5)`}
        fill="#ef4444"
        stroke="#b91c1c"
        strokeWidth="1"
      />
      {/* Score Text */}
      <text
        x={x + width / 2}
        y={y - 28}
        fill="#b91c1c"
        fontSize={10}
        fontWeight="bold"
        textAnchor="middle"
      >
        {value}
      </text>
    </g>
  );
};

const KlineChart: React.FC<Props> = ({ data }) => {
  const transformedData = data.map(d => ({
    ...d,
    bodyRange: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
    // Helper for labelling
    labelPoint: d.high
  }));

  // Identify Da Yun change points to draw reference lines
  const daYunChanges = data.filter((d, i) => {
    if (i === 0) return true;
    return d.daYun !== data[i - 1].daYun;
  });

  const maxHigh = data.length > 0 ? Math.max(...data.map(d => d.high)) : 100;

  if (!data || data.length === 0) {
    return <div className="h-[350px] sm:h-[450px] lg:h-[500px] flex items-center justify-center text-gray-400">无数据</div>;
  }

  return (
    <div className="w-full h-[350px] sm:h-[450px] lg:h-[600px] p-2 md:p-6 rounded-xl relative">
      <div className="mb-6 flex justify-between items-center px-2">
        <h3 className="text-xl font-bold text-gray-800 font-serif-sc">人生流年大运K线图</h3>
        <div className="flex gap-4 text-xs font-medium">
          <span className="flex items-center text-red-700 bg-red-50 px-2 py-1 rounded"><div className="w-2 h-2 bg-red-500 mr-2 rounded-full"></div> 吉运 (涨)</span>
          <span className="flex items-center text-green-700 bg-green-50 px-2 py-1 rounded"><div className="w-2 h-2 bg-green-500 mr-2 rounded-full"></div> 凶运 (跌)</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={transformedData} margin={{ top: 30, right: 10, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

          <XAxis
            dataKey="age"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            interval={9}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
            label={{ value: '年龄', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#9ca3af' }}
          />

          <YAxis
            domain={[0, 'auto']}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            label={{ value: '运势分', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }} />

          {daYunChanges.map((point, index) => (
            <ReferenceLine
              key={`dayun-${index}`}
              x={point.age}
              stroke="#cbd5e1"
              strokeDasharray="3 3"
              strokeWidth={1}
            >
              <Label
                value={point.daYun}
                position="top"
                fill="#6366f1"
                fontSize={10}
                fontWeight="bold"
                className="hidden md:block"
              />
            </ReferenceLine>
          ))}

          <Bar
            dataKey="bodyRange"
            shape={<CandleShape />}
            isAnimationActive={true}
            animationDuration={1500}
          >
            <LabelList
              dataKey="high"
              position="top"
              content={<PeakLabel maxHigh={maxHigh} />}
            />
          </Bar>

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default KlineChart;
