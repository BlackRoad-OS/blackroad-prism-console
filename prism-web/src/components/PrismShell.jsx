import { useState, useRef, useEffect, useCallback } from 'react';

const WELCOME = [
  'PrismOS Shell v0.1.0',
  'Type "help" for available commands.',
  '',
];

const HELP_TEXT = [
  'Available commands:',
  '  help              Show this help message',
  '  clear             Clear the terminal',
  '  echo <text>       Print text to the terminal',
  '  date              Show current date and time',
  '  whoami            Show current user',
  '  uname             Show system information',
  '  env               List environment variables',
  '  history           Show command history',
  '  uptime            Show session uptime',
  '  pwd               Print working directory',
  '  ls [path]         List directory contents',
  '  cat <file>        Display file contents',
  '',
];

const FILESYSTEM = {
  '/': ['home', 'etc', 'var', 'tmp'],
  '/home': ['prism'],
  '/home/prism': ['.bashrc', 'README.md', 'projects'],
  '/home/prism/projects': ['blackroad', 'lucidia'],
  '/etc': ['hostname', 'prism.conf'],
  '/var': ['log'],
  '/var/log': ['prism.log'],
  '/tmp': [],
};

const FILE_CONTENTS = {
  '/home/prism/.bashrc': 'export PS1="prism@prismos:$ "\nexport PATH=/usr/local/bin:$PATH\n',
  '/home/prism/README.md': '# PrismOS\nA modular operating system for the BlackRoad ecosystem.\n',
  '/etc/hostname': 'prismos\n',
  '/etc/prism.conf': '[core]\nkernel=lucidia\nmode=interactive\n',
  '/var/log/prism.log': '[INFO] PrismOS booted successfully\n[INFO] Shell session started\n',
};

function resolvePath(cwd, target) {
  if (!target || target === '~') return '/home/prism';
  if (target === '..') {
    const parts = cwd.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }
  if (target === '.') return cwd;
  if (target.startsWith('/')) return target.replace(/\/+$/, '') || '/';
  const base = cwd === '/' ? '' : cwd;
  return `${base}/${target}`;
}

export default function PrismShell() {
  const [lines, setLines] = useState(WELCOME);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [cwd, setCwd] = useState('/home/prism');
  const [startTime] = useState(Date.now());
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [lines, scrollToBottom]);

  const appendLines = useCallback((newLines) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const executeCommand = useCallback(
    (raw) => {
      const trimmed = raw.trim();
      const promptLine = `prism@prismos:${cwd}$ ${trimmed}`;

      if (!trimmed) {
        appendLines([promptLine]);
        return;
      }

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      let output = [];

      switch (cmd) {
        case 'help':
          output = HELP_TEXT;
          break;

        case 'clear':
          setLines([]);
          return;

        case 'echo':
          output = [args.join(' ')];
          break;

        case 'date':
          output = [new Date().toString()];
          break;

        case 'whoami':
          output = ['prism'];
          break;

        case 'uname':
          output = ['PrismOS 0.1.0 lucidia-kernel x86_64'];
          break;

        case 'hostname':
          output = ['prismos'];
          break;

        case 'pwd':
          output = [cwd];
          break;

        case 'env':
          output = [
            'HOME=/home/prism',
            'USER=prism',
            'SHELL=/bin/prismsh',
            'PATH=/usr/local/bin:/usr/bin:/bin',
            'TERM=prism-256color',
            `PWD=${cwd}`,
          ];
          break;

        case 'uptime': {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          output = [`up ${mins}m ${secs}s`];
          break;
        }

        case 'history':
          output = history.map((h, i) => `  ${i + 1}  ${h}`);
          if (output.length === 0) output = ['  (no history)'];
          break;

        case 'cd': {
          const target = resolvePath(cwd, args[0]);
          if (FILESYSTEM[target]) {
            setCwd(target);
            appendLines([promptLine]);
            return;
          }
          output = [`cd: ${args[0] || '~'}: No such directory`];
          break;
        }

        case 'ls': {
          const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
          const entries = FILESYSTEM[target];
          if (entries) {
            output = entries.length > 0 ? [entries.join('  ')] : ['(empty)'];
          } else {
            output = [`ls: cannot access '${args[0] || target}': No such file or directory`];
          }
          break;
        }

        case 'cat': {
          if (!args[0]) {
            output = ['cat: missing operand'];
            break;
          }
          const filePath = resolvePath(cwd, args[0]);
          const content = FILE_CONTENTS[filePath];
          if (content) {
            output = content.trimEnd().split('\n');
          } else {
            output = [`cat: ${args[0]}: No such file or directory`];
          }
          break;
        }

        default:
          output = [`prismsh: command not found: ${cmd}`];
      }

      appendLines([promptLine, ...output]);
    },
    [cwd, history, startTime, appendLines],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const cmd = input;
    setInput('');
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    executeCommand(cmd);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistory((prev) => {
        const newIdx = historyIdx < prev.length - 1 ? historyIdx + 1 : historyIdx;
        setHistoryIdx(newIdx);
        if (newIdx >= 0 && newIdx < prev.length) {
          setInput(prev[prev.length - 1 - newIdx]);
        }
        return prev;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setHistory((prev) => {
          setInput(prev[prev.length - 1 - newIdx]);
          return prev;
        });
      } else {
        setHistoryIdx(-1);
        setInput('');
      }
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      className="font-mono bg-black text-green-400 p-4 rounded-lg h-full flex flex-col border border-green-900"
      onClick={focusInput}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-900">
        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
        <span className="ml-2 text-green-600 text-sm">prismsh — {cwd}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all min-h-[1.25em]">
            {line}
          </div>
        ))}
        <form onSubmit={handleSubmit} className="flex">
          <span className="whitespace-pre">prism@prismos:{cwd}$ </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-green-400 caret-green-400"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </form>
      </div>
    </div>
  );
}
