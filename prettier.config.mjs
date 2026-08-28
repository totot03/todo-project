/**
 * Prettier 설정 (루트 = 문서·설정 파일용)
 *
 * todo-frontend 는 자체 prettier.config.mjs 를 가지며(Tailwind 클래스 정렬 플러그인 포함),
 * Prettier 는 각 파일에서 가장 가까운 설정을 사용하므로 이 파일이 프론트엔드에 영향을 주지 않는다.
 *
 * @type {import("prettier").Config}
 */
const config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: "always",
  // .gitattributes(eol=lf) 와 짝을 이룬다 — Windows 에서도 저장소는 항상 LF
  endOfLine: "lf",

  overrides: [
    {
      // Markdown 문서는 줄바꿈을 임의로 재배치하지 않는다(한국어 문단 가독성 유지)
      files: ["*.md", "*.mdx"],
      options: { proseWrap: "preserve" },
    },
  ],
};

export default config;
