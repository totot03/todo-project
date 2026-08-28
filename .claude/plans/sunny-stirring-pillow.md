# M1 — 도메인 모델 구현 계획

## Context

M0 스캐폴딩이 완료된 상태에서(`git tag m0-scaffold`), `docs/ROADMAP.md`의 M1 마일스톤을 진행한다.
M1의 목표는 "데이터 구조가 확정되고 테이블이 생성된다"이며, M2-A(자체 JWT 인증)와 M3(Todo CRUD API)가
이 위에서 바로 동작해야 하므로 엔티티 필드·제약·인덱스가 `docs/PRD.md` 8.2와 정확히 일치해야 한다.

핵심 난제는 **부분 유니크 인덱스**(`UNIQUE (email) WHERE deleted_at IS NULL`)다. 이 프로젝트는
Flyway/Liquibase가 없고 `ddl-auto=update`만 쓰므로, 순수 JPA 어노테이션으로는 조건부 WHERE절을
표현할 수 없다. 사용자와 상의해 **`schema.sql` 자동 실행 방식**(Hibernate가 테이블을 만든 뒤
`defer-datasource-initialization=true`로 순서를 보장해 인덱스를 추가 적용)으로 확정했다.

또한 이 저장소는 백엔드 전용 가이드 문서가 없어(`docs/guides/`는 전부 프론트엔드용), 엔티티 설계
컨벤션(Lombok 사용 범위, Soft Delete 구현 방식, 패키지 구조)을 이번 마일스톤에서 새로 세운다.
이후 마일스톤(User/Todo 관련 모든 백엔드 작업)이 이 컨벤션을 따르게 되므로 일관성 있게 정한다.

## 패키지 구조

기존 `common/config/controller`와 같은 레벨에 신설:

```
src/main/java/com/example/
├── entity/
│   ├── BaseTimeEntity.java   (@MappedSuperclass, 시간·Soft Delete 공통 필드)
│   ├── User.java
│   ├── Todo.java
│   ├── Provider.java         (top-level enum: LOCAL, GOOGLE)
│   ├── Role.java             (top-level enum: USER 만 — YAGNI)
│   └── Priority.java         (top-level enum: HIGH, MEDIUM, LOW)
└── repository/
    ├── UserRepository.java
    └── TodoRepository.java
```

enum을 top-level로 두는 이유: M2-A/M3의 DTO·Service가 `User.Provider.LOCAL`처럼 소유 엔티티를
거치지 않고 직접 참조해야 하기 때문 (API_SPEC 응답에 `provider`/`priority` 문자열이 그대로 노출됨).

## BaseTimeEntity 설계

`@MappedSuperclass` + `@EntityListeners(AuditingEntityListener.class)`.

- `createdAt` (`@CreatedDate`, `updatable=false`), `updatedAt` (`@LastModifiedDate`) — JPA Auditing 자동 관리
- `deletedAt` (nullable, Auditing 대상 아님 — `markDeleted()`로만 채워짐)
- `markDeleted()` 메서드 1개만 추가 (deletedAt = now()). Soft Delete를 호출하는 서비스 로직(M3 Todo 삭제)이
  재사용할 최소한의 엔티티 상태 전이 메서드. `restore()`/`isDeleted()` 등은 실제 사용처가 생길 때 추가한다.

**`id`는 BaseTimeEntity에 넣지 않고 User/Todo 각각에 개별 선언**한다. 클래스명이 "BaseTime"으로
시간 필드 책임을 한정하고 있고, PK 생성 전략은 엔티티마다 달라질 수 있는 별개 관심사이기 때문이다.

## User 엔티티

```java
@Entity
@Table(name = "users")                    // "user"는 Postgres 예약어라 명시 필수
@SQLRestriction("deleted_at IS NULL")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
public class User extends BaseTimeEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)              // unique=true 를 의도적으로 두지 않음 (아래 참고)
    private String email;

    @Column                                 // nullable — 소셜 가입자는 NULL
    private String password;

    @Column(nullable = false, length = 50)
    private String nickname;

    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private Provider provider;

    @Builder.Default
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private Role role = Role.USER;
}
```

