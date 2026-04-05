'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function GameDetailPage() {
  const params = useParams();
  const gameId = params.id;
  
  // ✨ 추가: 유저 정보 및 플레이 기록 상태
  const [user, setUser] = useState(null);
  const [playedRecords, setPlayedRecords] = useState([]);
  
  const [game, setGame] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [categories, setCategories] = useState(['머더 미스테리']); 
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (gameId) fetchGameDetails();
  }, [gameId]);

  const fetchGameDetails = async () => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    let userIsAdmin = false;
    
    // ✨ 수정: 로그인한 유저 정보 저장 및 해당 게임의 플레이 기록 가져오기
    if (sessionUser) {
      setUser(sessionUser);
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', sessionUser.id).single();
      if (profile?.is_admin) {
        setIsAdmin(true);
        userIsAdmin = true;
      }

      // 내 플레이 기록 가져오기
      const { data: playedData } = await supabase.from('played_games')
        .select('*')
        .eq('user_id', sessionUser.id)
        .eq('game_id', gameId);
      setPlayedRecords(playedData || []);
    }

    const { data: gameData, error: gameError } = await supabase.from('games').select('*').eq('id', gameId).single();
    if (gameError) {
      console.error(gameError);
      setLoading(false);
      return;
    }
    setGame(gameData);

    if (userIsAdmin) {
      const { data: catData } = await supabase.from('games').select('category');
      const uniqueCategories = [...new Set((catData || []).map(g => g.category || '머더 미스테리'))];
      if (!uniqueCategories.includes('머더 미스테리')) uniqueCategories.unshift('머더 미스테리');
      setCategories(uniqueCategories);
    }

    const { data: reviewData } = await supabase.from('reviews').select('*').eq('game_id', gameId).order('created_at', { ascending: false });
    
    if (reviewData && reviewData.length > 0) {
      const userIds = reviewData.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', userIds);
      const profileMap = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.nickname }), {});
      
      const enrichedReviews = reviewData.map(r => ({
        ...r,
        nickname: profileMap[r.user_id] || '이름없는 요원'
      }));
      setReviews(enrichedReviews);
    } else {
      setReviews([]);
    }
    setLoading(false);
  };

  // ✨ 추가: 플레이 상태 토글 함수 (메인 페이지 로직과 동일)
  const togglePlayed = async (isGmMode) => {
    if (!user) {
      alert('로그인이 필요한 기능입니다. 요원으로 합류해주세요! 🩸');
      return;
    }
    
    const hasPlayed = playedRecords.some(pg => pg.is_gm === false);
    const hasGm = playedRecords.some(pg => pg.is_gm === true);
    const targetRecord = playedRecords.find(pg => pg.is_gm === isGmMode);
    
    let newPlayedRecords = [...playedRecords];

    if (targetRecord) {
      const idsToDelete = [targetRecord.id];
      newPlayedRecords = newPlayedRecords.filter(pg => pg.id !== targetRecord.id);
      
      if (isGmMode === false && hasGm) {
        const gmRecord = playedRecords.find(pg => pg.is_gm === true);
        if (gmRecord) {
          idsToDelete.push(gmRecord.id);
          newPlayedRecords = newPlayedRecords.filter(pg => pg.id !== gmRecord.id);
        }
      }
      setPlayedRecords(newPlayedRecords);
      await supabase.from('played_games').delete().in('id', idsToDelete);
    } else {
      const insertData = [{ user_id: user.id, game_id: gameId, is_gm: isGmMode }];
      if (isGmMode === true && !hasPlayed) {
        insertData.push({ user_id: user.id, game_id: gameId, is_gm: false });
      }
      
      const { data: inserted } = await supabase.from('played_games').insert(insertData).select();
      if (inserted) setPlayedRecords([...playedRecords, ...inserted]);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm("🚨 이 기록을 아지트에서 영구적으로 삭제하시겠습니까?")) return;
    
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
    if (!error) {
      alert("기록이 완전히 삭제되었습니다.");
      fetchGameDetails(); 
    } else {
      alert("삭제 중 오류가 발생했습니다: " + error.message);
    }
  };

  const openEditModal = () => {
    setIsAddingNewCategory(false);
    setFormData({ 
      ...game,
      ownership_status: game.ownership_status || 'owned',
      category: game.category || '머더 미스테리'
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateGame = async () => {
    if (!formData.title.trim()) return alert("게임 이름을 입력해주세요!");
    if (!formData.category.trim()) return alert("카테고리(장르)를 입력하거나 선택해주세요!");

    const submitData = {
      ...formData,
      min_players: parseInt(formData.min_players) || 1,
      max_players: parseInt(formData.max_players) || 1,
      recommended_players: parseInt(formData.recommended_players) || 1,
    };

    const { error } = await supabase.from('games').update(submitData).eq('id', game.id);
    if (error) {
      alert("저장 실패: " + error.message);
    } else {
      alert("게임 정보가 현장에서 즉시 수정되었습니다! 🛠️");
      setIsEditModalOpen(false);
      fetchGameDetails(); 
    }
  };

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">기록을 해독하는 중... 🎲</div>;
  if (!game) return <div className="p-8 text-center text-red-500 font-bold bg-zinc-950 min-h-screen">게임을 찾을 수 없습니다.</div>;

  const avgRating = reviews.length > 0 
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1) 
    : 0;

  // ✨ 추가: 현재 렌더링을 위한 플레이 상태 계산
  const isPlayed = playedRecords.some(pg => pg.is_gm === false);
  const isGmCapable = playedRecords.some(pg => pg.is_gm === true);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900">
      <div className="mb-6">
        <Link href="/" className="text-zinc-400 hover:text-zinc-100 hover:underline font-bold transition flex items-center gap-2">
          <span>←</span> 어둠 속(대시보드)으로 돌아가기
        </Link>
      </div>

      <div className="bg-zinc-900 p-6 md:p-8 rounded-3xl shadow-md border-2 border-zinc-700 mb-10">
        
        {/* 1층: 뱃지 & 관리자 수정 버튼 */}
        <div className="flex justify-between items-start gap-4 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-black tracking-wide shadow-sm">
              {game.category || '머더 미스테리'}
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 font-black uppercase shadow-sm">
              {game.ownership_status === 'owned' ? '아지트 보유' : 
               game.ownership_status === 'unowned' ? '미보유' : 
               game.ownership_status === 'online' ? '온라인 전용' : '외부 조달'}
            </span>
          </div>

          {isAdmin && (
            <button onClick={openEditModal} className="px-4 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 hover:text-white transition shadow-sm shrink-0 flex items-center gap-1.5">
              <span>⚙️</span> 정보 수정
            </button>
          )}
        </div>

        {/* 2층: 게임 제목 & 별점 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 mb-6 border-b-2 border-zinc-800/80 pb-6">
          <h1 className="text-3xl md:text-4xl font-black text-zinc-100 break-keep leading-tight">
            {game.title}
          </h1>
          <div className="flex items-center gap-2 bg-zinc-950 px-5 py-2.5 rounded-xl border border-zinc-800 shrink-0 shadow-inner">
            <span className="text-2xl drop-shadow-md">⭐</span>
            <span className="text-2xl font-black text-amber-400">{avgRating > 0 ? avgRating : '-'}</span>
            <span className="text-sm font-bold text-zinc-500 ml-1">({reviews.length}개의 리뷰)</span>
          </div>
        </div>

        {/* 3층: 게임 정보 태그들 */}
        <div className="flex flex-wrap items-center gap-2.5 mb-6">
          <span className="bg-zinc-800 text-zinc-300 text-sm px-3.5 py-2 rounded-lg font-bold border border-zinc-600 shadow-sm">
            👥 {game.min_players === game.max_players ? `${game.min_players}명` : `${game.min_players}~${game.max_players}명`}
          </span>
          {game.recommended_players > 0 && game.recommended_players !== game.min_players && game.recommended_players !== game.max_players && (
            <span className="bg-emerald-950/40 text-emerald-400 text-sm px-3.5 py-2 rounded-lg font-bold border border-emerald-900/50 shadow-sm">
              👍 추천 {game.recommended_players}명
            </span>
          )}
          {game.play_time ? (
            <span className="bg-zinc-800 text-amber-400 text-sm px-3.5 py-2 rounded-lg font-bold border border-zinc-600 shadow-sm">
              ⏳ 예상 시간: {game.play_time}
            </span>
          ) : null}
          {game.needs_gm ? (
            <span className="bg-purple-950/50 text-purple-300 text-sm px-3.5 py-2 rounded-lg font-bold border border-purple-800/60 shadow-sm">
              👑 진행자(GM) 필수
            </span>
          ) : null}
        </div>

        {/* ✨ 3.5층: 플레이 기록 체크 버튼들 */}
        <div className="flex gap-3 mb-8">
          <button 
            onClick={() => togglePlayed(false)} 
            className={`px-4 py-3.5 rounded-xl text-sm font-bold transition border-2 flex-1 shadow-sm ${isPlayed ? 'bg-zinc-700 text-zinc-100 border-zinc-500' : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`}
          >
            {isPlayed ? '🩸 이미 플레이 함' : '플레이 안함'}
          </button>
          {game.needs_gm && (
            <button 
              onClick={() => togglePlayed(true)} 
              className={`px-4 py-3.5 rounded-xl text-sm font-bold transition border-2 flex-1 shadow-sm ${isGmCapable ? 'bg-purple-800 text-purple-100 border-purple-500' : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`}
            >
              {isGmCapable ? '👑 GM 가능' : 'GM 불가'}
            </button>
          )}
        </div>

        {/* 4층: 설명 구역 */}
        <div className="bg-zinc-950 p-6 md:p-8 rounded-2xl border border-zinc-800 shadow-inner">
          <h3 className="font-bold text-zinc-500 mb-3 text-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
            게임 정보
          </h3>
          <p className="text-base md:text-lg text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {game.description || '아직 등록된 상세 설명이 없습니다.'}
          </p>
        </div>
      </div>

      {/* 리뷰(기록) 구역 */}
      <div>
        <h2 className="text-2xl font-black text-zinc-100 mb-6 flex items-center gap-3 border-b-2 border-zinc-800 pb-4">
          💬 유저들의 진실된 기록 
          <span className="bg-zinc-800 text-zinc-300 text-sm px-3 py-1 rounded-lg border border-zinc-700">{reviews.length}</span>
        </h2>

        {reviews.length === 0 ? (
          <div className="bg-zinc-900 p-10 rounded-3xl border-2 border-dashed border-zinc-700 text-center shadow-sm">
            <p className="text-zinc-400 text-lg font-bold mb-2">아직 작성된 리뷰가 없습니다.</p>
            <p className="text-sm text-zinc-500">마이페이지에서 확정된 모임에 평점을 남겨 첫 번째 기록자가 되어보세요!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {reviews.map((review) => (
              <div key={review.id} className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-700 flex flex-col sm:flex-row gap-5 justify-between sm:items-center transition hover:border-zinc-500 hover:shadow-md relative">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-black text-zinc-200 bg-zinc-800 border border-zinc-600 px-3 py-1.5 rounded-lg text-sm shadow-sm">{review.nickname}</span>
                    <span className="text-xs font-bold text-zinc-500">{new Date(review.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  <p className="text-zinc-300 text-base md:text-lg font-medium leading-relaxed break-all">
                    {review.comment || '내용 없이 별점만 남겼습니다.'}
                  </p>
                </div>
                
                <div className="flex flex-col items-end gap-3 shrink-0">
                  <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 px-4 py-2 rounded-xl shadow-inner">
                    {[1, 2, 3, 4, 5].map(num => (
                      <span key={num} className={`text-xl md:text-2xl ${review.rating >= num ? 'text-amber-500 drop-shadow-sm' : 'text-zinc-800'}`}>★</span>
                    ))}
                  </div>
                  
                  {isAdmin && (
                    <button 
                      onClick={() => handleDeleteReview(review.id)}
                      className="text-xs font-bold bg-zinc-950 border border-red-900/50 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-950/80 hover:text-red-400 transition shadow-sm"
                    >
                      🚨 강제 삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-zinc-700 p-6 md:p-8 rounded-3xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black mb-6 text-zinc-100 border-b-2 border-zinc-800 pb-4 flex items-center gap-2">
              <span>🛠️</span> 게임 정보 현장 수정
            </h2>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1.5">게임명 *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition" />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1.5">카테고리 (장르) *</label>
                {!isAddingNewCategory ? (
                  <select 
                    className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition font-bold"
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === 'NEW_CATEGORY') {
                        setIsAddingNewCategory(true);
                        setFormData({...formData, category: ''});
                      } else {
                        setFormData({...formData, category: e.target.value});
                      }
                    }}
                  >
                    {categories.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                    <option value="NEW_CATEGORY">➕ 새 카테고리 직접 입력...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="새로운 장르 입력" 
                      value={formData.category} 
                      onChange={e => setFormData({...formData, category: e.target.value})} 
                      className="w-full bg-zinc-800 border-2 border-purple-600 p-3.5 rounded-xl text-zinc-100 outline-none transition" 
                      autoFocus
                    />
                    <button 
                      onClick={() => {
                        setIsAddingNewCategory(false);
                        setFormData({...formData, category: categories[0] || '머더 미스테리'});
                      }} 
                      className="px-5 bg-zinc-700 border-2 border-zinc-600 hover:bg-zinc-600 text-zinc-300 rounded-xl font-bold transition whitespace-nowrap"
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1.5">보유 상태 *</label>
                <select 
                    className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition font-bold"
                    value={formData.ownership_status}
                    onChange={(e) => setFormData({...formData, ownership_status: e.target.value})}
                >
                    <option value="owned">📦 아지트 보유</option>
                    <option value="unowned">👻 미보유</option>
                    <option value="online">🌐 온라인 전용</option>
                    <option value="external">🚚 외부 조달</option>
                </select>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-1.5">최소 인원</label>
                  <input type="number" value={formData.min_players} onChange={e => setFormData({...formData, min_players: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-1.5">최대 인원</label>
                  <input type="number" value={formData.max_players} onChange={e => setFormData({...formData, max_players: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-1.5">추천 인원</label>
                  <input type="number" value={formData.recommended_players} onChange={e => setFormData({...formData, recommended_players: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-emerald-600 transition" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1.5">예상 플레이 시간 *</label>
                <input type="text" value={formData.play_time || ''} onChange={e => setFormData({...formData, play_time: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition" />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1.5">게임 설명</label>
                <textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3.5 rounded-xl text-zinc-100 outline-none focus:border-purple-600 transition h-28 resize-none leading-relaxed" />
              </div>

              <div className="flex items-center gap-3 pt-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <input type="checkbox" id="needs_gm_edit" checked={formData.needs_gm} onChange={e => setFormData({...formData, needs_gm: e.target.checked})} className="w-5 h-5 accent-purple-600 rounded border-zinc-600 cursor-pointer" />
                <label htmlFor="needs_gm_edit" className="text-sm font-bold text-zinc-300 cursor-pointer select-none">이 게임은 진행자(GM)가 필수로 필요합니다.</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition">취소</button>
              <button onClick={handleUpdateGame} className="flex-1 py-4 bg-emerald-800 border-2 border-emerald-600 text-white rounded-xl font-black shadow-lg hover:bg-emerald-700 transition">
                수정 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}