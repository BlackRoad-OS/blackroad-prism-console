import { useState, useRef, useEffect, useCallback } from 'react';

const VERSION = '1.0.0';
const BOOT_TIME = Date.now();
const USER = 'prism';
const HOST = 'blackroad';

const VIRTUAL_FS = {
  '/': ['bin', 'etc', 'home', 'tmp', 'var'],
  '/home': ['prism'],
  '/home/prism': ['.bashrc', 'README.md', 'projects'],
  '/home/prism/projects': ['prism-console', 'agent-mesh'],
  '/etc': ['hostname', 'prism.conf'],
  '/tmp': [],
  '/var': ['log'],
  '/var/log': ['prism.log'],
};

const FILE_CONTENTS = {
  '/home/prism/.bashrc': 'export PS1="prism@blackroad:~$ "\nexport PATH=/usr/local/bin:$PATH',
  '/home/prism/README.md': '# BlackRoad Prism Console\n\nWelcome to the Prism operating environment.',
  '/etc/hostname': 'blackroad',
  '/etc/prism.conf': '[core]\nmode = interactive\nlog_level = info',
  '/var/log/prism.log': '[INFO] Prism shell initialized\n[INFO] Agent mesh connected',
};

const ENV_VARS = {
  HOME: '/home/prism',
  USER: USER,
  SHELL: '/bin/prismsh',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  TERM: 'xterm-256color',
  HOSTNAME: HOST,
  PRISM_VERSION: VERSION,
};

function formatUptime() {
  const ms = Date.now() - BOOT_TIME;
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

function resolvePath(cwd, target) {
  if (!target || target === '~') return '/home/prism';
  if (target.startsWith('~/')) target = '/home/prism/' + target.slice(2);
  if (!target.startsWith('/')) {
    target = cwd === '/' ? '/' + target : cwd + '/' + target;
  }
  const parts = target.split('/').filter(Boolean);
  const resolved = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p !== '.') resolved.push(p);
  }
  return '/' + resolved.join('/');
}

export default function PrismShell() {
  const [lines, setLines] = useState([
    { type: 'system', text: `BlackRoad Prism Shell v${VERSION}` },
    { type: 'system', text: 'Type "help" for available commands.' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [cwd, setCwd] = useState('/home/prism');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [lines, scrollToBottom]);

  const prompt = `${USER}@${HOST}:${cwd}$ `;

  const addOutput = useCallback((newLines) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const runCommand = useCallback((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    addOutput([{ type: 'prompt', text: prompt + trimmed }]);

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        addOutput([
          { type: 'output', text: 'Available commands:' },
          { type: 'output', text: '  help       Show this help message' },
          { type: 'output', text: '  clear      Clear the terminal' },
          { type: 'output', text: '  echo       Print arguments to output' },
          { type: 'output', text: '  date       Show current date and time' },
          { type: 'output', text: '  whoami     Show current user' },
          { type: 'output', text: '  uname      Show system information' },
          { type: 'output', text: '  uptime     Show session uptime' },
          { type: 'output', text: '  ls         List directory contents' },
          { type: 'output', text: '  cd         Change directory' },
          { type: 'output', text: '  cat        Display file contents' },
          { type: 'output', text: '  pwd        Print working directory' },
          { type: 'output', text: '  env        Show environment variables' },
          { type: 'output', text: '  history    Show command history' },
          { type: 'output', text: '  version    Show Prism version' },
        ]);
        break;

      case 'clear':
        setLines([]);
        return;

      case 'echo':
        addOutput([{ type: 'output', text: args.join(' ') }]);
        break;

      case 'date':
        addOutput([{ type: 'output', text: new Date().toString() }]);
        break;

      case 'whoami':
        addOutput([{ type: 'output', text: USER }]);
        break;

      case 'uname':
        if (args.includes('-a')) {
          addOutput([{ type: 'output', text: `PrismOS ${HOST} ${VERSION} BlackRoad x86_64` }]);
        } else {
          addOutput([{ type: 'output', text: 'PrismOS' }]);
        }
        break;

      case 'uptime':
        addOutput([{ type: 'output', text: `up ${formatUptime()}` }]);
        break;

      case 'pwd':
        addOutput([{ type: 'output', text: cwd }]);
        break;

      case 'ls': {
        const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
        const entries = VIRTUAL_FS[target];
        if (entries) {
          if (entries.length === 0) {
            addOutput([{ type: 'output', text: '' }]);
          } else {
            addOutput([{ type: 'output', text: entries.join('  ') }]);
          }
        } else {
          addOutput([{ type: 'error', text: `ls: cannot access '${args[0] || target}': No such file or directory` }]);
        }
        break;
      }

      case 'cd': {
        const target = resolvePath(cwd, args[0]);
        if (VIRTUAL_FS[target]) {
          setCwd(target);
        } else {
          addOutput([{ type: 'error', text: `cd: ${args[0] || target}: No such directory` }]);
        }
        break;
      }

      case 'cat': {
        if (!args[0]) {
          addOutput([{ type: 'error', text: 'cat: missing file operand' }]);
          break;
        }
        const filePath = resolvePath(cwd, args[0]);
        const content = FILE_CONTENTS[filePath];
        if (content !== undefined) {
          content.split('\n').forEach((line) => {
            addOutput([{ type: 'output', text: line }]);
          });
        } else {
          addOutput([{ type: 'error', text: `cat: ${args[0]}: No such file or directory` }]);
        }
        break;
      }

      case 'env':
        Object.entries(ENV_VARS).forEach(([k, v]) => {
          addOutput([{ type: 'output', text: `${k}=${v}` }]);
        });
        break;

      case 'history':
        history.forEach((h, i) => {
          addOutput([{ type: 'output', text: `  ${i + 1}  ${h}` }]);
        });
        break;

      case 'version':
        addOutput([{ type: 'output', text: `Prism Shell v${VERSION}` }]);
        break;

      default:
        addOutput([{ type: 'error', text: `${cmd}: command not found` }]);
    }
  }, [addOutput, cwd, history, prompt]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const cmd = input;
      setInput('');
      if (cmd.trim()) {
        setHistory((prev) => [...prev, cmd.trim()]);
      }
      setHistoryIdx(-1);
      runCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistory((prev) => {
        const newIdx = historyIdx === -1 ? prev.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(newIdx);
        if (prev[newIdx]) setInput(prev[newIdx]);
        return prev;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistory((prev) => {
        if (historyIdx === -1) return prev;
        const newIdx = historyIdx + 1;
        if (newIdx >= prev.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(newIdx);
          setInput(prev[newIdx]);
        }
        return prev;
      });
    }
  }, [input, historyIdx, runCommand]);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="bg-black text-green-400 font-mono text-sm rounded-lg border border-green-900 h-96 flex flex-col cursor-text"
      onClick={handleContainerClick}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-green-900 rounded-t-lg">
        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
        <span className="ml-2 text-gray-400 text-xs">prismsh</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className={
            line.type === 'error' ? 'text-red-400' :
            line.type === 'system' ? 'text-cyan-400' :
            line.type === 'prompt' ? 'text-green-300' :
            'text-green-400'
          }>
            {line.text}
          </div>
        ))}
        <div className="flex">
          <span className="text-green-300 whitespace-pre">{prompt}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-green-400 caret-green-400"
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
