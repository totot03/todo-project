# React Hook Form + Zod 폼 처리 가이드

이 문서는 React Hook Form + Zod를 활용한 폼 처리 패턴을 정리한 **범용 참고 자료**입니다.

> ⚠️ **스택 사실의 단일 출처는 [PRD 1.3](../PRD.md#13-기술-스택)이다.** 이 가이드의 서술이 PRD와 어긋나면 PRD를 따른다.
> **React Hook Form · Zod · `@hookform/resolvers` 는 아직 설치되지 않았습니다 (ROADMAP M5 도입 예정).**
> 미설치 상태에서 `import` 하지 않는다.

---

## ⚠️ 이 프로젝트에 적용할 때 반드시 지킬 것

이 가이드는 원래 프론트엔드 단독(Server Actions 기반) 프로젝트를 전제로 작성되었습니다.
**본 Todo 프로젝트는 자체 백엔드(Spring Boot)를 사용하므로, 아래 두 가지를 반드시 치환해서 읽으십시오.**

### 1. 비밀번호 규칙은 "6자 이상"이 전부다

이 프로젝트의 불변 규칙([PRD.md](../PRD.md) FR-A03)은 **비밀번호 최소 6자**이며,
**대소문자·숫자·특수문자 복잡도 규칙을 추가하지 않습니다.**
아래 예시 중 복잡도 정규식이 등장하면 무시하고 `.min(6, ...)`만 사용하십시오.

### 2. 인증·CRUD는 Server Actions가 아니라 Spring Boot REST API로 처리한다

이 문서 후반부에는 Server Actions 안에서 `hashPassword()`, `createUser()`, `authenticateUser()`를
직접 호출하는 예시가 나옵니다. **본 프로젝트는 이 패턴을 사용하지 않습니다.**

| 이 문서의 예시                         | 본 프로젝트에서 실제로 할 일                                              |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Server Action에서 `hashPassword()`     | 백엔드가 BCrypt로 해시 — 프론트는 평문을 HTTPS로 전달만                   |
| Server Action에서 `createUser()`       | `POST /api/auth/signup` 호출                                              |
| Server Action에서 `authenticateUser()` | `POST /api/auth/login` 호출 — 토큰은 **쿠키로 자동 수신**, 저장 코드 없음 |
| DB 직접 조회                           | `lib/api/client.ts`를 경유한 REST 호출                                    |

### 3. 토큰을 저장하는 코드를 절대 쓰지 않는다

이 프로젝트의 JWT는 **httpOnly 쿠키로만** 전달됩니다 (`PRD.md` FR-A06 / NFR-S02, `API_SPEC.md` 1.2).

- 로그인·회원가입 **응답 본문에 토큰 값이 없습니다.** `res.data.accessToken` 같은 필드는 존재하지 않습니다.
- `saveToken()` · `lib/auth/token.ts` · `localStorage` · `Authorization: Bearer` 헤더 —
  **전부 이 프로젝트에서는 오답이며 `PRD.md` 위반입니다.**
- 프론트가 할 일은 `fetch` 에 `credentials: "include"` 를 붙이는 것뿐이고, 나머지는 브라우저가 합니다.
- 로그인 여부 판정은 `GET /api/auth/me` 응답으로 합니다. 쿠키를 읽어 판정하지 않습니다(읽을 수 없습니다).

### 4. 에러 코드는 `API_SPEC.md` 1.5 표를 쓴다

`COMMON_001` · `AUTH_001` 같은 코드 체계는 이 프로젝트에 없습니다. 실제 코드는 다음 6개입니다.

`VALIDATION_FAILED` · `EMAIL_DUPLICATED` · `LOGIN_FAILED` · `UNAUTHORIZED` · `TODO_NOT_FOUND` · `INTERNAL_ERROR`

필드별 검증 오류는 `data` 가 아니라 **`error.fieldErrors`** 배열(`{ field, message }[]`)로 내려옵니다.

---

즉, 이 문서에서 **가져다 쓸 부분은 "폼 상태 관리 + Zod 검증 + 에러 표시" 패턴뿐**이고,
**데이터 영속화·인증 부분은 전부 [API_SPEC.md](../API_SPEC.md)의 엔드포인트 호출로 대체**합니다.

---

## 🚀 기본 설정 및 셋업

### 패키지 설치

```bash
# ⏳ 아직 설치되지 않았습니다. ROADMAP M5 에서 설치합니다 (PRD.md 1.3 "설치 상태" 열 기준)
npm install react-hook-form @hookform/resolvers zod
```

### TypeScript 설정 최적화

```typescript
// lib/types/forms.ts
import { z } from "zod";
import { UseFormReturn } from "react-hook-form";

// 공통 폼 타입 정의
export type FormState<T extends z.ZodSchema> = {
  success: boolean;
  message?: string;
  errors?: Partial<Record<keyof z.infer<T>, string[]>>;
  data?: z.infer<T>;
};

// 서버 액션 반환 타입
export type ActionResult<T = unknown> = {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
};

// 폼 훅 공통 인터페이스
export interface FormHookProps<T extends z.ZodSchema> {
  schema: T;
  defaultValues?: Partial<z.infer<T>>;
  onSubmit: (data: z.infer<T>) => Promise<ActionResult>;
}
```

## 🚀 필수 패턴: 기본 폼 아키텍처

### 스키마 정의 패턴

```typescript
// lib/schemas/auth.ts
import { z } from "zod";

// 🚀 재사용 가능한 기본 스키마 컴포넌트
export const emailSchema = z
  .string()
  .min(1, "이메일을 입력해주세요")
  .email("올바른 이메일 형식이 아닙니다");

// ⚠️ 불변 규칙(PRD.md FR-A03): 6자 이상이면 통과.
//    복잡도 정규식(.regex)을 추가하지 않는다. 백엔드의 @Size(min = 6)과 일치시킨다.
export const passwordSchema = z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다");

// 로그인 폼 스키마
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});

// 회원가입 폼 스키마
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "이름은 최소 2자 이상이어야 합니다")
      .max(50, "이름은 최대 50자까지 입력 가능합니다"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    terms: z.boolean().refine((val) => val === true, {
      message: "이용약관에 동의해주세요",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
```

### Server Actions 정의

> 🚫 **본 프로젝트는 아래 패턴을 사용하지 않습니다.**
> 이 절의 `authenticateUser` / `hashPassword` / `createUser` / `getUserByEmail`은 프론트엔드가 인증과 DB를
> 직접 담당하는 구조를 전제한 Mock입니다. 본 프로젝트에서 이 책임은 전부 Spring Boot 백엔드에 있습니다.
> 아래 코드는 **폼 상태·검증·에러 반환 흐름을 이해하는 용도로만** 읽고, 실제 구현은 이 절 끝의
> **"본 프로젝트 적용 버전"** 을 사용하십시오.

```typescript
// app/actions/auth.ts  ※ 참고용 — 본 프로젝트에서는 사용하지 않음
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { loginSchema, registerSchema } from "@/lib/schemas/auth";
import type { ActionResult } from "@/lib/types/forms";

// 🔧 Mock 헬퍼 함수들 (실제 구현 필요)
async function authenticateUser(email: string, password: string) {
  // TODO: 실제 인증 로직 구현
  // 예: 데이터베이스에서 사용자 확인, 비밀번호 검증
  if (email === "test@example.com" && password === "password123") {
    return { id: "1", email, name: "Test User" };
  }
  return null;
}

async function createSession(userId: string) {
  // TODO: 실제 세션 생성 로직 구현
  // 예: JWT 토큰 생성, 쿠키 설정
  console.log(`Creating session for user ${userId}`);
}

async function logUserActivity(userId: string, action: string) {
  // TODO: 실제 활동 로그 기록
  console.log(`User ${userId} performed ${action}`);
}

async function updateLastLoginTime(userId: string) {
  // TODO: 실제 데이터베이스 업데이트
  console.log(`Updated last login time for user ${userId}`);
}

async function getUserByEmail(email: string) {
  // TODO: 실제 데이터베이스 조회
  // 예시: 중복 이메일 확인
  const existingEmails = ["existing@example.com"];
  return existingEmails.includes(email) ? { email } : null;
}

async function hashPassword(password: string) {
  // TODO: 실제 비밀번호 해싱 (bcrypt, argon2 등)
  return `hashed_${password}`;
}

async function createUser(userData: { name: string; email: string; password: string }) {
  // TODO: 실제 데이터베이스에 사용자 생성
  const newUser = {
    id: Date.now().toString(),
    ...userData,
    createdAt: new Date(),
  };
  console.log("Created user:", newUser);
  return newUser;
}

async function sendWelcomeEmail(email: string, name: string) {
  // TODO: 실제 이메일 발송 로직
  console.log(`Sending welcome email to ${email}`);
}

// 🚀 서버 액션 with 타입 안전성
export async function loginAction(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    // 🚀 필수: 서버 사이드 스키마 검증
    const validatedFields = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!validatedFields.success) {
      return {
        success: false,
        message: "입력된 정보를 확인해주세요",
        errors: validatedFields.error.flatten().fieldErrors,
      };
    }

    const { email, password } = validatedFields.data;

    // 인증 로직
    const user = await authenticateUser(email, password);

    if (!user) {
      return {
        success: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다",
      };
    }

    // 🔄 세션 설정
    await createSession(user.id);

    // 🔄 비동기 후처리 작업
    after(async () => {
      await logUserActivity(user.id, "login");
      await updateLastLoginTime(user.id);
    });

    return {
      success: true,
      message: "로그인되었습니다",
      data: { userId: user.id },
    };
  } catch (error) {
    console.error("Login error:", error);
    return {
      success: false,
      message: "로그인 중 오류가 발생했습니다",
    };
  }
}

// 리다이렉션이 필요한 경우
export async function loginWithRedirect(formData: FormData) {
  const result = await loginAction({ success: false, message: "" }, formData);

  if (result.success) {
    redirect("/dashboard");
  }

  return result;
}

// 🚀 회원가입 액션
export async function registerAction(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const validatedFields = registerSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      terms: formData.get("terms") === "on",
    });

    if (!validatedFields.success) {
      return {
        success: false,
        message: "입력된 정보를 확인해주세요",
        errors: validatedFields.error.flatten().fieldErrors,
      };
    }

    const { name, email, password } = validatedFields.data;

    // 중복 이메일 확인
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return {
        success: false,
        message: "이미 사용 중인 이메일입니다",
        errors: { email: ["이미 사용 중인 이메일입니다"] },
      };
    }

    // 사용자 생성
    const hashedPassword = await hashPassword(password);
    const user = await createUser({
      name,
      email,
      password: hashedPassword,
    });

    // 후처리 작업
    after(async () => {
      await sendWelcomeEmail(email, name);
      await logUserActivity(user.id, "register");
    });

    return {
      success: true,
      message: "회원가입이 완료되었습니다",
      data: { userId: user.id },
    };
  } catch (error) {
    console.error("Register error:", error);
    return {
      success: false,
      message: "회원가입 중 오류가 발생했습니다",
    };
  }
}
```

### ✅ 본 프로젝트 적용 버전 — Spring Boot REST API 호출

Server Action 대신 **React Query mutation + `lib/api/` 클라이언트**로 처리합니다.
비밀번호 해싱·중복 검사·토큰 발급은 전부 백엔드가 담당하므로, 프론트는 요청을 보내고 응답을 해석할 뿐입니다.

```typescript
// lib/api/auth.ts
import { apiClient } from "./client";
import type { ApiResponse } from "@/types/api";

// API_SPEC.md 2.1~2.2 — 응답 data 는 사용자 정보뿐이다.
// JWT 는 Set-Cookie 헤더로만 오므로 타입에 토큰 필드가 존재하지 않는다.
export type UserResponse = {
  id: number;
  email: string;
  nickname: string;
  provider: "LOCAL" | "GOOGLE";
};

// POST /api/auth/login — 자격 검증과 JWT 쿠키 발급은 백엔드 책임
export async function login(body: { email: string; password: string }) {
  return apiClient.post<ApiResponse<UserResponse>>("/api/auth/login", body);
}

// POST /api/auth/signup — BCrypt 해싱·이메일 중복 검사는 백엔드 책임
// nickname 은 필수(1~50자)다. `name` 이 아니다.
export async function signup(body: { email: string; password: string; nickname: string }) {
  return apiClient.post<ApiResponse<UserResponse>>("/api/auth/signup", body);
}
```

```typescript
// components/auth/LoginForm.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { loginSchema, type LoginFormData } from "@/lib/schemas/auth";
import { login } from "@/lib/api/auth";

export function LoginForm() {
  const router = useRouter();
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      // 저장할 토큰이 없다. 쿠키는 서버가 Set-Cookie 로 이미 심었다.
      // 인증 상태가 필요한 곳에서는 GET /api/auth/me 로 판정한다.
      router.push("/todos");
    },
    onError: (error: unknown) => {
      // 검증 실패(VALIDATION_FAILED)면 error.fieldErrors 배열로 내려온다 (API_SPEC.md 1.3)
      const fieldErrors = extractFieldErrors(error); // { field, message }[] → 폼 필드에 매핑
      if (fieldErrors) {
        fieldErrors.forEach(({ field, message }) => {
          form.setError(field as keyof LoginFormData, { message });
        });
        return;
      }
      // 자격 불일치(LOGIN_FAILED)는 어느 쪽이 틀렸는지 밝히지 않고 폼 전체 에러로 표시
      form.setError("root", { message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    },
  });

  // 이하 렌더는 아래 "기본 폼 컴포넌트 패턴"과 동일하되,
  // form action 대신 form.handleSubmit((values) => mutation.mutate(values)) 를 사용한다.
}
```

핵심 차이를 정리하면 이렇습니다.

|                  | 참고용 Server Actions 패턴       | 본 프로젝트                                    |
| ---------------- | -------------------------------- | ---------------------------------------------- |
| 실행 위치        | Next.js 서버                     | Spring Boot                                    |
| 비밀번호 해싱    | 프론트의 `hashPassword()`        | 백엔드 BCrypt                                  |
| 중복 이메일 검사 | 프론트의 `getUserByEmail()`      | 백엔드 → `EMAIL_DUPLICATED` 응답               |
| 세션             | 쿠키 세션                        | JWT (24h) **httpOnly 쿠키** — 저장 코드 없음   |
| 제출 트리거      | `useActionState` + `form action` | React Query `mutation`                         |
| 에러 표시        | Action 반환값                    | `ApiResponse.error.code` / `error.fieldErrors` |

---

### 기본 폼 컴포넌트 패턴

```typescript
// components/forms/login-form.tsx
'use client'

import React from 'react'
import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginFormData } from '@/lib/schemas/auth'
import { loginAction } from '@/app/actions/auth'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export function LoginForm() {
  // 🔄 React 19: useActionState로 서버 액션 상태 관리
  const [state, formAction, isPending] = useActionState(loginAction, {
    success: false,
    message: '',
  })

  // 🚀 React Hook Form 설정
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onChange', // 실시간 검증
  })

  // 🚀 폼 제출 처리
  const onSubmit = async (data: LoginFormData) => {
    const formData = new FormData()
    formData.append('email', data.email)
    formData.append('password', data.password)

    formAction(formData)
  }

  // ✅ 서버 에러를 폼 필드 에러로 연동
  React.useEffect(() => {
    if (state.errors) {
      Object.entries(state.errors).forEach(([field, messages]) => {
        form.setError(field as keyof LoginFormData, {
          type: 'server',
          message: messages[0],
        })
      })
    }
  }, [state.errors, form])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>비밀번호</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 서버 메시지 표시 */}
        {state.message && (
          <div
            className={`text-sm ${
              state.success ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {state.message}
          </div>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              로그인 중...
            </>
          ) : (
            '로그인'
          )}
        </Button>
      </form>
    </Form>
  )
}
```

## ✅ 권장 사항: 고급 폼 패턴

### 다단계 폼 (Multi-step Form)

```typescript
// components/forms/multi-step-form.tsx
'use client'

