export type SkillSource = 'global' | 'workspace'

export interface SkillSummary {
  baseDirectory: string
  description: string
  id: string
  location: string
  name: string
  source: SkillSource
  sourceLabel: string
}

export interface SkillsState {
  errorMessage: string | null
  skills: SkillSummary[]
}

export interface EchosphereSkillsApi {
  listSkills: (workspacePath?: string | null) => Promise<SkillsState>
}
