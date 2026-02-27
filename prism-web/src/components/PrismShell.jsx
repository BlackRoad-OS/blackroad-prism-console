import { useState, useRef, useEffect, useCallback } from 'react';

const BUILT_IN_COMMANDS = {
  help: () =>
    [
      'Available commands:',
      '  help       Show this help message',
      '  clear      Clear the terminal',
      '  version    Show PrismOS version',
      '  date       Show current date/time',
      '  whoami     Show current user',
      '  echo       Echo arguments back',
      '  history    Show command history',
      '  uptime     Show session uptime',
    ].join('\n'),
  version: () => 'PrismOS v0.1.0 (blackroad-prism-console)',
  date: () => new Date().toLocaleString(),
  whoami: () => 'prism@blackroad',
  uptime: (_, ctx) => {
    const seconds = Math.floor((Date.now() - ctx.startTime) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `Session uptime: ${mins}m ${secs}s`;
  },
  echo: (args) => args.join(' ') || '',
  history: (_, ctx) =>
    ctx.commandHistory.length === 0
      ? 'No commands in history.'
      : ctx.commandHistory.map((cmd, i) => `  ${i + 1}  ${cmd}`).join('\n'),
};

const WELCOME_MESSAGE = [
  'PrismOS v0.1.0 — BlackRoad Prism Console',
  'Type "help" for available commands.',
  '',
].join('\n');

export default function PrismShell() {
  const [lines, setLines] = useState([{ type: 'output', text: WELCOME_MESSAGE }]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const startTime = useRef(Date.now());
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const executeCommand = useCallback(
    (raw) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setLines((prev) => [...prev, { type: 'input', text: trimmed }]);
        return;
      }

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      const newLines = [{ type: 'input', text: trimmed }];

      if (cmd === 'clear') {
        setLines([]);
        setCommandHistory((prev) => [...prev, trimmed]);
        setHistoryIndex(-1);
        return;
      }

      const ctx = {
        startTime: startTime.current,
        commandHistory: [...commandHistory, trimmed],
      };

      if (BUILT_IN_COMMANDS[cmd]) {
        const result = BUILT_IN_COMMANDS[cmd](args, ctx);
        if (result) {
          newLines.push({ type: 'output', text: result });
        }
      } else {
        newLines.push({
          type: 'error',
          text: `prismsh: command not found: ${cmd}`,
        });
      }

      setLines((prev) => [...prev, ...newLines]);
      setCommandHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
    },
    [commandHistory],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        executeCommand(input);
        setInput('');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        const newIndex =
          historyIndex === -1
            ? commandHistory.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === -1) return;
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    },
    [input, commandHistory, historyIndex, executeCommand],
  );

  return (
    <div
      className="font-mono bg-black text-green-400 p-3 rounded-lg h-full flex flex-col border border-green-900"
      onClick={focusInput}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto whitespace-pre-wrap text-sm">
        {lines.map((line, i) => {
          if (line.type === 'input') {
            return (
              <div key={i}>
                <span className="text-green-600">prism@blackroad</span>
                <span className="text-gray-500">:</span>
                <span className="text-blue-400">~</span>
                <span className="text-gray-500">$ </span>
                <span>{line.text}</span>
              </div>
            );
          }
          if (line.type === 'error') {
            return (
              <div key={i} className="text-red-400">
                {line.text}
              </div>
            );
          }
          return (
            <div key={i} className="text-gray-300">
              {line.text}
            </div>
          );
        })}
        <div className="flex items-center">
          <span className="text-green-600">prism@blackroad</span>
          <span className="text-gray-500">:</span>
          <span className="text-blue-400">~</span>
          <span className="text-gray-500">$ </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-green-400 caret-green-400 text-sm"
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
