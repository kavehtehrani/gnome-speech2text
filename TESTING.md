# Testing Guide for GNOME Speech2Text Extension

## Overview

This document outlines the comprehensive testing strategy for the GNOME Speech2Text extension, covering JavaScript extension code, Python backend, and integration testing.

## Testing Architecture

### 1. Unit Tests

- **JavaScript**: Test individual utility modules and components
- **Python**: Test backend functions, signal handling, and audio processing
- **Coverage**: Aim for >80% code coverage across both codebases

### 2. Integration Tests

- **Extension-Python Communication**: Test process spawning and IPC
- **Signal Handling**: Test graceful shutdown and error handling
- **Data Flow**: Test transcription pipeline from recording to text insertion

### 3. CI/CD Validation

- **Extension Structure**: Validate metadata, schemas, and file structure
- **Automated Testing**: Run all test suites on push/PR
- **Code Quality**: ESLint for JavaScript, pytest for Python

## Setup and Installation

### Prerequisites

```bash
# System dependencies
sudo apt install python3 python3-pip python3-venv ffmpeg xdotool xclip

# Node.js for JavaScript testing
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs
```

### Install Testing Dependencies

```bash
# JavaScript testing tools
npm install

# Python testing tools
pip install pytest pytest-cov pytest-mock
```

## Running Tests

### JavaScript Tests

```bash
# Run all JavaScript tests
npm test

# Run specific test suites
npm run test:js          # Unit tests only
npm run test:integration # Integration tests only

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Python Tests

```bash
# Run Python tests with coverage
npm run test:python

# Or run directly with pytest
cd src && python -m pytest ../tests/python --cov=. --cov-report=html
```

### Linting and Code Quality

```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## Test Structure

```
tests/
├── setup.js                          # Jest configuration and GNOME mocks
├── js/                               # JavaScript unit tests
│   └── lib/
│       ├── constants.test.js         # Color/style constants
│       ├── uiUtils.test.js          # UI utility functions
│       ├── focusUtils.test.js       # Window focus management
│       └── resourceUtils.test.js    # Resource cleanup
├── python/                          # Python unit tests
│   ├── conftest.py                  # Pytest fixtures and mocks
│   └── test_whisper_typing.py       # Backend functionality
└── integration/                     # Integration tests
    └── extension-python.test.js     # Extension-Python communication
```

## Writing New Tests

### JavaScript Tests

```javascript
// Example unit test structure
import { functionToTest } from "../../../src/lib/module.js";

describe("Module Name", () => {
  test("should do something specific", () => {
    const result = functionToTest(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Python Tests

```python
# Example Python test structure
import pytest
from unittest.mock import patch

def test_function_name(mock_whisper_model):
    """Test description"""
    result = function_to_test()
    assert result == expected_value
```

## Mocking Strategy

### GNOME Shell APIs

- **Global Objects**: Mocked in `tests/setup.js`
- **GI Imports**: Clutter, Gio, GLib, Meta, Shell, St
- **Extension APIs**: Main, PanelMenu, PopupMenu

### Python Dependencies

- **Whisper Model**: Mocked transcription responses
- **Subprocess**: Mocked audio recording and system commands
- **Environment**: Controlled X11/Wayland detection

## Continuous Integration

### GitHub Actions Workflow

- **JavaScript Tests**: Node.js 18, Jest, ESLint
- **Python Tests**: Python 3.9, pytest, coverage
- **Extension Validation**: Metadata, schema compilation
- **Coverage Reporting**: Codecov integration

### Pre-commit Hooks (Optional)

```bash
# Install pre-commit
pip install pre-commit
pre-commit install

# Manual run
pre-commit run --all-files
```

## Test Data and Fixtures

### Audio Files

- **Mock WAV Files**: Generated in `conftest.py`
- **Transcription Responses**: Predefined test strings
- **Error Scenarios**: Invalid audio, model failures

### Environment Simulation

- **X11 vs Wayland**: Environment variable mocking
- **Process Communication**: Subprocess mocking
- **Signal Handling**: Graceful shutdown testing

## Debugging Tests

### JavaScript

```bash
# Debug specific test
npm test -- --testNamePattern="test name"

# Run with verbose output
npm test -- --verbose

# Debug in VS Code
# Use "Jest Debug" configuration
```

### Python

```bash
# Debug with pdb
pytest --pdb tests/python/test_whisper_typing.py

# Verbose output
pytest -v tests/python/

# Debug specific test
pytest -k "test_function_name" tests/python/
```

## Performance Testing

### JavaScript

- **UI Responsiveness**: Modal creation/destruction times
- **Memory Leaks**: Resource cleanup validation
- **Event Handling**: Rapid user interactions

### Python

- **Audio Processing**: Recording latency and quality
- **Whisper Performance**: Transcription time benchmarks
- **Process Overhead**: Spawn/terminate timing

## Contributing

### Test Requirements for PRs

1. **New Features**: Must include unit tests
2. **Bug Fixes**: Must include regression tests
3. **Coverage**: Maintain >80% overall coverage
4. **Integration**: Add integration tests for new workflows

### Code Quality Standards

- **JavaScript**: Follow ESLint rules
- **Python**: Follow PEP 8 (enforced by pytest)
- **Documentation**: Update test docs for new patterns
- **Commit Messages**: Reference test coverage in PR descriptions

## Troubleshooting

### Common Issues

- **GNOME Mocks**: Update `tests/setup.js` for new APIs
- **Import Errors**: Check Python path in `conftest.py`
- **Async Tests**: Use proper Jest async patterns
- **CI Failures**: Check system dependencies in workflow

### Getting Help

- **Test Failures**: Check console output and coverage reports
- **Mock Issues**: Review existing mock patterns in test files
- **CI Problems**: Check GitHub Actions logs for detailed errors
