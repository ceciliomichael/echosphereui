import type { SkillSummary } from '../../../types/skills'
import { SkillCard } from './SkillCard'

interface SkillListProps {
  disabledSkillsByPath: Record<string, boolean>
  onToggleSkill: (skill: SkillSummary, enabled: boolean) => void
  skills: SkillSummary[]
}

export function SkillList({ disabledSkillsByPath, onToggleSkill, skills }: SkillListProps) {
  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-surface px-4 py-12 text-center">
        <p className="text-sm font-medium text-foreground">No skills discovered</p>
        <p className="max-w-md text-xs leading-6 text-muted-foreground">
          Add `SKILL.md` files to your workspace `skills/` folder or your home profile skill directories to make them
          available here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          isEnabled={disabledSkillsByPath[skill.location] !== true}
          onToggle={(enabled) => onToggleSkill(skill, enabled)}
          skill={skill}
        />
      ))}
    </div>
  )
}