import React, { useState } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// 단계별 스키마 정의
const step1Schema = z.object({
  firstName: z.string().min(1, '이름을 입력해주세요'),
  lastName: z.string().min(1, '성을 입력해주세요'),
  email: z.string().email('올바른 이메일을 입력해주세요'),
})

const step2Schema = z.object({
  company: z.string().min(1, '회사명을 입력해주세요'),
  position: z.string().min(1, '직책을 입력해주세요'),
  experience: z.enum(['junior', 'mid', 'senior']),
})

const step3Schema = z.object({
  skills: z.array(z.string()).min(1, '최소 1개의 스킬을 선택해주세요'),
  portfolio: z.string().url('올바른 URL을 입력해주세요').optional(),
  bio: z.string().max(500, '최대 500자까지 입력 가능합니다'),
})

// 전체 스키마
const completeSchema = step1Schema.merge(step2Schema).merge(step3Schema)
type CompleteFormData = z.infer<typeof completeSchema>

const steps = [
  { schema: step1Schema, title: '기본 정보' },
  { schema: step2Schema, title: '경력 정보' },
  { schema: step3Schema, title: '추가 정보' },
]

export function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState(0)
  const [savedData, setSavedData] = useState<Partial<CompleteFormData>>({})

  const form = useForm<CompleteFormData>({
    resolver: zodResolver(steps[currentStep].schema),
    defaultValues: savedData,
    mode: 'onChange',
  })

  // 🚀 단계별 유효성 검사 및 데이터 저장
  const nextStep = async () => {
    const isValid = await form.trigger()
    if (isValid) {
      const currentData = form.getValues()
      setSavedData(prev => ({ ...prev, ...currentData }))

      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1)
        // 다음 단계 스키마로 리셋
        form.reset(savedData, {
          resolver: zodResolver(steps[currentStep + 1].schema)
        })
      }
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
      form.reset(savedData, {
        resolver: zodResolver(steps[currentStep - 1].schema)
      })
    }
  }

  // 🚀 최종 제출
  const onSubmit = async (data: CompleteFormData) => {
    const completeData = { ...savedData, ...data }

    // 전체 스키마로 최종 검증
    const validation = completeSchema.safeParse(completeData)

    if (!validation.success) {
      console.error('Validation failed:', validation.error)
      return
    }

    // 서버로 데이터 전송
    const formData = new FormData()
    Object.entries(completeData).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => formData.append(`${key}[]`, item))
      } else {
        formData.append(key, String(value))
      }
    })

    // 서버 액션 호출
    await submitProfileAction(formData)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* 진행 표시기 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center ${
                index <= currentStep ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  index <= currentStep
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300'
                }`}
              >
                {index + 1}
              </div>
              <span className="ml-2">{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 단계별 컴포넌트 렌더링 */}
          {currentStep === 0 && <Step1Form />}
          {currentStep === 1 && <Step2Form />}
          {currentStep === 2 && <Step3Form />}

          {/* 네비게이션 버튼 */}
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              이전
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button type="button" onClick={nextStep}>
                다음
              </Button>
            ) : (
              <Button type="submit">
                제출
              </Button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  )
}

// 🔧 단계별 폼 컴포넌트 정의
function Step1Form() {
  const { control } = useFormContext<CompleteFormData>()

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="firstName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>이름</FormLabel>
            <FormControl>
              <Input placeholder="이름을 입력하세요" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="lastName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>성</FormLabel>
            <FormControl>
              <Input placeholder="성을 입력하세요" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>이메일</FormLabel>
            <FormControl>
              <Input type="email" placeholder="이메일을 입력하세요" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

function Step2Form() {
  const { control } = useFormContext<CompleteFormData>()

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="company"
        render={({ field }) => (
          <FormItem>
            <FormLabel>회사명</FormLabel>
            <FormControl>
              <Input placeholder="회사명을 입력하세요" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="position"
        render={({ field }) => (
          <FormItem>
            <FormLabel>직책</FormLabel>
            <FormControl>
              <Input placeholder="직책을 입력하세요" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="experience"
        render={({ field }) => (
          <FormItem>
            <FormLabel>경력 수준</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="경력 수준을 선택하세요" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="junior">주니어 (1-3년)</SelectItem>
                <SelectItem value="mid">중급 (3-7년)</SelectItem>
                <SelectItem value="senior">시니어 (7년+)</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

function Step3Form() {
  const { control } = useFormContext<CompleteFormData>()

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="skills"
        render={({ field }) => (
          <FormItem>
            <FormLabel>기술 스택</FormLabel>
            <FormControl>
              <div className="space-y-2">
                {['React', 'TypeScript', 'Next.js', 'Node.js', 'Python'].map((skill) => (
                  <div key={skill} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={skill}
                      checked={field.value?.includes(skill) || false}
                      onChange={(e) => {
                        const updatedSkills = e.target.checked
                          ? [...(field.value || []), skill]
                          : (field.value || []).filter((s) => s !== skill)
                        field.onChange(updatedSkills)
                      }}
                    />
                    <label htmlFor={skill}>{skill}</label>
                  </div>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="portfolio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>포트폴리오 URL (선택사항)</FormLabel>
            <FormControl>
              <Input
                type="url"
                placeholder="https://your-portfolio.com"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="bio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>자기소개</FormLabel>
            <FormControl>
              <Textarea
                placeholder="간단한 자기소개를 작성해주세요"
                className="min-h-[100px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
```

