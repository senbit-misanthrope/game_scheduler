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
  const [confirmedFilter, setConfirmedFilter] = useState('my'); 
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { fetchUserAndSchedules(); }, []);

  const cleanUpConflictingSchedules = async (confirmedDate, confirmedGameId, participantIds) => {
    const { error } = await supabase.from('schedules').delete()
      .eq('status', 'waiting').neq('role_wanted', 'gm').in('user_id', participantIds)
      .or(`available_date.eq.${confirmedDate},game_id.eq.${confirmedGameId}`);
    if (error) console.error("일정 정리 에러:", error);
  };

  const fetchUserAndSchedules = async (isRetry = false) => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (sessionUser) {
      setUser(sessionUser);
      const { data: pr } = await supabase.from('profiles').select('is_admin').eq('id', sessionUser.id).single();
      if (pr?.is_admin) setIsAdmin(true);
    }

    // ✨ 최적화: 일정과 프로필 데이터를 병렬 처리 또는 한 번에 조합 (Supabase 내장 관계 사용)
    const { data: schedulesData } = await supabase.from('schedules').select(`*, games(*)`).order('available_date');
    const { data: profilesData } = await supabase.from('profiles').select('id, nickname');
    const profileMap = (profilesData || []).reduce((acc, p) => { acc[p.id] = p.nickname; return acc; }, {});

    const grouped = (schedulesData || []).reduce((acc, curr) => {
      const key = `${curr.available_date}_${curr.game_id}`;
      if (!acc[key]) acc[key] = { ...curr, title: curr.games.title, playerCount: 0, gmCount: 0, playerNames: [], gmNames: [], applicants: [], mySchedule: null };
      
      const nickname = profileMap[curr.user_id] || '익명';
      if (curr.role_wanted === 'gm') { acc[key].gmCount++; acc[key].gmNames.push(nickname); }
      else { acc[key].playerCount++; acc[key].playerNames.push(nickname); }
      
      acc[key].applicants.push({ ...curr, nickname });
      if (sessionUser && curr.user_id === sessionUser.id) acc[key].mySchedule = curr;
      return acc;
    }, {});

    const groupArray = Object.values(grouped);

    if (!isRetry) {
      for (const g of groupArray) {
        if (g.status === 'waiting' && g.playerCount >= g.games.max_players) {
          if (g.games.needs_gm && g.gmCount === 0) continue;
          await supabase.from('schedules').update({ status: 'confirmed' }).eq('available_date', g.available_date).eq('game_id', g.game_id);
          const pIds = g.applicants.map(a => a.user_id);
          await cleanUpConflictingSchedules(g.available_date, g.game_id, pIds);
          sendDiscordMessage(`🎉 **모집 확정 (풀파티)!**\n게임: [${g.title}]\n날짜: ${g.available_date}\n참여자: ${[...g.playerNames, ...g.gmNames].join(', ')}`);
          return fetchUserAndSchedules(true);
        }
      }
    }

    setStatusList(groupArray);
    setLoading(false);
  };

  const handleQuickJoin = async (item) => {
    if (!user) return alert("로그인 필요");
    const role = (item.games.needs_gm && window.confirm(`[${item.title}]\n'확인'을 누르면 [플레이어]로, '취소'를 누르면 [GM]으로 신청합니다.`)) === false ? 'gm' : 'player';

    const { error } = await supabase.from('schedules').insert([{ user_id: user.id, game_id: item.game_id, available_date: item.available_date, role_wanted: role }]);
    if (!error) {
      const newPlayerCount = item.playerCount + (role === 'player' ? 1 : 0);
      const newGmCount = item.gmCount + (role === 'gm' ? 1 : 0);
      
      const { data: p } = await supabase.from('profiles').select('nickname');
      const pMap = (p || []).reduce((acc, curr) => { acc[curr.id] = curr.nickname; return acc; }, {});
      const currentNames = [...item.playerNames, ...item.gmNames, pMap[user.id] || '본인'];

      if (newPlayerCount === item.games.max_players) {
        if (item.games.needs_gm && newGmCount === 0) sendDiscordMessage(`🚨 **최대 인원 도달 (GM 구인 중)!**\n게임: [${item.title}]\n날짜: ${item.available_date}\n플레이어 인원이 꽉 찼지만 진행자(GM)가 없어 확정되지 않았습니다!\n현재 명단: ${currentNames.join(', ')}`);
      } else if (newPlayerCount === item.games.recommended_players) {
        if (item.games.needs_gm && newGmCount === 0) sendDiscordMessage(`🔥 **추천 인원 도달 (GM 구인 중)!**\n게임: [${item.title}]\n날짜: ${item.available_date}\n추천 인원에 도달했지만 진행자(GM)가 필요합니다!\n현재 명단: ${currentNames.join(', ')}`);
        else sendDiscordMessage(`🔥 **추천 인원 도달!**\n게임: [${item.title}]\n날짜: ${item.available_date}\n현황판에서 '진행 찬성'을 누르면 확정됩니다!\n현재 명단: ${currentNames.join(', ')}`);
      }
      fetchUserAndSchedules();
    }
  };

  const toggleReady = async (item) => {
    const newReady = !item.mySchedule.is_ready;
    await supabase.from('schedules').update({ is_ready: newReady }).eq('id', item.mySchedule.id);
    
    const readyCount = item.applicants.filter(a => (a.id === item.mySchedule.id ? newReady : a.is_ready)).length;
    const totalApplicants = item.applicants.length;
    
    if (item.playerCount >= (item.games.min_players || 1) && readyCount === totalApplicants) {
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
    await supabase.from('schedules').update({ status: 'confirmed' }).eq('available_date', date).eq('game_id', gameId);
    const pIds = applicants.map(a => a.user_id);
    await cleanUpConflictingSchedules(date, gameId, pIds);
    sendDiscordMessage(`👑 **수동 확정!**\n관리자가 [${title}] 모임을 확정하였습니다.\n날짜: ${date}`);
    fetchUserAndSchedules();
  };

  const cancelConfirm = async (date, gameId) => {
    if (!window.confirm("확정을 취소하시겠습니까?")) return;
    await supabase.from('schedules').update({ status: 'waiting', is_ready: false }).eq('available_date', date).eq('game_id', gameId);
    fetchUserAndSchedules();
  };

  const getDisplayList = () => {
    if (mainTab === 'waiting') return statusList.filter(s => s.status === 'waiting');
    let confirmed = statusList.filter(s => s.status === 'confirmed');
    if (confirmedFilter === 'my') confirmed = confirmed.filter(s => s.mySchedule !== null);
    return confirmed;
  };

  const getGroupedData = (list, mode) => {
    if (mode === 'game') {
      const grouped = list.reduce((acc, curr) => {
        if (!acc[curr.game_id]) acc[curr.game_id] = { title: curr.title, schedules: [] };
        acc[curr.game_id].schedules.push(curr);
        return acc;
      }, {});
      const arr = Object.values(grouped).sort((a, b) => a.title.localeCompare(b.title));
      arr.forEach(g => g.schedules.sort((a, b) => new Date(a.available_date) - new Date(b.available_date)));
      return arr;
    } else {
      const grouped = list.reduce((acc, curr) => {
        if (!acc[curr.available_date]) acc[curr.available_date] = { date: curr.available_date, games: [] };
        acc[curr.available_date].games.push(curr);
        return acc;
      }, {});
      const arr = Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
      arr.forEach(d => d.games.sort((a, b) => a.title.localeCompare(b.title)));
      return arr;
    }
  };

  const displayData = getGroupedData(getDisplayList(), viewMode);

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">현황을 불러오는 중...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900">
      <div className="flex justify-between items-center mb-8 border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-zinc-100">현황판 📊</h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold hover:bg-zinc-700 transition">대시보드로</Link>
      </div>

      <div className="flex gap-4 mb-6">
        <button onClick={() => setMainTab('waiting')} className={`flex-1 py-3 text-lg font-extrabold rounded-t-xl border-b-4 transition ${mainTab === 'waiting' ? 'border-red-600 text-red-400 bg-zinc-900' : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'}`}>⏳ 모집 중</button>
        <button onClick={() => setMainTab('confirmed')} className={`flex-1 py-3 text-lg font-extrabold rounded-t-xl border-b-4 transition ${mainTab === 'confirmed' ? 'border-emerald-500 text-emerald-400 bg-zinc-900' : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'}`}>🎉 확정됨</button>
      </div>

      <div className="flex justify-between items-center mb-8 bg-zinc-900 p-4 rounded-xl border-2 border-zinc-800 shadow-sm">
        <div className="flex gap-2">
          <button onClick={() => setViewMode('game')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${viewMode === 'game' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🎮 게임별</button>
          <button onClick={() => setViewMode('date')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${viewMode === 'date' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>📅 날짜별</button>
        </div>
        {mainTab === 'confirmed' && (
          <div className="flex gap-1">
            <button onClick={() => setConfirmedFilter('my')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${confirmedFilter === 'my' ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>👤 내 일정</button>
            <button onClick={() => setConfirmedFilter('all')} className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition ${confirmedFilter === 'all' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>🌍 전체</button>
          </div>
        )}
      </div>

      <div className="grid gap-6">
        {displayData.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 font-bold border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900">
            해당 조건의 내역이 없습니다.
          </div>
        ) : (
          displayData.map((section, idx) => (
            <div key={idx} className="bg-zinc-900 p-6 rounded-2xl border-2 border-zinc-700 shadow-md">
              <h2 className="text-2xl font-black mb-5 border-b-2 border-zinc-800 pb-3 text-zinc-100">{viewMode === 'game' ? section.title : section.date}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(viewMode === 'game' ? section.schedules : section.games).map((item, sIdx) => {
                  const totalApplicants = item.applicants.length; 
                  const readyCount = item.applicants.filter(a => a.is_ready).length;
                  const minPlayers = item.games.min_players || 1;
                  const hasRequiredGm = item.games.needs_gm ? item.gmCount > 0 : true;
                  const canConsensus = item.playerCount >= minPlayers && hasRequiredGm;

                  return (
                    <div key={sIdx} className={`p-6 rounded-xl border-2 transition flex flex-col justify-between shadow-sm ${item.status === 'confirmed' ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-zinc-950 border-zinc-700'}`}>
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <Link href={`/games/${item.game_id}`} className="font-black text-xl text-zinc-100 hover:text-red-400 hover:underline transition">
                            {viewMode === 'game' ? item.available_date : item.title}
                          </Link>
                          {item.status === 'confirmed' && <span className="text-emerald-400 text-xs font-bold bg-emerald-950/50 border border-emerald-900/50 px-3 py-1.5 rounded-lg shadow-sm">🎉 확정</span>}
                        </div>
                        <div className="text-sm bg-zinc-900 p-4 rounded-xl mb-5 border border-zinc-800">
                          <p className="text-blue-400 font-bold mb-2">👤 플레이어: {item.playerNames.join(', ')} ({item.playerCount}/{item.games.recommended_players})</p>
                          {item.games.needs_gm && (
                            <p className="text-purple-400 font-bold">👑 GM: {item.gmNames.length > 0 ? item.gmNames.join(', ') : '구인중 🚨'}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-auto">
                        {item.status === 'waiting' && (
                          item.mySchedule ? (
                            <>
                              {canConsensus ? (
                                <>
                                  <p className="text-xs font-bold text-amber-500 mb-1 text-center">🔥 찬성 시 만장일치로 확정됩니다. ({readyCount}/{totalApplicants})</p>
                                  <button onClick={() => toggleReady(item)} className={`px-4 py-3 rounded-lg font-black text-sm w-full transition border-2 ${item.mySchedule.is_ready ? 'bg-amber-600 border-amber-600 text-white' : 'bg-zinc-800 border-amber-600 text-amber-500 hover:bg-amber-900/30'}`}>
                                    {item.mySchedule.is_ready ? '✓ 찬성 취소' : '👉 진행 찬성하기!'}
                                  </button>
                                </>
                              ) : (
                                <button disabled className="px-4 py-3 bg-zinc-800 border-2 border-zinc-700 text-zinc-500 rounded-lg font-bold text-sm w-full cursor-not-allowed">
                                  {!hasRequiredGm ? `⏳ 진행자(GM) 구인 중 (찬성 대기)` : `⏳ 플레이어 부족 (${item.playerCount}/${minPlayers}명)`}
                                </button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => handleQuickJoin(item)} className="px-4 py-3 bg-red-700 border-2 border-red-600 text-white rounded-lg font-black text-sm hover:bg-red-600 w-full shadow-md transition">
                              ➕ 나도 참여하기
                            </button>
                          )
                        )}
                        {isAdmin && (
                          <div className="flex gap-2 mt-3 pt-3 border-t-2 border-zinc-800">
                            {item.status === 'waiting' ? (
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
    </div>
  );
}