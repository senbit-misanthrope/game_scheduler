'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function GameDetailPage() {
  const params = useParams();
  const gameId = params.id;
  
  const [game, setGame] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (gameId) fetchGameDetails();
  }, [gameId]);

  const fetchGameDetails = async () => {
    const { data: gameData, error: gameError } = await supabase.from('games').select('*').eq('id', gameId).single();
    if (gameError) {
      console.error(gameError);
      setLoading(false);
      return;
    }
    setGame(gameData);

    const { data: reviewData } = await supabase.from('reviews').select('*').eq('game_id', gameId).order('created_at', { ascending: false });
    
    if (reviewData && reviewData.length > 0) {
      const userIds = reviewData.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', userIds);
      const profileMap = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.nickname }), {});
      
      const enrichedReviews = reviewData.map(r => ({
        ...r,
        nickname: profileMap[r.user_id] || '이름없는 유저'
      }));
      setReviews(enrichedReviews);
    } else {
      setReviews([]);
    }
    setLoading(false);
  };

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">기록을 해독하는 중... 🎲</div>;
  if (!game) return <div className="p-8 text-center text-red-500 font-bold bg-zinc-950 min-h-screen">게임을 찾을 수 없습니다.</div>;

  const avgRating = reviews.length > 0 
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1) 
    : 0;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900">
      <div className="mb-6">
        <Link href="/" className="text-zinc-400 hover:text-zinc-100 hover:underline font-bold transition">← 어둠 속(대시보드)으로 돌아가기</Link>
      </div>

      <div className="bg-zinc-900 p-8 rounded-3xl shadow-md border-2 border-zinc-700 mb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-4xl font-black text-zinc-100">{game.title}</h1>
          <div className="flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-xl border-2 border-zinc-600">
            <span className="text-2xl drop-shadow-md">⭐</span>
            <span className="text-2xl font-black text-amber-400">{avgRating > 0 ? avgRating : '-'}</span>
            <span className="text-sm font-bold text-zinc-400">({reviews.length}개의 리뷰)</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <span className="bg-zinc-800 text-zinc-300 text-sm px-3 py-1.5 rounded-lg font-bold border border-zinc-600">
            👥 {game.min_players === game.max_players ? `${game.min_players}명` : `${game.min_players}~${game.max_players}명`}
          </span>
          {game.recommended_players !== game.min_players && game.recommended_players !== game.max_players && (
            <span className="bg-emerald-950/40 text-emerald-400 text-sm px-3 py-1.5 rounded-lg font-bold border border-emerald-900/50">👍 추천 {game.recommended_players}명</span>
          )}
          {game.play_time && <span className="bg-zinc-800 text-amber-400 text-sm px-3 py-1.5 rounded-lg font-bold border border-zinc-600">⏳ 예상 시간: {game.play_time}</span>}
          {game.needs_gm && <span className="bg-purple-900 text-purple-200 text-sm px-3 py-1.5 rounded-lg font-bold border border-purple-600">👑 진행자(GM) 필수</span>}
        </div>

        <div className="bg-zinc-950 p-6 rounded-2xl border-2 border-zinc-800">
          <h3 className="font-bold text-zinc-500 mb-2 text-sm border-b border-zinc-800 pb-2">게임 정보</h3>
          <p className="text-lg text-zinc-300 leading-relaxed mt-4">{game.description || '아직 등록된 상세 설명이 없습니다.'}</p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-black text-zinc-100 mb-6 flex items-center gap-2 border-b-2 border-zinc-800 pb-4">
          💬 유저들의 진실된 기록 <span className="text-zinc-500 text-lg font-bold">{reviews.length}</span>
        </h2>

        {reviews.length === 0 ? (
          <div className="bg-zinc-900 p-10 rounded-2xl border-2 border-dashed border-zinc-700 text-center">
            <p className="text-zinc-400 text-lg font-bold mb-2">아직 작성된 리뷰가 없습니다.</p>
            <p className="text-sm text-zinc-500">마이페이지에서 확정된 모임에 평점을 남겨 첫 번째 기록자가 되어보세요!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {reviews.map((review) => (
              <div key={review.id} className="bg-zinc-900 p-6 rounded-2xl shadow-sm border-2 border-zinc-700 flex flex-col sm:flex-row gap-4 justify-between sm:items-center transition hover:border-zinc-500 hover:shadow-md">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-black text-zinc-200 bg-zinc-800 border border-zinc-600 px-3 py-1 rounded-lg text-sm">{review.nickname}</span>
                    <span className="text-xs font-bold text-zinc-500">{new Date(review.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  <p className="text-zinc-300 text-lg font-medium">{review.comment || '내용 없이 별점만 남겼습니다.'}</p>
                </div>
                <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 px-4 py-2 rounded-xl">
                  {[1, 2, 3, 4, 5].map(num => (
                    <span key={num} className={`text-xl ${review.rating >= num ? 'text-amber-500 drop-shadow-md' : 'text-zinc-700'}`}>★</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}