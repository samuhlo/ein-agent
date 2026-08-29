function ein-pi --description "Pi Coding Agent con el cerebro de Ein (aislado en ~/.pi-ein)"
    # Aislamiento simétrico con ein-cc. Ambas envs quedan en el scope de la
    # función (se exportan al proceso pi hijo, NO contaminan tu shell ni tu
    # `pi` vanilla):
    #   PI_CODING_AGENT_DIR → Pi carga su config/agente/auth/sesiones de ahí.
    #   EIN_PI_AGENT_HOME    → el código de EIN (ein-paths) resuelve sus rutas ahí.
    set -x PI_CODING_AGENT_DIR "$HOME/.pi-ein/agent"
    set -x EIN_PI_AGENT_HOME "$HOME/.pi-ein/agent"
    set -fx ENGRAM_DATA_DIR "$HOME/.engram-ein"

    # One-shot session binding is trusted only when the validated Pi child
    # adapter adds it back. Ordinary Fish entrypoints must not inherit it.
    set -e EIN_SDD_SESSION_BINDING_V1

    set -l namespace ""
    if test (count $argv) -gt 0
        set namespace $argv[1]
    end

    switch $namespace
        case app
            set -l terminal_app "$EIN_PI_AGENT_HOME/app.ts"
            if not test -f "$terminal_app"
                printf "ein-pi: terminal app unavailable\n" >&2
                return 69
            end
            command bun "$terminal_app" $argv[2..-1]
        case cleaner workbench
            set -l surface_runner "$EIN_PI_AGENT_HOME/surfaces/surface-runner.ts"
            if not test -f "$surface_runner"
                printf "ein-pi: surface runner unavailable\n" >&2
                return 69
            end
            command bun "$surface_runner" $argv
        case '*'
            command pi $argv
    end
end
