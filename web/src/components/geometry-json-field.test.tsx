import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeometryJsonField } from "./geometry-json-field";

describe("GeometryJsonField", () => {
  it("loads mission samples and clears the field", () => {
    render(
      <GeometryJsonField
        name="geometry"
        label="GeoJSON"
        mode="mission"
        defaultValue=""
      />,
    );

    const textarea = screen.getByLabelText(/geojson/i) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: /use polygon sample/i }));
    expect(textarea.value).toContain('"type": "Polygon"');
    expect(screen.getByText(/geometry parsed/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(textarea.value).toBe("");
  });

  it("loads the dataset footprint sample", () => {
    render(
      <GeometryJsonField
        name="geometry"
        label="GeoJSON"
        mode="dataset"
        defaultValue=""
      />,
    );

    const textarea = screen.getByLabelText(/geojson/i) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: /use footprint sample/i }));
    expect(textarea.value).toContain('"coordinates"');
  });

  it("shows an invalid-geometry warning for bad json", () => {
    render(
      <GeometryJsonField
        name="geometry"
        label="GeoJSON"
        mode="mission"
        defaultValue=""
      />,
    );

    fireEvent.change(screen.getByLabelText(/geojson/i), {
      target: { value: '{"type":"Point"}' },
    });

    expect(screen.getByText(/invalid geometry/i)).toBeTruthy();
  });
});
