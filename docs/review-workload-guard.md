# Review Workload Guard

El Review Workload Guard protege la revisión de cambios de producción demasiado grandes antes de abrir un PR.

## Decisión vigente

`ein-git` mide el diff real contra la base usando `git diff --shortstat`. Suma inserciones y borrados de archivos de producción y los compara con el presupuesto de revisión, que por defecto es 400 líneas.

Los archivos de pruebas y generados se miden por separado: se informan, pero no cuentan para el presupuesto de producción.

| Resultado | Comportamiento |
|---|---|
| Dentro del presupuesto | La entrega puede continuar. |
| Excede el presupuesto y la estrategia no es `single-pr-default` | La entrega se detiene y solicita una decisión entre PR único o PRs encadenados. |
| Excede el presupuesto con excepción permitida | La entrega informa el tamaño y conserva la decisión registrada. |

El modo automático no omite esta protección. La medida se realiza en entrega porque el diff ya existe y el dato es determinista.

## Alcance de la medida

La medida excluye tests, snapshots, lockfiles y directorios generados. Su propósito es mantener revisable el cambio de producción, no limitar por una cifra el trabajo de pruebas.

## Razonamiento

El presupuesto evita que un PR grande se apruebe sin una revisión efectiva. Si el cambio supera el límite, dividirlo en unidades autónomas reduce el riesgo y permite revertir cada entrega con precisión.

## Operación

1. Define la estrategia de entrega y el presupuesto en la preflight cuando corresponda.
2. Antes de abrir el PR, deja que `ein-git` mida el diff real.
3. Si se supera el límite, elige PR único con la excepción aplicable o divide el trabajo en PRs encadenados.
