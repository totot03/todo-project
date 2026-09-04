# M7 작업 분해: Tiptap 이미지 첨부 (로컬 저장소)

문서 버전: v1 (2026-09-04)
상위 설계 문서: `docs/FEATURE_IMAGE_UPLOAD.md` v2
기준 문서: 루트 `CLAUDE.md` / `docs/PRD.md` / `docs/API_SPEC.md` / `docs/ROADMAP.md`

> **이 문서의 역할.** `FEATURE_IMAGE_UPLOAD.md`는 _무엇을 왜 만드는가_(설계 결정·API 계약·스키마)를 담는다.
> 이 문서는 그것을 **실제 코드베이스와 대조해 검증한 뒤 커밋 가능한 작업 단위로 쪼갠 실행 계획**이다.
> 설계 판단이 충돌하면 `FEATURE_IMAGE_UPLOAD.md`가 이기고, 파일 경로·기존 코드 사실 관계는 이 문서가 최신이다.

---

## 1. 사전 검증 결과 — 설계 문서 ↔ 실제 코드 대조

작업 시작 전 코드베이스를 직접 확인한 결과다. **③⑨⑫는 설계 문서에 없거나 어긋난 항목이므로 반드시 읽고 시작한다.**

| #   | 설계 문서의 전제                                  | 실제 확인 결과                                                                                                                                                | 판정               |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| ①   | `resources/`에 yml 없음, properties만 있음        | `application.properties` · `application-local.properties` · `application-test.properties` · `schema.sql`만 존재                                               | ✅ 일치            |
| ②   | `src/test/resources/`가 없다                      | 없음. 테스트는 `@ActiveProfiles("test")`로만 프로필 활성화                                                                                                    | ✅ 일치            |
| ③   | sanitize에 `addAttributes("img", ...)`를 더한다   | **현재 Safelist는 `Safelist.none().addTags(...)`뿐이고 속성 허용이 하나도 없다.** Javadoc이 "속성을 허용하지 않으므로 구조적으로 안전"을 안전성 근거로 삼는다 | ⚠️ **개정 필요**   |
| ④   | `next.config.ts`에 rewrites가 없다                | `typedRoutes: true` 한 줄뿐                                                                                                                                   | ✅ 일치            |
| ⑤   | `proxy.ts` matcher가 `/todos/:path*`뿐이라 무충돌 | 일치. 단 `/api/files/*`는 **rewrite 대상이지 proxy 대상이 아니므로** 비로그인 접근 차단은 백엔드 401이 담당                                                   | ✅ 일치(주석 보강) |
| ⑥   | `@tiptap/extension-image` 미설치                  | 미설치. 설치된 Tiptap은 `@tiptap/react` · `@tiptap/pm` · `@tiptap/starter-kit` 모두 `^3.30.6`                                                                 | ✅ 일치            |
| ⑦   | `.tiptap-content`에 `img` 규칙이 없다             | `app/globals.css` 135~~161행. h1~~h3·p·ul·ol·blockquote·strong만 있음                                                                                         | ✅ 일치            |
| ⑧   | `ErrorCode`가 6종이고 Javadoc에 "6종" 표기        | 일치. `GlobalExceptionHandler`에 `MaxUploadSizeExceededException` 핸들러 없음                                                                                 | ✅ 일치            |
| ⑨   | "3장 다음에 파일 API 장 신설"                     | **현재 `API_SPEC.md`는 4장 "기타", 5장 "FR↔엔드포인트 대응표"다.** 파일 API를 4장으로 넣으면 기존 4·5장을 5·6장으로 재번호해야 한다                           | ⚠️ **보완 필요**   |
| ⑩   | `FR-T13` / `NFR-S08` / `M6`이 마지막 번호         | 일치 → 신규 번호는 `FR-T14` / `NFR-S09` / `M7`                                                                                                                | ✅ 일치            |
| ⑪   | `schema.sql`을 건드리지 않는다                    | 부분 인덱스 3개(users 이메일, todos 복합)만 있음. `attachments`는 부분 인덱스가 아니므로 손댈 필요 없음                                                       | ✅ 일치            |
| ⑫   | multipart 한도를 앱 한도보다 크게 잡는다          | `application.properties`에 `spring.servlet.multipart.*` 설정이 **아예 없다** → Spring 기본값 1MB가 걸려 있어 5MB 파일은 우리 검증에 도달조차 못 한다          | ⚠️ **중요**        |

### 1.1 추가로 발견한 재사용 지점

- **고아 정리 가드 쿼리를 새로 설계할 필요가 없다.** `TodoRepository.search()`가 이미
  `LOWER(t.description) LIKE LOWER(CONCAT('%', :keyword, '%'))` 패턴을 쓰고, `Todo`에 걸린
  `@SQLRestriction("deleted_at IS NULL")`이 리포지토리의 **모든** 쿼리(파생 쿼리·`@Query` 모두)에 자동 적용된다.
  따라서 `SELECT COUNT(t) FROM Todo t WHERE t.description LIKE CONCAT('%', :uuid, '%')` 한 줄로
  "**활성** Todo 본문 어디에도 없는가"가 성립한다 — soft delete 조건을 손으로 쓰지 않는다.
