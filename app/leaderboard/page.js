'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function LeaderboardPage() {
  const [topUsers, setTopUsers] = useState([]);
  const [topGames, setTopGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonthStr, setCurrentMonthStr] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    setCurrentMonthStr(`${currentYear}년 ${currentMonth + 1}월`);

    const { data: schedules, error } = await supabase
      .from('schedules')
      .select(`
        user_id, 
        game_id, 
        available_date, 
        profiles ( nickname ), 
        games ( title )
      `)
      .eq('status', 'confirmed');

    if (error || !schedules) {
      console.error('데이터 에러:', error);
      setLoading(false);
      return;
    }

    const thisMonthSchedules = schedules.filter(s => {
      const date = new Date(s.available_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const userMap = {};
    const gameMap = {};
    const uniqueSessions = new Set(); 

    thisMonthSchedules.forEach(s => {
      if (!userMap[s.user_id]) {
        userMap[s.user_id] = { nickname: s.profiles?.nickname || '익명', count: 0 };
      }
      userMap[s.user_id].count += 1;

      const sessionKey = `${s.game_id}_${s.available_date}`;
      if (!uniqueSessions.has(sessionKey)) {
        uniqueSessions.add(sessionKey);
        if (!gameMap[s.game_id]) {
          gameMap[s.game_id] = { title: s.games?.title || '알 수 없는 게임', count: 0 };
        }
        gameMap[s.game_id].count += 1;
      }
    });

    const sortedUsers = Object.values(userMap).sort((a, b) => b.count - a.count).slice(0, 10);
    const sortedGames = Object.values(gameMap).sort((a, b) => b.count - a.count).slice(0, 10);

    setTopUsers(sortedUsers);
    setTopGames(sortedGames);
    setLoading(false);
  };

  const getMedal = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return <span className="text-zinc-600 font-black">{index + 1}</span>;
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-amber-900">
      <div className="mb-10 flex justify-between items-center border-b-2 border-zinc-800 pb-4">
        <div>
          <h1 className="text-4xl font-black text-zinc-100 mb-2">명예의 전당 🏆</h1>
          <p className="text-amber-500 font-bold text-lg">{currentMonthStr} 누적 통계</p>
        </div>
        <Link href="/" className="px-5 py-2.5 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition">
          대시보드로
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-500 font-bold text-xl">통계를 분석하는 중입니다... 📊</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* 🔥 이달의 열혈 멤버 */}
          <div className="bg-zinc-900 p-6 rounded-3xl shadow-md border-2 border-zinc-700">
            <h2 className="text-2xl font-black text-amber-500 mb-6 flex items-center gap-2 border-b-2 border-zinc-800 pb-4">
              🔥 이달의 열혈 멤버
            </h2>
            {topUsers.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 font-bold bg-zinc-950 rounded-xl border border-zinc-800">이번 달 확정된 모임이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {topUsers.map((user, idx) => (
                  <div key={idx} className={`flex justify-between items-center p-4 rounded-2xl border-2 transition ${idx < 3 ? 'bg-zinc-800 border-amber-600/50 shadow-sm' : 'bg-zinc-950 border-zinc-800'}`}>
                    <div className="flex items-center gap-4">
                      <div className="text-2xl w-8 text-center">{getMedal(idx)}</div>
                      <span className={`font-black text-lg ${idx < 3 ? 'text-zinc-100' : 'text-zinc-400'}`}>{user.nickname}</span>
                    </div>
                    <div className="bg-zinc-900 px-4 py-1.5 rounded-lg border-2 border-zinc-700 text-sm font-black text-amber-500">
                      {user.count}회 참석
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 🎲 이달의 인기 게임 */}
          <div className="bg-zinc-900 p-6 rounded-3xl shadow-md border-2 border-zinc-700">
            <h2 className="text-2xl font-black text-blue-500 mb-6 flex items-center gap-2 border-b-2 border-zinc-800 pb-4">
              🎲 이달의 인기 게임
            </h2>
            {topGames.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 font-bold bg-zinc-950 rounded-xl border border-zinc-800">이번 달 플레이된 게임이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {topGames.map((game, idx) => (
                  <div key={idx} className={`flex justify-between items-center p-4 rounded-2xl border-2 transition ${idx < 3 ? 'bg-zinc-800 border-blue-600/50 shadow-sm' : 'bg-zinc-950 border-zinc-800'}`}>
                    <div className="flex items-center gap-4">
                      <div className="text-2xl w-8 text-center">{getMedal(idx)}</div>
                      <span className={`font-black text-lg ${idx < 3 ? 'text-zinc-100' : 'text-zinc-400'}`}>{game.title}</span>
                    </div>
                    <div className="bg-zinc-900 px-4 py-1.5 rounded-lg border-2 border-zinc-700 text-sm font-black text-blue-400">
                      {game.count}회 플레이
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}