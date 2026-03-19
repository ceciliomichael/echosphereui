export function shouldRecoverFromTextOnlyToolTurn(content: string) {
  const normalizedContent = content.toLowerCase()
  const plainPseudoToolCallPattern =
    /(?:^|\n)\s*(?:edit|read|list|glob|grep|write|exec_command|write_stdin|update_plan)\s*:\s*\{/iu
  if (
    normalizedContent.includes('functions.') ||
    normalizedContent.includes('functions.edit') ||
    normalizedContent.includes('edit:{') ||
    normalizedContent.includes('read:{') ||
    normalizedContent.includes('list:{') ||
    normalizedContent.includes('glob:{') ||
    normalizedContent.includes('grep:{') ||
    normalizedContent.includes('write:{') ||
    normalizedContent.includes('exec_command:{') ||
    normalizedContent.includes('write_stdin:{') ||
    normalizedContent.includes('update_plan:{') ||
    normalizedContent.includes('tool_call') ||
    normalizedContent.includes('tool call:') ||
    plainPseudoToolCallPattern.test(content)
  ) {
    return true
  }

  const textOnlyToolIntentPattern =
    /\b(i(?:'|’)ll|i will|let me|now let me|going to)\b[^.!?\n]{0,120}\b(create|add|update|modify|edit|write|delete|rename|run|execute|implement)\b/iu
  const textOnlyInspectionIntentPattern =
    /\b(i(?:'|’)ll|i will|let me|now let me|going to)\b[^.!?\n]{0,140}\b(read|list|explore|inspect|check|search|open|look\s+at)\b/iu
  const inspectionTargetPattern =
    /\b(file|files|directory|directories|folder|folders|workspace|code|component|components|module|modules|src|app|repo|project|build|test|output|logs?|command)\b/iu
  const verificationActionPattern = /\b(verify|verification|validate|confirm)\b/iu
  const pseudoExecutionStatusPattern =
    /(?:^|\n)\s*(?:executed|listed|read|created|added|updated|modified|deleted|renamed|verification)\b[^\n]*[.:]?/iu
  const textOnlyMutationClaimPattern =
    /\b(created|added|updated|modified|edited|wrote|deleted|renamed)\b[^.\n]{0,160}\b[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,10}\b/iu
  const textOnlyDiffSummaryPattern = /\b(?:created|added|updated|modified|deleted)\b[^\n]{0,120}\s[+-]\d+\b/iu

  return (
    textOnlyToolIntentPattern.test(content) ||
    (textOnlyInspectionIntentPattern.test(content) && inspectionTargetPattern.test(content)) ||
    (textOnlyInspectionIntentPattern.test(content) && verificationActionPattern.test(content)) ||
    pseudoExecutionStatusPattern.test(content) ||
    textOnlyMutationClaimPattern.test(content) ||
    textOnlyDiffSummaryPattern.test(content)
  )
}