### 파일 업로드 폼

```typescript
// components/forms/file-upload-form.tsx
'use client'

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// 파일 검증 스키마
const fileSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  description: z.string().max(500, '최대 500자까지 입력 가능합니다'),
  category: z.enum(['document', 'image', 'video']),
  files: z
    .array(z.instanceof(File))
    .min(1, '최소 1개의 파일을 선택해주세요')
    .max(5, '최대 5개까지 업로드 가능합니다')
    .refine(
      (files) => files.every(file => file.size <= 5 * 1024 * 1024),
      '파일 크기는 5MB 이하여야 합니다'
    ),
})

type FileFormData = z.infer<typeof fileSchema>

export function FileUploadForm() {
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  const form = useForm<FileFormData>({
    resolver: zodResolver(fileSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'document',
      files: [],
    },
  })

  // 🚀 파일 선택 처리
  const handleFileChange = (files: FileList | null) => {
    if (!files) return

    const fileArray = Array.from(files)
    form.setValue('files', fileArray)

    // 이미지 미리보기 생성
    const imageUrls = fileArray
      .filter(file => file.type.startsWith('image/'))
      .map(file => URL.createObjectURL(file))

    setPreviewUrls(imageUrls)
  }

  // 🚀 파일 업로드 with 진행률
  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file, index) => {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()

      return new Promise<string>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100
            setUploadProgress(prev => ({
              ...prev,
              [`file-${index}`]: progress,
            }))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText)
            resolve(response.url)
          } else {
            reject(new Error('Upload failed'))
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'))
        })

        xhr.open('POST', '/api/upload')
        xhr.send(formData)
      })
    })

    return Promise.all(uploadPromises)
  }

  const onSubmit = async (data: FileFormData) => {
    try {
      // 파일 업로드
      const fileUrls = await uploadFiles(data.files)

      // 폼 데이터와 파일 URL을 서버로 전송
      const formData = new FormData()
      formData.append('title', data.title)
      formData.append('description', data.description)
      formData.append('category', data.category)
      fileUrls.forEach(url => formData.append('fileUrls[]', url))

      await submitDocumentAction(formData)
    } catch (error) {
      console.error('Upload error:', error)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>제목</FormLabel>
              <FormControl>
                <Input placeholder="문서 제목을 입력하세요" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>설명</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="문서에 대한 설명을 입력하세요"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>카테고리</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="카테고리를 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="document">문서</SelectItem>
                  <SelectItem value="image">이미지</SelectItem>
                  <SelectItem value="video">비디오</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="files"
          render={({ field }) => (
            <FormItem>
              <FormLabel>파일</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.mp4,.mov"
                  onChange={(e) => {
                    handleFileChange(e.target.files)
                    field.onChange(e.target.files ? Array.from(e.target.files) : [])
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 업로드 진행률 표시 */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="space-y-2">
            {Object.entries(uploadProgress).map(([key, progress]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{key}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 이미지 미리보기 */}
        {previewUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {previewUrls.map((url, index) => (
              <img
                key={index}
                src={url}
                alt={`Preview ${index}`}
                className="w-full h-32 object-cover rounded-lg"
              />
            ))}
          </div>
        )}

        <Button type="submit">
          업로드
        </Button>
      </form>
    </Form>
  )
}
```

