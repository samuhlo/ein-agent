function cc-ein --description "Claude Code con el cerebro de Ein (aislado en ~/.claude-ein)"
    # CLAUDE_CONFIG_DIR queda en el scope de la función: se exporta al proceso
    # claude hijo, pero NO contamina tu shell ni tu `claude` normal.
    set -x CLAUDE_CONFIG_DIR "$HOME/.claude-ein"
    command claude $argv
end
