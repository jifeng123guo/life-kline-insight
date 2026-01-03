
import React, { useState, useEffect } from 'react';
import { User, UserInput, BaziReport } from './types';
import { Icons } from './constants';
import { getBaziData } from './services/baziCalculator';
import { analyzeBazi } from './services/deepseekService';
import KlineChart from './components/KlineChart';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false); // Add Login modal state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [formData, setFormData] = useState<UserInput>({
    realName: '',
    gender: 'Male',
    birthDate: '1995-01-01',
    birthTime: '12:00',
    city: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BaziReport | null>(null);
  const [history, setHistory] = useState<BaziReport[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(err => console.error("Auth Check Failed", err));
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      // Transform DB format to UI format if needed, simplistic mapping here
      const mappedHistory = data.items.map((item: any) => ({
        ...item.analysisData, // Assuming analysisData holds the BaziReport structure except chartPoints which might be heavy
        chartPoints: item.chartData || [],
        // Re-attach other metadata if necessary
      }));
      // Note: The history API in server/index.js (getAnalysesByUserId) returns full objects currently.
      // Ideally we fetch full list or summary. Let's assume full list for simplicity or fetch detail on click.
      // But server code returns full list for getAnalysesByUserId.
      // Wait, server/index.js /api/history returns { items: list }. list comes from getAnalysesByUserId.
      // database.js getAnalysesByUserId returns parsed JSON. So structure matches.
      setHistory(mappedHistory);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  useEffect(() => {
    if (user && showHistory) {
      fetchHistory();
    }
  }, [user, showHistory]);

  const handleRegister = async () => {
    if (!regEmail || !regPassword) return alert("请填写邮箱和密码");
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, password: regPassword })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUser(data.user);
      setShowRegister(false);
    } catch (error: any) {
      alert("注册失败: " + error.message);
    }
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) return alert("请填写邮箱和密码");
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUser(data.user);
      setShowLogin(false);
    } catch (error: any) {
      alert("登录失败: " + error.message);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setResult(null);
  }

  const handleShare = async () => {
    if (!user) {
      alert("请先登录后分享");
      return;
    }
    // Mock share action
    const text = "Life K-Line Insight: 量化命运，看清起伏。";
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Life Insight', text: text, url: window.location.href });
        // Call API
        const res = await fetch('/api/points/share', { method: 'POST' });
        const data = await res.json();
        setUser({ ...user, points: data.points });
        alert("分享成功！获得 10 积分");
      } catch (err) {
        console.log("Share canceled", err);
      }
    } else {
      // Fallback for desktop
      try {
        await navigator.clipboard.writeText(window.location.href);
        const res = await fetch('/api/points/share', { method: 'POST' });
        const data = await res.json();
        setUser({ ...user, points: data.points });
        alert("链接已复制！分享成功，获得 10 积分");
      } catch (e) {
        alert("复制失败");
      }
    }
  };

  const handleAnalyze = async () => {
    if (!formData.realName || !formData.birthDate || !formData.birthTime) {
      alert("请填写完整的生辰信息");
      return;
    }

    let isGuest = false;

    if (!user) {
      // Check guest usage limit logic
      const guestUsed = localStorage.getItem('lifekline_guest_used');
      if (guestUsed) {
        setShowLogin(true);
        alert("游客仅限体验一次，请登录或注册以继续使用。");
        return;
      }
      isGuest = true;
    } else if (user.points < 5) {
      alert("积分不足，请分享赚取积分或模拟充值");
      return;
    }

    setLoading(true);
    try {
      const baziParams = getBaziData(formData.birthDate, formData.birthTime, formData.gender);

      // 1. Generate via DeepSeek (Frontend)
      const report = await analyzeBazi({
        ...baziParams,
        gender: formData.gender,
        name: formData.realName
      });

      // 2. Save to Backend
      const saveRes = await fetch('/api/analysis/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bazi: report.bazi,
          chartData: report.chartPoints,
          analysisData: report,
          cost: isGuest ? 0 : 5
        })
      });

      const saveData = await saveRes.json();
      if (saveData.error) throw new Error(saveData.error);

      // Update local state
      setResult(report);
      if (isGuest) {
        localStorage.setItem('lifekline_guest_used', 'true');
      } else {
        setUser({ ...user!, points: saveData.points });
      }

    } catch (error: any) {
      console.error("Analysis Error:", error);
      alert(`分析失败: ${error.message || "未知错误"}。请检查 API Key 配置或网络状态。`);
    } finally {
      setLoading(false);
    }
  };

  const addPoints = async () => {
    if (user) {
      try {
        const res = await fetch('/api/points/add', { method: 'POST' });
        const data = await res.json();
        setUser({ ...user, points: data.points });
        alert("模拟充值成功！");
      } catch (e) {
        alert("充值失败");
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-slide-up">
            <h3 className="text-2xl font-bold mb-2">登录</h3>
            <input
              type="email" placeholder="邮箱"
              value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
              className="w-full bg-gray-50 border-0 h-12 rounded-xl px-4 mb-4 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
            <input
              type="password" placeholder="密码"
              value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
              className="w-full bg-gray-50 border-0 h-12 rounded-xl px-4 mb-4 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
            <button onClick={handleLogin} className="w-full h-12 bg-black text-white rounded-xl font-bold active:scale-95 transition-transform">登录</button>
            <div className="flex justify-between mt-4">
              <button onClick={() => setShowLogin(false)} className="text-gray-400 text-sm">取消</button>
              <button onClick={() => { setShowLogin(false); setShowRegister(true); }} className="text-blue-600 text-sm font-bold">没有账号？去注册</button>
            </div>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-slide-up">
            <h3 className="text-2xl font-bold mb-2">注册</h3>
            <p className="text-gray-500 mb-6 text-sm">注册即送 10 积分。</p>
            <input
              type="email" placeholder="邮箱"
              value={regEmail} onChange={e => setRegEmail(e.target.value)}
              className="w-full bg-gray-50 border-0 h-12 rounded-xl px-4 mb-4 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
            <input
              type="password" placeholder="密码 (至少6位)"
              value={regPassword} onChange={e => setRegPassword(e.target.value)}
              className="w-full bg-gray-50 border-0 h-12 rounded-xl px-4 mb-4 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
            <button onClick={handleRegister} className="w-full h-12 bg-black text-white rounded-xl font-bold active:scale-95 transition-transform">立即注册</button>
            <div className="flex justify-between mt-4">
              <button onClick={() => setShowRegister(false)} className="text-gray-400 text-sm">取消</button>
              <button onClick={() => { setShowRegister(false); setShowLogin(true); }} className="text-blue-600 text-sm font-bold">已有账号？去登录</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <nav className="glass-panel sticky top-0 w-full z-50 border-b">
        <div className="max-w-6xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setResult(null)}>
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white shadow-lg">
              <Icons.Sparkles />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight hidden sm:block">Life Insight</h1>
          </div>

          <div className="flex gap-4 items-center">
            {user ? (
              <div className="flex items-center gap-3 bg-gray-100/80 px-4 py-2 rounded-full cursor-pointer hover:bg-gray-200 transition-colors" title="点击退出登录" onClick={handleLogout}>
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                  <Icons.User className="w-4 h-4" /> {user.email.split('@')[0]}
                </div>
                <div className="w-px h-3 bg-gray-300"></div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
                  <Icons.Coins className="w-4 h-4" /> {user.points}
                </div>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="text-sm font-bold text-blue-600">登录 / 注册</button>
            )}
            <button onClick={() => {
              if (!user) return setShowLogin(true);
              setShowHistory(true);
            }} className="p-2.5 rounded-full hover:bg-gray-100 transition-colors">
              <Icons.History />
            </button>
            {/* Share Button */}
            <button onClick={handleShare} className="hidden sm:flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-gray-800 transition-colors">
              分享获10积分
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-grow max-w-6xl mx-auto w-full px-4 pt-12 pb-24">
        {!result ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <h2 className="text-5xl font-black tracking-tight leading-tight">
                量化命运<br />
                <span className="text-blue-600">看清起伏</span>
              </h2>
              <p className="text-lg text-gray-500 leading-relaxed">
                结合传统八字与 AI 深度学习，生成专属的人生行情 K 线图。洞察机遇，规避风险。
              </p>
              <div className="flex gap-4 items-center pt-4">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map(i => (
                    <img key={i} src={`https://picsum.photos/seed/${i}/100/100`} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="user" />
                  ))}
                </div>
                <p className="text-sm text-gray-400 font-medium">已有 10k+ 用户生成人生白皮书</p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="glass-panel p-8 sm:p-10 rounded-[2.5rem] shadow-2xl space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">真实姓名</label>
                    <input
                      type="text"
                      placeholder="用于命理分析的姓名"
                      value={formData.realName}
                      onChange={e => setFormData({ ...formData, realName: e.target.value })}
                      className="w-full h-14 bg-gray-50/50 rounded-2xl px-5 text-lg font-medium focus:ring-2 focus:ring-blue-500 outline-none border-0 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">性别</label>
                    <div className="flex bg-gray-100 p-1.5 rounded-2xl h-14">
                      {(['Male', 'Female'] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => setFormData({ ...formData, gender: g })}
                          className={`flex-1 rounded-xl text-sm font-bold transition-all ${formData.gender === g ? 'bg-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          {g === 'Male' ? '乾造 (男)' : '坤造 (女)'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">出生日期</label>
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full h-14 bg-gray-50/50 rounded-2xl px-5 text-lg font-medium outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">具体时辰</label>
                    <input
                      type="time"
                      value={formData.birthTime}
                      onChange={e => setFormData({ ...formData, birthTime: e.target.value })}
                      className="w-full h-14 bg-gray-50/50 rounded-2xl px-5 text-lg font-medium outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">出生城市</label>
                    <input
                      type="text"
                      placeholder="省份/城市"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full h-14 bg-gray-50/50 rounded-2xl px-5 text-lg font-medium outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[1.25rem] font-black text-xl shadow-xl shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>正在推演命格...</span>
                    </div>
                  ) : (
                    <>
                      <Icons.Sparkles className="w-6 h-6" />
                      消耗 5 积分生成 K 线
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-10 animate-fade-in">
            {/* Report Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <button onClick={() => setResult(null)} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-black transition-colors">
                <Icons.ArrowLeft /> 返回首页
              </button>
              <div className="flex gap-2">
                {result.bazi.map((p, i) => (
                  <span key={i} className="px-4 py-2 bg-white rounded-2xl border font-mono text-sm font-bold text-gray-700 shadow-sm">{p}</span>
                ))}
              </div>
            </div>

            {/* Overview Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 glass-panel p-10 rounded-[2.5rem] shadow-xl space-y-6">
                <div className="flex items-center gap-3 text-blue-600">
                  <Icons.Activity className="w-6 h-6" />
                  <span className="text-sm font-black uppercase tracking-widest">命局总评</span>
                </div>
                <h2 className="text-3xl font-black text-gray-800 leading-tight">
                  {result.summary && result.summary.split('。')[0]}。
                </h2>
                <p className="text-lg text-gray-500 leading-relaxed text-justify">
                  {result.summary}
                </p>
              </div>

              <div className="glass-panel p-10 rounded-[2.5rem] shadow-xl flex flex-col justify-center gap-8">
                {[
                  { label: "综合评分", score: result.summaryScore, color: "bg-blue-600" },
                  { label: "财富指数", score: result.wealthScore, color: "bg-orange-500" },
                  { label: "事业高度", score: result.industryScore, color: "bg-purple-600" }
                ].map(bar => (
                  <div key={bar.label}>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-bold text-gray-400 uppercase">{bar.label}</span>
                      <span className="text-2xl font-black text-gray-800">{bar.score} <span className="text-xs font-normal text-gray-400">/ 10</span></span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${bar.color} transition-all duration-1000`} style={{ width: `${bar.score * 10}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* K-Line Chart */}
            <div className="glass-panel p-4 sm:p-8 rounded-[3rem] shadow-2xl bg-white overflow-hidden">
              <div className="flex justify-between items-center mb-6 px-4">
                <h3 className="text-2xl font-black text-gray-800">虚岁人生 K 线图</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-500"><div className="w-2 h-2 rounded-full bg-red-500"></div> 旺 (Bull)</div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-green-500"><div className="w-2 h-2 rounded-full bg-green-500"></div> 衰 (Bear)</div>
                </div>
              </div>
              <KlineChart data={result.chartPoints} />
            </div>

            {/* Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <AnalysisCard title="性格心理" icon="🧠" content={result.personality} score={result.personalityScore} />
              <AnalysisCard title="事业行业" icon="💼" content={result.industry} score={result.industryScore} />
              <AnalysisCard title="财富密码" icon="💰" content={result.wealth} score={result.wealthScore} />
              <AnalysisCard title="婚姻情感" icon="❤️" content={result.marriage} score={result.marriageScore} />
              <AnalysisCard title="健康建议" icon="🏥" content={result.health} score={result.healthScore} />
              <AnalysisCard title="风水建议" icon="🧭" content={result.fengShui} score={result.fengShuiScore} />
            </div>
          </div>
        )}
      </main>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
          <div className="relative bg-white w-[350px] max-w-[80vw] h-full shadow-2xl p-8 overflow-y-auto animate-slide-up ml-auto">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black">历史推演</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                title="后端数据只能在数据库中删除"
              >
                <Icons.ArrowLeft className="rotate-180" />
              </button>
            </div>
            <div className="space-y-4">
              {history.length === 0 && <p className="text-center text-gray-400 py-10">暂无推演记录</p>}
              {history.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => { setResult(item); setShowHistory(false); }}
                  className="p-5 rounded-2xl bg-gray-50 hover:bg-blue-50 cursor-pointer transition-all border border-gray-100 hover:border-blue-200"
                >
                  <div className="font-black text-gray-800">{item.summary ? item.summary.split('。')[0] : '历史记录'}</div>
                  <div className="flex gap-2 mt-3">
                    {item.bazi && item.bazi.slice(0, 2).map((b, i) => (
                      <span key={i} className="text-[10px] font-bold px-2 py-0.5 bg-white rounded border text-gray-500">{b}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full bg-white border-t py-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-6">
          <div className="flex gap-6 text-gray-400">
            <a href="https://www.youtube.com/channel/UCSrCCPbtqpfobsC0uThogQA?sub_confirmation=1" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors font-bold text-sm">YouTube</a>
            <a href="https://t.me/+6RZTwpCVQKE5NDY1" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors font-bold text-sm">Telegram</a>
            <a href="https://space.bilibili.com/493820858" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors font-bold text-sm">Bilibili</a>
          </div>
          <p
            className="text-[10px] text-gray-300 font-bold uppercase tracking-[0.2em] cursor-pointer"
            onClick={addPoints}
          >
            &copy; {new Date().getFullYear()} LIFE INSIGHT PROJECT | ALL RIGHTS RESERVED
          </p>
        </div>
      </footer>
    </div>
  );
};

const AnalysisCard: React.FC<{ title: string; icon: string | React.ReactNode; content: string; score: number; extra?: string }> = ({ title, icon, content, score, extra }) => (
  <div className="glass-panel p-8 rounded-[2rem] shadow-lg border-b-4 border-b-blue-600/10 hover:border-b-blue-600 transition-all group">
    <div className="flex justify-between items-start mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
          {icon}
        </div>
        <h4 className="font-black text-gray-800">{title}</h4>
      </div>
      <div className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-black text-gray-500 uppercase">{score}分</div>
    </div>
    <div className="text-sm text-gray-500 leading-relaxed text-justify whitespace-pre-line">
      {content}
    </div>
    {extra && (
      <div className="mt-4 pt-4 border-t border-gray-100 text-[10px] font-bold text-blue-600 uppercase tracking-wider italic">
        {extra}
      </div>
    )}
  </div>
);

export default App;
