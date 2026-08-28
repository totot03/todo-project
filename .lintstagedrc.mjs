/**
 * lint-staged 설정 (루트 = todo-frontend 바깥의 파일들)
 *
 * 적용 대상: docs/*.md, 루트 설정 파일, .github 워크플로 등
 * todo-frontend 안의 파일은 todo-frontend/.lintstagedrc.mjs 가 담당한다.
 * (lint-staged 는 파일마다 가장 가까운 설정만 적용한다)
 */
const config = {
  "*.{json,jsonc,md,mdx,yml,yaml,mjs,cjs,js}": ["prettier --write"],
};

export default config;
