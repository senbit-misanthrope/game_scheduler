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
  
  const [categories, setCategories] = useState(['전체']);
  const [activeCategory, setActiveCategory] = useState('전체');
  
  const [selectedGameIds, setSelectedGameIds] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]); 
  const [selectedRole, setSelectedRole] = useState('player');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 

  useEffect(() => {
    const fetchData = async () => {
      const { data: authData } = await supabase.auth.getUser();
      
      let fetchedGames = [];

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
        fetchedGames = gamesRes.data || [];
        setGames(fetchedGames);
      } else {
        const { data: g } = await supabase.from('games').select('*').order('title', { ascending: true });
        fetchedGames = g || [];
        setGames(fetchedGames);
      }

      const uniqueCategories = ['전체', ...new Set(fetchedGames.map(g => g.category || '머더 미스테리'))];
      setCategories(uniqueCategories);
    };
    fetchData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleProtectedLink = (e) => {
    if (!user) {
      e.preventDefault(); 
      alert('로그인이 필요한 기능입니다. 요원으로 합류해주세요! 🩸');
    }
  };

  const toggleGameSelection = (gameId) => {
    if (!user) {
      alert('아지트 요원만 모임을 소집할 수 있습니다. 로그인을 먼저 해주세요! 🩸');
      return;
    }

    if (selectedGameIds.includes(gameId)) {
      setSelectedGameIds(selectedGameIds.filter(id => id !== gameId));
    } else {
      setSelectedGameIds([...selectedGameIds, gameId]);
    }
  };

  const togglePlayed = async (gameId, isGmMode) => {
    if (!user) {
      alert('로그인이 필요한 기능입니다. 요원으로 합류해주세요! 🩸');
      return;
    }
    
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
    if (!user) return; 
    if (selectedGameIds.length === 0) return alert('게임을 선택해주세요!');
    if (selectedDates.length === 0) return alert('거사일을 선택해주세요!');
    
    if (selectedRole === 'gm') {
      const nonGmGames = games.filter(g => selectedGameIds.includes(g.id) && !g.needs_gm);
      if (nonGmGames.length > 0) {
        const titles = nonGmGames.map(g => g.title).join(', ');
        alert(`다음 게임은 GM이 필요하지 않습니다: [${titles}]\n참가자(player)로 신청해주세요.`);
        return;
      }
    }

    setIsSubmitting(true);

    const [ { data: existingSchedules }, { data: allSchedules } ] = await Promise.all([
      supabase.from('schedules').select('game_id, available_date').eq('user_id', user.id),
      supabase.from('schedules').select('game_id, available_date, role_wanted').in('available_date', selectedDates).in('game_id', selectedGameIds)
    ]);

    const validInserts = [];
    const failMessages = [];

    for (const gameId of selectedGameIds) {
      const gameInfo = games.find(g => g.id === gameId);
      for (const date of selectedDates) {
        const isDuplicate = existingSchedules?.some(s => s.game_id === gameId && s.available_date === date);
        if (isDuplicate) {
          failMessages.push(`[${date}] ${gameInfo.title} (중복 신청)`);
          continue;
        }

        const schedulesForThis = allSchedules?.filter(s => s.game_id === gameId && s.available_date === date) || [];
        const pCount = schedulesForThis.filter(s => s.role_wanted === 'player').length;
        const gmCount = schedulesForThis.filter(s => s.role_wanted === 'gm').length;

        if (selectedRole === 'gm' && gmCount >= 1) {
          failMessages.push(`[${date}] ${gameInfo.title} (GM 정원 마감)`);
          continue;
        }
        if (selectedRole === 'player' && pCount >= gameInfo.max_players) {
          failMessages.push(`[${date}] ${gameInfo.title} (정원 마감)`);
          continue;
        }

        validInserts.push({ user_id: user.id, game_id: gameId, available_date: date, role_wanted: selectedRole });
      }
    }

    if (validInserts.length > 0) {
      const { error } = await supabase.from('schedules').insert(validInserts);
      
      if (error) {
        alert("서약 중 통신 오류가 발생했습니다.");
      } else {
        for (const insert of validInserts) {
          const { game_id: gameId, available_date: date } = insert;
          const { data: schData } = await supabase.from('schedules').select('user_id, role_wanted').eq('game_id', gameId).eq('available_date', date).eq('status', 'waiting');
          const gameData = games.find(g => g.id === gameId);

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

        let resultMsg = `${validInserts.length}개의 거사 신청이 성공적으로 완료되었습니다! 🩸\n`;
        if (failMessages.length > 0) {
          resultMsg += `\n❌ 아래 일정은 정원 초과 등으로 튕겨냈습니다:\n- ` + failMessages.join('\n- ');
        }
        alert(resultMsg);
        
        setIsModalOpen(false);
        setSelectedGameIds([]);
        setSelectedDates([]);
      }
    } else {
      alert(`신청 가능한 일정이 없습니다.\n\n❌ 거부 사유:\n- ` + failMessages.join('\n- '));
    }

    setIsSubmitting(false);
  };

  const getOwnershipBadge = (status) => {
    switch (status) {
      case 'unowned':
        return <span className="bg-zinc-800 text-zinc-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-zinc-600 whitespace-nowrap">👻 미보유</span>;
      case 'online':
        return <span className="bg-zinc-800 text-indigo-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-indigo-800 whitespace-nowrap">🌐 온라인 전용</span>;
      case 'external':
        return <span className="bg-zinc-800 text-orange-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-orange-800 whitespace-nowrap">🚚 외부 조달</span>;
      case 'owned':
      default:
        return <span className="bg-zinc-800 text-sky-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-sky-800 whitespace-nowrap">📦 아지트 보유</span>;
    }
  };

  const filteredGames = games.filter(g => {
    if (activeCategory !== '전체' && (g.category || '머더 미스테리') !== activeCategory) return false;
    if (!g.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (user) {
      const hasPlayed = playedGames.some(pg => pg.game_id === g.id && pg.is_gm === false);
      if (hasPlayed && !g.needs_gm) return false; 
    }
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900 selection:text-white">
      
      {/* =========================================
          🖥️ PC 전용 헤더 (2단 분리형)
      ========================================= */}
      <div className="hidden md:flex flex-col gap-5 sticky top-0 z-40 bg-zinc-950 border-b-2 border-zinc-800 pb-5 pt-4 mb-8">
        {/* 1층: 로고 및 아이콘 (좌), 프로필/로그인 (우) */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-black tracking-wider text-zinc-100">
              <span className="text-red-600">D&D Mystery Club</span>
            </h1>
            <div className="flex gap-2">
              <a href="https://discord.gg/WhSn6M6fGM" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-[#5865F2] hover:bg-[#4752C4] rounded-lg shadow-sm transition flex items-center justify-center text-white" title="디스코드 합류">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.545 2.907a13.227 13.227 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.19 12.19 0 0 0-3.658 0 8.258 8.258 0 0 0-.412-.833.051.051 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.041.041 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032c.001.014.01.028.021.037a13.276 13.276 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019c.308-.42.582-.863.818-1.329a.05.05 0 0 0-.01-.059.051.051 0 0 0-.018-.011 8.875 8.875 0 0 1-1.248-.595.05.05 0 0 1-.02-.066.051.051 0 0 1 .015-.019c.084-.063.168-.129.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.052.052 0 0 1 .053.007c.08.066.164.132.248.195a.051.051 0 0 1-.004.085 8.254 8.254 0 0 1-1.249.594.05.05 0 0 0-.03.03.052.052 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.235 13.235 0 0 0 4.001-2.02.049.049 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.034.034 0 0 0-.02-.019Zm-8.198 7.307c-.789 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.316 0c-.788 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.45.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612Z"/></svg>
              </a>
              <a href="https://open.kakao.com/o/g6Ed6UPh" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-[#FEE500] hover:bg-[#F4DC00] rounded-lg shadow-sm transition flex items-center justify-center text-[#3A1D1D]" title="카카오톡 오픈채팅">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C3.582 0 0 2.82 0 6.3c0 2.247 1.516 4.225 3.86 5.378-.184.662-.667 2.404-.716 2.593-.062.242.083.24.234.14 1.18-.77 2.805-1.923 3.32-2.316.425.044.863.068 1.302.068 4.418 0 8-2.82 8-6.3S12.418 0 8 0z"/></svg>
              </a>
            </div>
          </div>
          <div>
            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl text-sm font-bold hover:bg-zinc-700 transition flex items-center gap-2 shadow-sm"
                >
                  {profile?.nickname || '익명'} 👤
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" className={`transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`}><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
                </button>
                {isProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border-2 border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
                      {isAdmin && <Link href="/admin" className="px-4 py-3 border-b border-zinc-800 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition text-left" onClick={() => setIsProfileOpen(false)}>👑 관리자</Link>}
                      <Link href="/mypage" className="px-4 py-3 border-b border-zinc-800 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition text-left" onClick={() => setIsProfileOpen(false)}>👤 마이페이지</Link>
                      <button onClick={handleLogout} className="px-4 py-3 text-sm font-bold text-red-500 hover:bg-zinc-800 transition text-left">🚪 로그아웃</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/login" className="px-6 py-2.5 bg-red-700 text-white rounded-xl font-bold hover:bg-red-600 shadow-md transition">로그인</Link>
            )}
          </div>
        </div>

        {/* ✨ 2층: 네비게이션 메뉴들 (가이드 버튼 우측 정렬) */}
        <div className="flex justify-between items-center w-full">
          <div className="flex gap-3">
            <Link href="/leaderboard" onClick={handleProtectedLink} className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-700 text-amber-500 hover:bg-zinc-700 hover:border-amber-500 rounded-xl text-sm font-bold shadow-sm transition">🏆 명예의 전당</Link>
            <Link href="/recommend" onClick={handleProtectedLink} className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-700 text-purple-400 hover:bg-zinc-700 hover:border-purple-500 rounded-xl text-sm font-bold shadow-sm transition">🎯 맞춤 추천</Link>
            <Link href="/status" onClick={handleProtectedLink} className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-700 text-red-400 hover:bg-zinc-700 hover:border-red-500 rounded-xl text-sm font-bold shadow-sm transition">📊 현황판</Link>
            <Link href="/archives" onClick={handleProtectedLink} className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-700 text-orange-400 hover:bg-zinc-700 hover:border-orange-500 rounded-xl text-sm font-bold shadow-sm transition">📜 기록 보관소</Link>
          </div>
          {/* 가이드 버튼 */}
          <Link href="/guide" className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-700 text-sky-400 hover:bg-zinc-700 hover:border-sky-500 rounded-xl text-sm font-bold shadow-sm transition">
            📖 이용 가이드
          </Link>
        </div>
      </div>

      {/* =========================================
          📱 모바일 전용 헤더 (단일 로우 햄버거형)
      ========================================= */}
      <div className="flex md:hidden flex-col sticky top-0 z-40 bg-zinc-950 border-b-2 border-zinc-800 pb-3 pt-3 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-black tracking-wider text-zinc-100 flex-shrink-0">
            <span className="text-red-600">D&D</span> Club
          </h1>
          <div className="flex items-center gap-2">
            <Link href="/status" onClick={handleProtectedLink} className="px-3 py-2 bg-zinc-800 border border-zinc-700 text-red-400 rounded-lg text-xs font-bold whitespace-nowrap shadow-sm">📊 현황판</Link>
            
            {user ? (
              <div className="relative">
                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="p-2 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg text-sm flex items-center justify-center shadow-sm">👤</button>
                {isProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-40 bg-zinc-900 border-2 border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
                      {isAdmin && <Link href="/admin" className="px-4 py-3 border-b border-zinc-800 text-sm font-bold text-zinc-200" onClick={() => setIsProfileOpen(false)}>👑 관리자</Link>}
                      <Link href="/mypage" className="px-4 py-3 border-b border-zinc-800 text-sm font-bold text-zinc-200" onClick={() => setIsProfileOpen(false)}>👤 마이페이지</Link>
                      <button onClick={handleLogout} className="px-4 py-3 text-sm font-bold text-red-500 text-left">🚪 로그아웃</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/login" className="px-3 py-2 bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm whitespace-nowrap">로그인</Link>
            )}

            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>
            </button>
          </div>
        </div>

        {/* ✨ 모바일 햄버거 메뉴 확장 영역 (가이드 버튼 추가) */}
        {isMobileMenuOpen && (
          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-zinc-800">
            <Link href="/leaderboard" onClick={handleProtectedLink} className="px-4 py-3 bg-zinc-900 border border-zinc-700 text-amber-500 rounded-xl text-sm font-bold">🏆 명예의 전당</Link>
            <Link href="/recommend" onClick={handleProtectedLink} className="px-4 py-3 bg-zinc-900 border border-zinc-700 text-purple-400 rounded-xl text-sm font-bold">🎯 맞춤 추천</Link>
            <Link href="/archives" onClick={handleProtectedLink} className="px-4 py-3 bg-zinc-900 border border-zinc-700 text-orange-400 rounded-xl text-sm font-bold">📜 기록 보관소</Link>
            <Link href="/guide" className="px-4 py-3 bg-zinc-900 border border-zinc-700 text-sky-400 rounded-xl text-sm font-bold">📖 이용 가이드</Link>
          </div>
        )}
      </div>
      {/* ========================================= */}

      {/* 검색 바 */}
      <div className="flex gap-4 mb-4 w-full">
        <input 
          type="text" 
          placeholder="게임을 검색해보세요..." 
          className="w-full bg-zinc-900 border-2 border-zinc-700 p-4 rounded-xl focus:border-red-600 outline-none text-lg text-zinc-100 placeholder-zinc-500 transition shadow-sm" 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        {selectedGameIds.length > 0 && (
          <button onClick={() => setIsModalOpen(true)} className="px-6 md:px-10 py-4 bg-red-700 text-white font-black tracking-wide rounded-xl hover:bg-red-600 transition whitespace-nowrap shadow-lg flex-shrink-0 animate-pulse">
            {selectedGameIds.length}개 소집 🩸
          </button>
        )}
      </div>

      {/* 카테고리 (장르) 필터 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide">
        {categories.map((cat, idx) => (
          <button
            key={idx}
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition border-2 shadow-sm ${activeCategory === cat ? 'bg-zinc-800 border-red-600 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 게임 목록 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
        {filteredGames.map(game => {
          const gameRecords = playedGames.filter(pg => pg.game_id === game.id);
          const isPlayed = gameRecords.some(pg => pg.is_gm === false);
          const isGmCapable = gameRecords.some(pg => pg.is_gm === true);

          return (
            <div key={game.id} onClick={() => toggleGameSelection(game.id)} className={`min-w-0 cursor-pointer border-2 p-5 rounded-2xl transition flex flex-col justify-between relative overflow-hidden shadow-md hover:shadow-lg hover:-translate-y-1 ${selectedGameIds.includes(game.id) ? 'border-red-600 bg-zinc-900/80 ring-4 ring-red-900/20' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}>
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="mb-2 inline-block">
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-black tracking-wide shadow-sm">
                      {game.category || '머더 미스테리'}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Link 
                      href={`/games/${game.id}`} 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!user) {
                          e.preventDefault();
                          alert('로그인이 필요한 기능입니다. 요원으로 합류해주세요! 🩸');
                        }
                      }} 
                      className="text-2xl font-black text-zinc-100 hover:text-red-500 transition truncate max-w-full block tracking-tight"
                    >
                      {game.title}
                    </Link>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {getOwnershipBadge(game.ownership_status)}
                    <span className="bg-zinc-800 text-zinc-300 text-xs px-2.5 py-1.5 rounded-md font-bold border border-zinc-600 whitespace-nowrap">
                      👥 {game.min_players === game.max_players ? `${game.min_players}명` : `${game.min_players}~${game.max_players}명`}
                    </span>
                    {game.recommended_players > 0 && (
                      <span className="bg-emerald-950/30 text-emerald-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-emerald-900/50 whitespace-nowrap">👍 추천 {game.recommended_players}명</span>
                    )}
                    {game.play_time && <span className="bg-zinc-800 text-amber-400 text-xs px-2.5 py-1.5 rounded-md font-bold border border-zinc-600 whitespace-nowrap">⏳ {game.play_time}</span>}
                    {game.needs_gm && <span className="bg-purple-950/40 text-purple-300 text-xs px-2.5 py-1.5 rounded-md font-bold border border-purple-800/60 whitespace-nowrap">👑 GM 필수</span>}
                  </div>
                  
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2 break-all">{game.description || '등록된 설명이 없습니다.'}</p>
                </div>
                
                <div className="pt-2 flex-shrink-0">
                  <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition shadow-sm ${selectedGameIds.includes(game.id) ? 'bg-red-600 border-red-600' : 'border-zinc-500 bg-zinc-800'}`}>
                    {selectedGameIds.includes(game.id) && <span className="text-white font-black text-xl leading-none">✓</span>}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 border-t-2 border-zinc-800/80 pt-4 mt-auto" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => togglePlayed(game.id, false)} className={`px-4 py-3 rounded-xl text-sm font-bold transition border-2 flex-1 shadow-sm ${isPlayed ? 'bg-zinc-700 text-zinc-100 border-zinc-500' : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`}>
                  {isPlayed ? '🩸 플레이 완료' : '플레이 안함'}
                </button>
                {game.needs_gm && (
                  <button onClick={() => togglePlayed(game.id, true)} className={`px-4 py-3 rounded-xl text-sm font-bold transition border-2 flex-1 shadow-sm ${isGmCapable ? 'bg-purple-800 text-purple-100 border-purple-500' : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`}>
                    {isGmCapable ? '👑 GM 가능' : 'GM 불가'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredGames.length === 0 && (
          <div className="col-span-1 lg:col-span-2 text-center py-24 text-zinc-500 font-bold border-2 border-dashed border-zinc-700 rounded-3xl bg-zinc-900/50">
            {searchTerm || activeCategory !== '전체' 
              ? "해당 조건에 맞는 게임이 아지트에 존재하지 않습니다. 🕵️‍♂️" 
              : "남아있는 게임이 없거나, 모든 게임을 경험하셨습니다. 🎉"}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border-2 border-zinc-700 p-8 rounded-3xl max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-black mb-6 text-zinc-100 border-b-2 border-zinc-800 pb-4">비밀 모임 소집 🩸</h2>
            <div className="mb-6">
              <label className="block text-sm font-bold text-zinc-400 mb-2">거사일 선택 (복수 가능)</label>
              <DatePicker 
                multiple 
                value={selectedDates} 
                onChange={(dates) => setSelectedDates(dates.map(d => d.format("YYYY-MM-DD")))} 
                format="YYYY-MM-DD" 
                minDate={new Date()}  
                inputClass="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition placeholder-zinc-500 font-bold" 
                containerClassName="w-full" 
                placeholder="날짜를 클릭하세요" 
              />
            </div>
            <div className="mb-8">
              <label className="block text-sm font-bold text-zinc-400 mb-2">당신의 역할</label>
              <select className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl focus:border-red-600 text-zinc-100 outline-none font-bold transition" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                <option value="player">일반 참가자</option>
                <option value="gm">게임 운영자 (GM)</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition">취소</button>
              <button onClick={submitSchedules} disabled={isSubmitting} className={`flex-1 py-3.5 text-white rounded-xl font-black shadow-lg transition border-2 ${isSubmitting ? 'bg-red-900 border-red-900 cursor-not-allowed' : 'bg-red-700 border-red-600 hover:bg-red-600'}`}>
                {isSubmitting ? '서약 중...' : '서약하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}