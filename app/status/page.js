'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function StatusPage() {
  const [schedules, setSchedules] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (profile) setIsAdmin(profile.is_admin);
    }

    // ✨ status 조건 없이(확정, 대기 모두) 모든 스케줄을 가져옵니다.
    const { data } = await supabase
      .from('schedules')
      .select(`
        id, available_date, role_wanted, status, user_id,
        games ( id, title, min_players, max_players, recommended_players, needs_gm ),
        profiles ( nickname )
      `)
      .order('available_date', { ascending: true });

    setSchedules(data || []);
    setLoading(false);
  };

  // 모임 강제 확정 로직
  const handleForceConfirm = async (gameId, date) => {
    if (!window.confirm('이 모임을 강제로 결성 확정하시겠습니까?')) return;

    const { error } = await supabase
      .from('schedules')
      .update({ status: 'confirmed' })
      .eq('game_id', gameId)
      .eq('available_date', date);

    if (error) alert("확정 실패: " + error.message);
    else {
      alert("거사가 확정되었습니다! 🩸");
      fetchData(); // 화면 새로고침
    }
  };

  // 현황판에서 바로 신청 취소하기
  const handleCancel = async (scheduleId, gameId, date, isConfirmed) => {
    if (!window.confirm('신청을 취소하시겠습니까?')) return;

    await supabase.from('schedules').delete().eq('id', scheduleId);
    
    // 확정된 방에서 나갔다면 남은 사람들을 다시 waiting으로 강등
    if (isConfirmed) {
      await supabase.from('schedules')
        .update({ status: 'waiting' })
        .eq('game_id', gameId)
        .eq('available_date', date)
        .eq('status', 'confirmed');
      alert("취소되었습니다. 멤버 이탈로 방이 다시 [모집 중]으로 변경됩니다.");
    } else {
      alert("취소되었습니다.");
    }
    fetchData();
  };

  // 데이터를 날짜 > 게임별로 그룹화
  const grouped = schedules.reduce((acc, curr) => {
    if (!curr.games) return acc;
    const date = curr.available_date;
    const gId = curr.games.id;
    
    if (!acc[date]) acc[date] = {};
    if (!acc[date][gId]) acc[date][gId] = { game: curr.games, items: [], status: 'waiting' };
    
    // 하나라도 확정이면 이 방은 확정 상태
    if (curr.status === 'confirmed') acc[date][gId].status = 'confirmed';
    acc[date][gId].items.push(curr);
    
    return acc;
  }, {});

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">현황을 파악하는 중...</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900">
      <div className="flex justify-between items-center mb-10 border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-zinc-100"> Deck&<span className="text-red-600">Dice</span> 현황판 📊</h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold hover:bg-zinc-700 transition">대시보드로</Link>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-24 bg-zinc-900 rounded-3xl border-2 border-dashed border-zinc-700">
          <p className="text-zinc-500 text-xl font-bold">현재 예정된 모임이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.keys(grouped).sort().map(date => (
            <div key={date}>
              <h2 className="text-2xl font-black text-zinc-100 mb-6 flex items-center gap-3">
                <span className="bg-red-900 text-white px-4 py-1.5 rounded-lg text-lg">📅 {date}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.values(grouped[date]).map((group, idx) => {
                  const players = group.items.filter(i => i.role_wanted === 'player');
                  const gms = group.items.filter(i => i.role_wanted === 'gm');
                  const mySchedule = group.items.find(i => i.user_id === currentUser?.id);
                  const isConfirmed = group.status === 'confirmed';
                  
                  // GM 또는 관리자 권한 확인
                  const canForceConfirm = isAdmin || mySchedule?.role_wanted === 'gm';

                  return (
                    <div key={idx} className={`bg-zinc-900 p-6 rounded-3xl shadow-md border-2 transition relative ${mySchedule ? 'border-red-800' : 'border-zinc-700 hover:border-zinc-500'}`}>
                      {isConfirmed && <div className="absolute -top-3 -right-3 bg-emerald-600 text-white font-black text-xs px-3 py-1.5 rounded-full shadow-lg border-2 border-zinc-900">결성 완료 🎉</div>}
                      
                      <div className="mb-4">
                        <Link href={`/games/${group.game.id}`} className="text-xl font-black text-zinc-100 hover:text-red-400 transition">{group.game.title}</Link>
                        <div className="flex gap-2 mt-2 text-xs font-bold text-zinc-400">
                          <span className="bg-zinc-800 border border-zinc-600 px-2 py-1 rounded">👥 {players.length} / {group.game.max_players}명</span>
                          {group.game.needs_gm && <span className={`border px-2 py-1 rounded ${gms.length > 0 ? 'bg-purple-900 text-purple-300 border-purple-700' : 'bg-zinc-800 border-zinc-600'}`}>👑 GM: {gms.length}명</span>}
                        </div>
                      </div>

                      <div className="space-y-3 mb-6 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                        <div>
                          <p className="text-xs text-zinc-500 font-bold mb-1">참가자 명단:</p>
                          <div className="flex flex-wrap gap-1">
                            {players.length > 0 ? players.map(p => (
                              <span key={p.id} className={`text-xs px-2 py-1 rounded border ${p.user_id === currentUser?.id ? 'bg-red-950 text-red-400 border-red-900' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                                {p.profiles?.nickname || '익명'}
                              </span>
                            )) : <span className="text-xs text-zinc-600">아직 없습니다.</span>}
                          </div>
                        </div>
                        {group.game.needs_gm && (
                          <div>
                            <p className="text-xs text-zinc-500 font-bold mb-1">진행자(GM):</p>
                            <div className="flex flex-wrap gap-1">
                              {gms.length > 0 ? gms.map(g => (
                                <span key={g.id} className={`text-xs px-2 py-1 rounded border ${g.user_id === currentUser?.id ? 'bg-purple-950 text-purple-400 border-purple-900' : 'bg-purple-900 text-purple-200 border-purple-700'}`}>
                                  {g.profiles?.nickname || '익명'}
                                </span>
                              )) : <span className="text-xs text-zinc-600">구인 중입니다.</span>}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-auto">
                        {mySchedule ? (
                          <button onClick={() => handleCancel(mySchedule.id, group.game.id, date, isConfirmed)} className="w-full py-2.5 bg-zinc-800 border-2 border-red-900 text-red-500 rounded-xl font-bold hover:bg-red-950 transition text-sm">
                            참여 취소하기
                          </button>
                        ) : (
                          <Link href="/" className="w-full text-center py-2.5 bg-zinc-800 border-2 border-zinc-600 text-zinc-300 rounded-xl font-bold hover:bg-zinc-700 transition text-sm">
                            대시보드에서 합류
                          </Link>
                        )}
                      </div>

                      {/* GM이거나 관리자일 때 강제 확정 버튼 표시 (모집 중일 때만) */}
                      {!isConfirmed && canForceConfirm && (
                        <button onClick={() => handleForceConfirm(group.game.id, date)} className="w-full mt-2 py-2 bg-purple-900 border-2 border-purple-700 text-white rounded-xl font-black shadow-lg hover:bg-purple-800 transition text-sm">
                          이 모임 강제 확정 👑
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}