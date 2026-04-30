// shared helpers used by bulk edit / duplicate / rename modals.

export function getFieldOptionTooltip(fieldName: string, optionName: string): string {
  return `Set ${fieldName} to ${optionName}.`
}
