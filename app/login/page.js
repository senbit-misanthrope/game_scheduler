'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 상태 관리: 'login', 'signup', 'forgot' (비밀번호 찾기)
  const [mode, setMode] = useState('login');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('가입 성공! 메인으로 이동합니다. (호칭은 마이페이지에서 설정해주세요)');
        router.push('/');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
      } else if (mode === 'forgot') {
        // ✨ 비밀번호 재설정 이메일 발송 로직
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`, // 이메일 링크 클릭 시 돌아올 주소
        });
        if (error) throw error;
        alert('입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해주세요!');
        setMode('login');
      }
    } catch (error) {
      alert(error.message || '인증 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 font-sans selection:bg-red-900">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-wider text-zinc-100 drop-shadow-md">
          SECRET <span className="text-red-600">AGIT</span>
        </h1>
        <p className="text-zinc-500 mt-2 font-bold">
          {mode === 'login' ? '어둠 속으로 입장하세요' : mode === 'signup' ? '새로운 요원으로 합류하세요' : '잃어버린 열쇠를 찾습니다'}
        </p>
      </div>

      <div className="bg-zinc-900 border-2 border-zinc-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-2">아이디 (이메일)</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full bg-zinc-950 border-2 border-zinc-700 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition" 
            />
          </div>
          
          {mode !== 'forgot' && (
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">비밀번호</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                className="w-full bg-zinc-950 border-2 border-zinc-700 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition" 
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className={`w-full py-3.5 rounded-xl font-black tracking-wide transition shadow-lg border-2 ${
              loading ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-red-800 border-red-700 text-white hover:bg-red-700'
            }`}
          >
            {loading ? '처리 중...' : mode === 'login' ? '입장하기 🚪' : mode === 'signup' ? '서약하기 🩸' : '복구 링크 받기 📧'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-center border-t-2 border-zinc-800 pt-6">
          {mode === 'login' ? (
            <>
              <button onClick={() => setMode('signup')} className="text-sm font-bold text-zinc-400 hover:text-zinc-200 transition">
                아직 아지트의 일원이 아니신가요? <span className="text-red-500 hover:underline">가입하기</span>
              </button>
              <button onClick={() => setMode('forgot')} className="text-sm font-bold text-zinc-500 hover:text-zinc-300 transition">
                비밀번호를 잊으셨나요?
              </button>
            </>
          ) : (
            <button onClick={() => setMode('login')} className="text-sm font-bold text-zinc-400 hover:text-zinc-200 transition">
              이미 요원이신가요? <span className="text-red-500 hover:underline">돌아가기</span>
            </button>
          )}
        </div>
      </div>
      
      <Link href="/" className="mt-8 text-zinc-600 font-bold hover:text-zinc-400 transition text-sm">
        ← 메인으로 돌아가기 (임시)
      </Link>
    </div>
  );
}