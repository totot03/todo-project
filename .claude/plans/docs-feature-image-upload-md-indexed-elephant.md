# FEATURE_IMAGE_UPLOAD.md 개정 설계

## Context

`docs/FEATURE_IMAGE_UPLOAD.md`(git 미추적)는 Tiptap 이미지 첨부 기능의 설계·실행 문서다. 코드베이스와 대조한 결과, 이 문서는 **루트 `CLAUDE.md`가 아니라 `.playwright-mcp/CLAUDE.md`**(1~13장 번호가 있고 "모노레포 구조"라고 서술하는 구버전, git 미추적)를 기준으로 작성됐다. 그 결과 현재 코드베이스와 어긋나는 전제가 다수 섞여 있고, 그대로 실행하면 다음이 발생한다.

- Step 0(yml→properties 전환) 전체가 **이미 완료된 작업**이라 헛수고가 된다
- `todo-backend/.env`에 키를 넣으라는 지시가 **아무 효과가 없다** (dotenv 라이브러리 미도입)
- 저장된 `<img src="/api/files/{uuid}">`가 **브라우저에서 404**가 된다 (Next에 rewrite 없음, API는 별도 오리진)
- jsoup Safelist에 `img`를 추가하는 순간 **상대경로 src가 통째로 제거되거나, 반대로 `javascript:`가 통과**한다
- 새 에러 코드가 필요한데 `ErrorCode`는 "6종 고정, 임의 추가 금지"가 코드·CLAUDE.md·API_SPEC 3곳에 못 박혀 있다
- `API_SPEC.md` 갱신이 갱신 대상 목록에서 빠져 있는데, PRD 5.4와 API_SPEC이 서로를 엔드포인트 단일 출처로 선언하고 있다

**이번 작업의 산출물은 개정된 `docs/FEATURE_IMAGE_UPLOAD.md` 하나다.** 기능 구현은 이 문서가 승인된 뒤 별도로 진행한다.

### 확정된 설계 결정 (사용자 승인)

| 항목            | 결정                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| 이미지 URL 전달 | **Next.js rewrite 프록시** — 저장 HTML과 표시 HTML을 동일하게 유지                      |
| 에러 코드       | **3종 추가** — `FILE_TOO_LARGE`(400) · `INVALID_FILE_TYPE`(400) · `FILE_NOT_FOUND`(404) |
| S3 범위         | **인터페이스만 준비**, 구현은 `LocalFileStorageService`만. S3는 ROADMAP v1.1로          |
| 고아 파일 정리  | **레코드는 soft delete, blob만 물리 삭제**                                              |

---

## 1. 코드베이스 사실 (개정의 근거)

| 문서의 전제                              | 실제                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application.yml` 존재                   | `src/main/resources/`에 `application.properties`·`application-local.properties`·`application-test.properties`·`schema.sql`. **yml 0건**                                       |
| `src/test/resources/`                    | 디렉터리 자체가 없음. 테스트 설정은 `src/main/resources/application-test.properties`, `@ActiveProfiles("test")`로 활성화                                                      |
| `todo-backend/.env`                      | `.env` 파일도, dotenv 의존성도 없음. 실제 관례는 OS 환경변수 + `application-local.properties`(gitignore)                                                                      |
| sanitize 허용 태그에 `a` 포함            | `HtmlSanitizer`는 `Safelist.none().addTags(p,br,strong,em,u,s,h1~h3,ul,ol,li,blockquote,code)`. **`addAttributes` 호출 0건** → 모든 속성 제거, `a`도 없음                     |
| 상대경로 `/api/files/{uuid}` 그대로 사용 | `next.config.ts`는 `{ typedRoutes: true }`가 전부. rewrites 없음. `lib/api/client.ts`가 `NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"`으로 **크로스 오리진 직접 호출** |
| 갱신 대상 = PRD·CLAUDE·ROADMAP           | `API_SPEC.md` 누락. PRD 5.4 = "백엔드 계약 전체 목록", API_SPEC = "엔드포인트 단일 출처는 PRD 5.4"                                                                            |

