# Project Settings Management Specification

## Purpose

Expose the supported project settings through their existing disk-backed owners.

## Requirements

### Requirement: Read and mutate supported project settings

The system MUST expose and persist work mode, agent language, artifact language, persona, strict TDD, Hypa, and CodeGraph. Each mutation MUST use the existing owner for that setting, and the displayed value after a mutation MUST come from rereading storage rather than from the requested value. Engram MUST remain a session-level choice and MUST NOT become a project setting.

#### Scenario: Successful setting change round-trips through storage

- GIVEN a supported setting has a writable owner
- WHEN the user changes its value
- THEN the owner persists it and the application displays the value read back from storage

#### Scenario: Failed write preserves the known value

- GIVEN a setting writer rejects a requested change
- WHEN the user attempts the mutation
- THEN the application reports the rejection and continues displaying the prior stored value

#### Scenario: All seven settings are represented

- GIVEN the configuration view is opened
- WHEN its setting catalog is rendered
- THEN all seven supported settings are present and Engram is absent from the mutation catalog
