'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function UpdatePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 사용자가 비밀번호 재설정 링크를 타고 온 것이 맞는지 확인
  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('비밀번호 복구 모드 진입');
      }
    });
  }, []);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;
      
      alert('비밀번호가 성공적으로 변경되었습니다! 아지트로 입장합니다.');
      router.push('/'); // 변경 성공 시 메인 페이지로 이동
    } catch (error) {
      alert('비밀번호 변경 실패: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 font-sans selection:bg-red-900">
      <div className="bg-zinc-900 border-2 border-zinc-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-black mb-6 text-zinc-100 border-b-2 border-zinc-800 pb-4 text-center">새로운 열쇠 각인 🗝️</h2>
        
        <form onSubmit={handleUpdatePassword} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-2">새 비밀번호 (6자리 이상)</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              required 
              minLength="6"
              className="w-full bg-zinc-950 border-2 border-zinc-700 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition" 
              placeholder="새로운 비밀번호를 입력하세요"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading} 
            className={`w-full py-3.5 rounded-xl font-black tracking-wide transition shadow-lg border-2 ${
              loading ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-amber-700 border-amber-600 text-white hover:bg-amber-600'
            }`}
          >
            {loading ? '각인 중...' : '비밀번호 변경 완료'}
          </button>
        </form>
      </div>
    </div>
  );
}