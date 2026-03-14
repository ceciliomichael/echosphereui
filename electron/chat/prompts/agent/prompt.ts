import { buildAgentContextSection } from './sections/context'
import { buildAgentEngineeringSection } from './sections/engineering'
import { buildAgentIdentitySection } from './sections/identity'
import { buildAgentResponseSection } from './sections/response'
import { buildAgentScopeSection } from './sections/scope'
import { buildAgentTaskClassificationSection } from './sections/taskClassification'
import { buildAgentToolMemorySection } from './sections/toolMemory'
import { buildAgentToolsSection } from './sections/tools'
import { buildAgentWorkflowSection } from './sections/workflow'
import type { BuildAgentPromptInput } from './types'

export function buildAgentPrompt({
  agentContextRootPath,
  chatMode,
  supportsNativeTools,
}: BuildAgentPromptInput) {
  if (chatMode !== 'agent') {
    return 'You are Echo, a helpful coding assistant.'
  }

  const sections = [
    buildAgentIdentitySection(),
    buildAgentContextSection(agentContextRootPath, supportsNativeTools),
    buildAgentTaskClassificationSection(),
    buildAgentScopeSection(),
    buildAgentWorkflowSection(),
    buildAgentToolsSection(agentContextRootPath, supportsNativeTools),
    buildAgentToolMemorySection(),
    buildAgentEngineeringSection(),
    buildAgentResponseSection(),
  ]

  return ['<agent_prompt>', ...sections, '</agent_prompt>'].join('\n\n')
}
