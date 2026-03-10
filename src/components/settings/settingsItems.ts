export const SETTINGS_ITEMS = [
  {
    id: 'settings-item1',
    label: 'General',
    description: 'Language and application-wide preferences.',
  },
  {
    id: 'settings-item2',
    label: 'Providers',
    description: 'Configure AI providers and authentication.',
  },
  {
    id: 'settings-item3',
    label: 'settings-item3',
    description: 'Reserved for the third settings surface.',
  },
  {
    id: 'settings-item4',
    label: 'settings-item4',
    description: 'Reserved for the fourth settings surface.',
  },
  {
    id: 'settings-item5',
    label: 'settings-item5',
    description: 'Reserved for the fifth settings surface.',
  },
] as const

export type SettingsItem = (typeof SETTINGS_ITEMS)[number]
export type SettingsItemId = SettingsItem['id']

export const DEFAULT_SETTINGS_ITEM_ID: SettingsItemId = SETTINGS_ITEMS[0].id

export function getSettingsItem(itemId: SettingsItemId) {
  return SETTINGS_ITEMS.find((item) => item.id === itemId) ?? SETTINGS_ITEMS[0]
}