추가로 확인된 제약:

- `ErrorCode`는 enum이며 **메시지가 코드에 묶여 있다**(`BusinessException(ErrorCode)`만 존재, 개별 문장 override 불가)
- 컨트롤러는 `ResponseEntity`가 아니라 `ApiResponse<T>`를 직접 반환하고 상태코드는 `@ResponseStatus`로 처리
- Swagger는 `@Tag` + `@Operation`만 사용 — `io.swagger...ApiResponse`는 프로젝트 `ApiResponse`와 simple name이 충돌해 **금지**
- `@EnableScheduling` 없음, `@Scheduled` 0건 → 스케줄러는 신규 인프라
- `spring.servlet.multipart.*` 설정 없음
- 엔티티 컨벤션: `BaseTimeEntity`(createdAt/updatedAt/deletedAt + `markDeleted()`) 상속, `@SQLRestriction("deleted_at IS NULL")`, Lombok `@Builder`, DTO는 `from(...)` 정적 팩토리
- `getTiptapExtensions()`(`components/editor/extensions.ts`)를 `TiptapEditor`와 `TiptapViewer`가 **공유** — 확장 추가 지점이 한 곳
- `apiFetch`가 `Content-Type: application/json`을 하드코딩하고 `JSON.stringify`함 → **현재 multipart 경로 없음**
- 번호 체계는 문서가 옳다: FR-T13 / NFR-S08 / M6 다음이 각각 FR-T14 / NFR-S09 / M7

---

## 2. 개정 작업 — 제거·교정

`docs/FEATURE_IMAGE_UPLOAD.md`를 아래대로 고친다.

**R-1. Step 0 전체 삭제** → "0단계: 사전 확인 및 프로퍼티 추가"로 교체.
`application.properties`에 **추가할 항목만** 명시한다.

```properties
# multipart — 앱 한도(5MB)보다 크게 잡아야 우리 에러 형식으로 응답할 수 있다
spring.servlet.multipart.max-file-size=6MB
spring.servlet.multipart.max-request-size=8MB

# 저장소: local(기본) 또는 s3
file.storage.type=${FILE_STORAGE_TYPE:local}
file.storage.max-size=5242880
file.storage.local.base-dir=${FILE_LOCAL_BASE_DIR:../upload}
```

`application-test.properties`에는 `file.storage.type=local`, `file.storage.local.base-dir=./target/test-upload` 2줄 추가. **경로는 `src/main/resources/`다**(문서의 `src/test/resources/`는 오기).

> multipart 한도를 앱 한도와 같게 두면 5MB 초과 시 컨테이너가 먼저 끊어 `MaxUploadSizeExceededException`만 나고 우리 검증 로직에 도달하지 못한다. 한도를 벌려두는 것이 핵심.

**R-2. §4 환경변수 재작성.** `.env` 지시를 삭제하고 실제 관례로 교체:
로컬은 `application-local.properties`(gitignore) 또는 OS 환경변수, CI는 워크플로 `env:` 블록. `.env.example` 신설 지시는 삭제한다(읽는 주체가 없다). §0의 "AWS 키를 문서·소스에 적지 말 것" 경고는 그대로 유지한다.

**R-3. 기준 문서 표기 교정.** "CLAUDE.md 3장/6장/9장"을 루트 `CLAUDE.md`의 실제 절 이름(`불변 규칙`, `함정`, `문서`)으로 바꾸고, 문서 머리말에 **`.playwright-mcp/CLAUDE.md`는 구버전이며 기준으로 삼지 않는다**는 경고를 명시한다.

**R-4. §1.2 표의 "Todo 삭제 시" 행 유지**(첨부 blob 보존) + 고아 정리 행을 C 항목대로 수정.

**R-5. Step 3 테스트 8번 교정.** 파일명은 서버가 새 UUID로 만들므로 "`../` 포함 파일명" 공격은 구조적으로 성립하지 않는다. 실제 위험 지점인 **`storage_key` 정규화 검증**(DB 값이 base-dir를 벗어나면 거부)으로 바꾼다.