- **Jackson 3 패키지.** 테스트는 `tools.jackson.databind.ObjectMapper`, MockMvc 자동설정은
  `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`다 (Spring Boot 4 이동분).
  새 테스트도 `TodoControllerTest`의 import를 그대로 따른다.
- **인증 주체 주입.** 컨트롤러는 `@AuthenticationPrincipal CustomUserDetails userDetails`를 받아
  `getUserId()` / `getUser()`를 쓴다. 파일 컨트롤러도 동일 패턴을 쓴다.
- **Lombok 함정.** `Todo.builder().priority(null)`이 `@Builder.Default`를 무력화하는 문제를
  `TodoService.create`가 명시 계산으로 회피하고 있다. `Attachment`에 기본값 필드를 두면 같은 함정을 밟는다.

### 1.2 저장소가 3개로 나뉘어 있다 — 커밋 위치 주의

`todo-project` / `todo-frontend` / `todo-backend`는 **독립된 Git 저장소 3개**다.
아래 작업표의 `저장소` 열을 반드시 확인하고, 파일을 고친 위치에서 `cd` 후 커밋한다.

---

## 2. 작업 분해

총 **22개 Task**, 4개 Phase. 각 Task는 하나의 커밋 단위에 대응한다.

### Phase A — 백엔드 기반 (T1~T7)

#### T1. 설정 프로퍼티 및 gitignore

| 항목   | 내용                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| 저장소 | `todo-backend` + 루트                                                                                            |
| 파일   | `src/main/resources/application.properties`, `src/main/resources/application-test.properties`, 루트 `.gitignore` |

- `application.properties`에 추가 (한국어 주석 필수 — 기존 파일 밀도에 맞춘다):

  ```properties
  # --- 파일 업로드 (M7) ---
  # multipart 한도는 앱 한도(5MB)보다 크게 잡는다 — 같게 두면 컨테이너가 먼저 요청을 끊어
  # 우리 검증 로직에 도달하지 못하고 FILE_TOO_LARGE/INVALID_FILE_TYPE을 구분할 수 없게 된다.
  # 설정이 없으면 Spring 기본값 1MB가 걸려 5MB 파일이 검증 전에 잘린다.
  spring.servlet.multipart.max-file-size=6MB
  spring.servlet.multipart.max-request-size=8MB

  # 저장소: local(기본) 또는 s3. S3 구현은 v1.1(ROADMAP 7장)에서 붙인다.
  file.storage.type=${FILE_STORAGE_TYPE:local}
  file.storage.max-size=5242880
  file.storage.local.base-dir=${FILE_LOCAL_BASE_DIR:../upload}
  ```

- `application-test.properties`에 `file.storage.type=local`,
  `file.storage.local.base-dir=./target/test-upload`
  (`target/`은 루트 `.gitignore`에 이미 있어 별도 처리 불필요)
- 루트 `.gitignore`의 "빌드 산출물" 아래에 `upload/` 추가 (주석: 업로드 원본 저장소)
- **커밋 2개로 분리** — 저장소가 다르다

**완료 조건** — `./mvnw -q compile` 통과, 루트 `git status`에 `upload/`가 뜨지 않음

---

#### T2. 에러 코드 3종 + 업로드 크기 초과 핸들러

| 항목   | 내용                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                                    |
| 파일   | `common/exception/ErrorCode.java`, `common/exception/GlobalExceptionHandler.java` |

- `ErrorCode`에 추가:
  - `FILE_TOO_LARGE`(400, `"파일 크기는 5MB를 초과할 수 없습니다."`)
  - `INVALID_FILE_TYPE`(400, `"지원하지 않는 이미지 형식입니다."`)
  - `FILE_NOT_FOUND`(404, `"파일을 찾을 수 없습니다."`)
- **Javadoc의 "고정 에러 코드 6종" 문구를 9종으로 갱신**하고, `FILE_NOT_FOUND`가 부재와 타인 소유를
  구분하지 않는 이유(`TODO_NOT_FOUND`와 동일한 열거 공격 방지)를 같은 문단에 덧붙인다.
- `GlobalExceptionHandler`에 `MaxUploadSizeExceededException` 핸들러 추가 → `FILE_TOO_LARGE` 봉투로 변환.
  기존 `HttpMessageNotReadableException` 핸들러 바로 아래에 두고, "컨테이너가 우리 검증보다 먼저 요청을
  끊는 경로도 같은 봉투로 응답해야 한다"를 Javadoc에 남긴다.

**완료 조건** — `./mvnw -q test` 기존 테스트 전부 통과

---

#### T3. Attachment 엔티티 · StorageType · Repository

| 항목   | 내용                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                                              |
| 파일   | `entity/Attachment.java`, `entity/StorageType.java`, `repository/AttachmentRepository.java` |

- 스키마는 `FEATURE_IMAGE_UPLOAD.md` 2장 그대로. `BaseTimeEntity` 상속,
  `@SQLRestriction("deleted_at IS NULL")`, `@Table(name="attachments", indexes={...})`
