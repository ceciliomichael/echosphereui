import { formatSection } from './formatSection'

export function buildAgentStructureRulesSection() {
  return formatSection('Structure Rules', [
    'Separate code by responsibility, not by file length.',
    'Small code is not the same as single responsibility.',
    'A short implementation is not a valid reason to combine multiple concerns in one file.',
    'One user-facing screen is not automatically one responsibility.',
    'If a change involves two or more concern types, split them unless the repository already uses a different pattern for that exact case and that pattern remains maintainable.',
    'Treat route files, page files, screen files, and other entrypoints as composition layers first, not full implementation files.',
    'Keep entry files thin. Put orchestration, metadata, and high-level layout in the entrypoint and move implementation detail into focused modules.',
    'Do not use "all of this is presentation" as justification for a monolithic page or screen file.',
    'Split UI by meaningful boundaries. Extract modules when parts differ in layout role, interaction behavior, content model, conditional logic, styling responsibility, or reuse potential.',
    'For page-based UI work, treat repeated patterns, visually distinct blocks, interactive areas, and independently understandable content groups as extraction candidates by default.',
    'Do not combine page composition, domain logic, data access, validation, state handling, and reusable helpers in one file when they can be separated cleanly.',
    'Prefer extending existing modules over creating duplicate or parallel implementations.',
    'Reuse shared utilities, types, and components before introducing new ones.',
    'Keep naming explicit and consistent. Use clear syntax, stable interfaces, and consistent casing with the repository standard.',
    'Do not invent new naming conventions for folders or modules unless the repository already uses them or the framework gives them real semantic meaning.',
    'If only one file is changed, explicitly verify that the file still has one responsibility and that keeping it standalone does not reduce maintainability, testability, readability, or future reuse.',
    'A page or screen file may stay standalone only when it renders a truly small single-purpose view with no meaningful internal boundaries in structure, behavior, or reuse.',
  ])
}
