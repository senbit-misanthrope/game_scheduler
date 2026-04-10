'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { sendDiscordMessage } from '@/lib/notifications';

export default function MyPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  
  const [activeMainTab, setActiveMainTab] = useState('schedules'); 
  const [scheduleSubTab, setScheduleSubTab] = useState('waiting'); 
  
  const [mySchedules, setMySchedules] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]); 
  const [playedGames, setPlayedGames] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('game'); 
  const [selectedIds, setSelectedIds] = useState([]); 

  // 탭별 검색어 상태 관리
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState(''); 
  const [recordSearchTerm, setRecordSearchTerm] = useState('');    

  // ✨ 신규: 소셜 연동 상태 저장용
  const [identities, setIdentities] = useState([]); 

  useEffect(() => {
    getUserAndData();
  }, []);

  const getUserAndData = async () => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (sessionUser) {
      setUser(sessionUser);
      // ✨ 유저의 연결된 소셜 계정 정보 가져오기
      setIdentities(sessionUser.identities || []); 
      
      const [profileRes, scheduleRes, playedRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', sessionUser.id).single(),
        supabase.from('schedules').select(`
          id, available_date, role_wanted, status, user_id,
          games ( id, title ),
          profiles ( nickname )
        `),
        supabase.from('played_games').select(`id, is_gm, games (id, title)`).eq('user_id', sessionUser.id)
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setNicknameInput(profileRes.data.nickname || '');
      }
      
      const allData = scheduleRes.data || [];
      setAllSchedules(allData);
      setMySchedules(allData.filter(s => s.user_id === sessionUser.id));
      setPlayedGames(playedRes.data || []);
    }
    setLoading(false);
  };

  // ✨ 신규: 이미 연동된 소셜 계정인지 확인
  const isLinked = (provider) => {
    return identities.some(identity => identity.provider === provider);
  };

  // ✨ 신규: 소셜 계정 연동 실행
  const handleLinkIdentity = async (provider) => {
    const { error } = await supabase.auth.linkIdentity({
      provider: provider,
      options: {
        redirectTo: `${window.location.origin}/mypage`, 
      }
    });

    if (error) {
      alert(`${provider} 연동 중 오류가 발생했습니다: ` + error.message);
    }
  };

  const handleSaveNickname = async () => {
    if (!nicknameInput.trim()) return alert("호칭을 입력해주세요!");
    const { error } = await supabase.from('profiles').update({ nickname: nicknameInput }).eq('id', user.id);
    if (error) alert("저장 실패: " + error.message);
    else {
      setProfile({ ...profile, nickname: nicknameInput });
      alert("호칭이 각인되었습니다! 🩸");
    }
  };

  const toggleItemSelection = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const toggleGroupSelection = (items) => {
    const itemIds = items.map(i => i.id);
    const isAllSelected = itemIds.every(id => selectedIds.includes(id));
    if (isAllSelected) setSelectedIds(selectedIds.filter(id => !itemIds.includes(id)));
    else {
      const newSelections = itemIds.filter(id => !selectedIds.includes(id));
      setSelectedIds([...selectedIds, ...newSelections]);
    }
  };

  const handleBatchCancel = async () => {
    if (!window.confirm(`선택한 ${selectedIds.length}개의 서약을 파기하시겠습니까?`)) return;
    
    const itemsToDelete = mySchedules.filter(s => selectedIds.includes(s.id));
    const { error } = await supabase.from('schedules').delete().in('id', selectedIds);
    
    if (!error) {
      const newMySchedules = mySchedules.filter(s => !selectedIds.includes(s.id));
      setMySchedules(newMySchedules);
      setSelectedIds([]); 

      const confirmedItems = itemsToDelete.filter(item => item.status === 'confirmed');
      for (const item of confirmedItems) {
         await supabase.from('schedules')
           .update({ status: 'waiting' })
           .eq('game_id', item.games.id)
           .eq('available_date', item.available_date)
           .eq('status', 'confirmed');

         sendDiscordMessage(`🚨 **거사 확정 취소 (멤버 이탈)**\n게임: [${item.games.title}]\n날짜: ${item.available_date}\n요원 한 명이 서약을 파기하여 방이 다시 [모집 중] 상태로 돌아갔습니다. 🩸`);
      }

      if (confirmedItems.length > 0) alert("서약이 파기되었습니다. 멤버 이탈로 인해 해당 모임은 다시 [모집 중] 상태로 강등되며, 알림이 발송되었습니다.");
      else alert("서약이 파기되었습니다.");
      
      getUserAndData(); 
    }
  };

  const togglePlayed = async (gameId, isGmMode) => {
    if (!user) return;
    const gameRecords = playedGames.filter(pg => pg.games?.id === gameId);
    const hasPlayed = gameRecords.some(pg => pg.is_gm === false);
    const targetRecord = gameRecords.find(pg => pg.is_gm === isGmMode);
    
    if (targetRecord) {
      const idsToDelete = [targetRecord.id];
      if (isGmMode === false) {
        const gmRecord = gameRecords.find(pg => pg.is_gm === true);
        if (gmRecord) idsToDelete.push(gmRecord.id);
      }
      await supabase.from('played_games').delete().in('id', idsToDelete);
    } else {
      const insertData = [{ user_id: user.id, game_id: gameId, is_gm: isGmMode }];
      if (isGmMode === true && !hasPlayed) insertData.push({ user_id: user.id, game_id: gameId, is_gm: false });
      await supabase.from('played_games').insert(insertData);
    }
    
    const { data } = await supabase.from('played_games').select(`id, is_gm, games (id, title)`).eq('user_id', user.id);
    setPlayedGames(data || []);
  };

  const filteredMySchedules = mySchedules.filter(s => {
    const matchesTab = s.status === scheduleSubTab;
    const matchesSearch = s.games?.title.toLowerCase().includes(scheduleSearchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const groupedByGame = filteredMySchedules.reduce((acc, curr) => {
    const gId = curr.games?.id;
    if (!acc[gId]) acc[gId] = { title: curr.games?.title, items: [] };
    acc[gId].items.push(curr);
    return acc;
  }, {});
  const gamesArray = Object.values(groupedByGame).sort((a, b) => a.title.localeCompare(b.title));
  gamesArray.forEach(g => g.items.sort((a, b) => new Date(a.available_date) - new Date(b.available_date)));

  const groupedByDate = filteredMySchedules.reduce((acc, curr) => {
    const date = curr.available_date;
    if (!acc[date]) acc[date] = { date, items: [] };
    acc[date].items.push(curr);
    return acc;
  }, {});
  const datesArray = Object.values(groupedByDate).sort((a, b) => new Date(a.date) - new Date(b.date));

  const filteredPlayedGames = Object.values(playedGames.reduce((acc, curr) => {
    if (!curr.games) return acc; 
    const gId = curr.games.id;
    if (!acc[gId]) acc[gId] = { id: gId, title: curr.games.title, is_player: false, is_gm: false };
    if (curr.is_gm) acc[gId].is_gm = true;
    else acc[gId].is_player = true;
    return acc;
  }, {})).filter(game => 
    game.title.toLowerCase().includes(recordSearchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">기록을 해독하는 중...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900">
      <div className="flex justify-between items-center mb-8 border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-zinc-100">나의 비밀 정보 👤</h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold hover:bg-zinc-700 transition">대시보드로</Link>
      </div>

      {/* ✨ 신규: 소셜 계정 연동 섹션 */}
      <div className="bg-zinc-900 p-6 rounded-2xl border-2 border-zinc-700 mb-8 shadow-md">
        <h3 className="text-xl font-black text-zinc-100 border-b-2 border-zinc-800 pb-3 mb-4 flex items-center gap-2">
          🔗 소셜 계정 연동
        </h3>
        <p className="text-sm text-zinc-400 mb-6 font-bold">
          카카오나 Google 계정을 연결해두면 다음부터 이메일과 비밀번호 입력 없이 터치 한 번으로 아지트에 들어올 수 있습니다.
        </p>

        <div className="flex flex-col md:flex-row gap-4">
          <button 
            onClick={() => handleLinkIdentity('kakao')}
            disabled={isLinked('kakao')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black transition border-2 ${
              isLinked('kakao') 
                ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' 
                : 'bg-[#FEE500] border-[#F4DC00] hover:bg-[#E6CF00] text-[#3A1D1D] shadow-md'
            }`}
          >
            {isLinked('kakao') ? '✅ 카카오 연동 완료' : '🟡 카카오 계정 연결하기'}
          </button>

          <button 
            onClick={() => handleLinkIdentity('google')}
            disabled={isLinked('google')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black transition border-2 ${
              isLinked('google') 
                ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' 
                : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-800 shadow-md'
            }`}
          >
            {isLinked('google') ? '✅ Google 연동 완료' : '⚪ Google 계정 연결하기'}
          </button>
        </div>
      </div>

      {/* 기존: 호칭 설정 섹션 */}
      <div className="bg-zinc-900 p-6 rounded-2xl border-2 border-zinc-700 mb-8 flex flex-col sm:flex-row sm:items-end gap-4 shadow-md">
        <div className="flex-1">
          <label className="block text-sm font-bold text-zinc-300 mb-2">아지트에서 사용할 호칭 (예: 쎈빛)</label>
          <input type="text" value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} placeholder="호칭을 입력하세요" className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-xl focus:border-red-600 outline-none text-lg text-zinc-100 transition" />
        </div>
        <button onClick={handleSaveNickname} className="w-full sm:w-auto px-8 py-3 bg-zinc-800 border-2 border-red-700 text-red-400 font-black rounded-xl hover:bg-red-900 hover:text-white transition shadow-sm">호칭 각인</button>
      </div>

      {/* 기존: 메인 탭 */}
      <div className="flex gap-4 mb-8 bg-zinc-900 p-2 rounded-2xl border-2 border-zinc-700 overflow-x-auto shadow-sm">
        <button onClick={() => setActiveMainTab('schedules')} className={`flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold transition border-2 ${activeMainTab === 'schedules' ? 'bg-zinc-800 border-zinc-500 text-white' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>📅 예정된 거사</button>
        <button onClick={() => setActiveMainTab('records')} className={`flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold transition border-2 ${activeMainTab === 'records' ? 'bg-red-900 border-red-600 text-white' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>📖 나의 핏빛 기록</button>
      </div>

      {activeMainTab === 'schedules' && (
        <>
          <div className="flex gap-4 mb-6 border-b-2 border-zinc-800 pb-4">
            <button onClick={() => setScheduleSubTab('waiting')} className={`px-4 py-2 text-lg font-black transition ${scheduleSubTab === 'waiting' ? 'text-red-400 border-b-2 border-red-500' : 'text-zinc-500 hover:text-zinc-300'}`}>⏳ 모집 중</button>
            <button onClick={() => setScheduleSubTab('confirmed')} className={`px-4 py-2 text-lg font-black transition ${scheduleSubTab === 'confirmed' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>🎉 확정됨</button>
          </div>

          <div className="mb-6">
            <input 
              type="text" 
              placeholder="예정된 게임 제목 검색..." 
              value={scheduleSearchTerm}
              onChange={(e) => setScheduleSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border-2 border-zinc-700 p-4 rounded-xl focus:border-zinc-500 outline-none text-lg text-zinc-100 placeholder-zinc-500 transition shadow-inner" 
            />
          </div>

          <div className="flex gap-3 mb-6">
            <button onClick={() => setViewMode('game')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition border-2 ${viewMode === 'game' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200'}`}>🎮 게임별 보기</button>
            <button onClick={() => setViewMode('date')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition border-2 ${viewMode === 'date' ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200'}`}>📅 날짜별 보기</button>
          </div>

          {filteredMySchedules.length === 0 ? (
            <div className="text-center py-24 bg-zinc-900 rounded-2xl border-2 border-dashed border-zinc-700">
              <p className="text-zinc-400 text-xl font-bold">{scheduleSearchTerm ? "검색 조건과 일치하는 서약이 없습니다." : "해당하는 서약이 없습니다."}</p>
            </div>
          ) : (
            <div className="space-y-6 pb-24">
              {(viewMode === 'game' ? gamesArray : datesArray).map((group, idx) => {
                const isAllGroupSelected = group.items.length > 0 && group.items.every(item => selectedIds.includes(item.id));
                return (
                  <div key={idx} className="bg-zinc-900 p-6 rounded-2xl border-2 border-zinc-700 shadow-md">
                    <div className="flex items-center gap-3 mb-5 border-b-2 border-zinc-800 pb-4">
                      <input type="checkbox" className="w-6 h-6 accent-red-600 cursor-pointer rounded border-zinc-500" checked={isAllGroupSelected} onChange={() => toggleGroupSelection(group.items)} />
                      <h2 className="text-2xl font-black text-zinc-100">
                        {viewMode === 'game' ? (
                          <Link href={`/games/${group.items[0].games?.id}`} className="hover:text-red-400 hover:underline transition">
                            {group.title}
                          </Link>
                        ) : (
                          group.date
                        )}
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {group.items.map(item => (
                        <RenderRow 
                          key={item.id} 
                          item={item} 
                          label={viewMode === 'game' ? item.available_date : item.games?.title} 
                          isSelected={selectedIds.includes(item.id)} 
                          onToggle={() => toggleItemSelection(item.id)} 
                          allSchedules={allSchedules}
                          viewMode={viewMode}
                          refreshData={getUserAndData} 
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
              <button onClick={handleBatchCancel} className="px-8 md:px-10 py-4 bg-red-700 text-white text-lg font-black rounded-full shadow-lg hover:bg-red-600 transition border-2 border-red-500">
                선택한 {selectedIds.length}개 파기하기 🗑️
              </button>
            </div>
          )}
        </>
      )}

      {activeMainTab === 'records' && (
        <div className="bg-zinc-900 p-6 md:p-8 rounded-3xl border-2 border-zinc-700 min-h-[400px]">
          <div className="mb-8">
            <input 
              type="text" 
              placeholder="플레이한 기록 검색..." 
              value={recordSearchTerm}
              onChange={(e) => setRecordSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border-2 border-zinc-700 p-4 rounded-xl focus:border-red-600 outline-none text-lg text-zinc-100 placeholder-zinc-500 transition shadow-inner" 
            />
          </div>

          {filteredPlayedGames.length === 0 ? (
            <div className="text-center py-20 text-zinc-400 font-bold border-2 border-dashed border-zinc-700 rounded-2xl bg-zinc-950">
              {recordSearchTerm ? "검색 결과와 일치하는 기록이 없습니다." : "아직 아지트에서 쌓은 기록이 없습니다."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPlayedGames.map((game, idx) => (
                <RecordCard key={idx} game={game} togglePlayed={togglePlayed} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// RenderRow 및 RecordCard 컴포넌트 (이전과 동일)
// -------------------------------------------------------------------------------------------------
function RenderRow({ item, label, isSelected, onToggle, allSchedules, viewMode, refreshData }) {
  const [showRate, setShowRate] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const others = allSchedules.filter(s => 
    s.games?.id === item.games?.id && 
    s.available_date === item.available_date && 
    s.user_id !== item.user_id
  );

  const submitReview = async () => {
    if (!comment.trim()) return alert("기록을 남겨주세요!");
    setIsSubmitting(true); 
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: existingReview } = await supabase.from('reviews').select('id').eq('game_id', item.games.id).eq('user_id', user.id).maybeSingle();
      
      let dbError = null;
      if (existingReview) {
        const { error } = await supabase.from('reviews').update({ rating, comment }).eq('id', existingReview.id);
        dbError = error;
      } else {
        const { error } = await supabase.from('reviews').insert([{ game_id: item.games.id, user_id: user.id, rating, comment }]);
        dbError = error;
      }

      if (dbError) {
        alert("기록 저장에 실패했습니다: " + dbError.message);
        return;
      }

      const isGmRole = item.role_wanted === 'gm';
      const { data: playedCheck } = await supabase.from('played_games')
        .select('id')
        .eq('game_id', item.games.id)
        .eq('user_id', user.id)
        .eq('is_gm', isGmRole)
        .maybeSingle();

      if (!playedCheck) {
        await supabase.from('played_games').insert([{ 
          user_id: user.id, 
          game_id: item.games.id, 
          is_gm: isGmRole 
        }]);
      }

      alert("기록이 각인되었습니다! 🩸 (나의 핏빛 기록에도 자동 추가되었습니다.)");
      setShowRate(false); 
      if (refreshData) refreshData(); 

    } catch (error) {
      alert("통신 중 에러가 발생했습니다.");
    } finally {
      setIsSubmitting(false); 
    }
  };

  return (
    <div className="flex flex-col gap-2 relative h-full">
      <label className={`flex flex-col justify-between p-4 rounded-xl border-2 transition cursor-pointer h-full ${isSelected ? 'bg-zinc-800 border-red-600' : 'bg-zinc-800 border-zinc-600 hover:border-zinc-400'}`}>
        <div>
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" className="w-5 h-5 accent-red-600 cursor-pointer flex-shrink-0 rounded border-zinc-500" checked={isSelected} onChange={onToggle} />
              {viewMode === 'date' ? (
                <Link href={`/games/${item.games?.id}`} className="font-black text-zinc-100 text-lg hover:text-red-400 hover:underline transition">
                  {label}
                </Link>
              ) : (
                <span className="font-black text-zinc-100 text-lg">{label}</span>
              )}
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${item.status === 'confirmed' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-zinc-700 text-zinc-300 border-zinc-500'}`}>
              {item.status === 'confirmed' ? '결성 완료 🎉' : '모집 중 ⏳'}
            </span>
          </div>
          
          <div className="ml-8 mb-3 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
            <p className="text-[11px] text-zinc-500 font-bold mb-1.5">함께 신청한 요원:</p>
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-xs px-2 py-0.5 rounded border ${item.role_wanted === 'gm' ? 'bg-purple-950 text-purple-400 border-purple-900' : 'bg-red-950 text-red-400 border-red-900'}`}>
                나({item.role_wanted === 'gm' ? 'GM' : '일반'})
              </span>
              {others.length > 0 ? others.map((other, i) => (
                <span key={i} className={`text-xs px-2 py-0.5 rounded border ${other.role_wanted === 'gm' ? 'bg-purple-900 text-purple-200 border-purple-700' : 'bg-zinc-800 text-zinc-300 border-zinc-600'}`}>
                  {other.profiles?.nickname || '익명'}({other.role_wanted === 'gm' ? 'GM' : '일반'})
                </span>
              )) : <span className="text-xs text-zinc-600 py-0.5">아직 혼자입니다.</span>}
            </div>
          </div>
        </div>

        {item.status === 'confirmed' && (
          <div className="ml-8 mt-auto flex justify-end">
            <button onClick={(e) => { e.preventDefault(); setShowRate(!showRate); }} className="text-xs text-amber-400 font-bold hover:text-amber-300 transition bg-zinc-700 px-3 py-1.5 rounded-md border border-zinc-500">
              {showRate ? '[접기]' : '⭐ 평점 남기기'}
            </button>
          </div>
        )}
      </label>

      {showRate && (
        <div className="p-4 bg-zinc-800 border-2 border-zinc-600 rounded-xl mt-1 ml-8 space-y-4 shadow-xl relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-zinc-300">별점:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(num => (
                <button key={num} onClick={() => setRating(num)} className={`text-2xl transition hover:scale-110 drop-shadow-md ${rating >= num ? 'text-amber-400' : 'text-zinc-600'}`}>★</button>
              ))}
            </div>
          </div>
          <textarea placeholder="이 모임은 어땠나요? 진실을 기록해주세요..." className="w-full p-3 text-sm bg-zinc-900 border-2 border-zinc-600 rounded-lg outline-none focus:border-amber-500 text-zinc-100 min-h-[80px] transition placeholder-zinc-500 resize-none" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button onClick={submitReview} disabled={isSubmitting} className={`w-full py-2.5 font-black tracking-wide rounded-lg text-sm transition shadow-md border-2 ${isSubmitting ? 'bg-zinc-700 border-zinc-600 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-zinc-900'}`}>
            {isSubmitting ? '각인 중... ⏳' : '기록 저장하기'}
          </button>
        </div>
      )}
    </div>
  );
}

function RecordCard({ game, togglePlayed }) {
  const [showRate, setShowRate] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitReview = async () => {
    if (!comment.trim()) return alert("기록을 남겨주세요!");
    setIsSubmitting(true); 
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: existingReview } = await supabase.from('reviews').select('id').eq('game_id', game.id).eq('user_id', user.id).maybeSingle();
      
      let dbError = null;
      if (existingReview) {
        const { error } = await supabase.from('reviews').update({ rating, comment }).eq('id', existingReview.id);
        dbError = error;
      } else {
        const { error } = await supabase.from('reviews').insert([{ game_id: game.id, user_id: user.id, rating, comment }]);
        dbError = error;
      }

      if (dbError) alert("기록 저장에 실패했습니다: " + dbError.message);
      else {
        alert("기록이 각인되었습니다! 🩸");
        setShowRate(false); 
      }
    } catch (error) {
      alert("통신 중 에러가 발생했습니다.");
    } finally {
      setIsSubmitting(false); 
    }
  };

  return (
    <div className="bg-zinc-800 p-5 rounded-2xl border-2 border-zinc-600 flex flex-col justify-between transition shadow-md hover:border-zinc-500 relative">
      <div className="flex justify-between items-start mb-4">
        <Link href={`/games/${game.id}`} className="font-black text-lg text-zinc-100 hover:text-red-400 hover:underline transition mr-2 line-clamp-1 break-all">
          {game.title}
        </Link>
        <button onClick={() => setShowRate(!showRate)} className="text-xs text-amber-400 font-bold bg-zinc-900 border border-zinc-700 px-2.5 py-1.5 rounded hover:bg-zinc-700 transition flex-shrink-0">
          {showRate ? '접기' : '⭐ 리뷰 작성'}
        </button>
      </div>

      <div className="flex gap-2 mt-auto">
        <button onClick={() => togglePlayed(game.id, false)} className={`px-2 py-2.5 rounded-lg text-xs font-bold transition border-2 flex-1 ${game.is_player ? 'bg-zinc-700 text-zinc-100 border-zinc-500 hover:bg-zinc-600' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:bg-zinc-800'}`}>
          {game.is_player ? '🩸 경험자' : '경험 없음'}
        </button>
        <button onClick={() => togglePlayed(game.id, true)} className={`px-2 py-2.5 rounded-lg text-xs font-bold transition border-2 flex-1 ${game.is_gm ? 'bg-purple-800 text-purple-100 border-purple-500 hover:bg-purple-700' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:bg-zinc-800'}`}>
          {game.is_gm ? '👑 GM 가능' : 'GM 불가'}
        </button>
      </div>

      {showRate && (
        <div className="p-4 bg-zinc-900 border-2 border-zinc-700 rounded-xl mt-3 space-y-3 shadow-inner absolute top-full left-0 w-full z-10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-300">별점:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(num => (
                <button key={num} onClick={() => setRating(num)} className={`text-xl transition hover:scale-110 ${rating >= num ? 'text-amber-400' : 'text-zinc-600'}`}>★</button>
              ))}
            </div>
          </div>
          <textarea placeholder="게임의 진실을 기록해주세요..." className="w-full p-3 text-sm bg-zinc-950 border-2 border-zinc-700 rounded-lg outline-none focus:border-amber-500 text-zinc-100 min-h-[60px] transition placeholder-zinc-500 resize-none" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button onClick={submitReview} disabled={isSubmitting} className={`w-full py-2 font-black rounded-lg text-sm transition shadow-md border-2 ${isSubmitting ? 'bg-zinc-700 border-zinc-600 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-zinc-900'}`}>
            {isSubmitting ? '각인 중...' : '저장하기'}
          </button>
        </div>
      )}
    </div>
  );
}