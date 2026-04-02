import './globals.css';
import AuthGuard from '@/components/AuthGuard'; // ✨ 문지기 불러오기

export const metadata = {
  title: 'Secret Agit | 시크릿 아지트',
  description: '비밀스러운 보드게임 모임 대시보드',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-zinc-950 text-zinc-200">
        {/* ✨ 사이트 전체를 문지기로 감쌉니다 */}
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}