### 실시간 자동저장 폼

```typescript
// components/forms/auto-save-form.tsx
'use client'

import React, { useEffect, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDebouncedCallback } from 'use-debounce'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const draftSchema = z.object({
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  isPublic: z.boolean(),
})

type DraftFormData = z.infer<typeof draftSchema>

export function AutoSaveForm({ draftId }: { draftId: string }) {
  const form = useForm<DraftFormData>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      title: '',
      content: '',
      tags: [],
      isPublic: false,
    },
  })

  // 🚀 폼 값 변경 감지
  const watchedValues = useWatch({
    control: form.control,
  })

  // 🚀 디바운스된 자동저장 함수
  const debouncedSave = useDebouncedCallback(
    useCallback(async (data: DraftFormData) => {
      try {
        await saveDraftAction(draftId, data)
        // 저장 상태 표시
        console.log('Draft saved automatically')
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }, [draftId]),
    2000 // 2초 디바운스
  )

  // 🚀 값 변경 시 자동저장 트리거
  useEffect(() => {
    const subscription = form.watch((values) => {
      // 빈 값이 아닌 경우에만 저장
      if (values.title || values.content) {
        debouncedSave(values as DraftFormData)
      }
    })

    return () => subscription.unsubscribe()
  }, [form, debouncedSave])

  // 🚀 페이지 이탈 시 자동저장
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const values = form.getValues()
      if (values.title || values.content) {
        e.preventDefault()
        // 마지막 저장 시도
        saveDraftAction(draftId, values)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [form, draftId])

  return (
    <Form {...form}>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>제목</FormLabel>
              <FormControl>
                <Input
                  placeholder="글 제목을 입력하세요"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>내용</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="글 내용을 입력하세요"
                  className="min-h-[300px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center text-sm text-muted-foreground">
          {watchedValues.title || watchedValues.content ? (
            <span>자동 저장됨</span>
          ) : (
            <span>저장할 내용이 없습니다</span>
          )}
        </div>
      </div>
    </Form>
  )
}
```

