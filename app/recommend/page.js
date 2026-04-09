'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function RecommendPage() {
  // ✨ 추가: 유저 로그인 상태 확인용
  const [user, setUser] = useState(null);

  const [playerCount, setPlayerCount] = useState(4);
  const [slots, setSlots] = useState(Array(4).fill(null)); 
  const [users, setUsers] = useState([]); 
  const [searchTerms, setSearchTerms] = useState(Array(4).fill(''));
  const [recommendedGames, setRecommendedGames] = useState([]);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState(['전체']);
  const [selectedCategory, setSelectedCategory] = useState('전체');

  useEffect(() => {
    const fetchInitialData = async () => {
      // ✨ 로그인한 유저 정보도 함께 가져오기
      const [authRes, profilesRes, gamesRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('id, nickname'),
        supabase.from('games').select('category')
      ]);
      
      setUser(authRes.data.user || null);
      
      const fetchedUsers = profilesRes.data || [];
      setUsers(fetchedUsers);

      if (gamesRes.data) {
        const uniqueCategories = ['전체', ...new Set(gamesRes.data.map(g => g.category || '머더 미스테리'))];
        setCategories(uniqueCategories);
      }

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const p = params.get('p');
        const c = params.get('c');
        const u = params.get('u');

        if (p || c || u) {
          const targetP = p ? parseInt(p) : 4;
          const targetC = c ? c : '전체';
          
          let targetSlots = Array(targetP).fill(null);
          let targetSearchTerms = Array(targetP).fill('');
          
          if (u && fetchedUsers.length > 0) {
            const ids = u.split(',');
            ids.forEach((id, index) => {
              if (index < targetP) {
                const foundUser = fetchedUsers.find(user => user.id === id);
                if (foundUser) {
                  targetSlots[index] = foundUser;
                  targetSearchTerms[index] = foundUser.nickname;
                }
              }
            });
          }

          setPlayerCount(targetP);
          setSelectedCategory(targetC);
          setSlots(targetSlots);
          setSearchTerms(targetSearchTerms);

          // URL 파라미터가 있으면 게스트/회원 상관없이 자동 검색
          getRecommendations({ p: targetP, c: targetC, slots: targetSlots });
        }
      }
    };
    
    fetchInitialData();
  }, []); 

  // ✨ 비회원(게스트) 조작 차단용 경고 함수
  const checkGuest = (e) => {
    if (!user) {
      if (e) e.preventDefault();
      alert("아지트 요원 전용 기능입니다. 먼저 로그인을 해주세요! 🩸");
      return true; // 차단됨
    }
    return false; // 통과
  };

  const handlePlayerCountChange = (e) => {
    if (checkGuest(e)) return; // 비회원 차단

    const num = parseInt(e.target.value) || 0;
    setPlayerCount(num);
    
    const newSlots = Array(num).fill(null);
    const newSearchTerms = Array(num).fill('');
    
    for (let i = 0; i < Math.min(num, slots.length); i++) {
      newSlots[i] = slots[i];
      newSearchTerms[i] = searchTerms[i];
    }
    
    setSlots(newSlots);
    setSearchTerms(newSearchTerms);
  };

  const handleSelectUser = (index, selectedUser) => {
    const newSlots = [...slots];
    newSlots[index] = selectedUser;
    setSlots(newSlots);
    
    const newSearch = [...searchTerms];
    newSearch[index] = selectedUser.nickname;
    setSearchTerms(newSearch);
  };

  const handleShare = (e) => {
    if (checkGuest(e)) return; // 비회원 차단

    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('p', playerCount);
    if (selectedCategory !== '전체') url.searchParams.set('c', selectedCategory);
    
    const selectedIds = slots.filter(s => s !== null).map(s => s.id).join(',');
    if (selectedIds) url.searchParams.set('u', selectedIds);

    navigator.clipboard.writeText(url.toString()).then(() => {
      alert('🔗 현재 검색 조건이 복사되었습니다!\n카톡이나 디스코드로 공유해보세요.');
    }).catch(() => {
      alert('링크 복사에 실패했습니다.');
    });
  };

  const getRecommendations = async (overrideParams = null) => {
    setLoading(true);
    
    const targetPlayerCount = overrideParams ? overrideParams.p : playerCount;
    const targetCategory = overrideParams ? overrideParams.c : selectedCategory;
    const targetSlots = overrideParams ? overrideParams.slots : slots;

    const [gamesRes, reviewsRes] = await Promise.all([
      supabase.from('games').select('*'),
      supabase.from('reviews').select('game_id, rating')
    ]);

    if (gamesRes.error) {
      alert("데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const gamesData = gamesRes.data || [];
    const reviewsData = reviewsRes.data || [];

    const filteredGamesData = targetCategory === '전체' 
      ? gamesData 
      : gamesData.filter(g => (g.category || '머더 미스테리') === targetCategory);

    const selectedUserIds = targetSlots.filter(s => s !== null).map(s => s.id);
    const { data: playedData } = await supabase.from('played_games')
      .select('game_id, user_id')
      .in('user_id', selectedUserIds);

    const processedGames = filteredGamesData.map(game => {
      const gameReviews = reviewsData.filter(r => r.game_id === game.id);
      const ratings = gameReviews.map(r => r.rating);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      
      const playedUserIds = (playedData || []).filter(p => p.game_id === game.id).map(p => p.user_id);
      const unplayedCount = targetPlayerCount - playedUserIds.length; 

      let priority = 4; 
      
      if (playedUserIds.length > 0) {
        priority = 4;
      } else if (targetPlayerCount >= game.min_players && targetPlayerCount <= game.max_players) {
        if (game.recommended_players === parseInt(targetPlayerCount)) priority = 1;
        else if (game.max_players === parseInt(targetPlayerCount)) priority = 2;
        else priority = 3;
      }

      return { ...game, avgRating, unplayedCount, priority };
    });

    const sorted = processedGames
      .filter(g => g.priority < 4) 
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
        return a.title.localeCompare(b.title);
      });

    setRecommendedGames(sorted);
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-purple-900">
      
      {/* ✨ 레이아웃 개편: 헤더에 버튼들 우측 정렬 */}
      <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 border-b-2 border-zinc-800 pb-5">
        <h1 className="text-3xl font-black text-zinc-100">맞춤 게임 추천기 🎯</h1>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleShare} 
            className="px-4 py-2.5 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition shadow-sm text-sm"
          >
            🔗 공유
          </button>
          <Link href="/" className="px-4 py-2.5 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition shadow-sm text-sm">
            대시보드로
          </Link>
          
          {/* ✨ 비회원일 경우 로그인 버튼 추가 노출 */}
          {!user && (
            <Link href="/login" className="px-5 py-2.5 bg-red-700 border-2 border-red-600 text-white rounded-xl font-black hover:bg-red-600 transition shadow-sm text-sm ml-1">
              로그인
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          
          {/* 인원수 */}
          <div className="bg-zinc-900 p-6 rounded-3xl shadow-md border-2 border-zinc-700">
            <label className="block text-sm font-bold text-zinc-400 mb-2">참여 인원수</label>
            <input 
              type="number" 
              value={playerCount} 
              onChange={handlePlayerCountChange}
              className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-xl focus:border-purple-500 outline-none text-xl font-black text-zinc-100 transition"
            />
          </div>

          {/* 장르 */}
          <div className="bg-zinc-900 p-6 rounded-3xl shadow-md border-2 border-zinc-700">
            <label className="block text-sm font-bold text-zinc-400 mb-2">선호하는 장르</label>
            <select 
              value={selectedCategory}
              onChange={(e) => {
                if (checkGuest(e)) return;
                setSelectedCategory(e.target.value);
              }}
              className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-xl focus:border-purple-500 outline-none text-zinc-100 font-bold transition cursor-pointer"
            >
              {categories.map((cat, idx) => (
                <option key={idx} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* 명단 */}
          <div className="bg-zinc-900 p-6 rounded-3xl shadow-md border-2 border-zinc-700">
            <h3 className="text-sm font-bold text-zinc-400 mb-4">참석자 명단 <span className="text-zinc-600 text-xs">(공석은 비워두세요)</span></h3>
            <div className="space-y-3">
              {slots.map((slot, i) => (
                <div key={i} className="relative">
                  <input 
                    type="text"
                    placeholder={`참석자 ${i+1} 호칭 검색`}
                    value={searchTerms[i]}
                    onChange={(e) => {
                      if (checkGuest(e)) return;
                      const newSearch = [...searchTerms];
                      newSearch[i] = e.target.value;
                      setSearchTerms(newSearch);
                      if (slot) {
                         const newSlots = [...slots];
                         newSlots[i] = null;
                         setSlots(newSlots);
                      }
                    }}
                    className="w-full bg-zinc-950 border-2 border-zinc-700 p-3 rounded-lg text-sm outline-none focus:border-purple-500 text-zinc-200 transition placeholder-zinc-600"
                  />
                  {searchTerms[i] && !slot && (
                    <div className="absolute z-10 w-full bg-zinc-800 border-2 border-zinc-600 rounded-lg shadow-xl max-h-40 overflow-y-auto mt-1">
                      {users.filter(u => u.nickname.includes(searchTerms[i])).map(u => (
                        <div 
                          key={u.id} 
                          onClick={(e) => {
                            if (checkGuest(e)) return;
                            handleSelectUser(i, u);
                          }} 
                          className="p-3 hover:bg-zinc-700 cursor-pointer text-sm font-bold text-zinc-200 transition"
                        >
                          {u.nickname}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-6">
              <button 
                onClick={(e) => {
                  if (checkGuest(e)) return;
                  getRecommendations();
                }}
                className="w-full py-4 bg-purple-900 border-2 border-purple-700 text-white font-black tracking-wide rounded-xl hover:bg-purple-800 transition shadow-lg flex items-center justify-center gap-2"
              >
                새로운 리스트 뽑기 ✨
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          {loading ? (
            <div className="text-center py-20 font-bold text-zinc-500 bg-zinc-900 rounded-3xl border-2 border-zinc-700">데이터 분석 중... 🔍</div>
          ) : (
            <div className="space-y-4">
              {recommendedGames.map((game, idx) => (
                <div key={game.id} className="bg-zinc-900 p-6 rounded-3xl shadow-sm border-2 border-zinc-700 hover:border-purple-500 transition flex items-center gap-5 relative overflow-hidden">
                  <div className="text-3xl font-black text-zinc-700 w-12 text-center">#{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-bold shadow-sm tracking-wide">
                        {game.category || '머더 미스테리'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      {/* ✨ 비회원이 게임 제목을 누를 때도 경고창 띄우기 */}
                      <Link 
                        href={`/games/${game.id}`} 
                        onClick={(e) => checkGuest(e)}
                        className="text-2xl font-black text-zinc-100 hover:text-purple-400 hover:underline transition truncate"
                      >
                        {game.title}
                      </Link>
                      {game.avgRating > 0 && (
                        <span className="text-amber-500 font-black text-sm drop-shadow-md whitespace-nowrap">⭐ {game.avgRating.toFixed(1)}</span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-xs font-bold text-zinc-400">
                      <span className="bg-zinc-800 border border-zinc-600 px-2.5 py-1.5 rounded-md text-zinc-300 whitespace-nowrap">
                        👥 {game.min_players === game.max_players ? `${game.min_players}명` : `${game.min_players}~${game.max_players}명`}
                      </span>
                      {game.recommended_players > 0 && (
                        <span className="bg-zinc-800 border border-zinc-600 px-2.5 py-1.5 rounded-md text-emerald-400 whitespace-nowrap">
                          👍 추천 {game.recommended_players}명
                        </span>
                      )}
                      {game.play_time && (
                        <span className="bg-zinc-800 border border-zinc-600 px-2.5 py-1.5 rounded-md text-amber-400 whitespace-nowrap">
                          ⏳ {game.play_time}
                        </span>
                      )}
                      {game.needs_gm && (
                        <span className="bg-zinc-800 text-purple-400 px-2.5 py-1.5 rounded-md border border-purple-800 whitespace-nowrap">
                          👑 GM 필수
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0 pl-2">
                    <span className={`px-4 py-2 rounded-lg text-xs font-black border-2 shadow-sm whitespace-nowrap ${
                      game.priority === 1 ? 'bg-emerald-950 border-emerald-600 text-emerald-400' : 
                      game.priority === 2 ? 'bg-blue-950 border-blue-600 text-blue-400' : 'bg-zinc-800 border-zinc-600 text-zinc-300'
                    }`}>
                      {game.priority === 1 ? '베스트 매칭' : game.priority === 2 ? '풀파티 적합' : '플레이 가능'}
                    </span>
                  </div>
                </div>
              ))}
              {recommendedGames.length === 0 && !loading && (
                <div className="text-center py-24 text-zinc-500 font-bold text-lg bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-3xl flex flex-col gap-2 items-center justify-center">
                  <span>해당 인원수와 장르 조건에 맞는 게임이 없습니다.</span>
                  {selectedCategory !== '전체' && (
                    <button 
                      onClick={(e) => {
                        if (checkGuest(e)) return;
                        setSelectedCategory('전체');
                        getRecommendations({ p: playerCount, c: '전체', slots: slots });
                      }} 
                      className="text-purple-400 hover:text-purple-300 underline text-sm mt-2 transition"
                    >
                      '전체 장르'로 다시 검색하기
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}