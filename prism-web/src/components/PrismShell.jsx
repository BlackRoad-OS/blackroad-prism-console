import { useState, useRef, useEffect, useCallback } from 'react';

const WELCOME = [
  'PrismOS Shell v0.1.0',
  'Type "help" for available commands.',
  '',
];

const COMMANDS = {
  help: () => [
    'Available commands:',
    '  help          Show this help message',
    '  clear         Clear the terminal',
    '  echo <text>   Print text to the terminal',
    '  date          Show the current date and time',
    '  whoami        Show current user',
    '  uname         Show system information',
    '  uptime        Show session uptime',
    '  ls            List virtual files',
    '  cat <file>    Show virtual file contents',
    '  env           Show environment variables',
    '  history       Show command history',
    '  version       Show shell version',
  ],
  date: () => [new Date().toString()],
  whoami: () => ['prism@blackroad'],
  uname: () => ['PrismOS 0.1.0 blackroad-prism-console aarch64'],
  version: () => ['prismsh v0.1.0'],
  env: () => [
    'SHELL=/bin/prismsh',
    'USER=prism',
    'HOME=/home/prism',
    'TERM=prism-web',
    'LANG=en_US.UTF-8',
  ],
  ls: () => [
    'agents/    analysis/   backend/    docs/',
    'packages/  prism-web/  services/   tools/',
  ],
};

const VIRTUAL_FILES = {
  'README.md': '# BlackRoad Prism Console\nA modular AI-powered operations platform.',
  'STATUS': 'All systems nominal.',
  '.profile': 'export PS1="prism@blackroad:~$ "\nalias ll="ls -la"',
};

export default function PrismShell() {
  const [lines, setLines] = useState(WELCOME);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [startTime] = useState(Date.now());
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const execute = useCallback((cmd) => {
    const trimmed = cmd.trim();
    if (!trimmed) return [];

    const [name, ...rest] = trimmed.split(/\s+/);
    const args = rest.join(' ');

    if (name === 'clear') return null;

    if (name === 'echo') return [args];

    if (name === 'history') {
      return history.map((h, i) => `  ${i + 1}  ${h}`);
    }

    if (name === 'uptime') {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(secs / 60);
      const hrs = Math.floor(mins / 60);
      return [`up ${hrs}h ${mins % 60}m ${secs % 60}s`];
    }

    if (name === 'cat') {
      if (!args) return ['cat: missing operand'];
      const content = VIRTUAL_FILES[args];
      if (!content) return [`cat: ${args}: No such file or directory`];
      return content.split('\n');
    }

    if (COMMANDS[name]) return COMMANDS[name](args);

    return [`prismsh: ${name}: command not found`];
  }, [history, startTime]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const cmd = input;
    const promptLine = `prism@blackroad:~$ ${cmd}`;
    const result = execute(cmd);

    if (result === null) {
      setLines([]);
    } else {
      setLines((prev) => [...prev, promptLine, ...result]);
    }

    if (cmd.trim()) {
      setHistory((prev) => [...prev, cmd]);
    }
    setInput('');
    setHistoryIdx(-1);
  }, [input, execute]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistoryIdx((idx) => {
        const next = idx === -1 ? history.length - 1 : Math.max(idx - 1, 0);
        if (history[next] !== undefined) setInput(history[next]);
        return next;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistoryIdx((idx) => {
        const next = idx + 1;
        if (next >= history.length) {
          setInput('');
          return -1;
        }
        setInput(history[next]);
        return next;
      });
    }
  }, [history]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="font-mono bg-black text-green-400 p-4 rounded-lg h-full flex flex-col overflow-hidden cursor-text"
      onClick={focusInput}
    >
      <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i}>{line || '\u00A0'}</div>
        ))}
        <form onSubmit={handleSubmit} className="flex">
          <span className="text-green-400 shrink-0">prism@blackroad:~$&nbsp;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-green-400 outline-none caret-green-400 border-none p-0 m-0"
            spellCheck={false}
            autoComplete="off"
          />
        </form>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