## 💡 실무 팁 및 최적화

### 성능 최적화 패턴

```typescript
// hooks/use-optimized-form.ts
import React, { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

export function useOptimizedForm<T extends z.ZodSchema>(
  schema: T,
  defaultValues?: Partial<z.infer<T>>
) {
  // 🚀 스키마 메모이제이션
  const memoizedResolver = useMemo(
    () => zodResolver(schema),
    [schema]
  )

  const form = useForm<z.infer<T>>({
    resolver: memoizedResolver,
    defaultValues,
    mode: 'onBlur', // 성능을 위해 onBlur 모드 사용
    shouldFocusError: true,
    shouldUseNativeValidation: false,
  })

  return form
}

// 큰 폼을 위한 가상화된 필드 렌더링
export function VirtualizedFormFields({
  fields,
  renderField
}: {
  fields: Array<{ name: string; type: string }>
  renderField: (field: any) => React.ReactNode
}) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })

  return (
    <div>
      {fields
        .slice(visibleRange.start, visibleRange.end)
        .map((field, index) => (
          <div key={field.name}>
            {renderField(field)}
          </div>
        ))}
    </div>
  )
}
```

### 에러 핸들링 패턴

```typescript
// components/forms/error-boundary.tsx
'use client'

import { ErrorBoundary } from 'react-error-boundary'

function FormErrorFallback({ error, resetErrorBoundary }: {
  error: Error
  resetErrorBoundary: () => void
}) {
  return (
    <div className="p-4 border border-red-200 rounded-lg bg-red-50">
      <h3 className="text-lg font-semibold text-red-800">
        폼 처리 중 오류가 발생했습니다
      </h3>
      <p className="text-sm text-red-600 mt-2">
        {error.message}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
      >
        다시 시도
      </button>
    </div>
  )
}

export function FormWithErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={FormErrorFallback}
      onReset={() => {
        // 폼 리셋 로직
        window.location.reload()
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
```