- `user`/`todo` 모두 `@ManyToOne(fetch = LAZY)`. **`todo`는 nullable** (작성 중 업로드)
- 기존 엔티티 컨벤션 준수: `@NoArgsConstructor(access = PROTECTED)`,
  `@AllArgsConstructor(access = PRIVATE)`, `@Builder`, `@Getter`
- 링크 조작용 도메인 메서드를 엔티티에 둔다: `linkTo(Todo todo)` / `unlink()`
  — `Todo.update()`처럼 "서비스가 최종 값을 계산하고 엔티티는 교체만" 원칙을 따른다
- `AttachmentRepository`:
  - `Optional<Attachment> findByUuidAndUserId(UUID uuid, Long userId)` — 소유권 검증 겸용
  - `List<Attachment> findByUserIdAndUuidIn(Long userId, Collection<UUID> uuids)` — 링크 갱신용
  - `List<Attachment> findByTodoId(Long todoId)` — 링크 해제 대상 탐색용
  - `List<Attachment> findByTodoIsNullAndUpdatedAtBefore(LocalDateTime threshold)` — 고아 후보
- **`schema.sql`은 건드리지 않는다.** 부분 인덱스가 아니므로 `ddl-auto=update`가 만들어 준다

**완료 조건** — 앱 기동 시 `todolist_db.attachments` 테이블과 인덱스 3종이 생성됨

---

#### T4. 저장소 추상화 + 로컬 구현

| 항목   | 내용                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                                                                               |
| 파일   | `service/storage/FileStorageService.java`, `service/storage/LocalFileStorageService.java`, `service/storage/StoredFile.java` |

- 인터페이스 시그니처는 설계 문서 5.1 그대로 (`store` / `load` / `getRedirectUrl` / `delete` / `getType`)
- `LocalFileStorageService`:
  - `@ConditionalOnProperty(name="file.storage.type", havingValue="local", matchIfMissing=true)`
  - 생성자에서 base-dir를 `Path.toAbsolutePath().normalize()`로 해석하고 **로그로 남긴다**
    (작업 디렉터리가 IDE마다 달라 `../upload`가 어디를 가리키는지 눈으로 확인해야 한다)
  - `@PostConstruct`로 디렉터리 생성
  - **경로 탈출 방어를 한 곳(`resolveSafely(String storageKey)` private 헬퍼)에 모으고
    `store`/`load`/`delete` 셋 다 이를 경유**한다. 최종 경로를 normalize한 뒤 `startsWith(baseDir)`가
    아니면 예외 — DB의 `storage_key`가 오염된 경우까지 막는 것이 목적이다

**완료 조건** — 단위 테스트로 `../../etc/passwd` 형태 키가 거부되는지 확인

---

#### T5. 이미지 타입 판정기 (매직 바이트)

| 항목   | 내용                                                                       |
| ------ | -------------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                             |
| 파일   | `service/storage/ImageTypeDetector.java`, `service/storage/ImageType.java` |

- **확장자도 `MultipartFile.getContentType()`도 신뢰하지 않는다** — 둘 다 클라이언트가 보낸 값이다
- 선두 바이트로 판정: JPEG `FF D8 FF` · PNG `89 50 4E 47 0D 0A 1A 0A` · GIF `47 49 46 38` ·
  WebP `52 49 46 46` + offset 8의 `57 45 42 50`
- **`ImageIO.read()`를 쓰지 않는다** — JDK에 WebP 리더가 없어 정상 webp를 거부한다
- SVG 불허(스크립트를 품을 수 있다)
- 판정 결과 `ImageType` enum이 **확장자와 content-type을 함께 들고 있게** 해서
  서버가 파일명과 응답 헤더를 모두 결정한다
- 미판정 시 `BusinessException(INVALID_FILE_TYPE)`

**완료 조건** — 4종 시그니처 각각 + 텍스트 파일 거부에 대한 단위 테스트 통과

---

#### T6. AttachmentService (업로드 · 조회)

| 항목   | 내용                                                                  |
| ------ | --------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                        |
| 파일   | `service/AttachmentService.java`, `dto/file/ImageUploadResponse.java` |

- `upload(MultipartFile file, User user)`:
  크기 검증(`file.storage.max-size`) → `ImageTypeDetector` 판정 →
  `storageKey = todos/{userId}/{yyyy}/{MM}/{uuid}.{ext}` 생성 →
  `FileStorageService.store` → `Attachment` 저장 → `ImageUploadResponse` 반환
- `original_filename`은 **표시용으로만** 저장하고 경로 생성에 절대 쓰지 않는다
- `ImageUploadResponse`는 record + `from(...)` 정적 팩토리 (기존 DTO 컨벤션)
- `load(UUID uuid, Long userId)`: `findByUuidAndUserId` → 없으면 `FILE_NOT_FOUND`

**완료 조건** — `./mvnw verify` 통과

---

#### T7. FileController

| 항목   | 내용                             |
| ------ | -------------------------------- |
| 저장소 | `todo-backend`                   |
| 파일   | `controller/FileController.java` |

