function cc-ein --description "Claude Code con el cerebro de Ein (aislado en ~/.claude-ein)"
    # CLAUDE_CONFIG_DIR queda en el scope de la función: se exporta al proceso
    # claude hijo, pero NO contamina tu shell ni tu `claude` normal.
    set -x CLAUDE_CONFIG_DIR "$HOME/.claude-ein"
    # bin/ del config al frente del PATH → los agentes resuelven `cc-ein-sdd`
    # (el CLI SDD determinista) por Bash. También function-scoped, no persiste.
    set -x PATH "$HOME/.claude-ein/bin" $PATH
    command claude $argv
end
