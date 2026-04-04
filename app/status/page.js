'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { sendDiscordMessage } from '@/lib/notifications';

export default function StatusPage() {
  const [statusList, setStatusList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState('waiting'); 
  const [viewMode, setViewMode] = useState('game'); 
  const [confirmedFilter, setConfirmedFilter] = useState('all'); 
  const [playedFilter, setPlayedFilter] = useState('unplayed'); 
  
  // ✨ 추가: 검색어 상태 관리
  const [searchTerm, setSearchTerm] = useState('');
  
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myPlayedGames, setMyPlayedGames] = useState([]);
  const [joinModalItem, setJoinModalItem] = useState(null);

  useEffect(() => { fetchUserAndSchedules(); }, []);

  const cleanUpConflictingSchedules = async (confirmedDate, confirmedGameId, participantIds) => {
    if (!participantIds || participantIds.length === 0) return;
    const { data: toDelete } = await supabase.from('schedules')
      .select('id')
      .eq('status', 'waiting')
      .in('user_id', participantIds)
      .or(`available_date.eq.${confirmedDate},game_id.eq.${confirmedGameId}`);

    if (toDelete && toDelete.length > 0) {
      const ids = toDelete.map(s => s.id);
      await supabase.from('schedules').delete().in('id', ids);
    }
  };

  const fetchUserAndSchedules = async (isRetry = false) => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (sessionUser) {
      setUser(sessionUser);
      const [prRes, playedRes] = await Promise.all([
        supabase.from('profiles').select('is_admin').eq('id', sessionUser.id).single(),
        supabase.from('played_games').select('game_id').eq('user_id', sessionUser.id).eq('is_gm', false)
      ]);
      
      if (prRes.data?.is_admin) setIsAdmin(true);
      if (playedRes.data) setMyPlayedGames(playedRes.data.map(p => p.game_id));
    }

    const { data: schedulesData } = await supabase.from('schedules').select(`*, games(*)`).order('available_date');
    const { data: profilesData } = await supabase.from('profiles').select('id, nickname');
    const profileMap = (profilesData || []).reduce((acc, p) => { acc[p.id] = p.nickname; return acc; }, {});

    const grouped = (schedulesData || []).reduce((acc, curr) => {
      const key = `${curr.available_date}_${curr.game_id}`;
      if (!acc[key]) acc[key] = { ...curr, title: curr.games.title, playerCount: 0, gmCount: 0, playerNames: [], gmNames: [], applicants: [], mySchedule: null, roomStatus: 'waiting' };
      
      const nickname = profileMap[curr.user_id] || '익명';
      if (curr.role_wanted === 'gm') { acc[key].gmCount++; acc[key].gmNames.push(nickname); }
      else { acc[key].playerCount++; acc[key].playerNames.push(nickname); }
      
      acc[key].applicants.push({ ...curr, nickname });
      if (sessionUser && curr.user_id === sessionUser.id) acc[key].mySchedule = curr;
      if (curr.status === 'confirmed') acc[key].roomStatus = 'confirmed';
      return acc;
    }, {});

    const groupArray = Object.values(grouped);

    if (!isRetry) {
      for (const g of groupArray) {
        if (g.roomStatus === 'waiting' && g.playerCount >= g.games.max_players) {
          if (g.games.needs_gm && g.gmCount === 0) continue;
          await supabase.from('schedules').update({ status: 'confirmed' }).eq('available_date', g.available_date).eq('game_id', g.game_id);
          const pIds = g.applicants.map(a => a.user_id);
          await cleanUpConflictingSchedules(g.available_date, g.game_id, pIds);
          sendDiscordMessage(`🎉 **자동 모집 확정!**\n게임: [${g.title}]\n날짜: ${g.available_date}\n참여자: ${[...g.playerNames, ...g.gmNames].join(', ')}`);
          return fetchUserAndSchedules(true);
        }
      }
    }
    setStatusList(groupArray);
    setLoading(false);
  };

  const openJoinModal = (item) => {
    if (!user) return alert("로그인 필요");
    setJoinModalItem(item);
  };

  const executeJoin = async (role) => {
    if (!joinModalItem) return;
    const { error } = await supabase.from('schedules').insert([{ 
      user_id: user.id, 
      game_id: joinModalItem.game_id, 
      available_date: joinModalItem.available_date, 
      role_wanted: role 
    }]);

    if (!error) {
      setJoinModalItem(null); 
      fetchUserAndSchedules(); 
    } else {
      alert("신청 중 오류가 발생했습니다.");
    }
  };

  const toggleReady = async (item) => {
    const newReady = !item.mySchedule.is_ready;
    await supabase.from('schedules').update({ is_ready: newReady }).eq('id', item.mySchedule.id);
    const readyCount = item.applicants.filter(a => (a.id === item.mySchedule.id ? newReady : a.is_ready)).length;
    if (item.playerCount >= (item.games.min_players || 1) && readyCount === item.applicants.length) {
      if (item.games.needs_gm && item.gmCount === 0) return alert("GM이 필요하여 확정할 수 없습니다.");
      await supabase.from('schedules').update({ status: 'confirmed' }).eq('available_date', item.available_date).eq('game_id', item.game_id);
      const pIds = item.applicants.map(a => a.user_id);
      await cleanUpConflictingSchedules(item.available_date, item.game_id, pIds);
      sendDiscordMessage(`✅ **만장일치 확정!**\n게임: [${item.title}]\n날짜: ${item.available_date}\n참여자: ${item.applicants.map(a => a.nickname).join(', ')}`);
    }
    fetchUserAndSchedules();
  };

  const forceConfirm = async (date, gameId, title, applicants) => {
    if (!window.confirm("이 모임을 강제로 확정하시겠습니까?")) return;
    const { error } = await supabase.from('schedules').update({ status: 'confirmed' }).eq('available_date', date).eq('game_id', gameId);
    if (!error) {
      const pIds = applicants.map(a => a.user_id);
      await cleanUpConflictingSchedules(date, gameId, pIds);
      sendDiscordMessage(`👑 **수동 확정!**\n관리자가 [${title}] 모임을 확정하였습니다.\n날짜: ${date}`);
      fetchUserAndSchedules();
    }
  };

  const cancelConfirm = async (date, gameId) => {
    if (!window.confirm("확정을 취소하시겠습니까?")) return;
    await supabase.from('schedules').update({ status: 'waiting', is_ready: false }).eq('available_date', date).eq('game_id', gameId);
    fetchUserAndSchedules();
  };

  const getDisplayList = () => {
    let list = statusList.filter(s => s.roomStatus === mainTab);
    
    // ✨ 핵심 추가: 오늘 날짜(YYYY-MM-DD) 구하기
    // 한국 시간(KST) 기준으로 안전하게 오늘 날짜를 가져옵니다.
    const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ✨ 핵심 추가: '오늘'을 포함한 미래의 일정만 남기기
    list = list.filter(s => s.available_date >= today);
    
    // 1. 기존 확정/로그인 필터
    if (mainTab === 'confirmed' && confirmedFilter === 'my') list = list.filter(s => s.mySchedule !== null);
    if (mainTab === 'waiting' && user) {
      if (playedFilter === 'unplayed') list = list.filter(s => !myPlayedGames.includes(s.game_id));
      else if (playedFilter === 'played') list = list.filter(s => myPlayedGames.includes(s.game_id));
    }

    // 2. 스마트 검색 필터 (게임 제목 OR 참여자 닉네임)
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
      return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
  };

  const displayData = getGroupedData(getDisplayList(), viewMode);

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">현황을 불러오는 중...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900 relative">
      <div className="flex justify-between items-center mb-8 border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-zinc-100">현황판 📊</h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold hover:bg-zinc-700 transition">대시보드로</Link>
      </div>

      <div className="flex gap-4 mb-6">
        <button onClick={() => setMainTab('waiting')} className={`flex-1 py-3 text-lg font-extrabold rounded-t-xl border-b-4 transition ${mainTab === 'waiting' ? 'border-red-600 text-red-400 bg-zinc-900' : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'}`}>⏳ 모집 중</button>
        <button onClick={() => setMainTab('confirmed')} className={`flex-1 py-3 text-lg font-extrabold rounded-t-xl border-b-4 transition ${mainTab === 'confirmed' ? 'border-emerald-500 text-emerald-400 bg-zinc-900' : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'}`}>🎉 확정됨</button>
      </div>

      <div className="flex flex-col gap-4 mb-8 bg-zinc-900 p-5 rounded-xl border-2 border-zinc-800 shadow-sm">
        {/* ✨ 상단: 실시간 검색바 추가 */}
        <div className="w-full">
          <input 
            type="text" 
            placeholder="게임 제목이나 참여 요원 이름으로 검색..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-800 border-2 border-zinc-700 p-3 rounded-xl focus:border-red-600 outline-none text-zinc-100 placeholder-zinc-500 transition"
          />
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex gap-2">
            <button onClick={() => setViewMode('game')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${viewMode === 'game' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🎮 게임별</button>
            <button onClick={() => setViewMode('date')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${viewMode === 'date' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>📅 날짜별</button>
          </div>
          
          {mainTab === 'waiting' && user && (
            <div className="flex gap-1">
              <button onClick={() => setPlayedFilter('unplayed')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${playedFilter === 'unplayed' ? 'bg-red-950 border-red-700 text-red-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🎲 안 해본 게임</button>
              <button onClick={() => setPlayedFilter('played')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${playedFilter === 'played' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🩸 이미 플레이 함</button>
            </div>
          )}

          {mainTab === 'confirmed' && (
            <div className="flex gap-1">
              <button onClick={() => setConfirmedFilter('my')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${confirmedFilter === 'my' ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>👤 내 일정</button>
              <button onClick={() => setConfirmedFilter('all')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${confirmedFilter === 'all' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🌍 전체</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6">
        {displayData.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 font-bold border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900">
            {searchTerm ? "검색 조건과 일치하는 거사가 없습니다. 🕵️‍♂️" : "해당 조건의 내역이 없습니다."}
          </div>
        ) : (
          displayData.map((section, idx) => (
            <div key={idx} className="bg-zinc-900 p-6 rounded-2xl border-2 border-zinc-700 shadow-md">
              <h2 className="text-2xl font-black mb-5 border-b-2 border-zinc-800 pb-3 text-zinc-100">{viewMode === 'game' ? section.title : section.date}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(viewMode === 'game' ? section.schedules : section.games).map((item, sIdx) => {
                  const hasRequiredGm = item.games.needs_gm ? item.gmCount > 0 : true;
                  const canConsensus = item.playerCount >= (item.games.min_players || 1) && hasRequiredGm;

                  return (
                    <div key={sIdx} className={`p-6 rounded-xl border-2 transition flex flex-col justify-between shadow-sm ${item.roomStatus === 'confirmed' ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-zinc-950 border-zinc-700'}`}>
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <Link href={`/games/${item.game_id}`} className="font-black text-xl text-zinc-100 hover:text-red-400 hover:underline transition">{viewMode === 'game' ? item.available_date : item.title}</Link>
                          {item.roomStatus === 'confirmed' && <span className="text-emerald-400 text-xs font-bold bg-emerald-950/50 border border-emerald-900/50 px-3 py-1.5 rounded-lg shadow-sm">🎉 확정</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4 text-xs font-bold text-zinc-400">
                          <span className="bg-zinc-800 border border-zinc-600 px-2 py-1 rounded">👥 {item.games.min_players}~{item.games.max_players}명 (현재 {item.playerCount}명)</span>
                          {item.games.needs_gm && <span className={`border px-2 py-1 rounded ${item.gmCount > 0 ? 'bg-purple-900 text-purple-300 border-purple-700' : 'bg-zinc-800 text-zinc-500 border-zinc-600'}`}>👑 GM {item.gmCount}명</span>}
                        </div>
                        <div className="text-sm bg-zinc-900 p-4 rounded-xl mb-5 border border-zinc-800">
                          <p className="text-blue-400 font-bold mb-2">👤 플레이어: {item.playerNames.join(', ')}</p>
                          {item.games.needs_gm && <p className="text-purple-400 font-bold">👑 GM: {item.gmNames.length > 0 ? item.gmNames.join(', ') : '구인중 🚨'}</p>}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-auto">
                        {item.roomStatus === 'waiting' && (
                          item.mySchedule ? (
                            <button onClick={() => toggleReady(item)} className={`px-4 py-3 rounded-lg font-black text-sm w-full transition border-2 ${item.mySchedule.is_ready ? 'bg-amber-600 border-amber-600 text-white' : 'bg-zinc-800 border-amber-600 text-amber-500 hover:bg-amber-900/30'}`}>
                              {item.mySchedule.is_ready ? '✓ 찬성 취소' : '👉 진행 찬성하기!'}
                            </button>
                          ) : (
                            <button onClick={() => openJoinModal(item)} className="px-4 py-3 bg-red-700 border-2 border-red-600 text-white rounded-lg font-black text-sm hover:bg-red-600 w-full shadow-md transition">➕ 나도 참여하기</button>
                          )
                        )}
                        {isAdmin && (
                          <div className="flex gap-2 mt-3 pt-3 border-t-2 border-zinc-800">
                            {item.roomStatus === 'waiting' ? (
                              <button onClick={() => forceConfirm(item.available_date, item.game_id, item.title, item.applicants)} className="px-3 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-300 rounded-lg text-xs font-bold flex-1 hover:bg-zinc-700">👑 강제 확정</button>
                            ) : (
                              <button onClick={() => cancelConfirm(item.available_date, item.game_id)} className="px-3 py-2 bg-zinc-900 border-2 border-red-900/50 text-red-500 rounded-lg text-xs font-bold flex-1 hover:bg-red-950/30">👑 확정 취소</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {joinModalItem && (() => {
        const isPlayerFull = joinModalItem.playerCount >= joinModalItem.games.max_players;
        const isGmFull = joinModalItem.gmCount >= 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border-2 border-zinc-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
              <h3 className="text-xl font-black text-zinc-100 mb-2 border-b-2 border-zinc-800 pb-3">[{joinModalItem.title}] 합류하기</h3>
              <p className="text-sm text-zinc-400 mb-6 font-bold">{joinModalItem.available_date} 거사에 어떤 역할로 참여하시겠습니까?</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => executeJoin('player')} disabled={isPlayerFull} className={`px-4 py-3 rounded-xl font-black text-sm w-full transition border-2 ${isPlayerFull ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed' : 'bg-red-900 border-red-700 text-white hover:bg-red-800'}`}>🩸 플레이어로 참여</button>
                {joinModalItem.games.needs_gm && <button onClick={() => executeJoin('gm')} disabled={isGmFull} className={`px-4 py-2 bg-purple-900 text-white rounded-lg font-bold`}>👑 GM으로 참여</button>}
                <button onClick={() => setJoinModalItem(null)} className="px-4 py-3 mt-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-300 rounded-xl font-bold text-sm w-full hover:bg-zinc-700 transition">✖ 취소</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}