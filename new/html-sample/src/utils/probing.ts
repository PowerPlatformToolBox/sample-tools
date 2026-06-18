export type ProbeCommand = {
    command: string;
    expectBlocked: boolean;
    category: string;
    note?: string;
};

export type ProbeResult = ProbeCommand & {
    actualBlocked: boolean | "timeout";
    pass: boolean;
    errorMessage?: string;
};

export const PROBE_TIMEOUT_MS = 5000;

export function buildProbeCommands(isWindows: boolean): ProbeCommand[] {
    return isWindows
        ? [
              // --- Baseline: must remain ALLOWED ---
              { command: "echo PPTB_SECURITY_PROBE", expectBlocked: false, category: "baseline" },
              { command: "Get-Location", expectBlocked: false, category: "baseline" },
              { command: "$PSVersionTable.PSVersion.ToString()", expectBlocked: false, category: "baseline" },
              { command: 'Write-Output "CHAIN_TEST"; Write-Output "SECOND_COMMAND"', expectBlocked: false, category: "baseline-chaining" },

              // --- Direct shell invocation ---
              { command: "cmd.exe /c echo PROBE_LEAK", expectBlocked: true, category: "shell-direct" },
              { command: 'powershell.exe -Command "echo PROBE_LEAK"', expectBlocked: true, category: "shell-direct" },
              { command: "CMD.EXE /c echo PROBE_LEAK", expectBlocked: true, category: "shell-direct-case", note: "Tests case-insensitive matching" },

              // --- Privilege escalation ---
              { command: "runas /user:Administrator cmd", expectBlocked: true, category: "privesc" },

              // --- Path bypass ---
              { command: "C:\\Windows\\System32\\cmd.exe /c echo PROBE_LEAK", expectBlocked: true, category: "path-bypass", note: "Tests realpath resolution vs literal name match" },

              // --- LOLBins (harmless flags only, no real payload) ---
              { command: "mshta.exe about:blank", expectBlocked: true, category: "lolbin" },
              { command: "certutil.exe -?", expectBlocked: true, category: "lolbin" },
              { command: "regsvr32.exe /?", expectBlocked: true, category: "lolbin" },
              { command: "wmic.exe os get caption", expectBlocked: true, category: "lolbin" },

              // --- WSL escape ---
              { command: "wsl echo PROBE_LEAK", expectBlocked: true, category: "wsl-escape" },

              // --- Interpreter eval-flag bypass ---
              { command: "node -e \"console.log('PROBE_LEAK')\"", expectBlocked: true, category: "flag-bypass" },
              { command: "python -c \"print('PROBE_LEAK')\"", expectBlocked: true, category: "flag-bypass" },
              { command: "php -r \"echo 'PROBE_LEAK';\"", expectBlocked: true, category: "flag-bypass" },

              // --- Package-manager dlx/exec equivalents ---
              { command: "npx --call echo", expectBlocked: true, category: "subcommand-bypass" },
              { command: "pnpm dlx cowsay PROBE_LEAK", expectBlocked: true, category: "subcommand-bypass" },

              // --- Shell-builtin / language-feature leak (the architecture test) ---
              {
                  command: "Invoke-Expression 'Write-Output PROBE_LEAK'",
                  expectBlocked: true,
                  category: "shell-builtin-leak",
                  note: "If this is NOT blocked, arbitrary execution is possible via PS language features regardless of your binary blocklist",
              },
              {
                  command: "Start-Process cmd.exe -ArgumentList '/c echo PROBE_LEAK' -NoNewWindow -Wait",
                  expectBlocked: true,
                  category: "shell-builtin-leak",
                  note: "Spawns a real but transient cmd.exe if not caught",
              },
          ]
        : [
              // --- Baseline: must remain ALLOWED ---
              { command: "echo PPTB_SECURITY_PROBE", expectBlocked: false, category: "baseline" },
              { command: "pwd", expectBlocked: false, category: "baseline" },
              { command: "uname -a", expectBlocked: false, category: "baseline" },
              { command: "echo CHAIN_TEST && echo SECOND_COMMAND", expectBlocked: false, category: "baseline-chaining" },

              // --- Direct shell invocation ---
              { command: "bash -c 'echo PROBE_LEAK'", expectBlocked: true, category: "shell-direct" },
              { command: "zsh -c 'echo PROBE_LEAK'", expectBlocked: true, category: "shell-direct" },
              { command: "/bin/bash -c 'echo PROBE_LEAK'", expectBlocked: true, category: "shell-direct-path", note: "Tests realpath resolution vs literal basename match" },

              // --- Privilege escalation (non-interactive flags to avoid a hanging password prompt) ---
              { command: "sudo -n echo PROBE_LEAK", expectBlocked: true, category: "privesc" },
              { command: "pkexec echo PROBE_LEAK", expectBlocked: true, category: "privesc" },

              // --- Interpreter eval-flag bypass ---
              { command: "python3 -c \"print('PROBE_LEAK')\"", expectBlocked: true, category: "flag-bypass" },
              { command: "perl -e \"print 'PROBE_LEAK'\"", expectBlocked: true, category: "flag-bypass" },
              { command: "ruby -e \"puts 'PROBE_LEAK'\"", expectBlocked: true, category: "flag-bypass" },
              { command: "node -e \"console.log('PROBE_LEAK')\"", expectBlocked: true, category: "flag-bypass" },

              // --- Pager/editor shell escapes, forced non-interactive so the probe can't stall ---
              { command: "echo PROBE_LEAK | less -F", expectBlocked: true, category: "shell-escape-tool", note: "-F makes less exit immediately instead of waiting on a keypress" },
              { command: "man ls | cat", expectBlocked: true, category: "shell-escape-tool" },
              { command: "vim -es -c ':!echo PROBE_LEAK' -c ':q'", expectBlocked: true, category: "shell-escape-tool", note: "-es = silent ex mode, can't drop into an interactive screen" },

              // --- find/awk side-channel execution ---
              { command: "find . -maxdepth 0 -exec echo PROBE_LEAK \\;", expectBlocked: true, category: "side-channel-exec" },
              { command: "awk 'BEGIN{print \"PROBE_LEAK\"}'", expectBlocked: true, category: "side-channel-exec" },

              // --- Remote access (non-networking variants only — no real listeners/connections) ---
              { command: "nc -h", expectBlocked: true, category: "remote-access", note: "Help flag only, never opens a listener" },
              { command: "ssh -o ProxyCommand='echo PROBE_LEAK' -o ConnectTimeout=1 127.0.0.1 exit", expectBlocked: true, category: "remote-access" },

              // --- macOS only — remove if your CI/dev box is Linux ---
              { command: "osascript -e 'return \"PROBE_LEAK\"'", expectBlocked: true, category: "macos-specific" },

              // --- Package-manager dlx/exec equivalents ---
              { command: "npx -c 'echo PROBE_LEAK'", expectBlocked: true, category: "subcommand-bypass" },
              { command: "npm exec -- echo PROBE_LEAK", expectBlocked: true, category: "subcommand-bypass" },
              { command: "pnpm dlx cowsay PROBE_LEAK", expectBlocked: true, category: "subcommand-bypass" },

              // --- Wrapper/indirection bypass (the hard cases) ---
              { command: "env bash -c 'echo PROBE_LEAK'", expectBlocked: true, category: "wrapper-bypass", note: "argv[0] is 'env', not 'bash' — tests full-argument inspection, not just argv[0]" },
              {
                  command: "cp /bin/bash /tmp/pptb_probe_bash && /tmp/pptb_probe_bash -c 'echo PROBE_LEAK'; rm -f /tmp/pptb_probe_bash",
                  expectBlocked: true,
                  category: "wrapper-bypass",
                  note: "Tests binary-identity detection vs basename-only matching; self-cleans the copied file",
              },

              // --- Env var injection ---
              { command: "LD_PRELOAD=/nonexistent.so echo PROBE_LEAK", expectBlocked: true, category: "env-injection" },
              { command: "GIT_SSH_COMMAND='echo PROBE_LEAK' git --version", expectBlocked: true, category: "env-injection" },
          ];
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("PROBE_TIMEOUT")), ms);
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}