## ⚠️ 보안 고려사항

> ⚠️ **아래 CSRF·Rate Limiting 절은 이 프로젝트에 적용되지 않습니다.**
> 둘 다 Next.js Server Actions 를 전제로 한 범용 예시입니다. 이 프로젝트에서는
>
> - **CSRF** — 백엔드 `SecurityConfig` 가 STATELESS + CSRF 비활성이며,
>   방어는 CORS 허용 출처 명시(`API_SPEC.md` 4.2 / NFR-S08)와 쿠키 속성으로 합니다.
>   프론트에 CSRF 토큰 입력을 만들지 않습니다.
> - **Rate Limiting** — 1차 범위 밖입니다(`PRD.md` 4.2).
>
> 참고용으로만 읽으십시오.

### CSRF 보호

```typescript
// lib/csrf.ts
import { headers } from 'next/headers'

export async function validateCSRFToken(formData: FormData) {
  const token = formData.get('_token') as string
  const headersList = await headers()
  const sessionToken = headersList.get('x-csrf-token')

  if (!token || !sessionToken || token !== sessionToken) {
    throw new Error('CSRF token validation failed')
  }
}

// 폼에서 CSRF 토큰 사용
export function CSRFTokenInput() {
  return (
    <input
      type="hidden"
      name="_token"
      value={process.env.CSRF_TOKEN}
    />
  )
}
```

