"use server";

import {
  runDataScoutForDataset,
  type DataScoutServerResult,
} from "@/lib/copilot/data-scout-server";

export type DataScoutFormState = DataScoutServerResult | { status: "idle" };

export async function generateDataScoutAction(
  _prev: DataScoutFormState,
  formData: FormData,
): Promise<DataScoutFormState> {
  const datasetId = formData.get("datasetId");
  if (typeof datasetId !== "string" || !datasetId) {
    return { status: "error", message: "Missing datasetId" };
  }
  return runDataScoutForDataset(datasetId);
}