**`email`에 `unique=true`를 두지 않는 이유**: JPA가 만드는 일반 UNIQUE 제약은 탈퇴 계정 이메일
재가입(FR-A12)을 막아버린다. 유일성 판단은 전적으로 `schema.sql`의 부분 유니크 인덱스에 위임한다.
이 지점은 흔히 놓치는 함정이므로 Javadoc에 명시적으로 남긴다.

## Todo 엔티티

```java
@Entity
@Table(name = "todos")
@SQLRestriction("deleted_at IS NULL")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
public class Todo extends BaseTimeEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")      // sanitize는 M3 서비스 계층에서
    private String description;

    @Column(name = "due_date")              // 과거 날짜 허용 (PRD 8.2)
    private LocalDate dueDate;

    @Builder.Default
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private Priority priority = Priority.MEDIUM;

    @Column(nullable = false)
    private boolean completed;              // primitive boolean → 기본값 false 자동
}
```

`priority`는 필드 초기화식이 있으므로 `@Builder.Default`가 필수(안 붙이면 Lombok이 builder에서 조용히
`null`을 만들 수 있어 컴파일 경고 발생). `completed`는 primitive라 초기화식/`@Builder.Default` 불필요.

Setter는 두지 않는다 — 두 엔티티 모두 `@Builder`로 생성만 지원하고, 필드 변경은 의도가 드러나는
전용 메서드가 필요해질 때(M3 토글, M5 프로필 수정 등) 추가한다.

## Repository

```java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
}

public interface TodoRepository extends JpaRepository<Todo, Long> {
    Optional<Todo> findByIdAndUserId(Long id, Long userId);
}
```

메서드명에 `AndDeletedAtIsNull` 접미사를 붙이지 않는다 — 클래스 레벨 `@SQLRestriction`이 파생 쿼리를
포함한 모든 Hibernate 쿼리에 조건을 자동으로 덧붙이므로 중복이다. 페이지네이션/필터/정렬 쿼리는 M3 범위.

## schema.sql (신규)

`src/main/resources/schema.sql`:

```sql
-- M1: users 부분 유니크 인덱스 — 탈퇴 계정(deleted_at IS NOT NULL)의 이메일은
-- 유일성 검사에서 제외되어 같은 이메일로 재가입할 수 있다 (FR-A12, PRD 8.2).
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_active
    ON users (email)
    WHERE deleted_at IS NULL;

-- M1: todos 목록 조회 성능 인덱스 — 모든 조회가 user_id + deleted_at IS NULL 로 시작한다 (NFR-P02).
CREATE INDEX IF NOT EXISTS ix_todos_user_deleted
    ON todos (user_id, deleted_at);

-- M1: completed 필터가 포함된 목록 조회(예: 미완료만 보기)를 위한 복합 인덱스.
CREATE INDEX IF NOT EXISTS ix_todos_user_completed_deleted
    ON todos (user_id, completed, deleted_at);
```

`currentSchema=todolist_db`가 JDBC 커넥션의 `search_path`를 설정하므로 테이블명에 스키마 접두사를
붙이지 않는다. `IF NOT EXISTS`로 재기동 시 멱등성을 보장한다. local/test 두 프로필 모두 이 파일을
공유하며 문제없이 동작한다 (test는 M6에서 `ddl-auto`가 확정될 예정이라 이번엔 손대지 않는다).

## application.properties 변경

기존 JPA/Hibernate 블록 뒤에 추가:

```properties
# --- SQL 초기화 (schema.sql) ---
# users 부분 유니크 인덱스·todos 복합 인덱스는 ddl-auto 로 표현할 수 없어 schema.sql 로 별도 적용한다.
# defer-datasource-initialization=true 로 Hibernate 가 테이블을 먼저 만든 뒤 schema.sql 이 실행되도록 순서를 보장한다.
# postgres 같은 외부 DB는 기본적으로 spring.sql.init.mode 가 always 가 아니므로 명시적으로 켠다.
spring.jpa.defer-datasource-initialization=true
spring.sql.init.mode=always
```

