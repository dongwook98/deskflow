import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";

// 레이어 경계. 의존 방향:
//   app(route.ts) → server → shared   (src/proxy.ts 는 요소 밖, 검사 대상 아님)
//   app(pages) → widgets → features → entities → shared
// 프론트 레이어(widgets/features/entities/shared)는 server(_server)를 import 할 수 없다.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "server", pattern: "src/app/api/_server/**" },
        { type: "api-route", pattern: "src/app/api/**" },
        { type: "app", pattern: "src/app/**" },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        { type: "shared", pattern: "src/shared/*" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            { from: { element: { type: "shared" } }, allow: { to: { element: { type: "shared" } } } },
            { from: { element: { type: "entities" } }, allow: { to: { element: { types: { anyOf: ["shared", "entities"] } } } } },
            { from: { element: { type: "features" } }, allow: { to: { element: { types: { anyOf: ["shared", "entities", "features"] } } } } },
            { from: { element: { type: "widgets" } }, allow: { to: { element: { types: { anyOf: ["shared", "entities", "features", "widgets"] } } } } },
            { from: { element: { type: "server" } }, allow: { to: { element: { types: { anyOf: ["shared", "server"] } } } } },
            { from: { element: { type: "api-route" } }, allow: { to: { element: { types: { anyOf: ["shared", "server"] } } } } },
            { from: { element: { type: "app" } }, allow: { to: { element: { types: { anyOf: ["shared", "entities", "features", "widgets"] } } } } },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
