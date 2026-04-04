'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ArchivesPage() {
  const [archivesList, setArchivesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('date'); 
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchArchives();
  }, []);

  const fetchArchives = async () => {
    const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ✨ 핵심: 상태가 'confirmed'이고, 날짜가 '오늘보다 이전'인 것만 긁어옵니다.
    const { data: schedulesData } = await supabase.from('schedules')
      .select(`*, games(*)`)
      .eq('status', 'confirmed')
      .lt('available_date', today)
      .order('available_date', { ascending: false }); // 최신 과거부터 보여주기 위해 내림차순

    const { data: profilesData } = await supabase.from('profiles').select('id, nickname');
    const profileMap = (profilesData || []).reduce((acc, p) => { acc[p.id] = p.nickname; return acc; }, {});

    const grouped = (schedulesData || []).reduce((acc, curr) => {
      const key = `${curr.available_date}_${curr.game_id}`;
      if (!acc[key]) acc[key] = { ...curr, title: curr.games.title, playerCount: 0, gmCount: 0, playerNames: [], gmNames: [] };
      
      const nickname = profileMap[curr.user_id] || '익명';
      if (curr.role_wanted === 'gm') { acc[key].gmCount++; acc[key].gmNames.push(nickname); }
      else { acc[key].playerCount++; acc[key].playerNames.push(nickname); }
      
      return acc;
    }, {});

    setArchivesList(Object.values(grouped));
    setLoading(false);
  };

  const getDisplayList = () => {
    let list = archivesList;

    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      list = list.filter(s => 
        s.title.toLowerCase().includes(lowerSearch) || 
        s.playerNames.some(name => name.toLowerCase().includes(lowerSearch)) ||
        s.gmNames.some(name => name.toLowerCase().includes(lowerSearch))
      );
    }
    return list;
  };

  const getGroupedData = (list, mode) => {
    if (mode === 'game') {
      const grouped = list.reduce((acc, curr) => {
        if (!acc[curr.game_id]) acc[curr.game_id] = { title: curr.title, schedules: [] };
        acc[curr.game_id].schedules.push(curr);
        return acc;
      }, {});
      return Object.values(grouped).sort((a, b) => a.title.localeCompare(b.title));
    } else {
      const grouped = list.reduce((acc, curr) => {
        if (!acc[curr.available_date]) acc[curr.available_date] = { date: curr.available_date, games: [] };
        acc[curr.available_date].games.push(curr);
        return acc;
      }, {});
      return Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date)); // 날짜 최신순
    }
  };

  const displayData = getGroupedData(getDisplayList(), viewMode);

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">역사를 해독하는 중...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-amber-900">
      <div className="flex justify-between items-center mb-8 border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-amber-500">기록 보관소 📜</h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold hover:bg-zinc-700 transition">대시보드로</Link>
      </div>

      <div className="flex flex-col gap-4 mb-8 bg-zinc-900 p-5 rounded-xl border-2 border-zinc-800 shadow-sm">
        <div className="w-full">
          <input 
            type="text" 
            placeholder="과거의 게임 제목이나 참여 요원 이름으로 검색..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-800 border-2 border-zinc-700 p-3 rounded-xl focus:border-amber-600 outline-none text-zinc-100 placeholder-zinc-500 transition"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={() => setViewMode('date')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${viewMode === 'date' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>📅 날짜별 보기</button>
          <button onClick={() => setViewMode('game')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${viewMode === 'game' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🎮 게임별 보기</button>
        </div>
      </div>

      <div className="grid gap-6">
        {displayData.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 font-bold border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900">
            {searchTerm ? "검색 조건과 일치하는 과거의 거사가 없습니다." : "아직 기록된 과거가 없습니다."}
          </div>
        ) : (
          displayData.map((section, idx) => (
            <div key={idx} className="bg-zinc-900 p-6 rounded-2xl border-2 border-zinc-700 shadow-md">
              <h2 className="text-2xl font-black mb-5 border-b-2 border-zinc-800 pb-3 text-zinc-100">{viewMode === 'game' ? section.title : section.date}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(viewMode === 'game' ? section.schedules : section.games).map((item, sIdx) => (
                  <div key={sIdx} className="p-6 rounded-xl border-2 bg-zinc-950 border-zinc-800 flex flex-col justify-between shadow-sm opacity-90 hover:opacity-100 transition">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-xl text-zinc-300">{viewMode === 'game' ? item.available_date : item.title}</span>
                        <span className="text-amber-500 text-xs font-bold bg-amber-950/30 border border-amber-900/50 px-3 py-1.5 rounded-lg shadow-sm">완료됨</span>
                      </div>
                      <div className="text-sm bg-zinc-900 p-4 rounded-xl mt-4 border border-zinc-800">
                        <p className="text-blue-400/80 font-bold mb-2">👤 플레이어: {item.playerNames.join(', ')}</p>
                        {item.games.needs_gm && <p className="text-purple-400/80 font-bold">👑 GM: {item.gmNames.join(', ')}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}