`application-local.properties`/`application-test.properties`는 수정하지 않는다 (둘 다 공통
`application.properties`를 상속하므로 자동 적용됨).

## TodoBackendApplication.java 변경

`@EnableJpaAuditing` 추가 (BaseTimeEntity의 createdAt/updatedAt 활성화에 필수 — 현재 누락 상태).

## 구현 순서

1. `entity/Provider.java`, `entity/Role.java`, `entity/Priority.java`
2. `entity/BaseTimeEntity.java`
3. `entity/User.java`, `entity/Todo.java`
4. `repository/UserRepository.java`, `repository/TodoRepository.java`
5. `TodoBackendApplication.java`에 `@EnableJpaAuditing` 추가
6. `application.properties`에 sql.init 설정 추가
7. `src/main/resources/schema.sql` 신규 작성
8. 검증 (아래)

## M1 범위에 포함하지 않는 것

- Service/Controller/DTO (M2-A, M3)
- **Repository 슬라이스 테스트(`@DataJpaTest`)는 작성하지 않는다**: H2 의존성이 없고, `application-test.properties`는
  "M6에서 ddl-auto 확정 예정"이라 명시적으로 유보된 상태라 지금 슬라이스 테스트를 만들면 그 결정을 앞당기게 된다.
  ROADMAP DoD도 psql 수동 검증만 요구한다. 필요하면 M2-A/M3의 `@SpringBootTest` 통합 테스트가 자연스럽게 경유한다.
- 페이지네이션/정렬/필터 쿼리 (M3), description sanitize (M3), User 갱신 메서드 (해당 마일스톤에서)

## 검증 방법

```bash
cd D:/claude/todo-project/todo-backend

./mvnw spotless:apply      # 신규 파일 포맷 정리 (AOSP 스타일)
./mvnw compile              # 컴파일만 빠르게 확인
./mvnw spring-boot:run      # 실기동 — DB_PASSWORD 등은 application-local.properties가 주입
```

콘솔 확인:

- `Started TodoBackendApplication in ...` — 부팅 성공
- `AnnotationException`/`MappingException`/`PropertyAccessException` 스택트레이스 없음
- `show-sql=true`로 `create table users`, `create table todos` DDL 출력 확인

별도 터미널에서:

```bash
psql -h localhost -U postgres -d postgres
\dt todolist_db.*
\d todolist_db.users
\d todolist_db.todos
```

`\d todolist_db.users`의 `Indexes:`에서 `ux_users_email_active UNIQUE, btree (email) WHERE deleted_at IS NULL` 확인.
`\d todolist_db.todos`의 `Indexes:`에서 `ix_todos_user_deleted`, `ix_todos_user_completed_deleted`, FK 제약 확인.

(선택) FR-A12 스모크 테스트: 같은 이메일로 두 번째 INSERT 시도 → `duplicate key ... ux_users_email_active` 에러 확인 →
첫 번째 행을 `UPDATE ... SET deleted_at = now()`로 소프트 삭제 → 같은 이메일로 재차 INSERT 성공 확인.

## Critical Files

- `todo-backend/src/main/java/com/example/entity/BaseTimeEntity.java` (신규)
- `todo-backend/src/main/java/com/example/entity/User.java` (신규)
- `todo-backend/src/main/java/com/example/entity/Todo.java` (신규)
- `todo-backend/src/main/java/com/example/entity/Provider.java`, `Role.java`, `Priority.java` (신규)
- `todo-backend/src/main/java/com/example/repository/UserRepository.java`, `TodoRepository.java` (신규)
- `todo-backend/src/main/resources/schema.sql` (신규)
- `todo-backend/src/main/resources/application.properties` (수정)
- `todo-backend/src/main/java/com/example/TodoBackendApplication.java` (수정)

완료 후 `git tag m1-domain` (ROADMAP.md 체크포인트).
