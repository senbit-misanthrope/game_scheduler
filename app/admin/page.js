'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('games'); 
  const [games, setGames] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  
  // ✨ ownership_status가 추가된 새로운 폼 데이터 구조
  const [formData, setFormData] = useState({
    title: '', 
    description: '', 
    min_players: 4, 
    max_players: 10, 
    recommended_players: 8, 
    play_time: '', 
    needs_gm: false,
    ownership_status: 'owned' // 기본값: 아지트 보유
  });

  useEffect(() => {
    checkAdminAndFetchData();
  }, []);

  const checkAdminAndFetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("접근 권한이 없습니다.");
      router.push('/');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    
    if (!profile || !profile.is_admin) {
      alert("관리자만 접근할 수 있는 비밀 공간입니다.");
      router.push('/');
      return;
    }

    setIsAdmin(true);
    fetchGames();
    fetchUsers();
    setLoading(false);
  };

  const fetchGames = async () => {
    const { data } = await supabase.from('games').select('*').order('title', { ascending: true });
    setGames(data || []);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('nickname', { ascending: true });
    setUsers(data || []);
  };

  const toggleAdminRole = async (userId, currentRole) => {
    if (!window.confirm(currentRole ? "이 유저의 관리자 권한을 박탈하시겠습니까?" : "이 유저에게 관리자 권한을 부여하시겠습니까?")) return;
    
    const { error } = await supabase.from('profiles').update({ is_admin: !currentRole }).eq('id', userId);
    if (error) alert("권한 변경 실패: " + error.message);
    else fetchUsers();
  };

  const openAddModal = () => {
    setEditingGame(null);
    setFormData({ title: '', description: '', min_players: 4, max_players: 10, recommended_players: 8, play_time: '', needs_gm: false, ownership_status: 'owned' });
    setIsModalOpen(true);
  };

  const openEditModal = (game) => {
    setEditingGame(game);
    setFormData({ 
        ...game,
        ownership_status: game.ownership_status || 'owned' // 기존 데이터가 없을 경우 대비
    });
    setIsModalOpen(true);
  };

  const handleSaveGame = async () => {
    if (!formData.title.trim()) return alert("게임 이름을 입력해주세요!");

    const submitData = {
      ...formData,
      min_players: parseInt(formData.min_players) || 1,
      max_players: parseInt(formData.max_players) || 1,
      recommended_players: parseInt(formData.recommended_players) || 1,
    };

    let dbError = null;
    if (editingGame) {
      const { error } = await supabase.from('games').update(submitData).eq('id', editingGame.id);
      dbError = error;
    } else {
      const { error } = await supabase.from('games').insert([submitData]);
      dbError = error;
    }

    if (dbError) {
      alert("저장 실패: " + dbError.message);
    } else {
      alert(editingGame ? "게임 정보가 수정되었습니다." : "새로운 게임이 등록되었습니다!");
      setIsModalOpen(false);
      fetchGames();
    }
  };

  const handleDeleteGame = async (id, title) => {
    if (!window.confirm(`[${title}] 게임을 아지트에서 완전히 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('games').delete().eq('id', id);
    if (error) alert("삭제 실패: " + error.message);
    else {
      alert("기록이 말소되었습니다. 🗑️");
      fetchGames();
    }
  };

  const filteredGames = games.filter(game => 
    game.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-lg font-bold text-zinc-400 bg-zinc-950 min-h-screen">관리자 권한을 확인하는 중...</div>;
  if (!isAdmin) return null;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-purple-900">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8 border-b-2 border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-zinc-100 flex items-center gap-3">
          👑 관리자 컨트롤 타워
        </h1>
        <Link href="/" className="px-5 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold text-center hover:bg-zinc-700 transition">대시보드로</Link>
      </div>

      <div className="flex gap-4 mb-8 bg-zinc-900 p-2 rounded-2xl border-2 border-zinc-700 overflow-x-auto shadow-sm">
        <button onClick={() => setActiveTab('games')} className={`flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold transition border-2 ${activeTab === 'games' ? 'bg-zinc-800 border-purple-600 text-white' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>🎮 게임 명부 관리</button>
        <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold transition border-2 ${activeTab === 'users' ? 'bg-zinc-800 border-red-600 text-white' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>👥 요원 관리</button>
      </div>

      {activeTab === 'games' && (
        <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border-2 border-zinc-700 shadow-md">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 border-b-2 border-zinc-800 pb-4">
            <h2 className="text-2xl font-black text-zinc-100">보유 게임 ({games.length})</h2>
            <button onClick={openAddModal} className="px-5 py-2 bg-purple-900 border-2 border-purple-700 text-white rounded-lg font-bold hover:bg-purple-800 transition shadow-sm">
              ➕ 신규 게임 입고
            </button>
          </div>

          <div className="mb-6">
            <input 
              type="text" 
              placeholder="게임명으로 검색..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border-2 border-zinc-700 p-3 rounded-xl focus:border-purple-600 outline-none text-zinc-100 placeholder-zinc-500 transition"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-zinc-800 border-y-2 border-zinc-700 text-zinc-400">
                  <th className="p-4 font-bold">게임명</th>
                  <th className="p-4 font-bold">상태</th>
                  <th className="p-4 font-bold">인원 (최소/최대/추천)</th>
                  <th className="p-4 font-bold text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y border-zinc-800">
                {filteredGames.map(game => (
                  <tr key={game.id} className="hover:bg-zinc-800/50 transition">
                    <td className="p-4 font-black text-zinc-100">{game.title}</td>
                    <td className="p-4">
                        <span className="text-[10px] px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 font-black uppercase">
                            {game.ownership_status === 'owned' ? 'Owned' : 
                             game.ownership_status === 'unowned' ? 'Unowned' : 
                             game.ownership_status === 'online' ? 'Online' : 'External'}
                        </span>
                    </td>
                    <td className="p-4 text-sm font-bold text-zinc-400">
                      {game.min_players} / {game.max_players} / <span className="text-emerald-400">{game.recommended_players}</span>
                    </td>
                    <td className="p-4 flex justify-center gap-2">
                      <button onClick={() => openEditModal(game)} className="px-3 py-1.5 bg-zinc-700 border border-zinc-600 text-zinc-200 rounded text-xs font-bold hover:bg-zinc-600">수정</button>
                      <button onClick={() => handleDeleteGame(game.id, game.title)} className="px-3 py-1.5 bg-zinc-950 border border-red-900 text-red-500 rounded text-xs font-bold hover:bg-red-950">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border-2 border-zinc-700 shadow-md">
          <h2 className="text-2xl font-black text-zinc-100 mb-6 border-b-2 border-zinc-800 pb-4">가입된 요원 목록 ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-zinc-800 border-y-2 border-zinc-700 text-zinc-400">
                  <th className="p-4 font-bold">닉네임</th>
                  <th className="p-4 font-bold text-center">권한</th>
                </tr>
              </thead>
              <tbody className="divide-y border-zinc-800">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-zinc-800/50 transition">
                    <td className="p-4 font-black text-zinc-100">{u.nickname || '익명'}</td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => toggleAdminRole(u.id, u.is_admin)} 
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition ${u.is_admin ? 'bg-red-900 border-red-700 text-white' : 'bg-zinc-800 border-zinc-600 text-zinc-400'}`}
                      >
                        {u.is_admin ? '👑 관리자' : '👤 일반'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border-2 border-zinc-700 p-5 md:p-8 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black mb-6 text-zinc-100 border-b-2 border-zinc-800 pb-4">
              {editingGame ? '게임 정보 수정' : '신규 게임 입고'}
            </h2>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1">게임명 *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-purple-600 transition" />
              </div>

              {/* ✨ 핵심: 보유 상태 선택 드롭다운 추가 */}
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1">보유 상태 *</label>
                <select 
                    className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-purple-600 transition font-bold"
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
                  <label className="block text-sm font-bold text-zinc-400 mb-1">최소 인원 *</label>
                  <input type="number" value={formData.min_players} onChange={e => setFormData({...formData, min_players: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-purple-600 transition" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-1">최대 인원 *</label>
                  <input type="number" value={formData.max_players} onChange={e => setFormData({...formData, max_players: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-purple-600 transition" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-1">추천 인원 *</label>
                  <input type="number" value={formData.recommended_players} onChange={e => setFormData({...formData, recommended_players: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-emerald-600 transition" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1">예상 플레이 시간 *</label>
                <input type="text" value={formData.play_time || ''} onChange={e => setFormData({...formData, play_time: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-purple-600 transition" />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-1">게임 설명</label>
                <textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-zinc-800 border-2 border-zinc-600 p-3 rounded-lg text-zinc-100 outline-none focus:border-purple-600 transition h-24 resize-none" />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input type="checkbox" id="needs_gm" checked={formData.needs_gm} onChange={e => setFormData({...formData, needs_gm: e.target.checked})} className="w-5 h-5 accent-purple-600 rounded border-zinc-600 cursor-pointer" />
                <label htmlFor="needs_gm" className="text-sm font-bold text-zinc-300 cursor-pointer select-none">진행자(GM) 필수 여부</label>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 transition">취소</button>
              <button onClick={handleSaveGame} className="flex-1 py-3 bg-purple-800 border-2 border-purple-600 text-white rounded-xl font-black shadow-lg hover:bg-purple-700 transition">
                {editingGame ? '수정 완료' : '등록하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}