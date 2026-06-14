<!-- manual_version: 1.0 -->
<!-- KVENDRA:MANUAL -->
# Kvendra project — boot ROM

This file is the agent's boot ROM (≤40 lines). Operational protocol lives in the KB.

## Protocol
1. **Bootstrap**: call `help({topic:"bootstrap"})` → run the returned `queries[]` in order to load the session context (whoami → PRJ → bootstrap_extras → orphan TXN check → active ROADs → recent RELs → open ISSUEs).
2. **Other topics**: `help({topic})` for `naming`, `txn`, `validation`, `errors`, `identity`, `embeddings`, `entity_types`, `tools`, `workspace-layout`, `skill-playbooks`.
3. **STD playbooks**: `PRJ.metadata.bootstrap_extras` (loaded at step 3) declares project-specific recipes (deploy policy, release process, etc.). Skills v2 read STDs at runtime.

## Fail-safe
If the MCP for this tier does not respond, or `help()` is unreachable: **STOP and notify the user**. No fallback to Bash for writes, no operating from memory.

Canonical message: *"El entorno Kvendra no está disponible. Reconecta antes de avanzar — operar sin Kvendra rompe más de lo que arregla."*
<!-- /KVENDRA:MANUAL -->

<!-- KVENDRA:PROJECT -->
## Project
- `project_id`: **KVD**
- `tier`: **pro**

Project entity: `PRJ-KVD`. Load via bootstrap protocol.
<!-- /KVENDRA:PROJECT -->

## Particularidades
- Repo del componente **`CMP-KVD-PLATFORM`** (motor KB single-tenant, AGPL-3.0). Es el motor open que `CMP-KVD-ENTERPRISE` envuelve. Stack, decisiones y el modelo entidad+TXN+changelog → en el KB. No duplicar aquí (anti-bitácora).
- **AGPL §13**: este es el motor canónico open. Los cambios SaaS-only viven en `kvendra-enterprise` (`@kvendra/enterprise-core`), NO aquí. Lo que toque el motor sí va aquí (upstream).
