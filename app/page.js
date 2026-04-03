'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import DatePicker from "react-multi-date-picker";
import { sendDiscordMessage } from '@/lib/notifications'; 

export default function Home() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); 
  const [games, setGames] = useState([]);
  const [playedGames, setPlayedGames] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedGameIds, setSelectedGameIds] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]); 
  const [selectedRole, setSelectedRole] = useState('player');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data: authData } = await supabase.auth.getUser();
      
      if (authData?.user) {
        setUser(authData.user);
        const [profileRes, playedRes, gamesRes] = await Promise.all([
          supabase.from('profiles').select('nickname, is_admin').eq('id', authData.user.id).single(),
          supabase.from('played_games').select('*').eq('user_id', authData.user.id),
          supabase.from('games').select('*').order('title', { ascending: true })
        ]);
        
        if (profileRes.data) {
          setProfile(profileRes.data);
          setIsAdmin(profileRes.data.is_admin);
        }
        setPlayedGames(playedRes.data || []);
        setGames(gamesRes.data || []);
      } else {
        const { data: g } = await supabase.from('games').select('*').order('title', { ascending: true });
        setGames(g || []);
      }
    };
    fetchData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const toggleGameSelection = (gameId) => {
    if (selectedGameIds.includes(gameId)) {
      setSelectedGameIds(selectedGameIds.filter(id => id !== gameId));
    } else {
      setSelectedGameIds([...selectedGameIds, gameId]);
    }
  };

  const togglePlayed = async (gameId, isGmMode) => {
    if (!user) return alert('로그인이 필요합니다!');
    
    const gameRecords = playedGames.filter(pg => pg.game_id === gameId);
    const hasPlayed = gameRecords.some(pg => pg.is_gm === false);
    const hasGm = gameRecords.some(pg => pg.is_gm === true);
    const targetRecord = gameRecords.find(pg => pg.is_gm === isGmMode);
    
    let newPlayedGames = [...playedGames];

    if (targetRecord) {
      const idsToDelete = [targetRecord.id];
      newPlayedGames = newPlayedGames.filter(pg => pg.id !== targetRecord.id);
      
      if (isGmMode === false && hasGm) {
        const gmRecord = gameRecords.find(pg => pg.is_gm === true);
        if (gmRecord) {
          idsToDelete.push(gmRecord.id);
          newPlayedGames = newPlayedGames.filter(pg => pg.id !== gmRecord.id);
        }
      }
      setPlayedGames(newPlayedGames);
      await supabase.from('played_games').delete().in('id', idsToDelete);
    } else {
      const insertData = [{ user_id: user.id, game_id: gameId, is_gm: isGmMode }];
      if (isGmMode === true && !hasPlayed) {
        insertData.push({ user_id: user.id, game_id: gameId, is_gm: false });
      }
      
      const { data: inserted } = await supabase.from('played_games').insert(insertData).select();
      if (inserted) setPlayedGames([...playedGames, ...inserted]);
    }
  };

  const submitSchedules = async () => {
      if (selectedGameIds.length === 0) return alert('게임을 선택해주세요!');
      if (selectedDates.length === 0) return alert('거사일을 선택해주세요!');
      
      // ✨ 1. GM 신청 시, 선택한 게임들이 GM을 지원하는지 검사
    if (selectedRole === 'gm') {
      const nonGmGames = games.filter(g => selectedGameIds.includes(g.id) && !g.needs_gm);
      if (nonGmGames.length > 0) {
        const titles = nonGmGames.map(g => g.title).join(', ');
        alert(`다음 게임은 GM이 필요하지 않습니다: [${titles}]\n참가자(player)로 신청해주세요.`);
        return;
      }
    }

      setIsSubmitting(true);
  
      // ✨ 추가된 로직: 현재 유저가 이미 신청한 내역(대기/확정 모두) 가져오기
      const { data: existingSchedules } = await supabase
        .from('schedules')
        .select('game_id, available_date')
        .eq('user_id', user.id);
  
      const insertData = [];
      for (const gameId of selectedGameIds) {
        for (const date of selectedDates) {
          // ✨ 추가된 로직: 중복 검사
          const isDuplicate = existingSchedules?.some(s => s.game_id === gameId && s.available_date === date);
          if (isDuplicate) {
            alert(`이미 해당 날짜(${date})에 이 게임의 서약(참가 또는 GM)이 존재합니다!\n중복 신청은 불가능합니다.`);
            setIsSubmitting(false);
            return; // 에러 발생 시 즉시 중단
          }
          insertData.push({ user_id: user.id, game_id: gameId, available_date: date, role_wanted: selectedRole });
        }
      }
  
    

    const { error } = await supabase.from('schedules').insert(insertData);
    
    if (error) {
      alert("서약 중 오류가 발생했습니다.");
    } else {
      alert(`${selectedGameIds.length}개 게임에 소집 서약을 완료했습니다! 🩸`);
      setIsModalOpen(false);
      setSelectedGameIds([]);
      setSelectedDates([]);

      for (const gameId of selectedGameIds) {
        for (const date of selectedDates) {
          const { data: schData } = await supabase.from('schedules').select('user_id, role_wanted').eq('game_id', gameId).eq('available_date', date).eq('status', 'waiting');
          const { data: gameData } = await supabase.from('games').select('title, recommended_players, max_players, needs_gm').eq('id', gameId).single();

          if (schData && gameData) {
            const playerCount = schData.filter(s => s.role_wanted === 'player').length;
            const gmCount = schData.filter(s => s.role_wanted === 'gm').length;
            const userIds = schData.map(s => s.user_id);
            const { data: profs } = await supabase.from('profiles').select('nickname').in('id', userIds);
            const names = profs ? profs.map(p => p.nickname || '익명').join(', ') : '익명';

            if (playerCount === gameData.max_players) {
              if (gameData.needs_gm && gmCount === 0) sendDiscordMessage(`🚨 **최대 인원 도달 (GM 구인 중)!**\n게임: [${gameData.title}]\n날짜: ${date}\n현재 명단: ${names}`);
              else sendDiscordMessage(`🎉 **최대 인원 도달!**\n게임: [${gameData.title}]\n날짜: ${date}`);
            } else if (playerCount === gameData.recommended_players) {
              if (gameData.needs_gm && gmCount === 0) sendDiscordMessage(`🔥 **추천 인원 도달 (GM 구인 중)!**\n게임: [${gameData.title}]\n날짜: ${date}\n현재 명단: ${names}`);
              else sendDiscordMessage(`🔥 **추천 인원 도달!**\n게임: [${gameData.title}]\n날짜: ${date}\n현재 대기자: ${names}`);
            }
          }
        }
      }
    }
    setIsSubmitting(false);
  };

  const filteredGames = games.filter(g => {
    if (!g.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (user) {
      const hasPlayed = playedGames.some(pg => pg.game_id === g.id && pg.is_gm === false);
      if (hasPlayed && !g.needs_gm) return false; 
    }
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900 selection:text-white">
      <div className="sticky top-0 z-40 bg-zinc-950 border-b-2 border-zinc-800 pb-4 pt-4 mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-black tracking-wider text-zinc-100 flex-shrink-0">
        <span className="text-red-600">D&D Mystery Club</span>
        </h1>
        <div className="flex flex-wrap gap-2 items-center justify-center">
          <Link href="/leaderboard" className="px-4 py-2 bg-zinc-800 border-2 border-zinc-700 text-amber-500 hover:bg-zinc-700 hover:border-amber-500 rounded-lg text-sm font-bold shadow-sm transition">🏆 명예의 전당</Link>
          <Link href="/recommend" className="px-4 py-2 bg-zinc-800 border-2 border-zinc-700 text-purple-400 hover:bg-zinc-700 hover:border-purple-500 rounded-lg text-sm font-bold shadow-sm transition">🎯 맞춤 추천</Link>
          <Link href="/status" className="px-4 py-2 bg-zinc-800 border-2 border-zinc-700 text-red-400 hover:bg-zinc-700 hover:border-red-500 rounded-lg text-sm font-bold shadow-sm transition">📊 현황판</Link>

          {user ? (
            <div className="flex items-center gap-2 ml-2 md:border-l-2 border-zinc-800 md:pl-4">
              {isAdmin && <Link href="/admin" className="px-3 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg text-sm font-bold hover:bg-zinc-700 transition">👑 관리자</Link>}
              <Link href="/mypage" className="px-4 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg text-sm font-bold hover:bg-zinc-700 transition">{profile?.nickname || '익명'} 👤</Link>
              <button onClick={handleLogout} className="px-3 py-2 bg-zinc-900 text-red-500 border-2 border-zinc-700 rounded-lg text-sm font-bold hover:bg-zinc-800 transition">로그아웃</button>
            </div>
          ) : (
            <Link href="/login" className="px-5 py-2 bg-red-700 text-white rounded-lg font-bold ml-2 hover:bg-red-600 shadow-md">로그인</Link>
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-10 w-full">
        <input 
          type="text" 
          placeholder="게임을 검색해보세요..." 
          className="w-full bg-zinc-900 border-2 border-zinc-700 p-4 rounded-xl focus:border-red-600 outline-none text-lg text-zinc-100 placeholder-zinc-500 transition" 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        {selectedGameIds.length > 0 && (
          <button onClick={() => setIsModalOpen(true)} className="px-6 md:px-10 py-4 bg-red-700 text-white font-black tracking-wide rounded-xl hover:bg-red-600 transition whitespace-nowrap shadow-lg flex-shrink-0">
            {selectedGameIds.length}개 소집 🩸
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {filteredGames.map(game => {
          const gameRecords = playedGames.filter(pg => pg.game_id === game.id);
          const isPlayed = gameRecords.some(pg => pg.is_gm === false);
          const isGmCapable = gameRecords.some(pg => pg.is_gm === true);

          return (
            <div key={game.id} onClick={() => toggleGameSelection(game.id)} className={`min-w-0 cursor-pointer border-2 p-4 md:p-5 rounded-2xl transition flex flex-col justify-between relative overflow-hidden ${selectedGameIds.includes(game.id) ? 'border-red-600 bg-zinc-900' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}>
              
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Link href={`/games/${game.id}`} onClick={(e) => e.stopPropagation()} className="text-xl font-black text-zinc-100 hover:text-red-500 transition truncate max-w-full block">
                      {game.title}
                    </Link>
                    <span className="bg-zinc-800 text-zinc-300 text-xs px-2.5 py-1.5 rounded-md font-bold border border-zinc-600 whitespace-nowrap">
                      👥 {game.min_players === game.max_players ? `${game.min_players}명` : `${game.min_players}~${game.max_players}명`}
                    </span>
                    {/* ✨ 추천 인원 조건 완화 (항상 보이도록 수정) */}
                    {game.recommended_players > 0 && (
                      <span className="bg-zinc-800 text-emerald-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-zinc-600 whitespace-nowrap">👍 추천 {game.recommended_players}명</span>
                    )}
                    {game.play_time && <span className="bg-zinc-800 text-amber-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-zinc-600 whitespace-nowrap">⏳ {game.play_time}</span>}
                    {game.needs_gm && <span className="bg-zinc-800 text-purple-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-purple-800 whitespace-nowrap">👑 GM 필수</span>}
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-3 line-clamp-2 break-all">{game.description || '등록된 설명이 없습니다.'}</p>
                </div>
                <div className="pt-1 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition ${selectedGameIds.includes(game.id) ? 'bg-red-600 border-red-600' : 'border-zinc-500 bg-zinc-800'}`}>
                    {selectedGameIds.includes(game.id) && <span className="text-white font-bold text-lg leading-none">✓</span>}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t-2 border-zinc-800 pt-3 mt-auto" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => togglePlayed(game.id, false)} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition border-2 flex-1 ${isPlayed ? 'bg-zinc-700 text-zinc-100 border-zinc-500' : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`}>
                  {isPlayed ? '🩸 경험자' : '경험 없음'}
                </button>
                {/* ✨ GM 텍스트 변경 */}
                {game.needs_gm && (
                  <button onClick={() => togglePlayed(game.id, true)} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition border-2 flex-1 ${isGmCapable ? 'bg-purple-800 text-purple-100 border-purple-500' : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`}>
                    {isGmCapable ? '👑 GM 가능' : 'GM 불가'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredGames.length === 0 && (
          <div className="col-span-1 lg:col-span-2 text-center py-20 text-zinc-400 font-bold border-2 border-dashed border-zinc-700 rounded-2xl bg-zinc-900">
            남아있는 게임이 없거나, 모든 게임을 경험하셨습니다.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border-2 border-zinc-700 p-8 rounded-2xl max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-black mb-6 text-zinc-100 border-b-2 border-zinc-800 pb-4">비밀 모임 소집</h2>
            <div className="mb-6">
              <label className="block text-sm font-bold text-zinc-300 mb-2">거사일 선택 (복수 가능)</label>
              <DatePicker 
  multiple 
  value={selectedDates} 
  onChange={(dates) => setSelectedDates(dates.map(d => d.format("YYYY-MM-DD")))} 
  format="YYYY-MM-DD" 
  minDate={new Date()}  /* ✨ 이 한 줄이 추가되면 과거 날짜는 회색으로 변하고 클릭이 막힙니다! */
  inputClass="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition placeholder-zinc-500" 
  containerClassName="w-full" 
  placeholder="날짜를 클릭하세요" 
/>
            </div>
            <div className="mb-8">
              <label className="block text-sm font-bold text-zinc-300 mb-2">당신의 역할</label>
              <select className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none font-bold transition" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                <option value="player">일반 참가자</option>
                <option value="gm">모임의 지배자 (GM)</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition">취소</button>
              <button onClick={submitSchedules} disabled={isSubmitting} className={`flex-1 py-3 text-white rounded-xl font-black shadow-lg transition border-2 ${isSubmitting ? 'bg-red-900 border-red-900 cursor-not-allowed' : 'bg-red-700 border-red-600 hover:bg-red-600'}`}>
                {isSubmitting ? '서약 중...' : '서약하기 🩸'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}