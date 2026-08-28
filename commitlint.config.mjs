/**
 * commitlint 설정 — 커밋 메시지 규칙 검증
 *
 * 이 프로젝트의 커밋 포맷: `<이모지(선택)> <타입>(<범위>): <한국어 설명>`
 *   예) ✨ feat(fe): 할 일 완료 토글 UI 추가
 *       fix(be): 만료된 JWT 재발급 시 500 응답 수정
 *
 * 기본 conventional 파서는 헤더를 /^(\w*)(?:\((.*)\))?!?: (.*)$/ 로 읽기 때문에
 * 앞에 붙은 이모지를 타입으로 인식하지 못해 무조건 실패한다.
 * → .claude/commands/git/commit.md 의 이모지 컨벤션과 맞추기 위해 파서를 확장한다.
 *
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
  extends: ["@commitlint/config-conventional"],

  parserPreset: {
    parserOpts: {
      // 그룹1: 이모지(선택) / 그룹2: 타입 / 그룹3: 범위(선택) / 그룹4: 설명
      headerPattern:
        /^(?:([\p{Extended_Pictographic}\u{FE0F}\u{200D}]+)\s+)?(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/u,
      headerCorrespondence: ["emoji", "type", "scope", "breaking", "subject"],
    },
  },

  rules: {
    // 타입: 프로젝트 /commit 명령어의 타입 목록과 일치시킨다
    "type-enum": [
      2,
      "always",
      [
        "feat", // 새로운 기능
        "fix", // 버그 수정
        "docs", // 문서
        "style", // 포맷팅(동작 변화 없음)
        "refactor", // 리팩토링
        "perf", // 성능 개선
        "test", // 테스트
        "build", // 빌드/의존성
        "ci", // CI 설정
        "chore", // 잡무/도구
        "revert", // 되돌리기
      ],
    ],
    "type-empty": [2, "never"],
    "type-case": [2, "always", "lower-case"],

    // 범위: 모노레포 구조를 반영. 강제하지 않고 경고(1)로만 안내한다.
    "scope-enum": [1, "always", ["fe", "be", "docs", "infra", "deps", "config", "root"]],
    "scope-case": [2, "always", "lower-case"],

    // 제목: 한국어에는 대소문자 개념이 없으므로 case 규칙을 끈다
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],

    // 길이: 한글은 표시 폭이 넓어 기본 100자는 과하다. 이모지+타입 포함 72자.
    "header-max-length": [2, "always", 72],

    // 본문/꼬리말은 앞에 빈 줄 한 줄
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
    // 한국어 본문은 줄바꿈을 강제하면 오히려 읽기 나빠진다
    "body-max-line-length": [0],
  },
};

export default config;
