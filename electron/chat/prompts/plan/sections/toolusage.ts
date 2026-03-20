import { formatPlanSection } from './formatSection'

const PLAN_TOOL_USAGE_RULES: ReadonlyArray<{
  description: string
  rules: readonly string[]
  toolName: string
}> = [
  {
    description: 'Inspect directory structure before selecting files.',
    toolName: 'list',
    rules: [
      'Use absolute_path rooted in the workspace.',
      'Never pass bare folder names (for example "app") when listing nested paths.',
      'When listing a child directory, build the next absolute_path from the previous successful path (for example <cwd>/src -> <cwd>/src/app).',
      'Use limit to keep large directory listings focused.',
      'Prefer list before deep file reads when path context is unclear.',
    ],
  },
  {
    description: 'Read file content in bounded, meaningful ranges.',
    toolName: 'read',
    rules: [
      'Use start_line/end_line for targeted ranges.',
      'Prefer fewer, broader reads over many tiny reads when understanding structure.',
      'Read relevant source before proposing implementation steps that name files or symbols.',
    ],
  },
  {
    description: 'Discover candidate files by path pattern.',
    toolName: 'glob',
    rules: [
      'Use glob to find files before read when the exact path is unknown.',
      'Constrain broad searches with max_results.',
      'Use focused patterns (for example **/*.tsx) instead of scanning the whole tree blindly.',
    ],
  },
  {
    description: 'Locate symbols and code paths by content search.',
    toolName: 'grep',
    rules: [
      'Use grep to find where logic or symbols live before planning edits.',
      'Set is_regex only when regex matching is required.',
      'Use grep hits with read for full local context before finalizing plan steps.',
    ],
  },
  {
    description: 'Track implementation workflow state for the planned execution.',
    toolName: 'update_plan',
    rules: [
      'Call update_plan only when the plan is large or branching enough that explicit step tracking will help.',
      'Keep step ids stable across updates and only change statuses when progress changes.',
      'Do not resend an unchanged step list.',
      'If all steps are approved and complete, plan state should show no incomplete steps.',
    ],
  },
  {
    description: 'Ask one focused planning question when a critical decision is missing.',
    toolName: 'ask_question',
    rules: [
      'Ask only when the missing answer materially affects correctness or scope.',
      'Provide 2 or 3 mutually exclusive options.',
      'options is required and must be an array of objects with id and label.',
      'Use payload shape: {"question":"...","options":[{"id":"a","label":"Option A"},{"id":"b","label":"Option B"}],"allow_custom_answer":true}.',
      'Allow custom answer when predefined options may be insufficient.',
      'Ask one question per call; avoid bundling unrelated decisions.',
    ],
  },
  {
    description: 'Gate implementation on explicit user approval.',
    toolName: 'ready_implement',
    rules: [
      'Call only after the plan has been presented and mirrored in update_plan.',
      'This is a synchronous approval gate: wait for user selection before continuing.',
      'If user selects yes, continue in Agent mode.',
      'If user selects no, remain in Plan mode and refine the plan or ask follow-up questions.',
    ],
  },
]

function buildToolRuleLines() {
  const lines: string[] = []

  for (const entry of PLAN_TOOL_USAGE_RULES) {
    lines.push(`### ${entry.toolName}`)
    lines.push(`- ${entry.description}`)

    for (const rule of entry.rules) {
      lines.push(`- ${rule}`)
    }
  }

  return lines
}

export function buildPlanToolUsageSection() {
  return [
    formatPlanSection('Tool Usage', [
      'Only use these tools in Plan mode: list, read, glob, grep, ask_question, update_plan, ready_implement.',
      'Do not reference or attempt tools outside this set.',
      'Do not emit pseudo tool calls in plain text; call tools directly.',
      'If you say you will inspect/read/search, invoke the tool in the same turn.',
      'Never end a turn with intent-only text such as "Let me inspect..." without an actual tool call.',
      'For tools that accept absolute_path, always send a true absolute filesystem path (for example C:\\\\repo\\\\file.ts or /repo/file.ts); never use "." or relative paths.',
      'Path protocol: start from <cwd>; for nested paths, extend from the last successful absolute_path; never reset to a guessed root.',
      'When a tool fails due to invalid path or bad arguments, correct arguments immediately and retry instead of continuing with assumptions.',
    ]),
    '<toolusage>',
    ...buildToolRuleLines(),
    '</toolusage>',
  ].join('\n')
}
