import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { message } = await request.json();
    
    // 🔥 [수정됨] .env.local 대신 여기에 디스코드 웹훅 주소를 직접 복사해서 양쪽 따옴표("") 사이에 붙여넣으세요!
    const webhookUrl = "https://discord.com/api/webhooks/1489176313762811926/euL8YP3vrjXxXJPhzpoY7o8Y3UguJXpK6U-AN78NefOPh7kUsxAJGTrKSc0-QV5Ui8NL";

    // 터미널에 로그 띄우기 (확인용)
    console.log("🚀 디스코드 발송 시도 중...");
    console.log("보낼 메시지:", message);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ 디스코드에서 거절함! 에러 코드:", response.status, errorText);
      throw new Error(`Discord API 에러: ${response.status}`);
    }

    console.log("✅ 디스코드 발송 성공!");
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("❌ 서버 내부 에러 발생:", error);
    return NextResponse.json({ error: "전송 실패" }, { status: 500 });
  }
}