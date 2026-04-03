'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function RecommendPage() {
  const [playerCount, setPlayerCount] = useState(4);
  const [slots, setSlots] = useState(Array(4).fill(null)); 
  const [users, setUsers] = useState([]); 
  const [searchTerms, setSearchTerms] = useState(Array(4).fill(''));
  const [recommendedGames, setRecommendedGames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const num = parseInt(playerCount) || 0;
    setSlots(Array(num).fill(null));
    setSearchTerms(Array(num).fill(''));
  }, [playerCount]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, nickname');
    setUsers(data || []);
  };

  const handleSelectUser = (index, user) => {
    const newSlots = [...slots];
    newSlots[index] = user;
    setSlots(newSlots);
    
    const newSearch = [...searchTerms];
    newSearch[index] = user.nickname;
    setSearchTerms(newSearch);
  };

  const getRecommendations = async () => {
    setLoading(true);
    
    // ✨ 최적화: Promise.all을 통해 게임/리뷰 데이터를 한 번에 가져옴
    const [gamesRes, reviewsRes] = await Promise.all([
      supabase.from('games').select('*'),
      supabase.from('reviews').select('game_id, rating')
    ]);

    if (gamesRes.error) {
      console.error("데이터 에러:", gamesRes.error);
      alert("데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const gamesData = gamesRes.data || [];
    const reviewsData = reviewsRes.data || [];

    const selectedUserIds = slots.filter(s => s !== null).map(s => s.id);
    const { data: playedData } = await supabase.from('played_games')
      .select('game_id, user_id')
      .in('user_id', selectedUserIds);

    const processedGames = gamesData.map(game => {
      const gameReviews = reviewsData.filter(r => r.game_id === game.id);
      const ratings = gameReviews.map(r => r.rating);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      
      const playedUserIds = (playedData || []).filter(p => p.game_id === game.id).map(p => p.user_id);
      const unplayedCount = playerCount - playedUserIds.length; 

      let priority = 4; 
      
      if (playedUserIds.length > 0) {
        priority = 4;
      } else if (playerCount >= game.min_players && playerCount <= game.max_players) {
        if (game.recommended_players === parseInt(playerCount)) priority = 1;
        else if (game.max_players === parseInt(playerCount)) priority = 2;
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
      <div className="mb-10 flex justify-between items-center border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-zinc-100">맞춤 게임 추천기 🎯</h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold hover:bg-zinc-700 transition">
          대시보드로
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-zinc-900 p-6 rounded-3xl shadow-md border-2 border-zinc-700">
            <label className="block text-sm font-bold text-zinc-400 mb-2">참여 인원수</label>
            <input 
              type="number" 
              value={playerCount} 
              onChange={(e) => setPlayerCount(e.target.value)}
              className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-xl focus:border-purple-500 outline-none text-xl font-black text-zinc-100 transition"
            />
          </div>

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
                        <div key={u.id} onClick={() => handleSelectUser(i, u)} className="p-3 hover:bg-zinc-700 cursor-pointer text-sm font-bold text-zinc-200 transition">
                          {u.nickname}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button 
              onClick={getRecommendations}
              className="w-full mt-6 py-4 bg-purple-900 border-2 border-purple-700 text-white font-black tracking-wide rounded-xl hover:bg-purple-800 transition shadow-lg"
            >
              추천 리스트 뽑기 ✨
            </button>
          </div>
        </div>

        <div className="md:col-span-2">
          {loading ? (
            <div className="text-center py-20 font-bold text-zinc-500 bg-zinc-900 rounded-3xl border-2 border-zinc-700">데이터 분석 중... 🔍</div>
          ) : (
            <div className="space-y-4">
              {recommendedGames.map((game, idx) => (
                <div key={game.id} className="bg-zinc-900 p-6 rounded-3xl shadow-sm border-2 border-zinc-700 hover:border-purple-500 transition flex items-center gap-5">
                  <div className="text-3xl font-black text-zinc-700 w-12 text-center">#{idx + 1}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Link href={`/games/${game.id}`} className="text-2xl font-black text-zinc-100 hover:text-purple-400 hover:underline transition">
                        {game.title}
                      </Link>
                      {game.avgRating > 0 && (
                        <span className="text-amber-500 font-black text-sm drop-shadow-md">⭐ {game.avgRating.toFixed(1)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-bold text-zinc-400">
                      {/* ✨ 인원수 표기 */}
                      <span className="bg-zinc-800 border border-zinc-600 px-2.5 py-1.5 rounded-md text-zinc-300">
                        👥 {game.min_players === game.max_players ? `${game.min_players}명` : `${game.min_players}~${game.max_players}명`}
                      </span>
                      {/* ✨ 추천 인원 표시 */}
                      {game.recommended_players > 0 && (
                        <span className="bg-zinc-800 border border-zinc-600 px-2.5 py-1.5 rounded-md text-emerald-400">
                          👍 추천 {game.recommended_players}명
                        </span>
                      )}
                      {/* ✨ 플레이 시간 표시 */}
                      {game.play_time && (
                        <span className="bg-zinc-800 border border-zinc-600 px-2.5 py-1.5 rounded-md text-amber-400">
                          ⏳ {game.play_time}
                        </span>
                      )}
                      {/* ✨ 추가된 GM 필수 여부 뱃지 */}
                      {game.needs_gm && (
                        <span className="bg-zinc-800 text-purple-400 px-2.5 py-1.5 rounded-md border border-purple-800 whitespace-nowrap">
                          👑 GM 필수
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-4 py-2 rounded-lg text-xs font-black border-2 ${
                      game.priority === 1 ? 'bg-emerald-950 border-emerald-600 text-emerald-400' : 
                      game.priority === 2 ? 'bg-blue-950 border-blue-600 text-blue-400' : 'bg-zinc-800 border-zinc-600 text-zinc-300'
                    }`}>
                      {game.priority === 1 ? '베스트 매칭' : game.priority === 2 ? '풀파티 적합' : '플레이 가능'}
                    </span>
                  </div>
                </div>
              ))}
              {recommendedGames.length === 0 && !loading && (
                <div className="text-center py-24 text-zinc-500 font-bold text-lg bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-3xl">
                  인원수를 채울 수 있는 새로운 게임이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}