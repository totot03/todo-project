# 스타일링 가이드

이 문서는 TailwindCSS v4 + shadcn/ui를 활용한 스타일링 규칙과 모범 사례를 제공합니다.

> ⚠️ **스택 사실의 단일 출처는 [PRD 1.3](../PRD.md#13-기술-스택)이다.** 이 가이드의 서술이 PRD와 어긋나면 PRD를 따른다.
> 특히 **미설치 라이브러리를 `import` 하지 않는다** — PRD 1.3의 "설치 상태" 열을 먼저 확인할 것.

## 🎨 기술 스택 개요

### 핵심 스타일링 도구

- **TailwindCSS v4**: 유틸리티 기반 CSS 프레임워크 — ✅ 설치됨
- **shadcn/ui**: Radix UI 기반 컴포넌트 라이브러리 — ✅ 설치됨. style은 **`radix-nova`**, baseColor는 `neutral` (`components.json` 기준. new-york 아님)
- **tw-animate-css**: 애니메이션 라이브러리 — ✅ 설치됨
- **CSS Variables**: 동적 테마 시스템
- **다크모드**: `providers/ThemeProvider.tsx`의 자체 구현 — ✅ 설치됨. M4에서 next-themes 0.4를 도입했으나, React 19가 next-themes의 FOUC 방지 `<script>`를 컴포넌트 트리 안의 엘리먼트로 인식해 "Encountered a script tag while rendering React component" 경고를 내는 문제(pacocoursey/next-themes#385·#387)가 있어 M6에서 `useServerInsertedHTML` 기반 자체 구현으로 교체했다 (`PRD.md` 1.3)
- **prettier-plugin-tailwindcss**: 자동 클래스 정렬 — ✅ 설치됨 (`todo-frontend/prettier.config.mjs` 의 `plugins` 에 등록됨)

> 아래 다크모드 예시는 `providers/ThemeProvider.tsx`를 그대로 발췌한 것이다. 테마 기본값은 시스템 설정이다 (`PRD.md` FR-U01).

## 🚀 TailwindCSS v4 사용 규칙

### 기본 원칙

```tsx
// ✅ 올바른 Tailwind 클래스 사용
<div className="flex items-center justify-between rounded-lg bg-background p-4 shadow-md">
  <h2 className="text-lg font-semibold text-foreground">제목</h2>
  <Button variant="outline" size="sm">버튼</Button>
</div>

// ❌ 인라인 스타일 사용 금지
<div style={{ display: 'flex', padding: '16px' }}>
  <h2 style={{ fontSize: '18px' }}>제목</h2>
</div>
```

### 클래스 작성 순서

Prettier 플러그인이 자동으로 정렬하지만, 수동 작성 시 다음 순서를 따르세요:

```tsx
<div className={cn(
  // 1. 레이아웃 (display, position)
  "flex absolute",

  // 2. 크기 (width, height, padding, margin)
  "w-full h-auto p-4 m-2",

  // 3. 타이포그래피 (font, text)
  "text-lg font-medium text-center",

  // 4. 배경 및 테두리
  "bg-background border border-border rounded-md",

  // 5. 효과 (shadow, opacity, transform)
  "shadow-lg opacity-90 hover:scale-105",

  // 6. 상호작용 (hover, focus, active)
  "hover:bg-accent focus:ring-2 active:scale-95",

  // 조건부 클래스
  isActive && "bg-primary text-primary-foreground",
  className
)}>
```

### 반응형 디자인

```tsx
// ✅ 모바일 우선 접근법
<div className={cn(
  // 기본 (모바일)
  "flex flex-col space-y-4 p-4",

  // 태블릿 (768px+)
  "md:flex-row md:space-y-0 md:space-x-6 md:p-6",

  // 데스크톱 (1024px+)
  "lg:max-w-6xl lg:mx-auto lg:p-8",

  // 대형 화면 (1280px+)
  "xl:max-w-7xl"
)}>

// ❌ 데스크톱 우선 접근법 지양
<div className="hidden lg:block md:hidden">
```

### 커스텀 클래스 최소화

```tsx
// ✅ Tailwind 유틸리티 클래스 우선 사용
<button className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">

// ❌ 커스텀 CSS 클래스 지양
<button className="custom-button">
```

## 🎭 shadcn/ui 컴포넌트 활용

### 기본 사용법

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ✅ shadcn/ui 컴포넌트 활용
export function UserCard({ user }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button variant="outline">프로필 보기</Button>
      </CardContent>
    </Card>
  );
}
```

### 컴포넌트 변형 (Variants)

```tsx
// Button 컴포넌트 변형
<Button variant="default">기본 버튼</Button>
<Button variant="destructive">삭제 버튼</Button>
<Button variant="outline">아웃라인 버튼</Button>
<Button variant="secondary">보조 버튼</Button>
<Button variant="ghost">고스트 버튼</Button>
<Button variant="link">링크 버튼</Button>

// 크기 변형
<Button size="default">기본 크기</Button>
<Button size="sm">작은 크기</Button>
<Button size="lg">큰 크기</Button>
<Button size="icon">아이콘만</Button>
```

### 컴포넌트 커스터마이징

```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ✅ 기존 컴포넌트 확장
export function CustomButton({ className, ...props }) {
  return (
    <Button
      className={cn(
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

// ❌ 처음부터 새로 만들기
export function MyButton({ className, ...props }) {
  return (
    <button
      className="bg-blue-500... px-4 py-2" // 긴 클래스 나열
      {...props}
    />
  );
}
```

### 새 shadcn/ui 컴포넌트 추가

```bash
# 컴포넌트 추가
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog

# 모든 컴포넌트 확인
npx shadcn@latest add
```

## 🌓 다크모드 구현

### 자체 ThemeProvider (next-themes 대체)

next-themes는 하이드레이션 전에 실행되는 FOUC 방지 `<script>`를 일반 React 엘리먼트로 렌더링하는데,
React 19가 이를 "컴포넌트 안에서 렌더링된 script는 클라이언트에서 실행되지 않는다"고 매번 경고한다
(next-themes는 2025-03 이후 업데이트가 없어 라이브러리 차원 수정을 기대하기 어렵다). 대신 같은
스크립트를 `next/navigation`의 `useServerInsertedHTML`로 서버 렌더링 스트림에 직접 삽입한다 —
이 경로는 일반 클라이언트 렌더 트리를 타지 않으므로 저 경고가 발생하지 않는다.

핵심 아이디어만 발췌(전문은 `providers/ThemeProvider.tsx` 참고, 파일명은 PascalCase — guides/project-structure.md):

```tsx
// providers/ThemeProvider.tsx
"use client";
import { useServerInsertedHTML } from "next/navigation";

// localStorage에서 테마를 읽어 하이드레이션 전에 동기적으로 <html>에 dark 클래스를 적용한다.
const THEME_INIT_SCRIPT = `(function(){ /* localStorage → <html class="dark"> 즉시 반영 */ })();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  useServerInsertedHTML(() => <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />);

  // useState의 lazy initializer로 최초 렌더 시 한 번만 localStorage를 읽는다.
  // 마운트 useEffect에서 setState를 동기 호출하면 캐스케이딩 렌더가 생긴다는
  // react-hooks/set-state-in-effect 경고를 피하기 위함 (아래 테마 토글 주석도 참고).
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  // ... Context Provider로 { theme, resolvedTheme, setTheme } 제공
}

export function useTheme() {
  /* Context 값을 반환, ThemeProvider 밖에서 쓰면 throw */
}
```

### 테마 토글 컴포넌트

```tsx
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/providers/ThemeProvider";

// resolvedTheme으로 아이콘을 조건부 렌더링하면 서버는 시스템 설정을 몰라 하이드레이션
// 전/후 마크업이 달라진다. Tailwind의 dark: variant로 두 아이콘을 항상 렌더링해두고
// CSS만으로 전환하면 이 문제 자체가 생기지 않는다.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
      <span className="sr-only">테마 전환</span>
    </Button>
  );
}
```

### 다크모드 대응 스타일링

```tsx
// ✅ 시맨틱 색상 변수 사용
<div className="bg-background text-foreground">
  <h1 className="text-primary">제목</h1>
  <p className="text-muted-foreground">설명</p>
</div>

// ❌ 하드코딩된 색상 사용
<div className="bg-white text-black dark:bg-black dark:text-white">
  <h1 className="text-blue-600 dark:text-blue-400">제목</h1>
</div>
```

## 🎨 색상 시스템

### CSS 변수 기반 색상

`app/globals.css`에 정의된 색상 변수:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 224 71.4% 4.1%;
  --primary: 220.9 39.3% 11%;
  --primary-foreground: 210 20% 98%;
  --secondary: 220 14.3% 95.9%;
  --secondary-foreground: 220.9 39.3% 11%;
  --muted: 220 14.3% 95.9%;
  --muted-foreground: 220 8.9% 46.1%;
  --accent: 220 14.3% 95.9%;
  --accent-foreground: 220.9 39.3% 11%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 20% 98%;
  --border: 220 13% 91%;
  --input: 220 13% 91%;
  --ring: 224 71.4% 4.1%;
}
```

### 색상 사용 예시

```tsx
// ✅ 시맨틱 색상 클래스 사용
<div className="bg-background border-border">
  <h1 className="text-foreground">메인 텍스트</h1>
  <p className="text-muted-foreground">보조 텍스트</p>
  <Button className="bg-primary text-primary-foreground">버튼</Button>
</div>

// ❌ 직접 색상 지정
<div className="bg-white border-gray-200">
  <h1 className="text-gray-900">메인 텍스트</h1>
  <p className="text-gray-600">보조 텍스트</p>
</div>
```

## ✨ 애니메이션 가이드

### tw-animate-css 활용

```tsx
import 'tw-animate-css'

// ✅ 내장 애니메이션 사용
<div className="animate-fadeIn">페이드 인</div>
<div className="animate-slideUp">슬라이드 업</div>
<div className="animate-bounce">바운스</div>

// ✅ Tailwind transition 활용
<button className="transition-all duration-200 hover:scale-105 hover:shadow-lg">
  호버 효과
</button>

// ✅ 복합 애니메이션
<div className="transform transition-transform duration-300 hover:scale-110 hover:rotate-3">
  복합 효과
</div>
```

### 성능 고려사항

```tsx
// ✅ will-change 사용으로 성능 최적화
<div className="will-change-transform transition-transform hover:scale-105">

// ✅ 애니메이션 종료 후 will-change 제거
<div className="hover:will-change-transform transition-transform hover:scale-105">
```

## 📱 반응형 디자인 패턴

### 컨테이너 패턴

```tsx
// ✅ 반응형 컨테이너
<div className="container mx-auto px-4 sm:px-6 lg:px-8">
  <div className="max-w-7xl mx-auto">
    {/* 컨텐츠 */}
  </div>
</div>

// ✅ 그리드 레이아웃
<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => (
    <Card key={item.id}>...</Card>
  ))}
</div>
```

### 네비게이션 패턴

```tsx
// ✅ 반응형 네비게이션
<nav className="flex items-center justify-between p-4">
  <div className="flex items-center space-x-4">
    <Logo />
    <div className="hidden md:flex md:space-x-6">
      <NavLink href="/about">소개</NavLink>
      <NavLink href="/contact">연락처</NavLink>
    </div>
  </div>

  {/* 모바일 메뉴 */}
  <div className="md:hidden">
    <MobileMenu />
  </div>
</nav>
```

## 🛠️ 유틸리티 함수

### cn() 헬퍼 함수

```tsx
import { cn } from '@/lib/utils'

// ✅ cn() 함수로 클래스 조합
<div className={cn(
  "base-classes",
  condition && "conditional-classes",
  variant === 'primary' && "primary-classes",
  className // props에서 받은 추가 클래스
)}>

// ❌ 수동 문자열 조합
<div className={`base-classes ${condition ? 'conditional-classes' : ''} ${className || ''}`}>
```

### 조건부 스타일링

```tsx
// ✅ 조건부 클래스 적용
<Button
  className={cn(
    "base-button-styles",
    isLoading && "opacity-50 cursor-not-allowed",
    variant === 'destructive' && "bg-destructive text-destructive-foreground",
    size === 'sm' && "px-2 py-1 text-sm"
  )}
  disabled={isLoading}
>

// ❌ 복잡한 삼항 연산자
<Button
  className={
    isLoading
      ? "opacity-50 cursor-not-allowed"
      : variant === 'destructive'
        ? "bg-red-500 text-white"
        : "bg-blue-500 text-white"
  }
>
```

## 🚫 금지사항

### ❌ 피해야 할 패턴

```tsx
// 인라인 스타일 사용
<div style={{ backgroundColor: 'red' }}>

// 긴 클래스명 하드코딩
<div className="w-full h-screen flex items-center justify-center bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-bold text-2xl shadow-2xl rounded-lg border-4 border-white">

// 중복된 스타일 정의
<div className="p-4 padding-4 pt-4 pb-4 pl-4 pr-4">

// !important 남용
<div className="!text-red-500 !bg-blue-500">

// Tailwind와 CSS 모듈 혼재
<div className={`${styles.customClass} flex items-center`}>
```

### ❌ 잘못된 색상 사용

```tsx
// 하드코딩된 색상
<div className="bg-gray-100 text-gray-900">

// 다크모드 미고려
<div className="bg-white text-black">

// 접근성 미고려
<button className="bg-red-200 text-red-300">저대비 버튼</button>
```

## ✅ 스타일링 체크리스트

새 컴포넌트 작성 시 확인사항:

### 기본 사항

- [ ] TailwindCSS 유틸리티 클래스 우선 사용
- [ ] cn() 함수로 클래스 조합
- [ ] 시맨틱 색상 변수 사용
- [ ] 반응형 디자인 적용

### 다크모드

- [ ] 다크모드 대응 색상 사용
- [ ] 하드코딩된 색상 없음
- [ ] 테마 전환 시 깨짐 없음

### 성능

- [ ] 불필요한 애니메이션 없음
- [ ] will-change 적절히 사용
- [ ] 인라인 스타일 없음

### 접근성

- [ ] 충분한 색상 대비
- [ ] 포커스 상태 스타일링
- [ ] 스크린 리더 고려

### 유지보수

- [ ] 일관된 클래스 순서
- [ ] 재사용 가능한 컴포넌트 활용
- [ ] 의미있는 클래스 조합

이 가이드를 따라 일관성 있고 아름다운 UI를 구현해보세요!