- `POST /api/files/images` — multipart, 파트명 `file`, 201, `ApiResponse<ImageUploadResponse>`
- `GET /api/files/{uuid}` — **이 프로젝트에서 유일하게 `ResponseEntity<Resource>`를 반환**한다.
  `storage_type`이 `LOCAL`이면 스트리밍, `S3`면 `getRedirectUrl` 결과로 302(5.4 전까지는 분기만)
- 응답 헤더 5종은 설계 문서 3.3 그대로. **`Content-Type`은 DB의 `content_type`을 쓰고 요청값을 반사하지 않는다**
- **Javadoc에 봉투 예외의 근거를 남긴다** — `TodoController`가 "swagger의 `ApiResponse`와 simple name이
  충돌하므로 쓰지 않는다"를 Javadoc에 남긴 것과 같은 방식이다. Swagger는 `@Tag` + `@Operation`만 붙인다
- **`SecurityConfig`의 `permitAll` 목록을 수정하지 않는다** — 인증 필수이므로
  `anyRequest().authenticated()`에 걸리는 것이 정상 동작이다

**완료 조건 (수동 검증)**

- [ ] curl 업로드 → `todo-project/upload/todos/{userId}/{년}/{월}/`에 실제 파일 생성
- [ ] `GET /api/files/{uuid}`가 이미지를 반환하고 보안 헤더 5종이 붙음
- [ ] 다른 계정 토큰으로 접근 시 `FILE_NOT_FOUND` 404
- [ ] 확장자만 `.png`로 위조한 텍스트 파일이 `INVALID_FILE_TYPE`으로 거부됨

---

### Phase B — sanitize · 링크 · 정리 (T8~T11)

#### T8. HtmlSanitizer에 img 허용 ⚠️ 가장 조심할 Task

| 항목   | 내용                                                                        |
| ------ | --------------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                              |
| 파일   | `common/sanitize/HtmlSanitizer.java`, `src/test/.../HtmlSanitizerTest.java` |

**현재 이 클래스의 안전성 근거는 "어떤 태그에도 속성을 허용하지 않는다"이며 Javadoc에 그렇게 적혀 있다.**
`img[src]`를 여는 순간 그 문장이 거짓이 되므로 **코드·Javadoc·테스트를 한 커밋에서 함께 고친다.**

1. Safelist: `.addTags("img").addAttributes("img", "src", "alt", "width")`
   — **`addProtocols`는 호출하지 않는다.** 걸면 상대경로가 프로토콜 검사에 걸려 `src`가 통째로 사라진다