---

## 3. 개정 작업 — 추가 설계 (문서에 없던 것)

### A-1. 이미지 URL 전달 — Next.js rewrite

`todo-frontend/next.config.ts`에 rewrite를 추가한다. 이미지 요청이 same-origin이 되어 저장 HTML을 그대로 표시할 수 있고, 쿠키·CORS 문제가 사라지며, S3 전환 시 302 리다이렉트도 그대로 통과한다.

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // 본문에 저장되는 이미지 경로는 상대경로 하나뿐이다. 브라우저가 3000으로 보내는 요청을
  // 백엔드로 넘겨 저장 HTML과 표시 HTML을 동일하게 유지한다.
  async rewrites() {
    return [{ source: "/api/files/:path*", destination: `${API_BASE}/api/files/:path*` }];
  },
};
```

- `/api/files/*`만 대상으로 한다. `/api/*` 전체를 프록시하면 `lib/api/client.ts`의 절대 URL 호출 경로와 이중화된다
- 업로드(`POST /api/files/images`)는 기존대로 `apiFetch`가 절대 URL로 호출한다. 표시 경로만 프록시된다
- `proxy.ts`의 matcher는 `/todos/:path*`뿐이라 충돌 없음
- 배포 시에는 프론트 호스트가 같은 rewrite를 제공해야 한다는 점을 문서에 남긴다

### A-2. 에러 코드 3종 추가

`ErrorCode`에 추가하고, "6종 고정" 주석을 "9종"으로 갱신한다.

| 코드                | 상태 | 메시지                                |
| ------------------- | ---- | ------------------------------------- |
| `FILE_TOO_LARGE`    | 400  | 파일 크기는 5MB를 초과할 수 없습니다. |
| `INVALID_FILE_TYPE` | 400  | 지원하지 않는 이미지 형식입니다.      |
| `FILE_NOT_FOUND`    | 404  | 파일을 찾을 수 없습니다.              |

`GlobalExceptionHandler`에 `MaxUploadSizeExceededException` 핸들러를 추가해 `FILE_TOO_LARGE`로 변환한다(컨테이너가 먼저 끊는 경우도 같은 봉투로 응답하기 위해). `FILE_NOT_FOUND`는 `TODO_NOT_FOUND`와 같은 이유로 **부재와 타인 소유를 구분하지 않는다** — 이 근거를 enum 주석에 남긴다.

동시 갱신: `docs/API_SPEC.md` 1.5, 루트 `CLAUDE.md` 에러 코드 절, `docs/PRD.md` 10장.

### A-3. MIME 실제 검증 — 매직 바이트

`MultipartFile.getContentType()`은 **클라이언트가 보낸 값**이라 신뢰할 수 없다. 확장자도 마찬가지다. 파일 선두 바이트로 판정한다.

| 형식 | 시그니처                                 |
| ---- | ---------------------------------------- |
| JPEG | `FF D8 FF`                               |
| PNG  | `89 50 4E 47 0D 0A 1A 0A`                |
| GIF  | `47 49 46 38` (`GIF8`)                   |
| WebP | `52 49 46 46` … `57 45 42 50` (offset 8) |

- **`ImageIO.read()`로 판정하지 말 것** — JDK에 WebP 리더가 없어 정상 webp를 거부한다
- **SVG는 허용하지 않는다** — 스크립트를 품을 수 있다. 이 판단 근거를 문서에 명시
- 판정된 형식으로 확장자와 `content_type`을 **서버가 결정**한다(원본 확장자를 쓰지 않는다)

### A-4. jsoup 상대경로 함정

`Safelist`에 `addAttributes("img", "src", ...)`만 하면 **프로토콜 검사가 걸리지 않아 `javascript:`·`data:`가 통과**한다. 반대로 `addProtocols("img","src","http","https")`를 걸면 상대경로가 프로토콜 검사에 걸려 **`src`가 통째로 제거**된다. 둘 다 틀린다.

해결: `Jsoup.clean()` 이후 `Document`를 한 번 순회해 검증한다.

```java
// 허용 형태는 서버가 발급한 UUID 경로 하나뿐이다
private static final Pattern ALLOWED_IMG_SRC =
        Pattern.compile("^/api/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
```

- 화이트리스트: `addTags("img")` + `addAttributes("img", "src", "alt", "width")`, `addProtocols`는 **호출하지 않는다**
- clean 후 `doc.select("img")`를 돌며 정규식 불일치 요소는 **`remove()`로 통째 제거**(속성만 지우면 src 없는 깨진 `<img>`가 남는다)
- `Jsoup.clean(html, safelist)`는 baseUri가 없으면 상대경로를 그대로 둔다 — 이 동작에 의존하므로 테스트로 고정한다

### A-5. 첨부 ↔ Todo 연결 모델의 결함

원안의 "`todo_id`를 채우고, 본문에서 빠지면 null로 되돌린다"에는 두 가지 사고가 있다.

1. **본문 복사·붙여넣기**로 두 Todo가 같은 uuid를 참조하면 `todo_id`는 하나만 가리킨다. 나중 Todo가 이미지를 빼면 `todo_id`가 null이 되고, 여전히 그 이미지를 쓰는 첫 Todo의 본문이 깨진다
2. 정리 기준이 `created_at < now-24h`면, **한 달 전 업로드한 이미지를 오늘 본문에서 빼는 순간 다음 실행에서 즉시 삭제**된다

문서에 다음을 반영한다.

- 정리 기준을 **`todo_id IS NULL AND updated_at < now() - 24h`**로 바꾼다(링크 해제 후에도 24시간 유예)
- 삭제 직전 **활성 Todo 본문 어디에도 해당 uuid가 없는지 재확인하는 가드 쿼리**를 통과한 것만 지운다
- 링크 갱신 쿼리에는 **반드시 `user_id = :userId` 조건**을 넣는다. 없으면 사용자 A가 본문에 남의 uuid를 적어 B의 첨부 레코드 링크를 오염시킬 수 있다(조회는 소유권 검증으로 여전히 404이지만 데이터는 망가진다)
- 링크 파싱은 **sanitize 이후 HTML**을 대상으로 한다(허용된 `img`만 남은 상태)

### A-6. 응답 봉투 예외 조항

`GET /api/files/{uuid}`는 바이너리 스트림 또는 302다. API_SPEC 1.3의 "모든 응답은 `ApiResponse<T>`로 감싼다"에 **명시적 예외 조항**을 넣어야 한다. 컨트롤러도 프로젝트 관례(`ApiResponse<T>` 직접 반환)를 벗어나 `ResponseEntity<Resource>`를 반환하게 되므로 그 근거를 Javadoc에 남긴다. 단 **에러 응답(401/404)은 봉투를 유지**한다.

### A-7. 파일 서빙 보안 헤더

```
Content-Type: <DB에 저장된 화이트리스트 값>   ← 요청값을 반사하지 않는다
X-Content-Type-Options: nosniff
Content-Disposition: inline
Cache-Control: private, max-age=3600
Content-Security-Policy: default-src 'none'
```

`SecurityConfig`의 `permitAll` 목록에 `/api/files/**`를 **넣지 않는다**(인증 필수). 이 점을 문서에 못 박는다.

### A-8. 프론트엔드 실행 설계 보강

- **`apiFetch`에 multipart 분기 추가** — `body instanceof FormData`면 `Content-Type`을 붙이지 않고(브라우저가 boundary를 넣어야 한다) `JSON.stringify`도 하지 않는다. 기존 `ApiClientError` 변환·봉투 언랩 로직을 그대로 재사용한다. `lib/api/client.ts`
- **`@tiptap/extension-image` 설치**(현재 미설치). Tiptap 3.30.6과 메이저를 맞춘다
- **`components/editor/extensions.ts`의 `getTiptapExtensions()`에 Image 추가** — 편집기와 뷰어가 공유하는 유일한 지점
- **툴바 버튼은 `TOOLBAR_GROUPS` 배열에 4번째 그룹으로 추가**(`{ label, icon, isActive, run }` 형태 유지). 단 파일 선택은 `run(editor)` 시그니처만으로 안 되므로 이 항목의 예외 처리 방식을 문서에 적는다
- **드래그·붙여넣기·자리표시자**: `extension-image`만으로는 불가능하다. `editorProps.handleDrop` / `handlePaste`로 파일을 가로채고, 업로드 중에는 ProseMirror decoration 또는 임시 placeholder 노드를 넣었다가 완료 시 교체한다. 원안의 "자리표시자" 한 줄을 이 수준으로 구체화한다
- **`app/globals.css`의 `.tiptap-content` 블록에 `img` 규칙 추가** — 현재 `img` 규칙이 없다. `max-width:100%`, `height:auto`, `border-radius`, 라이트/다크 공통
- **`types/api.ts`에 `ImageUploadResponse` 추가**. 단 이 파일은 "요청 타입은 `lib/api/*.ts`에 co-locate"가 규칙이므로 응답 타입만 여기 둔다
- 환경변수명은 `NEXT_PUBLIC_API_URL`이 아니라 **`NEXT_PUBLIC_API_BASE_URL`**이다(원안 오기 교정)

### A-9. 스키마 보강

`attachments` 인덱스는 부분 인덱스가 아니므로 **`schema.sql`을 건드릴 필요가 없다** — `@Table(indexes = {...})`와 `@Column(unique = true)`로 충분하다(`ddl-auto=update`). 이 판단을 문서에 남겨 불필요한 DDL 추가를 막는다. `storage_type`은 `@Enumerated(EnumType.STRING)`으로 기존 enum 컨벤션을 따른다.

---

## 4. 개정 작업 — 삭제·정리 정책

- 고아 정리 스케줄러는 **레코드에 `deleted_at`을 찍고(`BaseTimeEntity.markDeleted()`), 실제 blob만 물리 삭제**한다. Soft Delete 불변 규칙에 예외를 만들지 않는다
- `@EnableScheduling`을 `TodoBackendApplication`에 추가하는 것이 **신규 인프라**임을 문서에 명시(현재 프로젝트에 `@Scheduled`가 0건)
- 수동 실행 경로는 별도 엔드포인트를 만들지 말고 **테스트에서 서비스 메서드를 직접 호출**하는 방식으로 한다(관리자 API는 범위 밖)
- Todo soft delete 시 첨부 blob은 그대로 둔다(원안 유지)

---

## 5. 개정 작업 — 문서 갱신 목록(§6) 보강

원안의 3개 문서에 **`API_SPEC.md`를 추가**하고 누락 항목을 채운다.

| 문서               | 갱신 내용                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/API_SPEC.md` | 3장 다음에 **파일 API 장 신설**(`POST /api/files/images`, `GET /api/files/{uuid}`) · 1.1 요청 형식에 **multipart 예외** · 1.3에 **바이너리/302 예외 조항** · 1.5에 **에러 코드 3종** · 5장 FR↔엔드포인트 대응표에 FR-T14                                     |
| `docs/PRD.md`      | **5.4 엔드포인트 전체 목록**에 2건 추가 · 5.2에 `FR-T14` · **FR-T04 서식 목록에 "이미지" 추가** · 8.2에 `Attachment` 엔티티 · 9.1에 `NFR-S09` · 4.2 제외 항목에서 해당 행 제거 · 13장 OQ-4 해결됨 · **1.3 설치 상태 표에 `@tiptap/extension-image` 행 추가** |
| 루트 `CLAUDE.md`   | 불변 규칙에 `attachments`·에러 코드 3종·sanitize `img` 규칙 추가. **장 번호가 아니라 절 제목으로 지칭**                                                                                                                                                      |
| `docs/ROADMAP.md`  | **M7(로컬 이미지 첨부)** 신설 · 9장 진행 현황에 행 추가 · **7장 v1.1에 S3 전환 단계 추가** · 8장 v2.0 후보에서 "이미지 첨부" 제거                                                                                                                            |

> PRD 4.2의 문구는 "S3 연동은 배포 단계에서 재검토"다. 로컬 저장 방식으로 범위에 들어오는 것이므로 **행 삭제가 아니라 "S3 연동(v1.1)"으로 축소**하는 편이 이력상 정확하다.

---

## 6. 개정판 목차

```
0. 시작 전 필독 — 자격 증명 / 기준 문서 경고        (§0 확장, R-3)
1. 설계 결정                                        (§1.2 표 수정, A-1·A-5 반영)
2. DB 스키마 — attachments                          (A-9 주석 추가)
3. API 계약 — 요청·응답·에러 코드            ★신설  (A-2·A-6·A-7)
4. 이미지 URL 경로와 rewrite                 ★신설  (A-1)
5. 실행 단계
   5.0 사전 확인 및 프로퍼티 추가            ← 기존 Step 0 대체
   5.1 백엔드: 스키마 + 로컬 저장소           ← A-3·A-4·A-5·A-7 반영
   5.2 프론트엔드: Tiptap 이미지 확장         ← A-8 반영
   5.3 정리 및 테스트                        ← 4장 정책 + R-5 반영
   5.4 S3 전환 (v1.1 배포 시)                 ← 인터페이스 준비만, 구현은 이관
6. 환경변수 / 설정                                  (R-2)
7. 검증 체크리스트                                  (항목 보강)
8. 기존 문서 갱신                                   (§5 표로 교체)
```

---

## 7. 손대는 파일

이번 작업에서 편집하는 파일은 **`docs/FEATURE_IMAGE_UPLOAD.md` 하나**다. 아래는 개정판이 _지목하게 될_ 구현 대상이며 지금은 수정하지 않는다.

- 백엔드: `entity/Attachment.java`(신규) · `common/exception/ErrorCode.java` · `common/exception/GlobalExceptionHandler.java` · `common/sanitize/HtmlSanitizer.java` · `service/TodoService.java`(링크 갱신 연결) · `service/storage/*`(신규) · `controller/FileController.java`(신규) · `resources/application.properties`
- 프론트: `next.config.ts` · `lib/api/client.ts` · `components/editor/extensions.ts` · `components/editor/TiptapEditor.tsx` · `app/globals.css` · `types/api.ts` · `package.json`
- 루트: `.gitignore`(`upload/` 추가)

---

## 8. 검증

문서 작업이므로 코드 검증은 없다. 아래로 개정판의 정합성을 확인한다.

1. **사실 대조** — 개정판이 주장하는 현재 상태(설정 파일 형식, 미설치 의존성, 에러 코드 수, sanitize 화이트리스트)를 실제 파일과 다시 대조한다
2. **번호 충돌 확인** — `grep -n "FR-T1[3-9]\|NFR-S0[8-9]\|^### M[67]" docs/*.md`로 새 번호가 기존과 겹치지 않는지 확인
3. **포맷 검사** — `npx prettier --check docs/FEATURE_IMAGE_UPLOAD.md` (루트 Prettier 관할, `printWidth: 100`). `*.md`는 `trim_trailing_whitespace = false`라 줄 끝 공백 2칸이 보존되어야 한다
4. **교차 참조 확인** — 개정판이 지칭하는 절 이름(`CLAUDE.md`의 "불변 규칙", API_SPEC 1.5 등)이 실제로 존재하는지 확인. 장 번호로 지칭한 곳이 남아 있지 않은지 `grep -n "CLAUDE.md [0-9]장" docs/FEATURE_IMAGE_UPLOAD.md`

### 후속 (별도 결정 필요)

- `docs/FEATURE_IMAGE_UPLOAD.md`는 현재 git 미추적이다. 개정 후 루트 저장소에 커밋할지 결정한다
- `.playwright-mcp/CLAUDE.md`(구버전, 미추적)가 남아 있는 한 같은 혼선이 반복된다. 삭제 또는 "구버전" 표기를 별도로 검토한다