### Rate Limiting

```typescript
// lib/rate-limit.ts
import { headers } from "next/headers";

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

export async function checkRateLimit(identifier: string, limit = 5, window = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now - record.lastReset > window) {
    rateLimitMap.set(identifier, { count: 1, lastReset: now });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}

// 서버 액션에서 사용
export async function rateLimitedAction(formData: FormData) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || "unknown";

  if (!(await checkRateLimit(ip))) {
    return {
      success: false,
      message: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요.",
    };
  }

  // 실제 액션 로직
}
```

## ❌ 안티패턴 및 금지사항

### 피해야 할 패턴

```typescript
// ❌ 금지: 불필요한 리렌더링 유발
function BadForm() {
  const [data, setData] = useState({})

  // 모든 입력마다 전체 상태 업데이트
  const handleChange = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value })) // 리렌더링 유발
  }

  return (
    <div>
      <input onChange={e => handleChange('name', e.target.value)} />
      <input onChange={e => handleChange('email', e.target.value)} />
    </div>
  )
}

// ✅ 올바른 방법: React Hook Form 사용
function GoodForm() {
  const { register, handleSubmit } = useForm()

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      <input {...register('email')} />
    </form>
  )
}

// ❌ 금지: 클라이언트에서만 검증
function InsecureForm() {
  const schema = z.object({
    email: z.string().email(),
  })

  // 서버 검증 없이 클라이언트 검증만 수행
  const onSubmit = async (data: any) => {
    await fetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(data), // 서버 검증 없음
    })
  }
}

// ✅ 올바른 방법: 서버-클라이언트 이중 검증
function SecureForm() {
  // 클라이언트 검증
  const form = useForm({
    resolver: zodResolver(schema),
  })

  // 서버에서도 동일한 스키마로 검증
  const onSubmit = async (data: FormData) => {
    await serverActionWithValidation(data) // 서버에서 재검증
  }
}
```