2. `Jsoup.clean()` 결과를 다시 파싱해 `img` 요소를 순회하며 `src`를 정규식으로 검증한다:
   `^/api/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
3. 불일치 요소는 **`remove()`로 통째 제거**한다 (속성만 지우면 `src` 없는 깨진 `img`가 남는다)
4. Javadoc 개정: "속성 전면 불허" → "`img[src]`만 예외적으로 허용하되, 프로토콜 검사가 아닌
   **사후 화이트리스트 정규식**으로 검증한다. 다른 태그는 여전히 속성을 허용하지 않는다"
5. `HtmlSanitizerTest`에 케이스 추가: 외부 URL 제거 · `javascript:` 제거 · `data:` 제거 ·
   정상 `/api/files/{uuid}` **생존**(상대경로가 살아남는 것을 고정하는 회귀 테스트)

**완료 조건** — 기존 5개 테스트 + 신규 4개 전부 통과

---

#### T9. Todo ↔ Attachment 링크

| 항목   | 내용                                                         |
| ------ | ------------------------------------------------------------ |
| 저장소 | `todo-backend`                                               |
| 파일   | `service/TodoService.java`, `service/AttachmentService.java` |

- **sanitize를 마친 뒤의 HTML**에서 `/api/files/{uuid}`를 파싱한다 (제거될 것을 링크하면 안 된다)
- `TodoService.create` / `update` 양쪽에서 호출한다 — 두 경로가 갈라지지 않게
  `AttachmentService.syncLinks(Todo todo, String sanitizedHtml, Long userId)` 하나로 모은다
- **링크 갱신 쿼리에는 반드시 `user_id = :userId` 조건을 넣는다.**
  없으면 사용자 A가 본문에 남의 uuid를 적어 B의 첨부 레코드를 오염시킬 수 있다
- 수정으로 본문에서 빠진 이미지는 `todo_id`를 null로 되돌린다 (**물리 삭제하지 않는다**)
- **Todo 삭제 시에는 첨부를 건드리지 않는다** — Todo가 soft delete이므로 복구 시 본문이 살아 있어야 한다

**완료 조건** — T11의 시나리오 9·10 통과

---

#### T10. 고아 파일 정리 스케줄러

| 항목   | 내용                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                                                           |
| 파일   | `TodoBackendApplication.java`, `service/AttachmentCleanupService.java`, `repository/TodoRepository.java` |

- `@EnableScheduling` 추가 — **이 프로젝트에 `@Scheduled`가 하나도 없는 신규 인프라**이므로
  도입 사실과 이유를 주석으로 남긴다
- 대상: `todo_id IS NULL` **AND `updated_at`이 24시간 이전**
  (`created_at`이 아니다 — 오래된 이미지를 오늘 본문에서 뺐을 때 즉시 삭제되는 것을 막는다)
- **삭제 직전 가드**: `TodoRepository`에 아래를 추가하고 0건인 것만 지운다.
  `Todo`의 `@SQLRestriction`이 자동 적용되므로 "활성 Todo"가 그냥 성립한다:

  ```java
  @Query("SELECT COUNT(t) FROM Todo t WHERE t.description LIKE CONCAT('%', :uuid, '%')")
  long countActiveReferencing(@Param("uuid") String uuid);
  ```

- 삭제 방식: `Attachment`는 `markDeleted()`로 `deleted_at`만 기록, **blob만 물리 삭제**
  — Soft Delete 불변 규칙에 예외를 만들지 않는다
- 하루 1회 실행. 대상 건수와 소요 시간을 로그로 남긴다
- **관리자 API는 범위 밖.** 수동 실행은 테스트가 서비스 메서드를 직접 호출한다

---

#### T11. 백엔드 통합 테스트 12종

| 항목   | 내용                                                              |
| ------ | ----------------------------------------------------------------- |
| 저장소 | `todo-backend`                                                    |
| 파일   | `src/test/java/com/example/controller/FileControllerTest.java` 등 |

`TodoControllerTest` 스타일을 그대로 따른다 — `@SpringBootTest` + `@AutoConfigureMockMvc` +
`@ActiveProfiles("test")`, `signup` 헬퍼로 `access_token` 쿠키 획득, Jackson 3(`tools.jackson.databind`),
MockMvc 자동설정은 `org.springframework.boot.webmvc.test.autoconfigure` 패키지.
저장 경로는 `./target/test-upload`, 테스트 종료 후 정리.

| #   | 시나리오                              | 기대                             |
| --- | ------------------------------------- | -------------------------------- |
| 1   | 이미지 업로드 성공                    | Attachment 생성 + 파일 실제 생성 |
| 2   | 5MB 초과 파일                         | `FILE_TOO_LARGE`                 |
| 3   | 확장자만 `.png`로 위조한 `text/plain` | `INVALID_FILE_TYPE`              |
| 4   | 인증 없이 업로드                      | 401 `UNAUTHORIZED`               |
| 5   | 다른 사용자의 파일 조회               | 404 `FILE_NOT_FOUND`             |
| 6   | description에 외부 URL img            | 제거됨                           |
| 7   | description에 `javascript:` src img   | 제거됨                           |
| 8   | 정상 `/api/files/{uuid}` src          | **그대로 생존** (상대경로 고정)  |
| 9   | Todo 생성 시 본문 내 이미지           | `todo_id`가 채워짐               |
| 10  | 남의 uuid를 본문에 기재               | 그 사람의 `todo_id`가 안 바뀜    |
| 11  | `storage_key`가 base-dir를 벗어남     | `load` 거부                      |
| 12  | 활성 Todo가 참조 중인 첨부            | 고아 정리에서 제외됨             |

> 11번의 실제 위험 지점은 **DB의 `storage_key`**다. 파일명은 서버가 UUID로 만들므로
> "`../`가 든 업로드 파일명"은 애초에 성립하지 않는다. 테스트도 그 지점을 직접 찌른다.

**완료 조건** — `./mvnw clean verify` 통과. Spotless가 `validate` 페이즈에 묶여 있어 포맷이 어긋나면
테스트 실패로 위장되니 먼저 `./mvnw spotless:apply`를 돌린다

---

### Phase C — 프론트엔드 (T12~T16)

#### T12. next.config.ts rewrite

| 항목   | 내용             |
| ------ | ---------------- |
| 저장소 | `todo-frontend`  |
| 파일   | `next.config.ts` |

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
// 본문에 저장되는 이미지 경로는 상대경로 하나뿐이다. 브라우저가 3000으로 보내는 요청을
// 백엔드로 넘겨 "저장 HTML == 표시 HTML"을 유지한다.
async rewrites() {
  return [{ source: "/api/files/:path*", destination: `${API_BASE}/api/files/:path*` }];
}
```

- **`/api/*` 전체를 프록시하지 않는다** — `lib/api/client.ts`가 이미 `BASE_URL` 절대 URL로 호출하고 있어
  경로가 이중화된다. 표시 경로만 프록시한다
- 환경변수명은 `NEXT_PUBLIC_API_BASE_URL`이다 (`NEXT_PUBLIC_API_URL` 아님).
  `client.ts`가 이미 같은 이름을 export하고 있으므로 폴백 문자열도 동일하게 맞춘다
- `proxy.ts` matcher는 `/todos/:path*`뿐이라 충돌하지 않는다

---

#### T13. apiFetch multipart 분기 + files API + 타입

| 항목   | 내용                                                    |
| ------ | ------------------------------------------------------- |
| 저장소 | `todo-frontend`                                         |
| 파일   | `lib/api/client.ts`, `lib/api/files.ts`, `types/api.ts` |

- `apiFetch`의 현재 구현은 `headers: { "Content-Type": "application/json", ...headers }`와
  `body !== undefined ? JSON.stringify(body) : undefined`를 무조건 적용한다. **두 곳 모두 분기**한다:
  `body instanceof FormData`면 `Content-Type`을 붙이지 않고(브라우저가 boundary를 넣어야 한다)
  `JSON.stringify`도 하지 않는다
