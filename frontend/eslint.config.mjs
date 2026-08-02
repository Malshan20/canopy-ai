import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `scripts/**` holds standalone Node build utilities, not application
    // source. They legitimately use CommonJS `require()`, which the Next +
    // TypeScript preset forbids for app code — correctly, since app code is
    // ESM. Linting them under the app's ruleset flags that as an error and
    // fails CI, so they're excluded here rather than contorted into ESM for
    // a ruleset they were never meant to be governed by.
    ignores: [".next/**", "node_modules/**", "scripts/**"],
  },
];

export default eslintConfig;