## 🎯 체크리스트

### 폼 개발 완료 후 검증 체크리스트

```markdown
## 🚀 필수 검증 항목

- [ ] Zod 스키마 정의 및 TypeScript 타입 추론 확인
- [ ] 서버-클라이언트 이중 검증 구현 (백엔드 Bean Validation 이 최종 방어선 — NFR-S04)
- [ ] 비밀번호 스키마가 `.min(6)` 이며 복잡도 정규식이 없다 (FR-A03)
- [ ] **토큰을 저장·조회·첨부하는 코드가 없다** (FR-A06 / NFR-S02)
- [ ] 에러 코드가 `API_SPEC.md` 1.5 표와 일치한다
- [ ] 에러 메시지 사용자 친화적으로 표시
- [ ] 로딩 상태 UI 구현
- [ ] 접근성 속성 (aria-label, aria-describedby) 적용

## ✅ 권장 검증 항목

- [ ] 디바운스된 실시간 검증 구현
- [ ] 자동저장 기능 구현 (필요시)
- [ ] 파일 업로드 진행률 표시 (필요시)
- [ ] 다단계 폼 진행률 표시 (필요시)
- [ ] 에러 바운더리 구현
- [ ] 성능 최적화 (메모이제이션, 가상화)

## 💡 코드 품질 확인

- [ ] `npm run check-all` 통과
- [ ] TypeScript 엄격 모드 오류 없음
- [ ] ESLint 규칙 준수
- [ ] Prettier 포맷팅 적용
- [ ] 불필요한 리렌더링 없음
- [ ] 메모리 누수 없음 (useEffect cleanup)
```

## 🔗 관련 리소스

- [React Hook Form 공식 문서](https://react-hook-form.com/)
- [Zod 공식 문서](https://zod.dev/)
- [Next.js Server Actions 가이드](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [ShadcnUI Form 컴포넌트](https://ui.shadcn.com/docs/components/form)

이 가이드를 따라 타입 안전하고 성능 최적화된 폼을 구현하여 최고의 사용자 경험을 제공하세요.

---

## 📝 추가 Server Actions 함수 정의

다른 예제에서 참조되는 Server Actions 함수들의 기본 구현:

```typescript
// app/actions/profile.ts
"use server";

export async function submitProfileAction(formData: FormData) {
  try {
    // TODO: 실제 프로필 저장 로직 구현
    console.log("Profile data received:", Object.fromEntries(formData));

    return {
      success: true,
      message: "프로필이 성공적으로 저장되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      message: "프로필 저장 중 오류가 발생했습니다.",
    };
  }
}

// app/actions/documents.ts
("use server");

export async function submitDocumentAction(formData: FormData) {
  try {
    // TODO: 실제 문서 저장 로직 구현
    console.log("Document data received:", Object.fromEntries(formData));

    return {
      success: true,
      message: "문서가 성공적으로 업로드되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      message: "문서 업로드 중 오류가 발생했습니다.",
    };
  }
}

// app/actions/drafts.ts
("use server");

export async function saveDraftAction(draftId: string, data: any) {
  try {
    // TODO: 실제 임시저장 로직 구현
    console.log(`Saving draft ${draftId}:`, data);

    return {
      success: true,
      message: "자동 저장되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      message: "자동 저장에 실패했습니다.",
    };
  }
}
```