- **`ApiClientError` 변환과 봉투 언랩 로직은 그대로 재사용**한다 — 업로드 실패 메시지도
  기존 `extractErrorMessage`로 흐르게 하려면 예외 경로가 하나여야 한다
- `lib/api/files.ts`: `uploadImage(file: File)` → `POST /api/files/images`
- `types/api.ts`에 `ImageUploadResponse` 추가. **응답 타입만** 여기 둔다
  (요청 타입은 `lib/api/*.ts`에 co-locate가 이 파일의 규칙이고, 파일 상단 주석에 명시돼 있다). `any` 금지

---

#### T14. extension-image 설치 및 확장 등록

| 항목   | 내용                                              |
| ------ | ------------------------------------------------- |
| 저장소 | `todo-frontend`                                   |
| 파일   | `package.json`, `components/editor/extensions.ts` |

- `@tiptap/extension-image` 설치. **설치된 Tiptap 3.30.6과 메이저를 맞춘다**
- `getTiptapExtensions()`에 추가 — 이 함수가 `TiptapEditor`(편집)와 `TiptapViewer`(뷰어)가
  공유하는 **유일한 지점**이므로 여기 한 번만 넣으면 상세 화면 렌더링까지 함께 해결된다
- 기존 함수의 주석이 "StarterKit 하나로 FR-T04를 충족한다"고 서술하므로 이미지 추가 사실을 반영한다

---

#### T15. 업로드 훅 · 툴바 · 드롭/붙여넣기

| 항목   | 내용                                                            |
| ------ | --------------------------------------------------------------- |
| 저장소 | `todo-frontend`                                                 |
| 파일   | `hooks/useImageUpload.ts`, `components/editor/TiptapEditor.tsx` |

- `useImageUpload`: 업로드 중 상태, 에러 상태 관리
- **툴바 예외 처리**: `TOOLBAR_GROUPS`는 `{ label, icon, isActive, run(editor) }` 시그니처인데
  파일 선택은 이걸로 표현할 수 없다. 4번째 그룹으로 추가하되 **숨겨진 `input[type=file]`을 함께 두고
  이 항목만 예외 렌더링**한다 (기존 `.map()` 렌더 루프를 억지로 일반화하지 않는다)
- **드래그 앤 드롭·클립보드 붙여넣기는 `extension-image`만으로는 동작하지 않는다.**
  `editorProps.handleDrop` / `handlePaste`로 파일을 가로채 업로드로 넘긴다
- 업로드 중 자리표시자 → 완료 시 실제 이미지로 교체 (ProseMirror decoration 또는 임시 placeholder 노드)
- 실패 시 자리표시자 제거 + 에러 메시지. 메시지는 **`lib/api/errors.ts`의 `extractErrorMessage`를 재사용**한다
  (서버가 `FILE_TOO_LARGE` / `INVALID_FILE_TYPE`에 한국어 문장을 실어 보낸다)
- 업로드 전 클라이언트에서도 타입·용량(5MB) 1차 검증. **서버 검증은 그대로 유지**한다
- 삽입 `src`는 서버가 준 `/api/files/{uuid}`를 **그대로** 쓴다.
  절대 URL이나 파일 시스템 경로를 넣으면 sanitize가 제거한다

---

#### T16. 이미지 표시 스타일

| 항목   | 내용              |
| ------ | ----------------- |
| 저장소 | `todo-frontend`   |
| 파일   | `app/globals.css` |

- `.tiptap-content img` 규칙 추가 (현재 135~161행 블록에 img가 없다):
  `max-width: 100%`, `height: auto`, 라운드. 라이트/다크 공통으로 동작하게 한다
- 기존 규칙들이 `@apply`를 쓰고 있으므로 같은 방식으로 맞춘다

**완료 조건** — `npm run check`(typecheck + lint:strict + format:check)와 `npm run build` 통과

---

### Phase D — 문서 갱신 및 최종 검증 (T17~T22)

모두 **루트 저장소** 커밋이다.

#### T17. `docs/API_SPEC.md`

⚠️ **장 번호 재배치가 필요하다.** 현재 4장이 "기타", 5장이 "FR↔엔드포인트 대응표"다.

- **4장 "파일 API" 신설** (`POST /api/files/images`, `GET /api/files/{uuid}`)
- 기존 4장 "기타" → **5장**, 기존 5장 "FR↔엔드포인트 대응표" → **6장**으로 재번호
- 1.1에 **multipart 예외 조항** ("모든 요청은 JSON" 규약의 유일한 예외)
- 1.3에 **바이너리/302 예외 조항** (성공 응답만 예외, **에러 응답 401/404는 봉투 유지**)
- 1.5 에러 코드 표에 3종 추가
- FR↔엔드포인트 대응표에 `FR-T14`
- 재번호 후 **다른 문서가 "API_SPEC 4장/5장"을 참조하는 곳이 없는지 grep으로 확인**한다

#### T18. `docs/PRD.md`

