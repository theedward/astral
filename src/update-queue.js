export async function runUpdateQueue(addons, install, onUpdated = () => {}) {
  const result = { updated: [], current: [], failed: null, pending: [] };
  for (const [index, addon] of addons.entries()) {
    try {
      const state = await install(addon);
      const installed = state?.addons?.find((a) => a.id === addon.id);
      const bucket = installed?.version === addon.version ? result.current : result.updated;
      bucket.push({ id: addon.id, name: addon.name });
      onUpdated(state);
    } catch (error) {
      result.failed = {
        id: addon.id,
        name: addon.name,
        message: error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''),
      };
      result.pending = addons.slice(index + 1).map(({ id, name }) => ({ id, name }));
      break;
    }
  }
  return result;
}
