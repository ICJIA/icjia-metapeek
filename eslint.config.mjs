// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  // Your custom configs here
  {
    rules: {
      // Customize rules as needed
      "vue/multi-word-component-names": "off", // Allow single-word component names
      "@typescript-eslint/no-explicit-any": "warn", // Warn on 'any' type instead of error
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "vue/html-self-closing": [
        "warn",
        {
          html: {
            void: "never", // Don't require self-closing on void elements like <img>, <input>
            normal: "always",
            component: "always",
          },
        },
      ],
    },
  },
);
