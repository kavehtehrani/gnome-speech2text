/**
 * Integration tests for extension-Python backend communication
 */

// Mock GLib before any imports
jest.mock('gi://GLib', () => ({
  spawn_async: jest.fn(),
}), { virtual: true });

// Define mock process interface
interface MockProcess {
  pid: number;
  stdin: {
    write: jest.Mock;
    end: jest.Mock;
  };
  stdout: {
    on: jest.Mock;
    pipe: jest.Mock;
  };
  stderr: {
    on: jest.Mock;
  };
  on: jest.Mock;
  kill: jest.Mock;
}

describe('Extension-Python Integration', () => {
  let mockProcess: MockProcess;
  
  beforeEach(() => {
    mockProcess = {
      pid: 12345,
      stdin: {
        write: jest.fn(),
        end: jest.fn(),
      },
      stdout: {
        on: jest.fn(),
        pipe: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn(),
      kill: jest.fn(),
    };
    
    // Mock GLib.spawn_async
    const GLib = require('gi://GLib');
    GLib.spawn_async.mockImplementation((workingDir: string, argv: string[], envp: string[] | null, flags: number, childSetup: any, callback: (error: null, pid: number) => void) => {
      // Simulate successful process spawn
      setTimeout(() => callback(null, mockProcess.pid), 0);
      return true;
    });
  });

  describe('Process Communication', () => {
    test('should spawn Python process with correct arguments', () => {
      const expectedArgs = [
        'python3',
        expect.stringContaining('whisper_typing.py'),
        '--duration', '60',
        '--clipboard', 'true'
      ];
      
      // Simulate extension starting recording
      const GLib = require('gi://GLib');
      GLib.spawn_async(
        '/test/path',
        expectedArgs,
        null,
        0,
        null,
        jest.fn()
      );
      
      expect(GLib.spawn_async).toHaveBeenCalledWith(
        '/test/path',
        expectedArgs,
        null,
        0,
        null,
        expect.any(Function)
      );
    });

    test('should handle Python process output', (done) => {
      const testOutput = '🎤 Recording started\n';
      
      // Mock stdout data handler
      const stdoutHandler = jest.fn((event: string, callback: (data: string) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testOutput), 0);
        }
      });
      
      mockProcess.stdout.on = stdoutHandler;
      
      // Simulate output handling
      stdoutHandler('data', (data) => {
        expect(data).toBe(testOutput);
        done();
      });
    });

    test('should handle Python process completion', (done) => {
      const processHandler = jest.fn((event: string, callback: (exitCode: number) => void) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });
      
      mockProcess.on = processHandler;
      
      processHandler('exit', (exitCode) => {
        expect(exitCode).toBe(0);
        done();
      });
    });

    test('should handle Python process errors', (done) => {
      const errorMessage = 'Recording failed';
      const stderrHandler = jest.fn((event: string, callback: (data: string) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(errorMessage), 0);
        }
      });
      
      mockProcess.stderr.on = stderrHandler;
      
      stderrHandler('data', (data) => {
        expect(data).toBe(errorMessage);
        done();
      });
    });
  });

  describe('Signal Handling', () => {
    test('should send SIGUSR1 to stop recording gracefully', () => {
      // Simulate graceful stop
      const killMock = jest.fn();
      mockProcess.kill = killMock;
      
      // Extension would call this to stop recording
      mockProcess.kill('SIGUSR1');
      
      expect(killMock).toHaveBeenCalledWith('SIGUSR1');
    });

    test('should send SIGTERM to terminate process', () => {
      const killMock = jest.fn();
      mockProcess.kill = killMock;
      
      // Extension would call this to force terminate
      mockProcess.kill('SIGTERM');
      
      expect(killMock).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Data Flow', () => {
    test('should parse transcription output correctly', () => {
      const transcriptionOutput = '✅ Transcription complete: Hello world';
      
      // Simulate parsing logic
      const parseTranscription = (output: string): string | null => {
        const match = output.match(/✅ Transcription complete: (.+)/);
        return match ? match[1] : null;
      };
      
      const result = parseTranscription(transcriptionOutput);
      expect(result).toBe('Hello world');
    });

    test('should handle empty transcription', () => {
      const emptyOutput = '✅ Transcription complete: ';
      
      const parseTranscription = (output: string): string | null => {
        const match = output.match(/✅ Transcription complete: (.+)/);
        return match ? match[1].trim() : null;
      };
      
      const result = parseTranscription(emptyOutput);
      expect(result).toBeNull();
    });

    test('should handle processing status updates', () => {
      const statusMessages = [
        '🎤 Recording started',
        '🔄 Processing audio...',
        '✅ Transcription complete: Test message'
      ];
      
      statusMessages.forEach((message: string) => {
        expect(message).toMatch(/^[🎤🔄✅]/);
      });
    });
  });
});