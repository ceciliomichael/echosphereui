import { useCallback } from 'react'
import { SettingsPanelLayout, SETTINGS_SECTION_TITLE_CLASS_NAME } from '../shared/SettingsPanelPrimitives'
import { SkillList } from './SkillList'
import type { AppSettings } from '../../../types/chat'
import type { SkillSummary, SkillsState } from '../../../types/skills'

interface SkillsSettingsPanelProps {
  isLoading: boolean
  onUpdateSettings: (input: Partial<AppSettings>) => void
  settings: Pick<AppSettings, 'disabledSkillsByPath'>
  state: SkillsState | null
  errorMessage: string | null
}

function getNextDisabledSkillsByPath(
  currentValue: Record<string, boolean>,
  skill: SkillSummary,
  enabled: boolean,
) {
  const nextValue = { ...currentValue }
  if (enabled) {
    delete nextValue[skill.location]
  } else {
    nextValue[skill.location] = true
  }

  return nextValue
}

export function SkillsSettingsPanel({
  errorMessage,
  isLoading,
  onUpdateSettings,
  settings,
  state,
}: SkillsSettingsPanelProps) {
  const handleToggleSkill = useCallback(
    (skill: SkillSummary, enabled: boolean) => {
      onUpdateSettings({
        disabledSkillsByPath: getNextDisabledSkillsByPath(settings.disabledSkillsByPath, skill, enabled),
      })
    },
    [onUpdateSettings, settings.disabledSkillsByPath],
  )

  const visibleErrorMessage = errorMessage ?? state?.errorMessage ?? null

  return (
    <SettingsPanelLayout>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1 px-1 pt-1">
          <h2 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Skills</h2>
        </header>

        <div className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Skills are reusable instruction packs for specific workflows. Keep a skill enabled if you want the assistant
            to recognize it and load its guidance when it fits the task.
          </p>
        </div>

        {visibleErrorMessage ? (
          <div className="rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
            {visibleErrorMessage}
          </div>
        ) : null}

        {!isLoading ? (
          <SkillList
            disabledSkillsByPath={settings.disabledSkillsByPath}
            onToggleSkill={handleToggleSkill}
            skills={state?.skills ?? []}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface px-4 py-10 text-sm text-muted-foreground">
            Loading skills…
          </div>
        )}
      </div>
    </SettingsPanelLayout>
  )
}
