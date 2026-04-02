'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ children }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname(); // 현재 유저가 접속하려는 주소

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // 로그인 페이지('/login')나 회원가입 페이지('/signup')는 신분증 검사 예외!
      if (!user && pathname !== '/login' && pathname !== '/signup') {
        // 비회원이면 뒤도 돌아보지 않고 로그인 페이지로 쫓아냅니다.
        router.push('/login');
      } else {
        // 통과
        setLoading(false);
      }
    };
    
    checkUser();
  }, [pathname, router]);

  // 검사하는 아주 짧은 찰나에 보여줄 로딩 화면 (시크릿 테마 유지)
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex justify-center items-center text-zinc-500 font-black text-xl">
        비밀의 문을 확인하는 중... 🗝️
      </div>
    );
  }

  // 무사히 통과하면 원래 보려던 페이지(children)를 보여줍니다.
  return children;
}