- 5.4 엔드포인트 목록에 2건 추가
- 5.2에 `FR-T14` "사용자는 할 일 상세 설명에 이미지를 첨부할 수 있다"
- **FR-T04 서식 목록에 "이미지" 추가**
- 8.2에 `Attachment` 엔티티
- 9.1에 `NFR-S09` "업로드 파일은 타입·크기를 서버에서 검증하고 저장 경로는 서버가 생성한다"
- 10장에 에러 코드 3종
- 4.2 제외 항목을 "S3 연동(v1.1)"으로 축소
- 13장 **OQ-4 해결됨** 표시
- **1.3 설치 상태 표에 `@tiptap/extension-image` 행 추가** — 이 열은 과거 에이전트가 설치 여부를
  환각한 이력 때문에 생긴 것이므로 반드시 갱신한다

#### T19. `docs/ROADMAP.md`

- 3장에 **M7 (로컬 이미지 첨부)** 신설 (M6 다음)
- 9장 진행 현황 표에 행 추가
- **7장 v1.1에 S3 전환 단계 추가**
- 8장 v2.0 후보에서 "이미지 첨부" 제거

#### T20. 루트 `CLAUDE.md`

- "불변 규칙" 절에 추가: `attachments` 스키마 요지 · 에러 코드 **9종**으로 갱신 ·
  sanitize `img` 규칙(`src`는 `/api/files/{uuid}` 형태만)
- **장 번호가 아니라 절 제목으로 지칭**한다 (이 파일은 번호 체계를 쓰지 않는다)

#### T21. `.playwright-mcp/CLAUDE.md` 처리 (별도 판단)

git 미추적 구버전 문서(1~13장 번호 체계, "모노레포 구조"라고 서술)가 남아 있는 한 같은 혼선이 반복된다.
**삭제하거나 파일 상단에 "구버전 — 참조 금지"를 명시**한다. 사용자 확인 후 진행한다.

#### T22. 최종 검증

`/check-all` 스킬로 세 갈래를 모두 돈다 (`./mvnw clean verify` + `npm run check` + `npm run build`).
단일 npm 스크립트로는 전체를 덮지 못한다.

---

## 3. 의존 그래프와 권장 실행 순서

```
T1 ─┬─> T2 ─> T3 ─> T4 ─> T5 ─> T6 ─> T7 ──┐
    │                                       │
    └────────────────> T8 ──> T9 ──> T10 ───┼─> T11
                                            │
T12 ─> T13 ─> T14 ─> T15 ─> T16 ────────────┤
                                            │
                                  T17~T21 ──┴─> T22
```

- **Phase A(T1~~T7)와 Phase C(T12~~T16)는 병행 가능하다.** 단 T13/T15는 T7의 응답 형식이 확정된 뒤가 안전하다
- **T8은 T9의 선행이다.** sanitize를 통과한 HTML에서 uuid를 파싱하기 때문
- **T11은 T7·T8·T9·T10 전부에 의존**한다. 마지막에 몰아서 쓰지 말고 각 Task 직후 해당 케이스만 추가하는 편이 낫다
- 문서 갱신(T17~T21)은 구현이 확정된 뒤에 한 번에 처리한다 — 중간에 계약이 바뀌면 두 번 고치게 된다

---

## 4. 커밋 계획

형식: `<이모지(선택)> <타입>(<스코프>): <한국어 설명>` · **헤더 72자** · 제목 끝 마침표 금지 ·
**Claude 서명(`Co-Authored-By`, `Generated with`) 절대 추가 금지**

| Task    | 저장소        | 커밋 메시지 예시                                            |
| ------- | ------------- | ----------------------------------------------------------- |
| T1      | todo-backend  | `⚙️ build(be): 파일 업로드 프로퍼티 및 multipart 한도 추가` |
| T1      | 루트          | `🔧 chore(root): upload 디렉터리 gitignore 추가`            |
| T2      | todo-backend  | `✨ feat(be): 파일 관련 에러 코드 3종 추가`                 |
| T3      | todo-backend  | `✨ feat(be): Attachment 엔티티 및 리포지토리 추가`         |
| T4      | todo-backend  | `✨ feat(be): 파일 저장소 추상화와 로컬 구현 추가`          |
| T5      | todo-backend  | `✨ feat(be): 매직 바이트 기반 이미지 타입 판정 추가`       |
| T6~T7   | todo-backend  | `✨ feat(be): 이미지 업로드·조회 API 추가`                  |
| T8      | todo-backend  | `🔒 fix(be): sanitize에 img 허용 및 src 화이트리스트 검증`  |
| T9      | todo-backend  | `✨ feat(be): Todo 본문과 첨부 파일 링크 동기화`            |
| T10     | todo-backend  | `✨ feat(be): 고아 첨부 파일 정리 스케줄러 추가`            |
| T11     | todo-backend  | `✅ test(be): 이미지 첨부 통합 테스트 추가`                 |
| T12     | todo-frontend | `⚙️ build(fe): 이미지 경로 rewrite 추가`                    |
| T13     | todo-frontend | `✨ feat(fe): apiFetch multipart 지원 및 파일 API 추가`     |
| T14~T15 | todo-frontend | `✨ feat(fe): Tiptap 이미지 업로드 기능 추가`               |
| T16     | todo-frontend | `💄 style(fe): 에디터 본문 이미지 스타일 추가`              |
| T17~T21 | 루트          | `📝 docs(root): M7 이미지 첨부 기능 문서 반영`              |

