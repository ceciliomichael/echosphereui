export function resolveForcedToolChoiceForTurn(
  resolvedToolChoiceForTurn: 'auto' | 'none' | 'required',
  enforceRequiredToolChoiceForNextTurn: boolean,
): 'none' | 'required' | undefined {
  if (resolvedToolChoiceForTurn === 'auto') {
    return enforceRequiredToolChoiceForNextTurn ? 'required' : undefined
  }

  return resolvedToolChoiceForTurn
}
