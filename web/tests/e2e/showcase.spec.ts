import { expect, test } from "@playwright/test";

test.describe("public showcase", () => {
  test("renders hero, pricing, and truth disclosure sections", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Aerial Operations OS/i).first()).toBeVisible();

    await expect(page.getByRole("heading", { name: /^pricing$/i })).toBeVisible();
    await expect(page.getByText(/\$3,500/)).toBeVisible();
    await expect(page.getByText(/\$8,500/)).toBeVisible();
    await expect(page.getByText(/\$18,000/)).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /what.+real today/i }),
    ).toBeVisible();
  });

  test("sign-in link routes to /sign-in", async ({ page }) => {
    await page.goto("/");
    const signIn = page.getByRole("link", { name: /sign in/i }).first();
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