---

## 5. 최종 검증 체크리스트

- [ ] `attachments` 테이블 생성, 인덱스 적용 (`schema.sql`은 변경되지 않음)
- [ ] `todo-project/upload/`가 자동 생성되고 **해석된 절대경로가 로그에 찍힘**
- [ ] 에디터에서 파일 선택 / 드래그 / 붙여넣기 3가지 모두 업로드됨
- [ ] 업로드 중 자리표시자 → 완료 시 이미지로 교체
- [ ] Todo 저장 후 다시 열었을 때 이미지가 정상 표시됨 (rewrite 동작 확인)
- [ ] 저장된 HTML의 `src`가 `/api/files/{uuid}` **상대경로**임 (절대 URL이 섞이지 않음)
- [ ] 다른 계정으로 `/api/files/{uuid}` 접근 시 404 `FILE_NOT_FOUND`
- [ ] 5MB 초과 → `FILE_TOO_LARGE`, 위조된 확장자 → `INVALID_FILE_TYPE`
- [ ] 외부 URL·`javascript:`·`data:` 이미지가 제거되고 **정상 상대경로는 살아남음**
- [ ] 본문에서 이미지를 뺀 뒤 24시간 이내에는 정리되지 않음
- [ ] 두 Todo가 같은 이미지를 참조할 때 한쪽에서 빼도 다른 쪽이 깨지지 않음
- [ ] `upload/`가 git에 커밋되지 않음 (secretlint·`git status` 확인)
- [ ] `./mvnw clean verify`, `npm run check`, `npm run build` 전부 통과 (또는 `/check-all`)

---

## 6. 리스크와 주의점

| 리스크                                    | 내용                                                                                                                                | 대응                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **sanitize 안전성 근거 붕괴**             | `HtmlSanitizer`는 "속성 전면 불허"를 안전 근거로 Javadoc에 명시하고 있다. `img[src]`가 그 전제를 깬다                               | T8에서 코드·Javadoc·테스트를 **한 커밋**에서 함께 개정. 사후 정규식 검증으로 근거 교체          |
| **Spotless가 테스트 실패로 위장**         | Spotless가 Maven `validate` 페이즈에 묶여 있어 포맷이 어긋나면 `mvn test`/`verify`가 실패한다                                       | 커밋 전 항상 `./mvnw spotless:apply`                                                            |
| **multipart 기본 한도 1MB**               | `spring.servlet.multipart.*` 설정이 없어 5MB 파일이 우리 검증에 도달하지 못한다                                                     | T1에서 6MB/8MB로 상향 + `MaxUploadSizeExceededException` 핸들러(T2)                             |
| **API_SPEC 장 번호 밀림**                 | 4장 신설 시 기존 4·5장 재번호 필요                                                                                                  | T17에서 재번호 후 타 문서의 참조를 grep으로 확인                                                |
| **잘못된 저장소에 커밋**                  | 독립 저장소 3개가 디렉터리로만 중첩돼 있어 `cd` 위치에 따라 대상이 달라진다                                                         | 각 Task의 `저장소` 열 확인. 4장 커밋 계획표 준수                                                |
| **`todo_id` 단일 FK의 한계**              | 본문 복붙으로 두 Todo가 같은 uuid를 참조하면 `todo_id`는 한쪽만 가리킨다                                                            | `updated_at` 기준 24시간 유예 + 삭제 직전 가드 쿼리(T10). 다대다 조인 테이블은 도입 안 함       |
| **`FILE_LOCAL_BASE_DIR` 기본값의 모호성** | `../upload`는 **`todo-backend`를 작업 디렉터리로 실행할 때만** `todo-project/upload`를 가리킨다. IDE는 작업 디렉터리가 다를 수 있다 | 기동 시 해석된 절대경로를 로그로 남긴다(T4). 다르면 절대경로로 지정                             |
| **AWS 자격 증명**                         | 5.0~5.3에는 **AWS 키가 전혀 필요 없다**. 키를 소스·문서·커밋 어디에도 적지 않는다                                                   | 이미 노출했다면 IAM에서 즉시 폐기·재발급. 값은 `application-local.properties`나 OS 환경변수에만 |

---

## 7. 범위 밖 (이번에 하지 않음)

- **S3 전환** — `FEATURE_IMAGE_UPLOAD.md` 5.4, `ROADMAP.md` 7장 v1.1에서 진행.
  이번에는 `FileStorageService` 인터페이스와 `storage_type` 컬럼, `getRedirectUrl` 분기만 준비한다
- **첨부 파일 관리 UI / 관리자 API** — 정리는 스케줄러만, 수동 실행은 테스트에서 서비스 직접 호출
- **이미지 외 파일 타입**(PDF·동영상 등), 이미지 리사이즈·썸네일·EXIF 제거
- **다대다 첨부 조인 테이블** — 이 규모에 과하다고 판단
