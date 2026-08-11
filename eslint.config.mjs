const TYPOGRAPHIC_DASH = /[\u2012-\u2015]/;

/** @type {import('eslint').Rule.RuleModule} */
const noTypographicDashes = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow typographic dashes (U+2012–U+2015) in string literals and JSX text. Use comma, colon, period, "to" for ranges, or n/a for empty placeholders.',
    },
    schema: [],
    messages: {
      typographicDash:
        'Typographic dash (U+2012–U+2015) is not allowed in UI copy. Use comma, colon, period split, "A to Z", or n/a instead.',
    },
  },
  create(context) {
    function reportIfDash(node, value) {
      if (typeof value === 'string' && TYPOGRAPHIC_DASH.test(value)) {
        context.report({ node, messageId: 'typographicDash' });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') reportIfDash(node, node.value);
      },
      JSXText(node) {
        reportIfDash(node, node.value);
      },
      TemplateElement(node) {
        reportIfDash(node, node.value.raw);
      },
    };
  },
};

/** Minimal no-op rule so eslint-disable comments for Next/React plugins do not error. */
function noopRule() {
  return {};
}

export default [
  {
    ignores: ['node_modules/**', '.next/**', 'desktop/node_modules/**'],
  },
  {
    files: ['src/**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    plugins: {
      'no-typographic-dashes': { rules: { 'no-typographic-dashes': noTypographicDashes } },
      '@next/next': { rules: { 'no-img-element': { create: noopRule } } },
      'react-hooks': { rules: { 'exhaustive-deps': { create: noopRule } } },
    },
    rules: {
      'no-typographic-dashes/no-typographic-dashes': 'error',
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
