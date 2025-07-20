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
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
  },
};