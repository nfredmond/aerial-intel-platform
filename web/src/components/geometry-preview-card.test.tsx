import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeometryPreviewCard } from "./geometry-preview-card";

describe("GeometryPreviewCard", () => {
  it("lets the user toggle geometry layers", () => {
    render(
      <GeometryPreviewCard
        title="Geometry preview"
        subtitle="Test preview"
        missionGeometry={{
          type: "Polygon",
          coordinates: [[[-121, 39], [-121, 39.01], [-120.99, 39.01], [-120.99, 39], [-121, 39]]],
        }}
        datasetGeometry={{
          type: "Polygon",
          coordinates: [[[-121, 39], [-121, 39.005], [-120.995, 39.005], [-120.995, 39], [-121, 39]]],
        }}
      />,
    );

    const missionToggle = screen.getByLabelText(/show mission aoi/i);
    const datasetToggle = screen.getByLabelText(/show dataset footprint/i);

    expect(missionToggle).toBeTruthy();
    expect(datasetToggle).toBeTruthy();

    fireEvent.click(missionToggle);
    fireEvent.click(datasetToggle);

    expect(screen.getByText(/no supported geometry is currently visible/i)).toBeTruthy();
  });

  it("exposes interactive view controls", () => {
    render(
      <GeometryPreviewCard
        title="Geometry preview"
        subtitle="Test preview"
        missionGeometry={{
          type: "Polygon",
          coordinates: [[[-121, 39], [-121, 39.01], [-120.99, 39.01], [-120.99, 39], [-121, 39]]],
        }}
        datasetGeometry={null}
      />,
    );

    expect(screen.getByRole("button", { name: /fit all/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /focus aoi/i })).toBeTruthy();
    expect(screen.getByLabelText(/zoom/i)).toBeTruthy();
  });
});
