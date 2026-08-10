function cc-ein --description "Claude Code con el cerebro de Ein (aislado en ~/.claude-ein)"
    # CLAUDE_CONFIG_DIR queda en el scope de la función: se exporta al proceso
    # claude hijo, pero NO contamina tu shell ni tu `claude` normal.
    set -x CLAUDE_CONFIG_DIR "$HOME/.claude-ein"
    # bin/ del config al frente del PATH → los agentes resuelven `cc-ein-sdd`
    # (el CLI SDD determinista) por Bash. También function-scoped, no persiste.
    set -x PATH "$HOME/.claude-ein/bin" $PATH
    # Key de Context7 para el MCP: del env, o del fichero de secretos como
    # fallback. Se pasa por entorno (no se bakea en el config → sin secretos).
    if not set -q CONTEXT7_API_KEY
        set -l keyfile "$HOME/.config/opencode-secrets/context7-api-key"
        test -r "$keyfile"; and set -x CONTEXT7_API_KEY (string trim < "$keyfile")
    end

    switch "$argv[1]"
        case app
            set -l terminal_app "$CLAUDE_CONFIG_DIR/bin/ein-app"
            if not test -x "$terminal_app"
                echo "cc-ein: terminal app unavailable" >&2
                return 69
            end
            command "$terminal_app" $argv[2..-1]
            return $status
        case cleaner workbench
            set -l surface_runner "$CLAUDE_CONFIG_DIR/bin/ein-surface-runner"
            if not test -x "$surface_runner"
                echo "cc-ein: surface runner unavailable" >&2
                return 69
            end
            command "$surface_runner" $argv
            return $status
    end

    command claude $argv
end
