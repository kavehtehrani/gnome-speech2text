module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  globals: {
    // GNOME Shell globals
    global: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    // GI imports
    Clutter: 'readonly',
    Gio: 'readonly',
    GLib: 'readonly',
    GObject: 'readonly',
    Meta: 'readonly',
    Shell: 'readonly',
    St: 'readonly',
    // Extension globals
    Main: 'readonly',
    PanelMenu: 'readonly',
    PopupMenu: 'readonly',
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};