export async function getDataGeneration(): Promise<string | undefined> {
  const { dataGeneration } = await chrome.storage.local.get("dataGeneration")
  return typeof dataGeneration === "string" ? dataGeneration : undefined
}
