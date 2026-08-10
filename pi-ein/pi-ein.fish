function pi-ein --description "Pi Coding Agent con el cerebro de Ein (aislado en ~/.pi-ein)"
    # Aislamiento simétrico con cc-ein. Ambas envs quedan en el scope de la
    # función (se exportan al proceso pi hijo, NO contaminan tu shell ni tu
    # `pi` vanilla):
    #   PI_CODING_AGENT_DIR → Pi carga su config/agente/auth/sesiones de ahí.
    #   EIN_PI_AGENT_HOME    → el código de EIN (ein-paths) resuelve sus rutas ahí.
    set -x PI_CODING_AGENT_DIR "$HOME/.pi-ein/agent"
    set -x EIN_PI_AGENT_HOME "$HOME/.pi-ein/agent"

    set -l namespace ""
    if test (count $argv) -gt 0
        set namespace $argv[1]
    end

    switch $namespace
        case cleaner workbench
            set -l surface_runner "$EIN_PI_AGENT_HOME/surfaces/surface-runner.ts"
            if not test -f "$surface_runner"
                printf "pi-ein: surface runner unavailable\n" >&2
                return 69
            end
            command bun "$surface_runner" $argv
        case '*'
            command pi $argv
    end
end
