#!/usr/bin/env node
/**
 * PostToolUse 훅 — Claude Code 가 파일을 수정한 직후 자동 포맷/린트
 *
 * 왜 Node 스크립트인가:
 *   훅은 stdin 으로 JSON 을 받는다. jq 는 Windows 에 기본 설치되어 있지 않으므로
 *   이 프로젝트가 이미 의존하는 Node 로 파싱하는 편이 이식성이 높다.
 *
 * 동작 원칙:
 *   - 파일 위치에 따라 담당 Prettier 를 고른다:
 *       todo-frontend/**  → 프론트엔드 Prettier (tailwind 플러그인 포함)
 *       그 밖의 저장소 파일 → 루트 Prettier (문서·설정용, 플러그인 없음)
 *     Prettier 는 설정을 대상 파일 위치 기준으로 찾으므로, 실행 위치(cwd)는
 *     .prettierignore 를 어느 것으로 읽을지만 결정한다. 그래서 cwd 를 나눠 준다.
 *   - 백엔드 Java 는 건드리지 않는다 (Spotless 담당, JVM 기동이 느려 편집마다 돌릴 수 없다).
 *     .java 는 Prettier 가 모르는 확장자이므로 확장자 필터에서 자연히 걸러진다.
 *   - 절대 커밋을 막지 않는다: 어떤 실패에도 exit 0 (훅이 작업 흐름을 끊지 않도록)
 *   - 로컬 설치된 prettier/eslint 를 직접 실행 (npx 조회 비용 제거)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HOOK_DIR, "..", "..");
const FRONTEND = path.join(PROJECT_ROOT, "todo-frontend");

// .bin 셸 래퍼(.cmd) 대신 CLI 진입점을 Node 로 직접 실행한다.
// 셸을 거치지 않으므로 인자 이스케이프 문제와 Node 의 shell 경고가 사라진다.
const cliPath = (base, pkg, ...rest) => path.join(base, "node_modules", pkg, ...rest);

const FRONTEND_PRETTIER = cliPath(FRONTEND, "prettier", "bin", "prettier.cjs");
const ROOT_PRETTIER = cliPath(PROJECT_ROOT, "prettier", "bin", "prettier.cjs");
const FRONTEND_ESLINT = cliPath(FRONTEND, "eslint", "bin", "eslint.js");

// eslint 은 코드 파일만, prettier 는 스타일/문서/설정 파일까지 처리한다
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const FORMAT_EXT = new Set([
  ...CODE_EXT,
  ".css",
  ".scss",
  ".json",
  ".jsonc",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
]);

// 도구가 스스로 관리하거나 포맷 대상이 아닌 디렉터리.
// .prettierignore 에도 대부분 들어 있지만, 여기서 먼저 걸러 프로세스 기동 자체를 아낀다.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".metadata",
  "shrimp_data",
  "target",
  "out",
  "coverage",
]);

function run(cli, args, cwd) {
  if (!existsSync(cli)) return;
  spawnSync(process.execPath, [cli, ...args], {
    cwd,
    stdio: "ignore",
    timeout: 30_000,
  });
}

/** 경로가 base 안에 있으면 상대 경로를, 밖이면 null 을 돌려준다. */
function relativeInside(base, abs) {
  const rel = path.relative(base, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // stdin 이 비었거나 JSON 이 아니면 조용히 종료
  }

  const filePath = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath.length === 0) return;

  const abs = path.resolve(filePath);

  // 저장소 밖의 파일은 건드리지 않는다 (스크래치패드, 홈 디렉터리 설정 등)
  const relRoot = relativeInside(PROJECT_ROOT, abs);
  if (relRoot === null) return;
  if (relRoot.split(path.sep).some((seg) => SKIP_DIRS.has(seg))) return;

  const ext = path.extname(abs).toLowerCase();
  if (!FORMAT_EXT.has(ext)) return;

  const relFrontend = relativeInside(FRONTEND, abs);
  const isFrontend = relFrontend !== null;

  // 기본은 Prettier 만 (≈0.5초). ESLint --fix 는 기동에만 4초 이상 걸려
  // 편집마다 돌리면 작업 흐름이 눈에 띄게 느려진다.
  // 어차피 pre-commit 의 lint-staged 가 커밋 직전에 동일한 --fix 를 수행한다.
  // 편집 즉시 자동 수정까지 원하면 환경변수 CLAUDE_HOOK_ESLINT=1 을 설정한다.
  // ESLint 설정은 todo-frontend 에만 있으므로 프론트엔드 코드 파일에 한정한다.
  if (isFrontend && process.env.CLAUDE_HOOK_ESLINT === "1" && CODE_EXT.has(ext)) {
    run(FRONTEND_ESLINT, ["--fix", "--no-warn-ignored", abs], FRONTEND);
  }

  const prettier = isFrontend ? FRONTEND_PRETTIER : ROOT_PRETTIER;
  const cwd = isFrontend ? FRONTEND : PROJECT_ROOT;
  run(prettier, ["--write", "--ignore-unknown", abs], cwd);
}

main();
