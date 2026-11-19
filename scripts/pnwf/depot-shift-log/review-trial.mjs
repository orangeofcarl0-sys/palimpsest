// Only the isolated reviewer's pinned measurement can finish its DSH turn.
export function terminalTrial(definition, pinnedSha) {
  if (definition.name !== "depot_trial") return definition;
  return {...definition, async execute(args, context) {
    const result = await definition.execute(args, context);
    if (result?.ok === true && args.sha === pinnedSha && result.deliveredSha === pinnedSha &&
        result.receipt?.sha === pinnedSha) context.concludeTurn();
    return result;
  }};
}
